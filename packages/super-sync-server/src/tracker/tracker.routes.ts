import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { touchCaptureGrant } from '../capture/capture-grant.store';
import { TRACKER_BODY_LIMIT_BYTES, TRACKER_COOKIE } from './tracker.const';
import { toIssues, validateTrackerDoc } from './tracker-doc.model';
import { authenticateTracker, checkTrackerToken } from './tracker-auth';
import { loadTrackerDoc, saveTrackerDoc } from './tracker.store';

/**
 * `/api/tracker` (fork): the personal tracker document for the tracker page.
 * Authenticated by a capture credential, as a bearer header or the session
 * cookie. Writes need `X-Tracker-Request: 1`: a cross-site form cannot set a
 * custom header, which together with SameSite=Strict keeps the cookie from
 * being used by another site.
 */

const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const PutBodySchema = z.object({
  baseVersion: z.number().int().min(0),
  doc: z.unknown(),
});

const SessionBodySchema = z.object({ token: z.string().min(1).max(500) });

const sessionCookie = (value: string, maxAge: number, publicUrl?: string): string =>
  `${TRACKER_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` +
  (publicUrl?.startsWith('https://') ? '; Secure' : '');

const invalid = (reply: FastifyReply, issues: unknown): FastifyReply =>
  reply.code(400).send({ error: 'invalid', issues });

export const trackerRoutes = async (
  fastify: FastifyInstance,
  options: { publicUrl?: string } = {},
): Promise<void> => {
  const { publicUrl } = options;

  // Raw text so an empty body (a bodyless request that still says JSON) is
  // accepted, and a malformed one is a plain 400.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: TRACKER_BODY_LIMIT_BYTES },
    (_req, body, done) => {
      if (body === '') return done(null, undefined);
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    },
  );

  fastify.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (req.headers['x-tracker-request'] !== '1') {
      return reply.code(403).send({ error: 'missing_header' });
    }
  });

  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const grant = await authenticateTracker(req, reply, publicUrl);
    if (!grant) return reply;
    await touchCaptureGrant(grant.grantId);
    const { version, doc } = await loadTrackerDoc(grant.userId);
    return reply.header('Cache-Control', 'no-store').send({ version, doc });
  });

  fastify.put(
    '/',
    { bodyLimit: TRACKER_BODY_LIMIT_BYTES },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const grant = await authenticateTracker(req, reply, publicUrl);
      if (!grant) return reply;
      const body = PutBodySchema.safeParse(req.body);
      if (!body.success) return invalid(reply, toIssues(body.error));
      const checked = validateTrackerDoc(body.data.doc);
      if (!checked.ok) {
        return checked.reason === 'too_large'
          ? reply.code(413).send({ error: 'too_large' })
          : invalid(reply, checked.issues);
      }
      const current = await loadTrackerDoc(grant.userId);
      if (current.doc?.activities !== undefined && checked.doc.activities === undefined) {
        return reply.code(400).send({
          error: 'reload_required',
          message: 'Reload the tracker page before saving activity changes.',
        });
      }
      const saved = await saveTrackerDoc(
        grant.userId,
        checked.doc,
        body.data.baseVersion,
      );
      if (saved.status === 'conflict') {
        return reply
          .code(409)
          .send({ error: 'conflict', version: saved.version, doc: saved.doc });
      }
      return reply.send({ version: saved.version });
    },
  );

  fastify.post('/session', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = SessionBodySchema.safeParse(req.body);
    const token = body.success ? body.data.token : null;
    const result = await checkTrackerToken(req.ip, token, publicUrl);
    if (result.status === 'rate_limited') {
      return reply.code(429).header('Retry-After', '60').send({ error: 'rate_limited' });
    }
    if (result.status === 'invalid' || !token) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    return reply
      .code(204)
      .header('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS, publicUrl))
      .send();
  });

  fastify.delete('/session', async (_req: FastifyRequest, reply: FastifyReply) =>
    reply
      .code(204)
      .header('Set-Cookie', sessionCookie('', 0, publicUrl))
      .send(),
  );
};
