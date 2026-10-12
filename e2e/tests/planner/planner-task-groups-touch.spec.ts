import { type Locator, type Page, type TestInfo } from '@playwright/test';
import { expect, test } from '../../fixtures/test.fixture';
import { PlannerPage } from '../../pages/planner.page';
import { waitForMenuSettled } from '../../utils/waits';

/**
 * Planner task groups on a phone: 390px wide, touch input only. Every gesture
 * is a native touch sequence (CDP), as the Android WebView delivers it: a
 * long-press (DRAG_DELAY_FOR_TOUCH) starts a drag, a swipe left opens the
 * context menu.
 */

const UNGROUPED_LIST = '.normal-tasks-items';
const FRAMED_LIST = '.normal-tasks-items--framed';
const TASK_GROUP = '.task-group';
const NEW_GROUP_DROP_ZONE = '.new-task-group-drop-zone';
const SCHEDULE_DIALOG = 'dialog-schedule-task';
// DRAG_DELAY_FOR_TOUCH is 500ms
const LONG_PRESS_MS = 700;

type Point = { x: number; y: number };

const half = (value: number): number => value / 2;

const centerOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element is not visible');
  }
  return { x: box.x + half(box.width), y: box.y + half(box.height) };
};

const touchSession = async (
  page: Page,
): Promise<{
  send: (type: string, touchPoints: Point[]) => Promise<unknown>;
  detach: () => Promise<void>;
}> => {
  const cdp = await page.context().newCDPSession(page);
  return {
    send: (type, touchPoints) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints } as never),
    detach: () => cdp.detach(),
  };
};

/**
 * Long-press the source, then drag it with the finger. The target is resolved
 * while dragging, since lists move once the dragged task left its own.
 */
const touchDrag = async (
  page: Page,
  source: Locator,
  getTarget: () => Promise<Point>,
  whileDragging?: () => Promise<void>,
): Promise<void> => {
  await source.scrollIntoViewIfNeeded();
  const touch = await touchSession(page);
  const from = await centerOf(source);
  await touch.send('touchStart', [from]);
  await page.waitForTimeout(LONG_PRESS_MS);
  // Chromium holds back touchmoves inside its touch slop (~15px), as on a phone.
  let at = from;
  for (let i = 1; i <= 4; i++) {
    const offset = i * 6;
    at = { x: from.x, y: from.y + offset };
    await touch.send('touchMove', [at]);
  }
  await expect(page.locator('.cdk-drag-placeholder')).toBeVisible();
  const aim = await getTarget();
  const steps = 20;
  const start = at;
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const dx = (aim.x - start.x) * progress;
    const dy = (aim.y - start.y) * progress;
    at = { x: start.x + dx, y: start.y + dy };
    await touch.send('touchMove', [at]);
  }
  const to = await getTarget();
  for (let i = 1; i <= 6; i++) {
    await touch.send('touchMove', [{ x: to.x, y: to.y + (i % 2) }]);
  }
  await whileDragging?.();
  await touch.send('touchEnd', []);
  await touch.detach();
  await expect(page.locator('.cdk-drag-preview')).toHaveCount(0);
};

const swipeLeft = async (page: Page, task: Locator): Promise<void> => {
  await task.scrollIntoViewIfNeeded();
  const box = await task.boundingBox();
  if (!box) {
    throw new Error('Planner task is not visible');
  }
  const touch = await touchSession(page);
  const startOffset = box.width * 0.8;
  const x = box.x + startOffset;
  const y = box.y + half(box.height);
  await touch.send('touchStart', [{ x, y }]);
  for (let step = 1; step <= 5; step++) {
    const distance = box.width * 0.1 * step;
    await touch.send('touchMove', [{ x: x - distance, y }]);
  }
  await touch.send('touchEnd', []);
  await touch.detach();
};

const shot = async (page: Page, testInfo: TestInfo, name: string): Promise<void> => {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

test.describe('Planner task groups (touch, 390px)', () => {
  // isMobile reports `pointer: coarse`, so the app starts in touch intent. The
  // viewport starts desktop-sized for the shared add-task flow.
  test.use({ viewport: { width: 1024, height: 900 }, hasTouch: true, isMobile: true });

  test('create, change and move a group to another day by touch', async ({
    page,
    workViewPage,
  }, testInfo) => {
    await workViewPage.waitForTaskList();
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await workViewPage.addTask(title);
    }
    await new PlannerPage(page).navigateToPlanner();
    await page.setViewportSize({ width: 390, height: 844 });
    // The add-task flow clicked with a mouse; a touch pointerdown switches the
    // input intent back, as a finger would.
    await page.evaluate(() =>
      window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' })),
    );
    await expect(page.locator('body')).toHaveClass(/isTouchPrimary/);

    const today = page.locator('planner-day').first();
    const tomorrow = page.locator('planner-day').nth(1);
    const inToday = (title: string): Locator =>
      today.locator('planner-task').filter({ hasText: title });
    const groupTasks = today.locator(`${TASK_GROUP} planner-task`);
    const ungroupedTasks = today.locator(`${UNGROUPED_LIST} planner-task`);
    const intoGroupEnd = async (): Promise<Point> => {
      const box = await today.locator(TASK_GROUP).first().boundingBox();
      if (!box) {
        throw new Error('Task group is not visible');
      }
      return { x: box.x + half(box.width), y: box.y + box.height - 4 };
    };

    await expect(today.locator('planner-task')).toHaveCount(3);
    await shot(page, testInfo, '1-before-creating-a-group');

    // create: drop a task on the new group area below the list
    await touchDrag(page, inToday('Gamma'), () =>
      centerOf(today.locator(NEW_GROUP_DROP_ZONE)),
    );
    await expect(today.locator(TASK_GROUP)).toHaveCount(1);
    await expect(groupTasks).toHaveText([/Gamma/]);
    await expect(ungroupedTasks).toHaveCount(2);
    await expect(page.locator(SCHEDULE_DIALOG)).toHaveCount(0);
    await shot(page, testInfo, '2-after-creating-a-group');

    // add: drag a task into the group
    await touchDrag(page, inToday('Alpha'), intoGroupEnd);
    await expect(groupTasks).toHaveText([/Gamma/, /Alpha/]);
    await expect(ungroupedTasks).toHaveText([/Beta/]);

    // remove: drag a member back into the list above
    await touchDrag(page, inToday('Gamma'), async () => {
      const box = await ungroupedTasks.first().boundingBox();
      if (!box) {
        throw new Error('Ungrouped list has no task');
      }
      return { x: box.x + half(box.width), y: box.y + 4 };
    });
    await expect(groupTasks).toHaveText([/Alpha/]);
    await expect(ungroupedTasks).toHaveCount(2);

    await touchDrag(page, inToday('Beta'), intoGroupEnd);
    await expect(groupTasks).toHaveText([/Alpha/, /Beta/]);
    await expect(ungroupedTasks).toHaveText([/Gamma/]);

    // move: select the group from the swipe menu, then drag one member
    await swipeLeft(page, inToday('Alpha'));
    await waitForMenuSettled(page);
    await page.locator('.mat-mdc-menu-content button', { hasText: 'Select group' }).tap();
    await expect(page.locator('.mat-mdc-menu-panel')).toHaveCount(0);
    await expect(inToday('Alpha')).toHaveClass(/isMultiSelected/);
    await expect(inToday('Beta')).toHaveClass(/isMultiSelected/);
    await expect(inToday('Gamma')).not.toHaveClass(/isMultiSelected/);
    await expect(inToday('Alpha')).not.toHaveClass(/cdk-drag-disabled/);
    await shot(page, testInfo, '3-group-selected');

    await touchDrag(
      page,
      inToday('Alpha'),
      () => centerOf(tomorrow.locator(UNGROUPED_LIST)),
      async () => {
        // the preview lists the whole group
        await expect(
          page.locator('.cdk-drag-preview .planner-group-drag-preview'),
        ).toHaveText(/Alpha.*Beta/);
        await shot(page, testInfo, '4-dragging-the-group');
      },
    );

    await expect(today.locator('planner-task')).toHaveText([/Gamma/]);
    await expect(today.locator(TASK_GROUP)).toHaveCount(0);
    await expect(tomorrow.locator(`${FRAMED_LIST} planner-task`)).toHaveText([
      /Alpha/,
      /Beta/,
    ]);
    await expect(page.locator(SCHEDULE_DIALOG)).toHaveCount(0);
    await expect(page.locator('planner-task.isMultiSelected')).toHaveCount(0);
    await shot(page, testInfo, '5-after-moving-the-group-to-another-day');
  });
});
