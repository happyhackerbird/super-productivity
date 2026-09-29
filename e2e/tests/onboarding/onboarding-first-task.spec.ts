import { expect, test } from '../../fixtures/test.fixture';
import { devices, Page } from '@playwright/test';
import {
  assertNoRuntimeBrowserErrors,
  attachPageErrorCollector,
  installDevErrorDialogHandler,
} from '../../utils/runtime-errors';
import { waitForStatePersistence } from '../../utils/waits';

const pixel5TestOptions = { ...devices['Pixel 5'] };
// Browser type is worker-scoped and cannot be overridden inside a describe block.
Reflect.deleteProperty(pixel5TestOptions, 'defaultBrowserType');

const TRACK_OFFER = /play to track time on “.+”/;

const openFreshApp = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem('SUP_EXAMPLE_TASKS_CREATED', 'true');
  });
  await page.goto('/');
  await expect(page.locator('onboarding-hint')).toContainText(
    'Click + to add your first task',
  );
};

const expectHintBelow = async (page: Page, targetSelector: string): Promise<void> => {
  const target = await page.locator(targetSelector).boundingBox();
  const chip = await page.locator('onboarding-hint .hint-chip').boundingBox();
  expect(target && chip).toBeTruthy();
  // Attached right under the target, never covering it.
  expect(chip!.y).toBeGreaterThanOrEqual(target!.y + target!.height);
  expect(chip!.y - (target!.y + target!.height)).toBeLessThan(30);
};

const addTaskViaComposer = async (page: Page, title: string): Promise<void> => {
  await page.locator('.tour-addBtn').click();
  const composer = page.locator('add-task-bar.global');
  const input = composer.locator('.main-input');
  await input.fill(title);
  await input.press('Enter');
  await expect(composer).toBeVisible();
  await input.press('Escape');
  await expect(composer).toBeHidden();
};

test.describe('First-run onboarding', () => {
  test('points at the existing play button after the first task', async ({
    isolatedContext,
  }) => {
    const page = await isolatedContext.newPage();
    const runtimeErrors = attachPageErrorCollector(page, 'onboarding start');
    installDevErrorDialogHandler(page, 'onboarding start');
    await openFreshApp(page);

    const taskTitle = `Tracked first task ${Date.now()}`;
    await addTaskViaComposer(page, taskTitle);

    const hint = page.locator('onboarding-hint');
    await expect(hint).toContainText(TRACK_OFFER);
    await expect
      .poll(() => expectHintBelow(page, '.tour-playBtn').then(() => true))
      .toBe(true);

    await expect(hint).toContainText(`Click play to track time on “${taskTitle}”.`);

    // The real play button starts exactly the named task and ends guidance.
    await page.locator('.tour-playBtn').click();
    const task = page.locator('task').filter({ hasText: taskTitle }).first();
    await expect(task).toHaveClass(/isCurrent/);
    await expect(hint).toHaveCount(0);

    await waitForStatePersistence(page);
    await page.reload();
    await expect(page.locator('task').filter({ hasText: taskTitle })).toBeVisible();
    await expect(page.locator('onboarding-hint')).toHaveCount(0);
    assertNoRuntimeBrowserErrors(runtimeErrors, 'onboarding start');
    await page.close();
  });

  test('simplifies to a to-do list only on explicit choice', async ({
    isolatedContext,
  }) => {
    const page = await isolatedContext.newPage();
    const runtimeErrors = attachPageErrorCollector(page, 'onboarding simplify');
    installDevErrorDialogHandler(page, 'onboarding simplify');
    await openFreshApp(page);

    // Tracking is available before any choice.
    await expect(page.locator('.tour-playBtn')).toBeVisible();

    const taskTitle = `Simple first task ${Date.now()}`;
    await addTaskViaComposer(page, taskTitle);

    const hint = page.locator('onboarding-hint');
    await expect(hint).toContainText(TRACK_OFFER);
    await hint.getByRole('button', { name: 'I only need a to-do list' }).click();

    await expect(hint).toHaveCount(0);
    await expect(page.locator('.tour-playBtn')).toHaveCount(0);
    const task = page.locator('task').filter({ hasText: taskTitle }).first();
    await task.hover();
    await expect(task.locator('.start-task-btn')).toHaveCount(0);

    await waitForStatePersistence(page);
    await page.reload();
    await expect(page.locator('task').filter({ hasText: taskTitle })).toBeVisible();
    await expect(page.locator('onboarding-hint')).toHaveCount(0);
    await expect(page.locator('.tour-playBtn')).toHaveCount(0);
    assertNoRuntimeBrowserErrors(runtimeErrors, 'onboarding simplify');
    await page.close();
  });

  test('dismissing the offer changes no settings and does not ask again', async ({
    isolatedContext,
  }) => {
    const page = await isolatedContext.newPage();
    const runtimeErrors = attachPageErrorCollector(page, 'onboarding dismiss');
    installDevErrorDialogHandler(page, 'onboarding dismiss');
    await openFreshApp(page);

    await addTaskViaComposer(page, `Dismissed first task ${Date.now()}`);
    const hint = page.locator('onboarding-hint');
    await expect(hint).toContainText(TRACK_OFFER);
    // Focus returns to + after the composer closes; move it so the + tooltip
    // does not sit on top of the hint's close button.
    await page.mouse.click(640, 600);
    await hint.getByRole('button', { name: 'Close tip' }).click();
    await expect(hint).toHaveCount(0);
    await expect(page.locator('.tour-playBtn')).toBeVisible();

    await addTaskViaComposer(page, `Second task ${Date.now()}`);
    await expect(page.locator('onboarding-hint')).toHaveCount(0);
    assertNoRuntimeBrowserErrors(runtimeErrors, 'onboarding dismiss');
    await page.close();
  });

  test('ends by pointing at the Inbox, where the example tasks wait', async ({
    isolatedContext,
  }) => {
    const page = await isolatedContext.newPage();
    const runtimeErrors = attachPageErrorCollector(page, 'onboarding inbox');
    installDevErrorDialogHandler(page, 'onboarding inbox');
    // Real first run: example tasks get seeded into the Inbox.
    await page.goto('/');
    await expect(page.locator('onboarding-hint')).toContainText(
      'Click + to add your first task',
    );

    await addTaskViaComposer(page, `Inbox tip task ${Date.now()}`);
    await expect(page.locator('onboarding-hint')).toContainText(TRACK_OFFER);
    await page.locator('.tour-playBtn').click();

    const hint = page.locator('onboarding-hint');
    await expect(hint).toContainText('A few tips are waiting in your Inbox.');
    const inboxNavItem = page.locator(
      'magic-side-nav nav-item[data-project-id="INBOX_PROJECT"] .nav-link',
    );
    await expect
      .poll(async () => {
        const target = await inboxNavItem.boundingBox();
        const chip = await hint.locator('.hint-chip').boundingBox();
        return !!target && !!chip && chip.y > target.y + target.height;
      })
      .toBe(true);

    await inboxNavItem.click();
    await expect(hint).toHaveCount(0);
    await expect(page.locator('task').filter({ hasText: 'Set up Sync' })).toBeVisible();
    assertNoRuntimeBrowserErrors(runtimeErrors, 'onboarding inbox');
    await page.close();
  });

  test('reloading before answering counts as dismissal', async ({ isolatedContext }) => {
    const page = await isolatedContext.newPage();
    const runtimeErrors = attachPageErrorCollector(page, 'onboarding reload');
    installDevErrorDialogHandler(page, 'onboarding reload');
    await openFreshApp(page);

    await addTaskViaComposer(page, `Reloaded first task ${Date.now()}`);
    await expect(page.locator('onboarding-hint')).toContainText(TRACK_OFFER);

    await waitForStatePersistence(page);
    await page.reload();
    await expect(page.locator('task-list').first()).toBeVisible();
    await expect(page.locator('onboarding-hint')).toHaveCount(0);
    await expect(page.locator('.tour-playBtn')).toBeVisible();
    assertNoRuntimeBrowserErrors(runtimeErrors, 'onboarding reload');
    await page.close();
  });

  test.describe('mobile', () => {
    test.use(pixel5TestOptions);

    test('keeps + uncovered and points at play after the first task', async ({
      isolatedContext,
    }) => {
      const page = await isolatedContext.newPage();
      const runtimeErrors = attachPageErrorCollector(page, 'mobile onboarding');
      installDevErrorDialogHandler(page, 'mobile onboarding');

      await page.addInitScript(() => {
        localStorage.setItem('SUP_EXAMPLE_TASKS_CREATED', 'true');
      });

      await page.goto('/');
      const userAgent = await page.evaluate(() => navigator.userAgent);
      expect(userAgent).toContain('Pixel 5');
      expect(userAgent).toContain('PLAYWRIGHT-WORKER-');

      await expect(page.locator('onboarding-hint')).toContainText(
        'Tap + to add your first task',
      );
      // The hint sits above the + button, clear of its pulse glow and the arrow.
      const addBtn = await page.locator('.add-task-button').boundingBox();
      await expect
        .poll(async () => {
          const chip = await page.locator('onboarding-hint .hint-chip').boundingBox();
          return chip ? addBtn!.y - (chip.y + chip.height) : -1;
        })
        .toBeGreaterThanOrEqual(16);

      await page.getByRole('button', { name: 'Add new task' }).tap();
      const input = page.locator('add-task-bar.global .main-input');
      await input.fill('My first mobile task');
      await input.press('Enter');

      await expect(page.locator('add-task-bar.global')).toBeHidden();
      const hint = page.locator('onboarding-hint');
      await expect(hint).toContainText(
        'Tap play to track time on “My first mobile task”.',
      );
      await page.locator('.tour-playBtn').tap();
      const task = page
        .locator('task')
        .filter({ hasText: 'My first mobile task' })
        .first();
      await expect(task).toHaveClass(/isCurrent/);

      // Phones then learn the task gestures, pointed at the task row.
      await expect(hint).toContainText('Swipe task left for more actions');
      await expect.poll(() => expectHintBelow(page, 'task').then(() => true)).toBe(true);

      // Marking the task done (swipe right or checkbox) completes guidance.
      await task.locator('done-toggle').tap();
      await expect(hint).toHaveCount(0);
      assertNoRuntimeBrowserErrors(runtimeErrors, 'mobile onboarding');
      await page.close();
    });

    test('keeps the composer open after a later touch task', async ({
      isolatedContext,
    }) => {
      const page = await isolatedContext.newPage();
      const runtimeErrors = attachPageErrorCollector(page, 'hybrid onboarding');
      installDevErrorDialogHandler(page, 'hybrid onboarding');

      await page.addInitScript(() => {
        localStorage.setItem('SUP_EXAMPLE_TASKS_CREATED', 'true');
      });

      await page.goto('/');
      await expect(page.locator('onboarding-hint')).toContainText(
        'Tap + to add your first task',
      );

      await page.mouse.move(10, 10);
      await expect(page.locator('body')).toHaveClass(/isMousePrimary/);
      await page.getByRole('button', { name: 'Add new task' }).click();

      const composer = page.locator('add-task-bar.global');
      const input = composer.locator('.main-input');
      await input.fill('First hybrid task');
      await input.press('Enter');
      await expect(composer).toBeVisible();

      // Switch intent before the real submit tap so the touch layout has settled.
      await page.locator('body').dispatchEvent('pointerdown', {
        pointerType: 'touch',
      });
      await expect(page.locator('body')).toHaveClass(/isTouchPrimary/);
      await expect(composer).toBeVisible();

      await input.fill('Second hybrid task');
      await composer.locator('.e2e-add-task-submit').tap();
      await expect(composer).toBeVisible();

      await input.press('Escape');
      await expect(composer).toBeHidden();
      assertNoRuntimeBrowserErrors(runtimeErrors, 'hybrid onboarding');
      await page.close();
    });
  });
});
