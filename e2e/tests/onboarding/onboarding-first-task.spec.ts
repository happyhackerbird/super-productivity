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

const TRACK_OFFER = /Want to track time on “.+”\?/;

const openFreshApp = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem('SUP_EXAMPLE_TASKS_CREATED', 'true');
  });
  await page.goto('/');
  await expect(page.locator('onboarding-hint')).toContainText(
    'Click + to add your first task',
  );
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
  test('offers tracking on the first task and starts the timer on it', async ({
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
    await hint.getByRole('button', { name: 'Start timer' }).click();

    const task = page.locator('task').filter({ hasText: taskTitle }).first();
    await expect(task).toHaveClass(/isCurrent/);
    await expect(hint).toContainText('Time is being tracked');

    // Pausing through the header button completes the guidance.
    await page.locator('.tour-playBtn').click();
    await expect(task).not.toHaveClass(/isCurrent/);
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
    await hint.getByRole('button', { name: 'Just a to-do list' }).click();

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
    await hint.getByRole('button', { name: 'Dismiss hint' }).click();
    await expect(hint).toHaveCount(0);
    await expect(page.locator('.tour-playBtn')).toBeVisible();

    await addTaskViaComposer(page, `Second task ${Date.now()}`);
    await expect(page.locator('onboarding-hint')).toHaveCount(0);
    assertNoRuntimeBrowserErrors(runtimeErrors, 'onboarding dismiss');
    await page.close();
  });

  test('names the task and stays below task menus', async ({ isolatedContext }) => {
    const page = await isolatedContext.newPage();
    const runtimeErrors = attachPageErrorCollector(page, 'onboarding overlay');
    installDevErrorDialogHandler(page, 'onboarding overlay');
    await openFreshApp(page);

    const taskTitle = `Menu first task ${Date.now()}`;
    await addTaskViaComposer(page, taskTitle);
    const hint = page.locator('onboarding-hint');
    await expect(hint).toContainText(`Want to track time on “${taskTitle}”?`);

    await page.locator('task').filter({ hasText: taskTitle }).first().click({
      button: 'right',
    });
    const menuPanel = page.locator('.mat-mdc-menu-panel').first();
    await expect(menuPanel).toBeVisible();
    // The card sits right under the task, so the menu overlaps it. Menus render in
    // the CDK overlay (browser top layer): the menu's left edge, where the overlap
    // is, must be topmost for every visible entry.
    const deleteItem = menuPanel.getByRole('menuitem', { name: /Delete task/ });
    await expect(deleteItem).toBeVisible();
    // Guard: the check below is only meaningful while the two actually overlap.
    const cardBox = await hint.locator('.hint-chip').boundingBox();
    const menuBox = await menuPanel.boundingBox();
    expect(cardBox && menuBox && menuBox.x < cardBox.x + cardBox.width).toBeTruthy();
    await expect
      .poll(() =>
        menuPanel.evaluate((panel) =>
          Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'))
            .filter((item) => item.getBoundingClientRect().width > 0)
            .every((item) => {
              const rect = item.getBoundingClientRect();
              const halfHeight = rect.height / 2;
              const topEl = document.elementFromPoint(
                rect.left + 8,
                rect.top + halfHeight,
              );
              return !!topEl && panel.contains(topEl);
            }),
        ),
      )
      .toBe(true);
    assertNoRuntimeBrowserErrors(runtimeErrors, 'onboarding overlay');
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

    test('closes the composer after the first task and shows the offer', async ({
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

      await page.getByRole('button', { name: 'Add new task' }).tap();
      const input = page.locator('add-task-bar.global .main-input');
      await input.fill('My first mobile task');
      await input.press('Enter');

      await expect(page.locator('add-task-bar.global')).toBeHidden();
      const hint = page.locator('onboarding-hint');
      await expect(hint).toContainText(TRACK_OFFER);
      await hint.getByRole('button', { name: 'Start timer' }).tap();
      await expect(
        page.locator('task').filter({ hasText: 'My first mobile task' }).first(),
      ).toHaveClass(/isCurrent/);
      await expect(hint).toContainText('Tap here to pause');
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
