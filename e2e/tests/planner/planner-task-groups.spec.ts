import { type Locator, type Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test.fixture';
import { PlannerPage } from '../../pages/planner.page';

const UNGROUPED_LIST = '.normal-tasks-items';
const TASK_GROUP = '.task-group';
const NEW_GROUP_DROP_ZONE = '.new-task-group-drop-zone';
const SCHEDULE_DIALOG = 'dialog-schedule-task';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type Point = { x: number; y: number };

const half = (value: number): number => value / 2;

const centerOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element to drag from or to is not visible');
  }
  return { x: box.x + half(box.width), y: box.y + half(box.height) };
};

/**
 * Drags with real pointer events. The target is resolved while dragging, since
 * the lists below the dragged task move up once it left its list.
 */
const dragTo = async (
  page: Page,
  source: Locator,
  getTarget: () => Promise<Point>,
  getFinalTarget: () => Promise<Point> = getTarget,
): Promise<void> => {
  const from = await centerOf(source);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 4 });
  const firstAim = await getTarget();
  await page.mouse.move(firstAim.x, firstAim.y, { steps: 20 });
  await expect(page.locator('.cdk-drag-placeholder')).toBeVisible();
  const to = await getFinalTarget();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.move(to.x, to.y + 1, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('.cdk-drag-preview')).toHaveCount(0);
};

test.describe('Planner task groups', () => {
  let today: Locator;

  const taskInToday = (title: string): Locator =>
    today.locator('planner-task').filter({ hasText: title });

  const startGroupWith = async (
    page: Page,
    title: string,
    belowZone = false,
  ): Promise<void> => {
    const zoneCenter = (): Promise<Point> => centerOf(today.locator(NEW_GROUP_DROP_ZONE));
    const belowZonePoint = async (): Promise<Point> => {
      const zone = today.locator(NEW_GROUP_DROP_ZONE);
      const center = await centerOf(zone);
      const box = await zone.boundingBox();
      if (!box) {
        throw new Error('New group drop zone is not visible');
      }
      return { x: center.x, y: box.y + box.height + 20 };
    };
    await dragTo(
      page,
      taskInToday(title),
      zoneCenter,
      belowZone ? belowZonePoint : zoneCenter,
    );
  };

  const dragIntoGroup = async (
    page: Page,
    title: string,
    groupIndex = 0,
  ): Promise<void> => {
    await dragTo(page, taskInToday(title), async () => {
      const box = await today.locator(TASK_GROUP).nth(groupIndex).boundingBox();
      if (!box) {
        throw new Error('Task group is not visible');
      }
      return { x: box.x + half(box.width), y: box.y + box.height - 4 };
    });
  };

  const dragIntoUngroupedList = async (page: Page, title: string): Promise<void> => {
    await dragTo(page, taskInToday(title), async () => {
      const box = await today
        .locator(`${UNGROUPED_LIST} planner-task`)
        .first()
        .boundingBox();
      if (!box) {
        throw new Error('Ungrouped list has no task to drop onto');
      }
      return { x: box.x + half(box.width), y: box.y + 4 };
    });
  };

  test.beforeEach(async ({ page, workViewPage }) => {
    await workViewPage.waitForTaskList();
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await workViewPage.addTask(title);
    }
    await new PlannerPage(page).navigateToPlanner();
    today = page.locator('planner-day').first();
    await expect(today.locator('planner-task')).toHaveCount(3);
  });

  test('a separated drop at the end of the list starts a group without schedule dialog', async ({
    page,
  }) => {
    await startGroupWith(page, 'Gamma');

    await expect(today.locator(TASK_GROUP)).toHaveCount(1);
    await expect(today.locator(`${TASK_GROUP} planner-task`)).toHaveCount(1);
    await expect(today.locator(`${TASK_GROUP} planner-task`)).toContainText('Gamma');
    await expect(today.locator(`${UNGROUPED_LIST} planner-task`)).toHaveCount(2);
    await expect(page.locator(SCHEDULE_DIALOG)).toHaveCount(0);
  });

  test('a task dragged into the group joins it', async ({ page }) => {
    await startGroupWith(page, 'Gamma');
    await expect(today.locator(TASK_GROUP)).toHaveCount(1);

    await dragIntoGroup(page, 'Alpha');

    await expect(today.locator(TASK_GROUP)).toHaveCount(1);
    await expect(today.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
    await expect(
      today.locator(`${TASK_GROUP} planner-task`).filter({ hasText: 'Alpha' }),
    ).toHaveCount(1);
    await expect(today.locator(`${UNGROUPED_LIST} planner-task`)).toHaveCount(1);
    await expect(page.locator(SCHEDULE_DIALOG)).toHaveCount(0);
  });

  test('splitting a group can be repeated after later groups', async ({ page }) => {
    await startGroupWith(page, 'Gamma');
    await expect(today.locator(TASK_GROUP)).toHaveCount(1);
    await dragIntoGroup(page, 'Beta');
    await expect(today.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);

    await startGroupWith(page, 'Beta');

    await expect(today.locator(TASK_GROUP)).toHaveCount(2);
    await expect(today.locator(TASK_GROUP).first().locator('planner-task')).toContainText(
      'Gamma',
    );
    await expect(today.locator(TASK_GROUP).last().locator('planner-task')).toContainText(
      'Beta',
    );

    await dragIntoGroup(page, 'Alpha', 1);
    await expect(today.locator(TASK_GROUP).last().locator('planner-task')).toHaveCount(2);
    await startGroupWith(page, 'Alpha', true);

    await expect(today.locator(TASK_GROUP)).toHaveCount(3);
    await expect(today.locator(TASK_GROUP).nth(1).locator('planner-task')).toContainText(
      'Beta',
    );
    await expect(today.locator(TASK_GROUP).last().locator('planner-task')).toContainText(
      'Alpha',
    );
    await expect(page.locator(SCHEDULE_DIALOG)).toHaveCount(0);
  });

  test('dragging the last task out removes the group', async ({ page }) => {
    await startGroupWith(page, 'Gamma');
    await expect(today.locator(TASK_GROUP)).toHaveCount(1);

    await dragIntoUngroupedList(page, 'Gamma');

    await expect(today.locator(TASK_GROUP)).toHaveCount(0);
    await expect(today.locator(`${UNGROUPED_LIST} planner-task`)).toHaveCount(3);
    await expect(page.locator(SCHEDULE_DIALOG)).toHaveCount(0);
  });

  test('the regular day list is framed and two groups stay separate when overdue', async ({
    page,
  }) => {
    await page.clock.install();
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();
    today = page.locator('planner-day').first();
    await startGroupWith(page, 'Gamma');
    await page.clock.setSystemTime(Date.now() + 1);
    await startGroupWith(page, 'Beta');
    await expect(today.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
    await expect(today.locator(TASK_GROUP)).toHaveCount(2);
    await expect(today.locator(UNGROUPED_LIST)).toHaveClass(/normal-tasks-items--framed/);
    await expect(today.locator(UNGROUPED_LIST)).toHaveCSS('border-left-width', '1px');
    await expect(today.locator(TASK_GROUP).first()).toHaveCSS('border-left-width', '0px');
    await expect(today.locator(TASK_GROUP).last()).toHaveCSS('border-left-width', '0px');

    // give the operation log time to persist before moving to the next day
    await page.waitForTimeout(1000);
    await page.clock.setSystemTime(Date.now() + ONE_DAY_MS);
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();

    const overdue = page.locator('planner-day-overdue');
    await expect(overdue.locator(TASK_GROUP)).toHaveCount(2);
    await expect(overdue.locator(TASK_GROUP).first().locator('planner-task')).toHaveCount(
      1,
    );
    await expect(overdue.locator(TASK_GROUP).last().locator('planner-task')).toHaveCount(
      1,
    );
    await expect(overdue.locator(`${UNGROUPED_LIST} planner-task`)).toHaveCount(1);
    await expect(
      overdue.locator(`${UNGROUPED_LIST} planner-task`).filter({ hasText: 'Alpha' }),
    ).toHaveCount(1);
    await expect(
      overdue
        .locator(TASK_GROUP)
        .last()
        .locator('planner-task')
        .filter({ hasText: 'Beta' }),
    ).toHaveCount(1);
    await expect(overdue.locator(UNGROUPED_LIST)).toHaveCSS('border-left-width', '0px');
    await expect(overdue.locator(TASK_GROUP).first()).toHaveCSS(
      'border-left-width',
      '0px',
    );
    await expect(overdue.locator(TASK_GROUP).last()).toHaveCSS(
      'border-left-width',
      '0px',
    );
  });

  test('a third group remains separate when the day becomes overdue', async ({
    page,
  }) => {
    await page.clock.install();
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();
    today = page.locator('planner-day').first();

    for (const title of ['Gamma', 'Beta', 'Alpha']) {
      await startGroupWith(page, title);
      await expect(today.locator(TASK_GROUP)).toHaveCount(
        ['Gamma', 'Beta', 'Alpha'].indexOf(title) + 1,
      );
      await page.clock.setSystemTime(Date.now() + 1);
    }

    await page.waitForTimeout(1000);
    await page.clock.setSystemTime(Date.now() + ONE_DAY_MS);
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();

    const overdue = page.locator('planner-day-overdue');
    await expect(overdue.locator(TASK_GROUP)).toHaveCount(3);
    for (const [index, title] of ['Gamma', 'Beta', 'Alpha'].entries()) {
      await expect(
        overdue.locator(TASK_GROUP).nth(index).locator('planner-task'),
      ).toContainText(title);
    }
  });

  test('Cmd-click selects a group and dragging a member moves the group to another day', async ({
    page,
  }) => {
    await startGroupWith(page, 'Gamma');
    await dragIntoGroup(page, 'Beta');
    const sourceGroup = today.locator(TASK_GROUP).first();
    await expect(sourceGroup.locator('planner-task')).toHaveCount(2);

    await page.keyboard.down('Meta');
    await sourceGroup.locator('planner-task').first().click();
    await page.keyboard.up('Meta');
    await expect(sourceGroup.locator('planner-task.isMultiSelected')).toHaveCount(2);

    const tomorrow = page.locator('planner-day').nth(1);
    await dragTo(page, sourceGroup.locator('planner-task').last(), () =>
      centerOf(tomorrow.locator(NEW_GROUP_DROP_ZONE)),
    );

    await expect(today.locator(TASK_GROUP)).toHaveCount(0);
    await expect(tomorrow.locator(TASK_GROUP)).toHaveCount(1);
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`).first()).toContainText(
      'Gamma',
    );
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`).last()).toContainText(
      'Beta',
    );

    await page.reload();
    await new PlannerPage(page).navigateToPlanner();
    await expect(page.locator('planner-day').first().locator(TASK_GROUP)).toHaveCount(0);
    const reloadedGroup = page.locator('planner-day').nth(1).locator(TASK_GROUP);
    await expect(reloadedGroup).toHaveCount(1);
    await expect(reloadedGroup.locator('planner-task')).toHaveCount(2);
  });

  test('an overdue group can be moved together to a future day', async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();
    today = page.locator('planner-day').first();
    await startGroupWith(page, 'Gamma');
    await dragIntoGroup(page, 'Beta');

    // give the operation log time to persist before moving to the next day
    await page.waitForTimeout(1000);
    await page.clock.setSystemTime(Date.now() + ONE_DAY_MS);
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();
    const overdueGroup = page.locator(`planner-day-overdue ${TASK_GROUP}`).first();
    await expect(overdueGroup.locator('planner-task')).toHaveCount(2);

    const tomorrow = page.locator('planner-day').nth(1);
    await page.keyboard.down('Meta');
    await dragTo(page, overdueGroup.locator('planner-task').first(), () =>
      centerOf(tomorrow.locator(NEW_GROUP_DROP_ZONE)),
    );
    await page.keyboard.up('Meta');
    await expect(overdueGroup).toHaveCount(0);
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
  });

  test('holding Command through selection and drag moves the whole group', async ({
    page,
  }) => {
    await startGroupWith(page, 'Gamma');
    await dragIntoGroup(page, 'Beta');
    const group = today.locator(TASK_GROUP).first();
    await page.keyboard.down('Meta');
    await group.locator('planner-task .title').first().click();
    await expect(group.locator('planner-task.isMultiSelected')).toHaveCount(2);
    const tomorrow = page.locator('planner-day').nth(1);
    await dragTo(page, group.locator('planner-task').last(), () =>
      centerOf(tomorrow.locator(NEW_GROUP_DROP_ZONE)),
    );
    await page.keyboard.up('Meta');
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
  });

  test('Command-drag in one gesture moves the whole group', async ({ page }) => {
    await startGroupWith(page, 'Gamma');
    await dragIntoGroup(page, 'Beta');
    const group = today.locator(TASK_GROUP).first();
    const tomorrow = page.locator('planner-day').nth(1);
    await page.keyboard.down('Meta');
    await dragTo(page, group.locator('planner-task').last(), () =>
      centerOf(tomorrow.locator(NEW_GROUP_DROP_ZONE)),
    );
    await page.keyboard.up('Meta');
    await expect(today.locator(TASK_GROUP)).toHaveCount(0, { timeout: 3000 });
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
  });

  // Pressing Command only once the task is already moving is how the gesture
  // reads on a Mac: grab, then hold Command.
  const dragPressingCommandMidway = async (
    page: Page,
    source: Locator,
    target: Locator,
  ): Promise<void> => {
    const from = await centerOf(source);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 6, from.y + 6, { steps: 4 });
    await expect(page.locator('.cdk-drag-placeholder')).toBeVisible();
    await page.keyboard.down('Meta');
    const to = await centerOf(target);
    await page.mouse.move(to.x, to.y, { steps: 20 });
    const finalTo = await centerOf(target);
    await page.mouse.move(finalTo.x, finalTo.y + 1, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Meta');
    await expect(page.locator('.cdk-drag-preview')).toHaveCount(0);
  };

  test('Command pressed after the drag started moves the whole group', async ({
    page,
  }) => {
    await startGroupWith(page, 'Gamma');
    await dragIntoGroup(page, 'Beta');
    const group = today.locator(TASK_GROUP).first();
    const tomorrow = page.locator('planner-day').nth(1);
    await dragPressingCommandMidway(
      page,
      group.locator('planner-task').last(),
      tomorrow.locator(NEW_GROUP_DROP_ZONE),
    );
    await expect(today.locator(TASK_GROUP)).toHaveCount(0, { timeout: 3000 });
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`)).toHaveText([
      /Gamma/,
      /Beta/,
    ]);
  });

  test('Command pressed after the drag started moves a whole overdue group', async ({
    page,
  }) => {
    await page.clock.install();
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();
    today = page.locator('planner-day').first();
    await startGroupWith(page, 'Gamma');
    await dragIntoGroup(page, 'Beta');

    // give the operation log time to persist before moving to the next day
    await page.waitForTimeout(1000);
    await page.clock.setSystemTime(Date.now() + ONE_DAY_MS);
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();
    const overdueGroup = page.locator(`planner-day-overdue ${TASK_GROUP}`).first();
    await expect(overdueGroup.locator('planner-task')).toHaveText([/Gamma/, /Beta/]);

    const tomorrow = page.locator('planner-day').nth(1);
    await dragPressingCommandMidway(
      page,
      overdueGroup.locator('planner-task').last(),
      tomorrow.locator(NEW_GROUP_DROP_ZONE),
    );
    await expect(page.locator(`planner-day-overdue ${TASK_GROUP}`)).toHaveCount(0, {
      timeout: 3000,
    });
    await expect(tomorrow.locator(`${TASK_GROUP} planner-task`)).toHaveText([
      /Gamma/,
      /Beta/,
    ]);
  });

  test('grouping survives a reload', async ({ page }) => {
    await startGroupWith(page, 'Gamma');
    await dragIntoGroup(page, 'Alpha');
    await expect(today.locator(`${TASK_GROUP} planner-task`)).toHaveCount(2);
    const groupBefore = await today
      .locator(`${TASK_GROUP} planner-task .title`)
      .allTextContents();

    // give the operation log time to persist before reloading
    await page.waitForTimeout(1000);
    await page.reload();
    await new PlannerPage(page).navigateToPlanner();

    await expect(today.locator('planner-task')).toHaveCount(3);
    await expect(today.locator(TASK_GROUP)).toHaveCount(1);
    await expect(today.locator(`${TASK_GROUP} planner-task .title`)).toHaveText(
      groupBefore,
    );
    await expect(today.locator(`${UNGROUPED_LIST} planner-task`)).toHaveCount(1);
  });
});
