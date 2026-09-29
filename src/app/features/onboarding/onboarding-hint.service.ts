import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ofType } from '@ngrx/effects';
import { Action, Store } from '@ngrx/store';
import { Observable, Subscription } from 'rxjs';
import { concatMap, filter, first } from 'rxjs/operators';
import { Log } from '../../core/log';
import { LS } from '../../core/persistence/storage-keys.const';
import { LayoutService } from '../../core-ui/layout/layout.service';
import { DataInitStateService } from '../../core/data-init/data-init-state.service';
import { SnackService } from '../../core/snack/snack.service';
import { isTouchActive } from '../../util/input-intent';
import { LOCAL_ACTIONS } from '../../util/local-actions.token';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { T } from '../../t.const';
import { AppFeaturesConfig } from '../config/global-config.model';
import { GlobalConfigService } from '../config/global-config.service';
import { ProjectService } from '../project/project.service';
import { TaskService } from '../tasks/task.service';
import { selectTaskEntities } from '../tasks/store/task.selectors';
import { SIMPLE_TODO_DISABLED_FEATURES } from './onboarding-presets.const';

type DialogSyncCfgComponentType =
  typeof import('../../imex/sync/dialog-sync-cfg/dialog-sync-cfg.component').DialogSyncCfgComponent;

export type OnboardingStep = 'create-task' | 'track-offer' | 'pause-hint';

type OnboardingPhase = 'idle' | 'await-first-task' | 'track-offer' | 'pause-hint';

/** More projects than the default ones means this is not a new user. */
const RETURNING_USER_MIN_PROJECTS = 3;

/**
 * First-run guidance: value first, no upfront decision.
 *
 * 1. Point at "+" until the user creates their first real task (any local
 *    creation path; example tasks and repeat instances do not count).
 * 2. Offer, next to that task, to track time on it or to simplify to a to-do list.
 *    Ignoring the offer changes nothing. Feature settings are only written on an
 *    explicit choice, because appFeatures sync to the user's other devices.
 * 3. After "Start timer", point at the header pause button until tracking stops.
 *
 * No step advances on a timer. Reloading after the first task ends guidance.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingHintService {
  private _layoutService = inject(LayoutService);
  private _dataInitStateService = inject(DataInitStateService);
  private _taskService = inject(TaskService);
  private _projectService = inject(ProjectService);
  private _globalConfigService = inject(GlobalConfigService);
  private _snackService = inject(SnackService);
  private _matDialog = inject(MatDialog);
  private _store = inject(Store);
  private _localActions$: Observable<Action> = inject(LOCAL_ACTIONS);

  private _phase = signal<OnboardingPhase>('idle');
  private _isSyncDialogOpen = signal(false);
  private _isFirstTaskComposerAutoCloseUsed = false;
  private _startSub: Subscription | null = null;
  private _taskAddSub: Subscription | null = null;
  private _taskEntities = this._store.selectSignal(selectTaskEntities);

  readonly offerTaskId = signal<string | null>(null);

  readonly offerTask = computed(() => {
    const id = this.offerTaskId();
    return id ? (this._taskEntities()[id] ?? null) : null;
  });

  readonly isOfferTaskTrackable = computed(() => {
    const task = this.offerTask();
    return !!task && !task.isDone && task.subTaskIds.length === 0;
  });

  /** Hints hide while the composer or the sync dialog is open. */
  readonly currentStep = computed<OnboardingStep | null>(() => {
    const phase = this._phase();
    if (phase === 'pause-hint') {
      return 'pause-hint';
    }
    if (this._layoutService.isShowAddTaskBar() || this._isSyncDialogOpen()) {
      return null;
    }
    if (phase === 'await-first-task') {
      return 'create-task';
    }
    if (phase === 'track-offer' && this.offerTask()) {
      return 'track-offer';
    }
    return null;
  });

  constructor() {
    if (!OnboardingHintService.isOnboardingInProgress()) {
      return;
    }
    // The first task was already added in an earlier session (or a preset was
    // chosen in the previous onboarding flow): treat the unanswered offer as
    // dismissed instead of repeating it.
    if (localStorage.getItem(LS.ONBOARDING_PRESET_DONE)) {
      this._markDone();
      return;
    }

    // End the offer if its task disappears (deleted, undone by sync, ...).
    effect(() => {
      if (this._phase() === 'track-offer' && !this.offerTask()) {
        untracked(() => this._markDone());
      }
    });

    // Pausing (or tracking being turned off) completes the tracking hint.
    effect(() => {
      if (this._phase() === 'pause-hint' && this._taskService.currentTaskId() === null) {
        untracked(() => this._markDone());
      }
    });

    this._startSub = this._dataInitStateService.isAllDataLoadedInitially$
      .pipe(
        concatMap(() => this._projectService.list$),
        first(),
      )
      .subscribe((projects) => {
        // Tasks we did not seed ourselves mean an install that predates the
        // onboarding flags, not a new user.
        const hasNonExampleTasks =
          !localStorage.getItem(LS.EXAMPLE_TASKS_CREATED) &&
          Object.keys(this._taskEntities()).length > 0;
        if (
          projects.length >= RETURNING_USER_MIN_PROJECTS ||
          hasNonExampleTasks ||
          this._globalConfigService.sync()?.isEnabled
        ) {
          this._markDone();
          return;
        }
        this._phase.set('await-first-task');
      });

    this._taskAddSub = this._localActions$
      .pipe(
        ofType(TaskSharedActions.addTask),
        filter(({ isExampleTask, task }) => !isExampleTask && !task.repeatCfgId),
      )
      .subscribe(({ task }) => this._onFirstTaskCandidate(task.id));
  }

  static isOnboardingInProgress(): boolean {
    return (
      !localStorage.getItem(LS.ONBOARDING_HINTS_DONE) &&
      !localStorage.getItem(LS.IS_SKIP_TOUR)
    );
  }

  /**
   * On phones the composer covers the task list; close it after the first real
   * task so the offer next to it becomes visible. Later tasks keep it open.
   */
  shouldAutoCloseFirstTaskComposer(taskId: string): boolean {
    if (
      this._isFirstTaskComposerAutoCloseUsed ||
      this._phase() !== 'track-offer' ||
      this.offerTaskId() !== taskId
    ) {
      return false;
    }
    this._isFirstTaskComposerAutoCloseUsed = true;
    return isTouchActive() && this._layoutService.isShowMobileBottomNav();
  }

  startTimerForOfferTask(): void {
    const taskId = this.offerTaskId();
    if (this._phase() !== 'track-offer' || !taskId || !this.isOfferTaskTrackable()) {
      this._markDone();
      return;
    }
    if (!this._globalConfigService.appFeatures().isTimeTrackingEnabled) {
      this._globalConfigService.updateSection(
        'appFeatures',
        { isTimeTrackingEnabled: true } as Partial<AppFeaturesConfig>,
        true,
      );
    }
    this._taskService.setCurrentId(taskId);
    this._phase.set('pause-hint');
  }

  simplifyToTodoList(): void {
    if (this._phase() !== 'track-offer') {
      return;
    }
    // Only switch features off; never re-enable something the user hid.
    this._globalConfigService.updateSection(
      'appFeatures',
      SIMPLE_TODO_DISABLED_FEATURES,
      true,
    );
    this._snackService.open({
      type: 'SUCCESS',
      msg: T.ONBOARDING.HINTS.SIMPLIFIED,
    });
    this._markDone();
  }

  async openSyncSetup(): Promise<void> {
    if (this._isSyncDialogOpen()) {
      return;
    }
    this._isSyncDialogOpen.set(true);
    let DialogSyncCfgComponent: DialogSyncCfgComponentType;
    try {
      ({ DialogSyncCfgComponent } =
        await import('../../imex/sync/dialog-sync-cfg/dialog-sync-cfg.component'));
    } catch (e) {
      this._isSyncDialogOpen.set(false);
      Log.err('OnboardingHintService: failed to load sync dialog', e);
      return;
    }
    this._matDialog
      .open(DialogSyncCfgComponent)
      .afterClosed()
      .subscribe(() => {
        this._isSyncDialogOpen.set(false);
        // A returning user restoring their data needs no new-user guidance.
        if (this._globalConfigService.sync()?.isEnabled) {
          this._markDone();
        }
      });
  }

  private _onFirstTaskCandidate(taskId: string): void {
    if (this._phase() !== 'await-first-task' || !this._taskEntities()[taskId]) {
      return;
    }
    // From here on a reload counts as dismissing the offer.
    localStorage.setItem(LS.ONBOARDING_PRESET_DONE, 'true');

    // Someone who turned tracking off before adding a task has already chosen.
    if (!this._globalConfigService.appFeatures().isTimeTrackingEnabled) {
      this._markDone();
      return;
    }
    this.offerTaskId.set(taskId);
    this._phase.set('track-offer');
  }

  skip(): void {
    this._markDone();
  }

  private _markDone(): void {
    localStorage.setItem(LS.ONBOARDING_PRESET_DONE, 'true');
    localStorage.setItem(LS.ONBOARDING_HINTS_DONE, 'true');
    this._startSub?.unsubscribe();
    this._startSub = null;
    this._taskAddSub?.unsubscribe();
    this._taskAddSub = null;
    this.offerTaskId.set(null);
    this._phase.set('idle');
  }
}
