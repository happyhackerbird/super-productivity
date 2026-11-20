import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from '../logger';
import { CAPTURE_MCP_BODY_LIMIT_BYTES } from './capture.const';
import {
  AuthenticatedGrant,
  authenticateCaptureToken,
  touchCaptureGrant,
} from './capture-grant.store';
import {
  isAuthFailureLimited,
  isGrantRateLimited,
  recordAuthFailure,
  recordAuthSuccess,
} from './capture-rate-limit';
import { parseCaptureToken } from './capture-token';
import { CREATE_TASK_TOOL, runCreateTask } from './create-task.tool';
import { READ_TOOLS, runReadTool } from './capture-read.tools';
import { isTrackerTool, runTrackerTool, TRACKER_TOOLS } from '../tracker/tracker.tools';
import {
  handleMcpMessage,
  isAcceptedProtocolHeader,
  McpHttpReply,
  McpServerContext,
  parseErrorReply,
  unsupportedVersionReply,
} from './mcp-protocol';

/**
 * `POST /mcp`: the hosted MCP endpoint. It adds tasks, and reads the open-task
 * list only while the account has task reading on (the read tools check that
 * themselves). Accepts only capture tokens; a sync JWT is not a capture token
 * and fails here, and the sync `authenticate` preHandler is never registered
 * on this route.
 *
 * No Origin check: the endpoint is public and bearer-only, so a browser page
 * has no ambient credential to abuse, and DNS rebinding targets local servers.
 */

const MCP_SERVER_VERSION = '1.0.0';

const headerValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const bearerToken = (req: FastifyRequest): string | null => {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
};

/**
 * Fork: one log line per /mcp request, so a client that fails before the handler
 * (415, 401) or never calls at all is visible. Protocol fields only: the
 * JSON-RPC method, the tool name, a grant id suffix, status, content type and
 * user agent. Never arguments, titles or client names.
 */
const requestLog = new WeakMap<
  FastifyRequest,
  { rpc: string; tool?: string; grant?: string }
>();
const logToken = (value: unknown): string =>
  typeof value === 'string' && /^[A-Za-z0-9_./-]{1,64}$/.test(value) ? value : '?';
const logHeader = (value: string | string[] | undefined): string => {
  const text = (headerValue(value) ?? '').replace(/[^\x20-\x7e]/g, '').slice(0, 60);
  return text.replace(/\s+/g, '_') || '-';
};
const noteRequest = (req: FastifyRequest, message: unknown, grantId: string): void => {
  const body = (message ?? {}) as { method?: unknown; params?: { name?: unknown } };
  requestLog.set(req, {
    rpc: logToken(body.method),
    tool: body.method === 'tools/call' ? logToken(body.params?.name) : undefined,
    grant: grantId.slice(-8),
  });
};

const sendMcpReply = (reply: FastifyReply, result: McpHttpReply): FastifyReply =>
  result.body === undefined
    ? reply.code(result.status).send()
    : reply.code(result.status).type('application/json').send(result.body);

const contextFor = (grant: AuthenticatedGrant): McpServerContext => ({
  serverVersion: MCP_SERVER_VERSION,
  listTools: () => [CREATE_TASK_TOOL, ...READ_TOOLS, ...TRACKER_TOOLS],
  hasTool: (name) =>
    name === CREATE_TASK_TOOL.name ||
    READ_TOOLS.some((tool) => tool.name === name) ||
    isTrackerTool(name),
  callTool: (name, args) =>
    name === CREATE_TASK_TOOL.name
      ? runCreateTask(grant, args)
      : isTrackerTool(name)
        ? runTrackerTool(grant, name, args)
        : runReadTool(grant, name, args),
});

const handleMcpPost = async (
  req: FastifyRequest,
  reply: FastifyReply,
  publicUrl?: string,
): Promise<FastifyReply> => {
  const token = bearerToken(req);
  const claimedGrantId = (token && parseCaptureToken(token)?.grantId) || null;
  if (isAuthFailureLimited(req.ip, claimedGrantId)) {
    return reply.code(429).header('Retry-After', '60').send({ error: 'rate_limited' });
  }
  const grant = token
    ? await authenticateCaptureToken(
        token,
        Date.now(),
        publicUrl ? `${publicUrl}/mcp` : undefined,
      )
    : null;
  if (!grant) {
    recordAuthFailure(req.ip, claimedGrantId);
    const challenge = `Bearer scope="tasks:capture"${token ? ', error="invalid_token"' : ''}${publicUrl ? `, resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"` : ''}`;
    return reply
      .code(401)
      .header('WWW-Authenticate', challenge)
      .send({ error: 'invalid_token' });
  }
  recordAuthSuccess(grant.grantId);
  if (isGrantRateLimited(grant.grantId)) {
    return reply.code(429).header('Retry-After', '60').send({ error: 'rate_limited' });
  }
  await touchCaptureGrant(grant.grantId);
  noteRequest(req, undefined, grant.grantId);

  if (!isAcceptedProtocolHeader(headerValue(req.headers['mcp-protocol-version']))) {
    return sendMcpReply(reply, unsupportedVersionReply());
  }
  let message: unknown;
  try {
    message = JSON.parse(req.body as string);
  } catch {
    return sendMcpReply(reply, parseErrorReply());
  }
  noteRequest(req, message, grant.grantId);
  const result = await handleMcpMessage(
    message,
    { mcpMethod: headerValue(req.headers['mcp-method']) },
    contextFor(grant),
  );
  if (result.body && 'error' in result.body) {
    // Ids only: capture content never goes to the log.
    Logger.debug(`MCP error for grant ${grant.grantId}: ${result.body.error.code}`);
  }
  return sendMcpReply(reply, result);
};

const methodNotAllowed = async (
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> => reply.code(405).header('Allow', 'POST').send();

export const captureMcpRoutes = async (
  fastify: FastifyInstance,
  options: { publicUrl?: string } = {},
): Promise<void> => {
  // Raw text, so a malformed body becomes a JSON-RPC parse error rather than
  // a Fastify 400. Encapsulated: only affects routes in this plugin.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: CAPTURE_MCP_BODY_LIMIT_BYTES },
    (_req, body, done) => done(null, body),
  );

  // Encapsulated like the parser: fires for this plugin's routes only, after
  // every response, including a 415 from the parser and a 401.
  fastify.addHook('onResponse', async (req, reply) => {
    const noted = requestLog.get(req);
    Logger.info(
      `MCP ${req.method} ${reply.statusCode}` +
        ` ct=${logHeader(req.headers['content-type'])}` +
        ` pv=${logHeader(req.headers['mcp-protocol-version'])}` +
        ` ua=${logHeader(req.headers['user-agent'])}` +
        (noted
          ? ` rpc=${noted.rpc}${noted.tool ? ` tool=${noted.tool}` : ''} grant=${noted.grant}`
          : ''),
    );
  });

  // The global per-IP limiter is off here: assistant vendors call from shared
  // egress IPs. capture-rate-limit.ts counts per grant and failed auths per IP.
  const config = { rateLimit: false as const };
  fastify.post(
    '/mcp',
    { bodyLimit: CAPTURE_MCP_BODY_LIMIT_BYTES, config },
    (req, reply) => handleMcpPost(req, reply, options.publicUrl),
  );
  fastify.get('/mcp', { config }, methodNotAllowed);
  fastify.delete('/mcp', { config }, methodNotAllowed);
};
