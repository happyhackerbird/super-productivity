import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, getAuthUser } from '../middleware';
import { CAPTURE_READ_MODEL_BODY_LIMIT_BYTES } from './capture-read.const';
import { TaskReadModelSchema } from './capture-read.model';
import {
  disableReadAccess,
  enableReadAccess,
  getReadAccess,
  publishReadModel,
} from './capture-read.store';

/**
 * `/api/capture/read-access` and `/api/capture/read-model` (fork): the app
 * switches task reading and publishes its open-task list, behind the sync
 * `authenticate`. A capture token is not a JWT and fails here.
 */

const PublishSchema = z.object({
  enableId: z.string().min(1).max(64),
  model: TaskReadModelSchema,
});

const getAccess = async (
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> => reply.send(await getReadAccess(getAuthUser(req).userId));

const putAccess = async (
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> => {
  const result = await enableReadAccess(getAuthUser(req).userId);
  if (result.status === 'capture_disabled') {
    return reply.code(409).send({ error: 'capture_disabled' });
  }
  return reply.send({
    enabled: true,
    enableId: result.enableId,
    publishedAt: result.publishedAt,
  });
};

const deleteAccess = async (
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> => {
  await disableReadAccess(getAuthUser(req).userId);
  return reply.send({ enabled: false });
};

/** 409 tells the device its enablement is gone; it never means "retry". */
const putModel = async (
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> => {
  const parsed = PublishSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
  const publishedAt = Date.now();
  const result = await publishReadModel(
    getAuthUser(req).userId,
    parsed.data.enableId,
    JSON.stringify(parsed.data.model),
    publishedAt,
  );
  return result === 'published'
    ? reply.send({ publishedAt })
    : reply.code(409).send({ error: 'read_disabled' });
};

export const captureReadRoutes = async (fastify: FastifyInstance): Promise<void> => {
  // As in captureRoutes: the app's _fetchApi sends a JSON content type on
  // bodyless requests too. Encapsulated to this plugin.
  const parseJson = fastify.getDefaultJsonParser('error', 'ignore');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) =>
      body === '' ? done(null, undefined) : parseJson(req, body as string, done),
  );
  fastify.addHook('preHandler', authenticate);

  fastify.get('/read-access', getAccess);
  fastify.put('/read-access', putAccess);
  fastify.delete('/read-access', deleteAccess);
  fastify.put(
    '/read-model',
    { bodyLimit: CAPTURE_READ_MODEL_BODY_LIMIT_BYTES },
    putModel,
  );
};
