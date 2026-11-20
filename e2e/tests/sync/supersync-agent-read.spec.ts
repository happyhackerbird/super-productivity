import type { Locator } from '@playwright/test';
import { test, expect } from '../../fixtures/supersync.fixture';
import {
  closeClient,
  createSimulatedClient,
  createTestUser,
  getSuperSyncConfig,
  getTaskElement,
  getTaskTitles,
  markTaskDone,
  SUPERSYNC_BASE_URL,
  waitForTask,
  type SimulatedE2EClient,
} from '../../utils/supersync-helpers';

/**
 * Agent task reading: a web client shares its open-task list with SuperSync
 * and an assistant reads it over `/mcp` (`list_tasks`). Needs the server
 * started with CAPTURE_CONNECTOR_ENABLED=true (docker-compose.supersync.yaml).
 *
 * The list is published after a sync, at most once a minute plus one trailing
 * run (task-read-publisher.service.ts), so a change can take up to a minute to
 * reach the server after the sync that carries it.
 */

const PUBLISH_TIMEOUT = 90_000;
const READ_SWITCHED_OFF_TEXT = 'Task reading is switched off in Super Productivity.';
const CAPTURE_SAVED_TEXT =
  'Saved. It will appear in your Super Productivity Inbox the next time the app syncs.';

// Copied from supersync-agent-capture.spec.ts, which stays untouched.
const createTokenInSettings = async (client: SimulatedE2EClient): Promise<string> => {
  const dialog = await client.sync.openSuperSyncSettings();
  const capture = dialog.locator('agent-capture-settings');
  await capture.locator('details.agent-capture > summary').click();
  await capture.getByRole('button', { name: 'Let AI assistants add tasks' }).click();
  await capture.locator('details.manual-tokens > summary').click();
  await capture.getByLabel('Assistant name').fill('E2E assistant');
  await capture.getByRole('button', { name: 'Create token' }).click();
  const tokenInput = capture.locator('[e2e="captureToken"]');
  await expect(tokenInput).toHaveValue(/^sp_cap_/);
  const token = await tokenInput.inputValue();
  // Cancel only discards the form: capture was switched on directly.
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).toBeHidden();
  return token;
};

// Copied from supersync-agent-capture.spec.ts; an empty bearer sends no header.
const postJson = (
  path: string,
  bearer: string,
  body: unknown,
  method = 'POST',
): Promise<Response> => {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json, text/event-stream');
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  return fetch(`${SUPERSYNC_BASE_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

interface ListedTask {
  title: string;
  [key: string]: unknown;
}

/** Returns the tool result; a refused token fails the test. */
const callTool = async (
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
  const response = await postJson('/mcp', token, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result: ToolResult };
  return body.result;
};

const listToolNames = async (token: string): Promise<string[]> => {
  const response = await postJson('/mcp', token, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
  return body.result.tools.map((tool) => tool.name);
};

/** The Today list as `list_tasks` returns it; an error result fails the test. */
const listTodayTasks = async (token: string): Promise<ListedTask[]> => {
  const result = await callTool(token, 'list_tasks', { tagId: 'TODAY' });
  expect(result.isError, result.content[0]?.text).toBeFalsy();
  return (result.structuredContent as { tasks: ListedTask[] }).tasks;
};

const expectReadingSwitchedOff = async (token: string): Promise<void> => {
  expect(await callTool(token, 'list_tasks', { tagId: 'TODAY' })).toEqual({
    content: [{ type: 'text', text: READ_SWITCHED_OFF_TEXT }],
    isError: true,
  });
};

/** Opens the read block inside the collapsed "AI assistants" section. */
const openReadSettings = async (
  client: SimulatedE2EClient,
): Promise<{ dialog: Locator; read: Locator }> => {
  const dialog = await client.sync.openSuperSyncSettings();
  const capture = dialog.locator('agent-capture-settings');
  await capture.locator('details.agent-capture > summary').click();
  return { dialog, read: capture.locator('agent-read-settings') };
};

const closeSettings = async (dialog: Locator): Promise<void> => {
  // Cancel only discards the form: reading was switched directly.
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).toBeHidden();
};

const switchReadingOn = async (client: SimulatedE2EClient): Promise<void> => {
  const { dialog, read } = await openReadSettings(client);
  await read.locator('[e2e="agentReadOn"]').click();
  // The "on, ids equal" line: the server enabled reading for this account's opt-in.
  await expect(read.locator('[e2e="agentReadState"]')).toBeVisible();
  await closeSettings(dialog);
};

const switchReadingOff = async (client: SimulatedE2EClient): Promise<void> => {
  const { dialog, read } = await openReadSettings(client);
  await read.locator('[e2e="agentReadOff"]').click();
  await expect(read.locator('[e2e="agentReadOn"]')).toBeVisible();
  await expect(read.locator('[e2e="agentReadState"]')).toHaveCount(0);
  await closeSettings(dialog);
};

/** The one title shown in the UI that contains `name`. */
const uiTitle = (titles: string[], name: string): string => {
  const matches = titles.filter((title) => title.includes(name));
  expect(matches, `exactly one task title containing ${name}`).toHaveLength(1);
  return matches[0];
};

test.describe('@supersync Agent task reading', () => {
  let client: SimulatedE2EClient | null = null;

  test.beforeEach(() => {
    test.setTimeout(400_000);
    client = null;
  });

  test.afterEach(async () => {
    if (client) await closeClient(client);
  });

  test('an assistant reads the open Today list the app shares, and nothing once reading is off', async ({
    browser,
    baseURL,
    testRunId,
  }) => {
    const user = await createTestUser(testRunId);
    const a = await createSimulatedClient(browser, baseURL!, 'A', testRunId);
    client = a;
    await a.sync.setupSuperSync(getSuperSyncConfig(user));

    // Three tasks in Today; one done, one open task with a subtask.
    await a.page.evaluate(() => (location.hash = '#/tag/TODAY/tasks'));
    await a.workView.waitForTaskList();
    const alpha = `Alpha-${testRunId}`;
    const bravo = `Bravo-${testRunId}`;
    const charlie = `Charlie-${testRunId}`;
    const echo = `Echo-${testRunId}`;
    await a.workView.addTask(alpha);
    await a.workView.addTask(bravo);
    await a.workView.addTask(charlie);
    await markTaskDone(a, bravo);
    await a.workView.addSubTask(getTaskElement(a, alpha).first(), echo);
    await waitForTask(a.page, echo);

    const token = await createTokenInSettings(a);
    expect(await listToolNames(token)).toEqual([
      'create_task',
      'list_tasks',
      'get_task',
      'tracker_get',
      'tracker_add_task',
      'tracker_update_task',
      'tracker_delete_task',
      'tracker_add_goal',
      'tracker_update_goal',
      'tracker_delete_goal',
    ]);
    await expectReadingSwitchedOff(token);

    await switchReadingOn(a);
    await a.sync.syncAndWait();

    // Today order as this client's Today list shows it.
    const shown = await getTaskTitles(a);
    const alphaTitle = uiTitle(shown, alpha);
    const charlieTitle = uiTitle(shown, charlie);
    const echoTitle = uiTitle(shown, echo);
    const openTopLevel = shown.filter(
      (title) => title === alphaTitle || title === charlieTitle,
    );
    expect(openTopLevel).toHaveLength(2);
    const expectedTitles = openTopLevel.flatMap((title) =>
      title === alphaTitle ? [title, echoTitle] : [title],
    );

    const listed = await listTodayTasks(token);
    expect(listed.map((task) => task.title)).toEqual(expectedTitles);
    for (const task of listed) {
      expect(task).not.toHaveProperty('notes');
    }

    // A change reaches the list through a sync and the publisher's throttle.
    const delta = `Delta-${testRunId}`;
    await a.workView.addTask(delta);
    const deltaTitle = uiTitle(await getTaskTitles(a), delta);
    await a.sync.syncAndWait();
    await expect
      .poll(async () => (await listTodayTasks(token)).map((task) => task.title), {
        timeout: PUBLISH_TIMEOUT,
        intervals: [2_000],
      })
      .toContain(deltaTitle);

    // Capture keeps working beside reading.
    const created = await callTool(token, 'create_task', {
      title: `Captured-${testRunId}`,
    });
    expect(created.isError).toBeFalsy();
    expect(created.content[0].text).toBe(CAPTURE_SAVED_TEXT);

    const unauthenticated = await postJson('/mcp', '', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(unauthenticated.status).toBe(401);

    await switchReadingOff(a);
    await expectReadingSwitchedOff(token);
    const access = await postJson(
      '/api/capture/read-access',
      user.token,
      undefined,
      'GET',
    );
    expect(access.status).toBe(200);
    expect(await access.json()).toEqual({
      enabled: false,
      enableId: null,
      publishedAt: null,
    });
  });
});
