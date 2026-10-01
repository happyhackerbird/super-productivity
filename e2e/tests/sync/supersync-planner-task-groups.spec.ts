import { type Locator, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/supersync.fixture';
import {
  closeClient,
  createSimulatedClient,
  createTestUser,
  getSuperSyncConfig,
  navigateToWorkView,
  renameTask,
  waitForTask,
  type SimulatedE2EClient,
} from '../../utils/supersync-helpers';

const UNGROUPED_LIST = '.normal-tasks-items';
const TASK_GROUP = '.task-group';
const NEW_GROUP_DROP_ZONE = '.new-task-group-drop-zone';

type Point = { x: number; y: number };

const half = (value: number): number => value / 2;

const getDbDateStr = async (page: Page, offsetDays = 0): Promise<string> =>
  page.evaluate((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }, offsetDays);

const centerOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element to drag from or to is not visible');
  }
  return { x: box.x + half(box.width), y: box.y + half(box.height) };
};

const bottomOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element to drop onto is not visible');
  }
  return { x: box.x + half(box.width), y: box.y + box.height - 4 };
};

const topOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element to drop onto is not visible');
  }
  return { x: box.x + half(box.width), y: box.y + 4 };
};

// Drags with real pointer events; the target is resolved while dragging, since
// the lists below the dragged task move up once it left its list.
const dragTo = async (
  page: Page,
  source: Locator,
  getTarget: () => Promise<Point>,
): Promise<void> => {
  await source.scrollIntoViewIfNeeded();
  const from = await centerOf(source);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 4 });
  const firstAim = await getTarget();
  await page.mouse.move(firstAim.x, firstAim.y, { steps: 20 });
  await expect(page.locator('.cdk-drag-placeholder')).toBeVisible();
  const to = await getTarget();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.move(to.x, to.y + 1, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('.cdk-drag-preview')).toHaveCount(0);
};

const openPlannerDay = async (page: Page, day: string): Promise<Locator> => {
  await page.goto('/#/planner');
  const plannerDay = page.locator(`planner-day[data-day="${day}"]`);
  await expect(plannerDay).toBeVisible();
  return plannerDay;
};

const taskIn = (plannerDay: Locator, name: string): Locator =>
  plannerDay.locator('planner-task').filter({ hasText: name });

const groupTitles = (plannerDay: Locator): Promise<string[][]> =>
  plannerDay
    .locator(TASK_GROUP)
    .evaluateAll((groups) =>
      groups.map((group) =>
        Array.from(group.querySelectorAll('planner-task .title')).map((title) =>
          (title.textContent || '').trim(),
        ),
      ),
    );

const getPlannerGroupOfTask = async (
  page: Page,
  taskName: string,
): Promise<{ title: string; plannerGroup: string | null } | null> =>
  page.evaluate((name) => {
    type TaskLike = { title?: string; plannerGroup?: string | null };
    type StoreState = { tasks?: { entities?: Record<string, TaskLike | undefined> } };
    type StoreLike = {
      subscribe: (next: (state: StoreState) => void) => { unsubscribe: () => void };
    };
    const store = (window as unknown as { __e2eTestHelpers?: { store?: StoreLike } })
      .__e2eTestHelpers?.store;
    if (!store) {
      throw new Error('E2E store helper is unavailable');
    }
    let latestState: StoreState | undefined;
    store.subscribe((state) => (latestState = state)).unsubscribe();
    const task = Object.values(latestState?.tasks?.entities ?? {}).find((t) =>
      t?.title?.includes(name),
    );
    return task
      ? { title: task.title as string, plannerGroup: task.plannerGroup ?? null }
      : null;
  }, taskName);

const syncBoth = async (
  clientA: SimulatedE2EClient,
  clientB: SimulatedE2EClient,
): Promise<void> => {
  await clientA.sync.syncAndWait();
  await clientB.sync.syncAndWait();
  await clientA.sync.syncAndWait();
  await clientB.sync.syncAndWait();
};

test.describe('@supersync Planner task groups', () => {
  test('a group created by drag and drop syncs and disappears with its last task', async ({
    browser,
    baseURL,
    testRunId,
  }) => {
    const uniqueId = Date.now();
    let clientA: SimulatedE2EClient | null = null;
    let clientB: SimulatedE2EClient | null = null;

    try {
      const syncConfig = getSuperSyncConfig(await createTestUser(testRunId));
      clientA = await createSimulatedClient(browser, baseURL!, 'A', testRunId);
      await clientA.sync.setupSuperSync(syncConfig);

      const first = `GroupFirst-${uniqueId}`;
      const second = `GroupSecond-${uniqueId}`;
      const other = `GroupOther-${uniqueId}`;
      const tomorrow = await getDbDateStr(clientA.page, 1);
      for (const taskName of [first, second, other]) {
        await clientA.workView.addTask(`${taskName} @tomorrow`, false, null);
      }

      // tomorrow is ordered by the planner day, not by the today list
      const dayA = await openPlannerDay(clientA.page, tomorrow);
      await expect(dayA.locator('planner-task')).toHaveCount(3);
      await dragTo(clientA.page, taskIn(dayA, first), () =>
        centerOf(dayA.locator(NEW_GROUP_DROP_ZONE)),
      );
      await expect(dayA.locator(TASK_GROUP)).toHaveCount(1);
      await dragTo(clientA.page, taskIn(dayA, second), () =>
        bottomOf(dayA.locator(TASK_GROUP).first()),
      );
      await expect(dayA.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
      const groupsOnA = await groupTitles(dayA);

      await clientA.sync.syncAndWait();
      clientB = await createSimulatedClient(browser, baseURL!, 'B', testRunId);
      await clientB.sync.setupSuperSync(syncConfig);
      await clientB.sync.syncAndWait();

      const dayB = await openPlannerDay(clientB.page, tomorrow);
      await expect(dayB.locator('planner-task')).toHaveCount(3);
      await expect.poll(() => groupTitles(dayB)).toEqual(groupsOnA);
      await expect(taskIn(dayB.locator(UNGROUPED_LIST), other)).toHaveCount(1);

      // last tasks leave the group on A
      for (const taskName of [first, second]) {
        await dragTo(clientA.page, taskIn(dayA, taskName), () =>
          topOf(dayA.locator(`${UNGROUPED_LIST} planner-task`).first()),
        );
      }
      await expect(dayA.locator(TASK_GROUP)).toHaveCount(0);

      await syncBoth(clientA, clientB);
      await expect(dayB.locator(TASK_GROUP)).toHaveCount(0);
      await expect(dayB.locator(`${UNGROUPED_LIST} planner-task`)).toHaveCount(3);
    } finally {
      if (clientA) await closeClient(clientA);
      if (clientB) await closeClient(clientB);
    }
  });

  test('a group and a concurrent rename of the same task both survive', async ({
    browser,
    baseURL,
    testRunId,
  }) => {
    const uniqueId = Date.now();
    let clientA: SimulatedE2EClient | null = null;
    let clientB: SimulatedE2EClient | null = null;

    try {
      const syncConfig = getSuperSyncConfig(await createTestUser(testRunId));
      clientA = await createSimulatedClient(browser, baseURL!, 'A', testRunId);
      await clientA.sync.setupSuperSync(syncConfig);
      clientB = await createSimulatedClient(browser, baseURL!, 'B', testRunId);
      await clientB.sync.setupSuperSync(syncConfig);

      const taskName = `GroupRename-${uniqueId}`;
      const renamed = `GroupRenamed-${uniqueId}`;
      await clientA.workView.addTask(taskName);
      await clientA.workView.addTask(`GroupRenameOther-${uniqueId}`);
      await syncBoth(clientA, clientB);
      await waitForTask(clientB.page, taskName);

      // concurrent: neither client has seen the change of the other
      const today = await getDbDateStr(clientA.page);
      const dayA = await openPlannerDay(clientA.page, today);
      await dragTo(clientA.page, taskIn(dayA, taskName), () =>
        centerOf(dayA.locator(NEW_GROUP_DROP_ZONE)),
      );
      await expect(dayA.locator(TASK_GROUP)).toHaveCount(1);
      const groupOnA = (await getPlannerGroupOfTask(clientA.page, taskName))
        ?.plannerGroup;
      expect(groupOnA).toMatch(new RegExp(`^${today}:.+`));
      await renameTask(clientB, taskName, renamed);

      await syncBoth(clientA, clientB);

      for (const client of [clientA, clientB]) {
        await expect
          .poll(
            async () => (await getPlannerGroupOfTask(client.page, renamed))?.plannerGroup,
          )
          .toBe(groupOnA);
      }
      await navigateToWorkView(clientB);
      const dayB = await openPlannerDay(clientB.page, today);
      await expect(taskIn(dayB.locator(TASK_GROUP), renamed)).toHaveCount(1);
    } finally {
      if (clientA) await closeClient(clientA);
      if (clientB) await closeClient(clientB);
    }
  });

  test('concurrent groups for the same task converge to one group', async ({
    browser,
    baseURL,
    testRunId,
  }) => {
    const uniqueId = Date.now();
    let clientA: SimulatedE2EClient | null = null;
    let clientB: SimulatedE2EClient | null = null;

    try {
      const syncConfig = getSuperSyncConfig(await createTestUser(testRunId));
      clientA = await createSimulatedClient(browser, baseURL!, 'A', testRunId);
      await clientA.sync.setupSuperSync(syncConfig);
      clientB = await createSimulatedClient(browser, baseURL!, 'B', testRunId);
      await clientB.sync.setupSuperSync(syncConfig);

      const taskName = `GroupBoth-${uniqueId}`;
      await clientA.workView.addTask(taskName);
      await clientA.workView.addTask(`GroupBothOther-${uniqueId}`);
      await syncBoth(clientA, clientB);
      await waitForTask(clientB.page, taskName);

      const today = await getDbDateStr(clientA.page);
      const groupValues: (string | null | undefined)[] = [];
      for (const client of [clientA, clientB]) {
        const day = await openPlannerDay(client.page, today);
        await dragTo(client.page, taskIn(day, taskName), () =>
          centerOf(day.locator(NEW_GROUP_DROP_ZONE)),
        );
        await expect(day.locator(TASK_GROUP)).toHaveCount(1);
        groupValues.push(
          (await getPlannerGroupOfTask(client.page, taskName))?.plannerGroup,
        );
      }
      expect(groupValues[0]).not.toEqual(groupValues[1]);

      await syncBoth(clientA, clientB);

      const onA = await getPlannerGroupOfTask(clientA.page, taskName);
      await expect
        .poll(() => getPlannerGroupOfTask(clientB!.page, taskName))
        .toEqual(onA);
      expect(groupValues).toContain(onA?.plannerGroup);
      for (const client of [clientA, clientB]) {
        const day = client.page.locator(`planner-day[data-day="${today}"]`);
        await expect(day.locator(TASK_GROUP)).toHaveCount(1);
        await expect(taskIn(day.locator(TASK_GROUP), taskName)).toHaveCount(1);
      }
    } finally {
      if (clientA) await closeClient(clientA);
      if (clientB) await closeClient(clientB);
    }
  });
});
