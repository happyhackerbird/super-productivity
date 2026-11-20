import { FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthenticatedGrant,
  authenticateCaptureToken,
} from '../capture/capture-grant.store';
import {
  isAuthFailureLimited,
  isTrackerRateLimited,
  recordAuthFailure,
  recordAuthSuccess,
} from '../capture/capture-rate-limit';
import { parseCaptureToken } from '../capture/capture-token';
import { TRACKER_COOKIE } from './tracker.const';

/**
 * The tracker accepts an existing capture credential (OAuth grant or manual
 * token), as a bearer header or, for the browser page, the `sp_tracker`
 * cookie. Same failure limits as `/mcp`.
 */

const cookieValue = (header: string | undefined, name: string): string | null => {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
};

export const trackerCredential = (req: FastifyRequest): string | null => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return cookieValue(req.headers.cookie, TRACKER_COOKIE);
};

export type TrackerAuthResult =
  | { status: 'ok'; grant: AuthenticatedGrant }
  | { status: 'rate_limited' }
  | { status: 'invalid' };

/** Checks a token with the failure limiter; does not reply and does not count tracker calls. */
export const checkTrackerToken = async (
  ip: string,
  token: string | null,
  publicUrl?: string,
): Promise<TrackerAuthResult> => {
  const claimedGrantId = (token && parseCaptureToken(token)?.grantId) || null;
  if (isAuthFailureLimited(ip, claimedGrantId)) return { status: 'rate_limited' };
  const grant = token
    ? await authenticateCaptureToken(
        token,
        Date.now(),
        publicUrl ? `${publicUrl}/mcp` : undefined,
      )
    : null;
  if (!grant) {
    recordAuthFailure(ip, claimedGrantId);
    return { status: 'invalid' };
  }
  recordAuthSuccess(grant.grantId);
  return { status: 'ok', grant };
};

/** Replies 429 or 401 itself and returns null; otherwise the grant. */
export const authenticateTracker = async (
  req: FastifyRequest,
  reply: FastifyReply,
  publicUrl?: string,
): Promise<AuthenticatedGrant | null> => {
  const result = await checkTrackerToken(req.ip, trackerCredential(req), publicUrl);
  if (result.status === 'rate_limited') {
    reply.code(429).header('Retry-After', '60').send({ error: 'rate_limited' });
    return null;
  }
  if (result.status === 'invalid') {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
  if (isTrackerRateLimited(result.grant.grantId)) {
    reply.code(429).header('Retry-After', '60').send({ error: 'rate_limited' });
    return null;
  }
  return result.grant;
};
