import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticatedGrant } from '../capture/capture-grant.store';
import { checkTrackerToken, trackerCredential } from './tracker-auth';

/**
 * `/tracker/` (fork): the personal tracker page. The page itself is not part of
 * this server: an operator installs it in TRACKER_PAGE_DIR. Without a valid
 * session cookie only the sign-in shell is served, so the page's code is never
 * handed to an anonymous visitor.
 */

const FILE_PATTERN = /^[a-z0-9-]+\.(js|css)$/;

const CONTENT_TYPES: Record<string, string> = {
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
};

// No inline script or handler: the CSP allows only same-origin script files.
const LOGIN_SHELL = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tracker sign-in</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 0 1rem; }
input, button { font: inherit; padding: 0.5rem; }
input { width: 100%; box-sizing: border-box; margin-bottom: 0.75rem; }
</style>
</head>
<body>
<form id="login">
<label for="token">Access token</label>
<input id="token" type="password" autocomplete="off">
<button type="submit">Sign in</button>
</form>
<p id="msg"></p>
<p>Create a token in Super Productivity: sync settings → AI assistants → Manual tokens for scripts and other clients.</p>
<script src="/tracker-login.js"></script>
</body>
</html>
`;

export const trackerPageRoutes = async (
  fastify: FastifyInstance,
  options: { publicUrl?: string; pageDir?: string } = {},
): Promise<void> => {
  const { publicUrl, pageDir } = options;

  // A page load is not an API call: it passes the failure limiter but does not
  // count against the per-grant call limit.
  const signedIn = async (req: FastifyRequest): Promise<AuthenticatedGrant | null> => {
    const token = trackerCredential(req);
    if (!token) return null;
    const result = await checkTrackerToken(req.ip, token, publicUrl);
    return result.status === 'ok' ? result.grant : null;
  };

  const readPageFile = async (name: string): Promise<Buffer | null> => {
    if (!pageDir) return null;
    try {
      return await readFile(join(pageDir, name));
    } catch {
      return null;
    }
  };

  const noStore = (reply: FastifyReply): FastifyReply =>
    reply.header('Cache-Control', 'no-store');

  fastify.get('/tracker', async (_req, reply) => reply.redirect('/tracker/', 302));

  fastify.get('/tracker/', async (req, reply) => {
    noStore(reply);
    if (!(await signedIn(req))) {
      return reply.code(200).type('text/html; charset=utf-8').send(LOGIN_SHELL);
    }
    const page = await readPageFile('index.html');
    if (!page) {
      return reply
        .code(404)
        .type('text/plain; charset=utf-8')
        .send('Tracker page is not installed on this server.');
    }
    return reply.code(200).type('text/html; charset=utf-8').send(page);
  });

  fastify.get<{ Params: { file: string } }>('/tracker/:file', async (req, reply) => {
    noStore(reply);
    const { file } = req.params;
    if (!FILE_PATTERN.test(file)) return reply.code(404).send();
    if (!(await signedIn(req))) return reply.code(401).send();
    const body = await readPageFile(file);
    if (!body) return reply.code(404).send();
    return reply
      .code(200)
      .type(CONTENT_TYPES[file.slice(file.lastIndexOf('.') + 1)])
      .send(body);
  });
};
