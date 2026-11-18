import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { PGlite } from '@electric-sql/pglite';
import * as jwt from 'jsonwebtoken';
import { captureMcpRoutes, captureReadRoutes, captureRoutes } from '../src/capture';
import { disableCaptureKey, registerCaptureKey } from '../src/capture/capture-key.store';
import {
  disableReadAccess,
  enableReadAccess,
  getReadAccess,
  loadReadModel,
  publishReadModel,
} from '../src/capture/capture-read.store';
import { TaskReadModelV1 } from '../src/capture/capture-read.model';
import {
  READ_NOT_SHARED_TEXT,
  READ_SWITCHED_OFF_TEXT,
} from '../src/capture/capture-read.const';
import { CAPTURE_SAVED_TEXT } from '../src/capture/capture.const';
import { resetCaptureMemoryForTests } from '../src/capture/capture-retry-window';
import { resetCaptureRateLimitForTests } from '../src/capture/capture-rate-limit';
import {
  addUser,
  createCapturePrisma,
  createCaptureSchema,
  newCaptureKeyPair,
} from './capture-pglite.helper';

/**
 * Task reading on PGlite: the store's shipped SQL against the shipped
 * migration, the app-facing routes with the real sync `verifyToken`, and the
 * read tools through `/mcp`.
 */

const mocked = vi.hoisted(() => {
  // auth.ts reads it at module scope.
  process.env.JWT_SECRET = 'capture-read-spec-secret-0123456789';
  return { prisma: {} as Record<string, unknown> };
});
vi.mock('../src/db', () => ({ prisma: mocked.prisma }));
// tests/setup.ts mocks auth; these tests need the real token check.
vi.mock('../src/auth', async (importOriginal) => importOriginal());

const NOW = 1_800_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const readModel = (title = 'Buy milk'): TaskReadModelV1 => ({
  v: 1,
  today: '2026-11-17',
  dayStarts: [Date.now() + DAY_MS, Date.now() + 2 * DAY_MS],
  todayTaskIds: ['t1'],
  overdueTaskIds: [],
  truncated: false,
  tasks: [
    {
      id: 't1',
      title,
      projectId: 'inbox',
      projectTitle: 'Inbox',
      dueDay: '2026-11-17',
      plannedDay: '2026-11-17',
      carryOver: true,
    },
  ],
});

describe('task reading (PGlite)', () => {
  let db: PGlite;
  let app: FastifyInstance;
  let userId: number;
  let syncJwt: string;
  let key: ReturnType<typeof newCaptureKeyPair>;

  const rowCount = async (): Promise<number> =>
    (
      await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM capture_read_models WHERE user_id = $1',
        [userId],
      )
    ).rows[0].n;

  const storedRow = async (): Promise<{
    payload: string | null;
    published_at: unknown;
  } | null> =>
    (
      await db.query<{ payload: string | null; published_at: unknown }>(
        'SELECT payload, published_at FROM capture_read_models WHERE user_id = $1',
        [userId],
      )
    ).rows[0] ?? null;

  const api = (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    url: string,
    payload?: unknown,
    token = syncJwt,
  ): Promise<LightMyRequestResponse> =>
    app.inject({
      method,
      url: `/api/capture${url}`,
      // Like the app's _fetchApi: JSON content type even on bodyless requests.
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(payload === undefined
        ? {}
        : { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
    });

  const mcp = (token: string | null, body: unknown): Promise<LightMyRequestResponse> =>
    app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      payload: JSON.stringify(body),
    });

  const toolCall = (name: string, args: Record<string, unknown>, id = 1): unknown => ({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });

  const newToken = async (): Promise<string> =>
    (await api('POST', '/tokens', { clientName: 'Claude' })).json().token;

  const switchOn = async (): Promise<string> => {
    const res = await api('PUT', '/read-access');
    expect(res.statusCode).toBe(200);
    return res.json().enableId;
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    Object.assign(mocked.prisma, createCapturePrisma(db));
    app = Fastify();
    await app.register(captureMcpRoutes);
    await app.register(captureRoutes, { prefix: '/api/capture' });
    await app.register(captureReadRoutes, { prefix: '/api/capture' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  beforeEach(async () => {
    resetCaptureMemoryForTests();
    resetCaptureRateLimitForTests();
    await createCaptureSchema(db);
    userId = await addUser(db, 'a@example.com');
    syncJwt = jwt.sign(
      { userId, email: 'a@example.com', tokenVersion: 0 },
      process.env.JWT_SECRET as string,
    );
    key = newCaptureKeyPair();
  });

  describe('store', () => {
    it('refuses to switch on without live capture', async () => {
      expect(await enableReadAccess(userId, NOW)).toEqual({ status: 'capture_disabled' });
      await registerCaptureKey(userId, key.publicKey, NOW);
      await disableCaptureKey(userId, NOW);
      expect(await enableReadAccess(userId, NOW)).toEqual({ status: 'capture_disabled' });
      expect(await rowCount()).toBe(0);
    });

    it('keeps one enablement: a second switch-on returns the first id', async () => {
      await registerCaptureKey(userId, key.publicKey, NOW);
      const first = await enableReadAccess(userId, NOW);
      if (first.status !== 'enabled') throw new Error(first.status);
      expect(first.publishedAt).toBeNull();
      expect(first.enableId).toMatch(/^[0-9a-f-]{36}$/);
      expect(await publishReadModel(userId, first.enableId, '{"x":1}', NOW + 5)).toBe(
        'published',
      );
      expect(await enableReadAccess(userId, NOW + 10)).toEqual({
        status: 'enabled',
        enableId: first.enableId,
        publishedAt: NOW + 5,
      });
      // BIGINT columns come back as numbers.
      expect(await getReadAccess(userId)).toEqual({
        enabled: true,
        enableId: first.enableId,
        publishedAt: NOW + 5,
      });
      expect(await loadReadModel(userId)).toEqual({
        payload: '{"x":1}',
        publishedAt: NOW + 5,
      });
    });

    it('gives a new id after switching off and on', async () => {
      await registerCaptureKey(userId, key.publicKey, NOW);
      const first = await enableReadAccess(userId, NOW);
      await disableReadAccess(userId);
      expect(await getReadAccess(userId)).toEqual({
        enabled: false,
        enableId: null,
        publishedAt: null,
      });
      expect(await loadReadModel(userId)).toBeNull();
      const second = await enableReadAccess(userId, NOW);
      if (first.status !== 'enabled' || second.status !== 'enabled') throw new Error();
      expect(second.enableId).not.toBe(first.enableId);
      expect(await publishReadModel(userId, first.enableId, '{"stale":true}', NOW)).toBe(
        'read_disabled',
      );
    });

    it('publishes only against the current enablement and never creates a row', async () => {
      expect(await publishReadModel(userId, 'any-id', '{"x":1}', NOW)).toBe(
        'read_disabled',
      );
      expect(await rowCount()).toBe(0);
      await registerCaptureKey(userId, key.publicKey, NOW);
      await enableReadAccess(userId, NOW);
      expect(await publishReadModel(userId, 'wrong-id', '{"x":1}', NOW)).toBe(
        'read_disabled',
      );
      expect(await storedRow()).toEqual({ payload: null, published_at: null });
    });

    it('only moves published_at for an identical list', async () => {
      await registerCaptureKey(userId, key.publicKey, NOW);
      const enabled = await enableReadAccess(userId, NOW);
      if (enabled.status !== 'enabled') throw new Error(enabled.status);
      await publishReadModel(userId, enabled.enableId, '{"x":1}', NOW + 1);

      const execute = mocked.prisma.$executeRaw as (
        ...args: unknown[]
      ) => Promise<number>;
      const statements: string[] = [];
      mocked.prisma.$executeRaw = async (...args: unknown[]) => {
        statements.push((args[0] as TemplateStringsArray).join('?'));
        return execute(...args);
      };
      try {
        expect(await publishReadModel(userId, enabled.enableId, '{"x":1}', NOW + 2)).toBe(
          'published',
        );
      } finally {
        mocked.prisma.$executeRaw = execute;
      }
      expect(statements).toHaveLength(1);
      expect(statements[0]).not.toMatch(/SET payload/);
      expect(await loadReadModel(userId)).toEqual({
        payload: '{"x":1}',
        publishedAt: NOW + 2,
      });

      await publishReadModel(userId, enabled.enableId, '{"x":2}', NOW + 3);
      expect(await loadReadModel(userId)).toEqual({
        payload: '{"x":2}',
        publishedAt: NOW + 3,
      });
    });

    it('capture switch-off deletes the row', async () => {
      await registerCaptureKey(userId, key.publicKey, NOW);
      const enabled = await enableReadAccess(userId, NOW);
      if (enabled.status !== 'enabled') throw new Error(enabled.status);
      await publishReadModel(userId, enabled.enableId, '{"x":1}', NOW);
      await disableCaptureKey(userId, NOW);
      expect(await rowCount()).toBe(0);
    });

    it('a switch-off that commits before the switch-on leaves no row', async () => {
      // PGlite runs transactions one at a time, so the race is played in order.
      await registerCaptureKey(userId, key.publicKey, NOW);
      await disableCaptureKey(userId, NOW);
      expect(await enableReadAccess(userId, NOW)).toEqual({ status: 'capture_disabled' });
      expect(await rowCount()).toBe(0);
    });

    it('cascades on account deletion', async () => {
      await registerCaptureKey(userId, key.publicKey, NOW);
      await enableReadAccess(userId, NOW);
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
      expect(await rowCount()).toBe(0);
    });
  });

  describe('routes', () => {
    it('switches reading on and off and reports the state', async () => {
      expect((await api('GET', '/read-access')).json()).toEqual({
        enabled: false,
        enableId: null,
        publishedAt: null,
      });
      const refused = await api('PUT', '/read-access');
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({ error: 'capture_disabled' });

      await api('PUT', '/key', { publicKey: key.publicKey });
      const on = await api('PUT', '/read-access');
      expect(on.statusCode).toBe(200);
      const { enableId } = on.json();
      expect(on.json()).toEqual({ enabled: true, enableId, publishedAt: null });
      expect((await api('PUT', '/read-access')).json().enableId).toBe(enableId);
      expect((await api('GET', '/read-access')).json()).toEqual({
        enabled: true,
        enableId,
        publishedAt: null,
      });

      const off = await api('DELETE', '/read-access');
      expect(off.statusCode).toBe(200);
      expect(off.json()).toEqual({ enabled: false });
      expect(await rowCount()).toBe(0);
    });

    it('stores a valid list and round-trips it', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const enableId = await switchOn();
      const model = readModel();
      const before = Date.now();
      const res = await api('PUT', '/read-model', { enableId, model });
      expect(res.statusCode).toBe(200);
      const { publishedAt } = res.json();
      expect(publishedAt).toBeGreaterThanOrEqual(before);
      expect(JSON.parse((await storedRow())?.payload as string)).toEqual(model);
      expect((await api('GET', '/read-access')).json()).toEqual({
        enabled: true,
        enableId,
        publishedAt,
      });
    });

    it('refuses a list for another enablement or while reading is off', async () => {
      const off = await api('PUT', '/read-model', { enableId: 'x', model: readModel() });
      expect(off.statusCode).toBe(409);
      expect(off.json()).toEqual({ error: 'read_disabled' });
      await api('PUT', '/key', { publicKey: key.publicKey });
      await switchOn();
      const wrong = await api('PUT', '/read-model', {
        enableId: 'x',
        model: readModel(),
      });
      expect(wrong.statusCode).toBe(409);
      expect(await storedRow()).toEqual({ payload: null, published_at: null });
    });

    it('refuses notes, time fields, invalid days and other bad lists, keeping the stored one', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const enableId = await switchOn();
      await api('PUT', '/read-model', { enableId, model: readModel() });
      const stored = (await storedRow())?.payload;

      const withTask = (extra: Record<string, unknown>) => {
        const model = readModel();
        return { ...model, tasks: [{ ...model.tasks[0], ...extra }] };
      };
      const bodies: unknown[] = [
        { enableId, model: withTask({ notes: 'secret' }) },
        { enableId, model: withTask({ timeSpent: 60_000 }) },
        { enableId, model: withTask({ timeEstimate: 60_000 }) },
        { enableId, model: withTask({ dueDay: '2024-02-30' }) },
        { enableId, model: { ...readModel(), today: '2024-02-30' } },
        { enableId, model: { ...readModel(), extra: true } },
        { enableId, model: { ...readModel(), v: 2 } },
        { enableId, model: { ...readModel(), dayStarts: [] } },
        { enableId, model: { ...readModel(), dayStarts: [2, 1] } },
        { enableId, model: { ...readModel(), dayStarts: [1, 2, 3, 4, 5, 6, 7, 8, 9] } },
        { enableId, model: withTask({ id: 'x'.repeat(65) }) },
        { enableId, model: withTask({ title: '😀'.repeat(501) }) },
        { enableId, model: withTask({ carryOver: false }) },
        { enableId, model: withTask({ tagIds: Array.from({ length: 51 }, () => 't') }) },
        { enableId: '', model: readModel() },
        { model: readModel() },
        {},
      ];
      for (const body of bodies) {
        const res = await api('PUT', '/read-model', body);
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'Invalid body' });
      }
      expect((await storedRow())?.payload).toBe(stored);

      // 500 emoji are 500 characters, though 1000 UTF-16 units.
      const emoji = await api('PUT', '/read-model', {
        enableId,
        model: withTask({ title: '😀'.repeat(500) }),
      });
      expect(emoji.statusCode).toBe(200);
    });

    it('refuses a body over 1 MiB', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const enableId = await switchOn();
      const res = await api(
        'PUT',
        '/read-model',
        JSON.stringify({ enableId, model: { pad: 'x'.repeat(1024 * 1024) } }),
      );
      expect(res.statusCode).toBe(413);
    });

    it('refuses a capture token on all four routes', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const token = await newToken();
      for (const [method, url] of [
        ['GET', '/read-access'],
        ['PUT', '/read-access'],
        ['DELETE', '/read-access'],
        ['PUT', '/read-model'],
      ] as const) {
        const body =
          url === '/read-model' ? { enableId: 'x', model: readModel() } : undefined;
        expect((await api(method, url, body, token)).statusCode).toBe(401);
      }
      expect(await rowCount()).toBe(0);
    });

    it('capture switch-off over the API removes reading', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const enableId = await switchOn();
      await api('PUT', '/read-model', { enableId, model: readModel() });
      expect((await api('DELETE', '/key')).statusCode).toBe(200);
      expect(await rowCount()).toBe(0);
      expect((await api('GET', '/read-access')).json()).toEqual({
        enabled: false,
        enableId: null,
        publishedAt: null,
      });
    });
  });

  describe('/mcp', () => {
    const toolNames = async (token: string): Promise<string[]> =>
      (await mcp(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))
        .json()
        .result.tools.map((tool: { name: string }) => tool.name);

    it('reading off returns the switched-off error', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const token = await newToken();
      for (const [name, args] of [
        ['list_tasks', { tagId: 'TODAY' }],
        ['get_task', { id: 't1' }],
      ] as const) {
        const res = await mcp(token, toolCall(name, args));
        expect(res.statusCode).toBe(200);
        expect(res.json().result).toEqual({
          content: [{ type: 'text', text: READ_SWITCHED_OFF_TEXT }],
          isError: true,
        });
      }
    });

    it('lists three tools whether reading is on or off', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const token = await newToken();
      expect(await toolNames(token)).toEqual(['create_task', 'list_tasks', 'get_task']);
      await switchOn();
      expect(await toolNames(token)).toEqual(['create_task', 'list_tasks', 'get_task']);
    });

    it('answers from the published list once reading is on', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const token = await newToken();
      const enableId = await switchOn();
      const notYet = await mcp(token, toolCall('list_tasks', {}));
      expect(notYet.json().result.content[0].text).toBe(READ_NOT_SHARED_TEXT);

      await api('PUT', '/read-model', { enableId, model: readModel() });
      const res = await mcp(token, toolCall('list_tasks', { tagId: 'TODAY' }));
      expect(res.statusCode).toBe(200);
      const { result } = res.json();
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        tasks: [{ id: 't1', title: 'Buy milk', isDone: false }],
        today: '2026-11-17',
        rolledOver: false,
        truncated: false,
      });
      expect(result.content[0].text).not.toContain('"notes"');

      await api('DELETE', '/read-access');
      expect(
        (await mcp(token, toolCall('list_tasks', {}))).json().result.content[0].text,
      ).toBe(READ_SWITCHED_OFF_TEXT);
    });

    it('answers not shared yet for a stored list that does not parse', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const token = await newToken();
      await switchOn();
      await db.query(
        `UPDATE capture_read_models SET payload = '{broken', published_at = 1 WHERE user_id = $1`,
        [userId],
      );
      for (const [name, args] of [
        ['list_tasks', {}],
        ['get_task', { id: 't1' }],
      ] as const) {
        const { result } = (await mcp(token, toolCall(name, args))).json();
        expect(result).toEqual({
          content: [{ type: 'text', text: READ_NOT_SHARED_TEXT }],
          isError: true,
        });
      }
    });

    it('refuses a request without a token', async () => {
      const res = await mcp(null, toolCall('list_tasks', {}));
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer scope="tasks:capture"');
    });

    it('create_task still saves with reading off, on, and without the read table', async () => {
      await api('PUT', '/key', { publicKey: key.publicKey });
      const token = await newToken();
      const saved = async (title: string): Promise<void> => {
        const { result } = (await mcp(token, toolCall('create_task', { title }))).json();
        expect(result).toEqual({ content: [{ type: 'text', text: CAPTURE_SAVED_TEXT }] });
      };
      await saved('Off');
      await switchOn();
      await saved('On');
      await db.exec('DROP TABLE capture_read_models');
      await saved('No table');
    });
  });

  describe('two accounts', () => {
    interface Account {
      id: number;
      jwt: string;
      token: string;
      enableId: string;
      publishedAt: number;
    }
    interface Row {
      enable_id: string;
      payload: string | null;
      published_at: unknown;
    }

    let a: Account;
    let b: Account;

    const rowOf = async (id: number): Promise<Row | null> =>
      (
        await db.query<Row>(
          'SELECT enable_id, payload, published_at FROM capture_read_models WHERE user_id = $1',
          [id],
        )
      ).rows[0] ?? null;

    const hasLiveKey = async (id: number): Promise<boolean> =>
      (
        await db.query(
          'SELECT 1 FROM capture_keys WHERE user_id = $1 AND disabled_at IS NULL',
          [id],
        )
      ).rows.length === 1;

    /** A live key, a capture token, an enablement and a published list of its own. */
    const setUpAccount = async (
      id: number,
      accountJwt: string,
      title: string,
    ): Promise<Account> => {
      const keyRes = await api(
        'PUT',
        '/key',
        { publicKey: newCaptureKeyPair().publicKey },
        accountJwt,
      );
      expect(keyRes.statusCode).toBe(200);
      const token = (
        await api('POST', '/tokens', { clientName: 'Claude' }, accountJwt)
      ).json().token;
      const on = await api('PUT', '/read-access', undefined, accountJwt);
      expect(on.statusCode).toBe(200);
      const { enableId } = on.json();
      const published = await api(
        'PUT',
        '/read-model',
        { enableId, model: readModel(title) },
        accountJwt,
      );
      expect(published.statusCode).toBe(200);
      return {
        id,
        jwt: accountJwt,
        token,
        enableId,
        publishedAt: published.json().publishedAt,
      };
    };

    const accessOf = async (account: Account): Promise<unknown> =>
      (await api('GET', '/read-access', undefined, account.jwt)).json();

    const listedTitles = async (account: Account): Promise<string[]> => {
      const { result } = (await mcp(account.token, toolCall('list_tasks', {}))).json();
      expect(result.isError).toBeUndefined();
      return result.structuredContent.tasks.map((task: { title: string }) => task.title);
    };

    beforeEach(async () => {
      const otherId = await addUser(db, 'b@example.com');
      const otherJwt = jwt.sign(
        { userId: otherId, email: 'b@example.com', tokenVersion: 0 },
        process.env.JWT_SECRET as string,
      );
      a = await setUpAccount(userId, syncJwt, 'Alpha errand');
      b = await setUpAccount(otherId, otherJwt, 'Bravo errand');
      expect(b.enableId).not.toBe(a.enableId);
    });

    it('shows each account only its own enablement and list', async () => {
      expect(await accessOf(a)).toEqual({
        enabled: true,
        enableId: a.enableId,
        publishedAt: a.publishedAt,
      });
      expect(await accessOf(b)).toEqual({
        enabled: true,
        enableId: b.enableId,
        publishedAt: b.publishedAt,
      });
      expect(await listedTitles(a)).toEqual(['Alpha errand']);
      expect(await listedTitles(b)).toEqual(['Bravo errand']);
    });

    it("switching reading off for one account leaves the other's row and list", async () => {
      const othersRow = await rowOf(b.id);
      expect(othersRow).not.toBeNull();
      expect((await api('DELETE', '/read-access', undefined, a.jwt)).statusCode).toBe(
        200,
      );
      expect(await rowOf(a.id)).toBeNull();
      expect(await accessOf(a)).toEqual({
        enabled: false,
        enableId: null,
        publishedAt: null,
      });
      expect(await rowOf(b.id)).toEqual(othersRow);
      expect(await accessOf(b)).toEqual({
        enabled: true,
        enableId: b.enableId,
        publishedAt: b.publishedAt,
      });
      expect(await listedTitles(b)).toEqual(['Bravo errand']);
    });

    it("switching capture off for one account leaves the other's row", async () => {
      const othersRow = await rowOf(b.id);
      expect(othersRow).not.toBeNull();
      expect((await api('DELETE', '/key', undefined, a.jwt)).statusCode).toBe(200);
      expect(await rowOf(a.id)).toBeNull();
      expect(await rowOf(b.id)).toEqual(othersRow);
      expect(await accessOf(b)).toEqual({
        enabled: true,
        enableId: b.enableId,
        publishedAt: b.publishedAt,
      });
    });

    // The same switch-offs sent by the later-created account: a delete aimed
    // at the lowest account id instead of the caller's fails only here.
    it("switching reading off for the second account leaves the first's row and list", async () => {
      const firstRow = await rowOf(a.id);
      expect(firstRow).not.toBeNull();
      expect((await api('DELETE', '/read-access', undefined, b.jwt)).statusCode).toBe(
        200,
      );
      expect(await rowOf(b.id)).toBeNull();
      expect(await accessOf(b)).toEqual({
        enabled: false,
        enableId: null,
        publishedAt: null,
      });
      expect(await rowOf(a.id)).toEqual(firstRow);
      expect(await accessOf(a)).toEqual({
        enabled: true,
        enableId: a.enableId,
        publishedAt: a.publishedAt,
      });
      expect(await listedTitles(a)).toEqual(['Alpha errand']);
    });

    it("switching capture off for the second account leaves the first's row and list", async () => {
      const firstRow = await rowOf(a.id);
      expect(firstRow).not.toBeNull();
      expect((await api('DELETE', '/key', undefined, b.jwt)).statusCode).toBe(200);
      expect(await rowOf(b.id)).toBeNull();
      expect(await rowOf(a.id)).toEqual(firstRow);
      expect(await accessOf(a)).toEqual({
        enabled: true,
        enableId: a.enableId,
        publishedAt: a.publishedAt,
      });
      expect(await listedTitles(a)).toEqual(['Alpha errand']);
    });

    // The switch-on's key check must look at the caller's key only: the other
    // account's live key does not count.
    it("refuses reading for the second account while its capture is off and the first's is live", async () => {
      expect((await api('DELETE', '/key', undefined, b.jwt)).statusCode).toBe(200);
      expect(await hasLiveKey(b.id)).toBe(false);
      expect(await hasLiveKey(a.id)).toBe(true);
      expect(await accessOf(a)).toEqual({
        enabled: true,
        enableId: a.enableId,
        publishedAt: a.publishedAt,
      });
      const refused = await api('PUT', '/read-access', undefined, b.jwt);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({ error: 'capture_disabled' });
      expect(await rowOf(b.id)).toBeNull();
    });

    it("refuses reading for the first account while its capture is off and the second's is live", async () => {
      expect((await api('DELETE', '/key', undefined, a.jwt)).statusCode).toBe(200);
      expect(await hasLiveKey(a.id)).toBe(false);
      expect(await hasLiveKey(b.id)).toBe(true);
      expect(await accessOf(b)).toEqual({
        enabled: true,
        enableId: b.enableId,
        publishedAt: b.publishedAt,
      });
      const refused = await api('PUT', '/read-access', undefined, a.jwt);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({ error: 'capture_disabled' });
      expect(await rowOf(a.id)).toBeNull();
    });

    // A publish must land in the caller's own row, whichever account has the
    // higher id.
    it("a new list from the first account is stored while the second's is on", async () => {
      const othersRow = await rowOf(b.id);
      const res = await api(
        'PUT',
        '/read-model',
        { enableId: a.enableId, model: readModel('Alpha update') },
        a.jwt,
      );
      expect(res.statusCode).toBe(200);
      expect(await listedTitles(a)).toEqual(['Alpha update']);
      expect(await rowOf(b.id)).toEqual(othersRow);
    });

    // The unchanged-list shortcut may only touch the caller's row.
    it('an unchanged list from either account only moves its own published_at', async () => {
      const execute = mocked.prisma.$executeRaw as (
        ...args: unknown[]
      ) => Promise<number>;
      for (const [account, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const payload = (await rowOf(account.id))?.payload as string;
        const othersRow = await rowOf(other.id);
        const statements: string[] = [];
        mocked.prisma.$executeRaw = async (...args: unknown[]) => {
          statements.push((args[0] as TemplateStringsArray).join('?'));
          return execute(...args);
        };
        try {
          expect(await publishReadModel(account.id, account.enableId, payload, NOW)).toBe(
            'published',
          );
        } finally {
          mocked.prisma.$executeRaw = execute;
        }
        expect(statements).toHaveLength(1);
        expect(await loadReadModel(account.id)).toEqual({ payload, publishedAt: NOW });
        expect(await rowOf(other.id)).toEqual(othersRow);
      }
    });

    // Switching on again answers with the caller's enablement, never another
    // account's.
    it('the first account switching on again gets its own enablement back', async () => {
      const again = await api('PUT', '/read-access', undefined, a.jwt);
      expect(again.json()).toEqual({
        enabled: true,
        enableId: a.enableId,
        publishedAt: a.publishedAt,
      });
    });

    // An enablement id is not a capability across accounts: a device that
    // still holds another account's id must not write into that account's row.
    it("refuses a list sent with the other account's enablement id", async () => {
      const othersRow = await rowOf(b.id);
      const res = await api(
        'PUT',
        '/read-model',
        { enableId: b.enableId, model: readModel('Alpha leak') },
        a.jwt,
      );
      expect(res.statusCode).toBe(409);
      expect(await rowOf(b.id)).toEqual(othersRow);
      expect(await listedTitles(b)).toEqual(['Bravo errand']);
    });

    it("refuses the other account's own list sent with its enablement id", async () => {
      const othersRow = await rowOf(b.id);
      expect(
        await publishReadModel(a.id, b.enableId, othersRow?.payload as string, NOW),
      ).toBe('read_disabled');
      expect(await rowOf(b.id)).toEqual(othersRow);
    });
  });

  describe('restore procedure (docs/backup-and-recovery.md)', () => {
    // The statement exactly as the document prints it for the shell.
    const restoreStatement = (): string => {
      const doc = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../docs/backup-and-recovery.md'),
        'utf8',
      );
      const line = doc.split('\n').find((l) => l.includes('to_regclass'));
      const quoted = line && /-c "(.*)"$/.exec(line);
      if (!quoted) throw new Error('restore statement not found');
      return quoted[1].replace(/\\\$/g, '$');
    };

    it('empties the read table, and succeeds when a dump has none', async () => {
      const statement = restoreStatement();
      expect(statement).toBe(
        "DO $$BEGIN IF to_regclass('public.capture_read_models') IS NOT NULL THEN TRUNCATE capture_read_models; END IF; END$$",
      );
      await registerCaptureKey(userId, key.publicKey, NOW);
      await enableReadAccess(userId, NOW);
      await db.exec(statement);
      expect(await rowCount()).toBe(0);

      await db.exec('DROP TABLE capture_read_models');
      await expect(db.exec(statement)).resolves.toBeDefined();
    });
  });
});
