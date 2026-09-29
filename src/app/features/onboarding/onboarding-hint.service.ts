import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ofType } from '@ngrx/effects';
import { Action, Store } from '@ngrx/store';
import { Observable, Subscription } from 'rxjs';
import { concatMap, filter, first } from 'rxjs/operators';
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
import { TaskFocusService } from '../tasks/task-focus.service';
import { selectTaskFeatureState } from '../tasks/store/task.selectors';
import { findTaskToStart } from '../tasks/util/find-task-to-start';
import { WorkContextService } from '../work-context/work-context.service';
import { INBOX_PROJECT } from '../project/project.const';
import { SIMPLE_TODO_DISABLED_FEATURES } from './onboarding-presets.const';

export type OnboardingStep =
  | 'create-task'
  | 'track-offer'
  | 'task-swipe-left'
  | 'task-swipe-right'
  | 'explore-inbox';

type OnboardingPhase =
  | 'idle'
  | 'await-first-task'
  | 'track-offer'
  | 'task-swipe-left'
  | 'task-swipe-right'
  | 'explore-inbox';

/** Undo for "I only need a to-do list" must stay reachable (WCAG 2.2.1). */
const SIMPLIFIED_SNACK_DURATION_MS = 10000;

/** More projects than the default ones means this is not a new user. */
const RETURNING_USER_MIN_PROJECTS = 3;

/**
 * First-run guidance: value first, no upfront decision.
 *
 * 1. Point at "+" until the user creates their first real task (any local
 *    creation path; example tasks and repeat instances do not count).
 * 2. Point at the existing header play button, naming the task it would start.
 *    Starting tracking (from anywhere) ends guidance; the pause button and the
 *    time on the task row confirm it. "I only need a to-do list" switches
 *    features off (with undo). Ignoring the offer changes nothing: feature
 *    settings are only written on an explicit choice, because appFeatures sync
 *    to the user's other devices.
 * 3. Phones only: on the task row, "swipe left for more actions" (advances once
 *    the task menu was opened and closed), then "swipe right to mark it as done"
 *    (ends once a task is marked done).
 * 4. If the seeded example tasks are still in the Inbox, point at the Inbox once
 *    (ends when the Inbox is opened). Otherwise they are easy to never find.
 *
 * No step advances on a timer. Reloading after the first task ends guidance.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingHintService {
  private _layoutService = inject(LayoutService);
  private _dataInitStateService = inject(DataInitStateService);
  private _taskService = inject(TaskService);
  private _taskFocusService = inject(TaskFocusService);
  private _projectService = inject(ProjectService);
  private _globalConfigService = inject(GlobalConfigService);
  private _snackService = inject(SnackService);
  private _store = inject(Store);
  private _localActions$: Observable<Action> = inject(LOCAL_ACTIONS);

  private _phase = signal<OnboardingPhase>('idle');
  private _wasTaskMenuOpened = false;
  private _isFirstTaskComposerAutoCloseUsed = false;
  private _startSub: Subscription | null = null;
  private _taskAddSub: Subscription | null = null;
  private _taskDoneSub: Subscription | null = null;
  private _taskState = this._store.selectSignal(selectTaskFeatureState);
  private _taskEntities = computed(() => this._taskState().entities);
  private _workContextService = inject(WorkContextService);
  private _mainListTaskIds = toSignal(this._workContextService.mainListTaskIds$, {
    initialValue: [] as string[],
  });
  private _activeWorkContextId = toSignal(this._workContextService.activeWorkContextId$, {
    initialValue: null,
  });

  readonly offerTaskId = signal<string | null>(null);

  readonly offerTask = computed(() => {
    const id = this.offerTaskId();
    return id ? (this._taskEntities()[id] ?? null) : null;
  });

  /** The task the header play button would start; the offer names exactly this one. */
  readonly playTargetTask = computed(() => {
    const id = findTaskToStart(this._taskState(), this._mainListTaskIds());
    return id ? (this._taskEntities()[id] ?? null) : null;
  });

  /** Row the swipe hints point at: the first task while undone, else any undone task. */
  readonly swipeTargetTaskId = computed(() => {
    const task = this.offerTask();
    return task && !task.isDone ? task.id : null;
  });

  /** Hints hide while the composer, a task panel or task menu is open. */
  readonly currentStep = computed<OnboardingStep | null>(() => {
    const phase = this._phase();
    if (this._layoutService.isShowAddTaskBar()) {
      return null;
    }
    if (phase === 'task-swipe-left' || phase === 'task-swipe-right') {
      const isTaskUiOpen =
        this._taskFocusService.isTaskContextMenuOpen() ||
        this._taskService.selectedTaskId() !== null;
      return isTaskUiOpen ? null : phase;
    }
    if (phase === 'await-first-task') {
      return 'create-task';
    }
    if (phase === 'explore-inbox') {
      return 'explore-inbox';
    }
    // Nothing play could start here (e.g. the task went to another list): stay quiet.
    if (phase === 'track-offer' && this.offerTask() && this.playTargetTask()) {
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

    // Tracking started (header play button, task play button, shortcut, ...):
    // the pause button and the time on the task confirm it, so move on.
    effect(() => {
      if (this._phase() === 'track-offer' && this._taskService.currentTaskId() !== null) {
        untracked(() => this._advancePastTrackOffer());
      }
    });

    // "Swipe left" is learned once the task menu was opened and closed again.
    effect(() => {
      const isMenuOpen = this._taskFocusService.isTaskContextMenuOpen();
      if (this._phase() !== 'task-swipe-left') {
        return;
      }
      if (isMenuOpen) {
        this._wasTaskMenuOpened = true;
      } else if (this._wasTaskMenuOpened) {
        this._phase.set('task-swipe-right');
      }
    });

    // The Inbox tip is done once the Inbox is open.
    effect(() => {
      if (
        this._phase() === 'explore-inbox' &&
        this._activeWorkContextId() === INBOX_PROJECT.id
      ) {
        untracked(() => this._markDone());
      }
    });

    // A returning user who sets up sync needs no new-user guidance.
    effect(() => {
      if (this._globalConfigService.sync()?.isEnabled) {
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

    // Marking a task done (swipe right, checkbox, ...) completes the swipe hints.
    this._taskDoneSub = this._localActions$
      .pipe(
        ofType(TaskSharedActions.updateTask),
        filter(({ task }) => task.changes.isDone === true),
      )
      .subscribe(() => {
        const phase = this._phase();
        if (phase === 'task-swipe-left' || phase === 'task-swipe-right') {
          this._advanceToExplore();
        }
      });
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
      this._phase() === 'idle' ||
      this._phase() === 'await-first-task' ||
      this.offerTaskId() !== taskId
    ) {
      return false;
    }
    this._isFirstTaskComposerAutoCloseUsed = true;
    return this.isSwipeLayout();
  }

  simplifyToTodoList(): void {
    if (this._phase() !== 'track-offer') {
      return;
    }
    const current = this._globalConfigService.appFeatures();
    const previous = Object.fromEntries(
      Object.keys(SIMPLE_TODO_DISABLED_FEATURES).map((key) => [
        key,
        current[key as keyof AppFeaturesConfig],
      ]),
    ) as Partial<AppFeaturesConfig>;

    // Move on first: the hint is anchored to the play button being hidden.
    this._advancePastTrackOffer();
    // Only switch features off; never re-enable something the user hid.
    this._globalConfigService.updateSection(
      'appFeatures',
      SIMPLE_TODO_DISABLED_FEATURES,
      true,
    );
    this._snackService.open({
      type: 'SUCCESS',
      msg: T.ONBOARDING.HINTS.SIMPLIFIED,
      actionStr: T.G.UNDO,
      actionFn: () =>
        this._globalConfigService.updateSection('appFeatures', previous, true),
      config: { duration: SIMPLIFIED_SNACK_DURATION_MS },
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
      this.offerTaskId.set(taskId);
      this._advancePastTrackOffer();
      return;
    }
    this.offerTaskId.set(taskId);
    this._phase.set('track-offer');
  }

  /** Touch input on the phone layout, where tasks are handled with swipes. */
  isSwipeLayout(): boolean {
    return isTouchActive() && this._layoutService.isShowMobileBottomNav();
  }

  /** Phones continue with the swipe gestures; elsewhere guidance is complete. */
  private _advancePastTrackOffer(): void {
    if (this.isSwipeLayout()) {
      this._wasTaskMenuOpened = false;
      this._phase.set('task-swipe-left');
    } else {
      this._advanceToExplore();
    }
  }

  /** Point at the Inbox only while the seeded example tasks are still there. */
  private _advanceToExplore(): void {
    const offerTaskId = this.offerTaskId();
    const hasExampleTasksInInbox =
      !!localStorage.getItem(LS.EXAMPLE_TASKS_CREATED) &&
      Object.values(this._taskEntities()).some(
        (task) =>
          !!task &&
          task.projectId === INBOX_PROJECT.id &&
          task.id !== offerTaskId &&
          !task.parentId &&
          !task.isDone,
      );
    if (hasExampleTasksInInbox && this._activeWorkContextId() !== INBOX_PROJECT.id) {
      this._phase.set('explore-inbox');
    } else {
      this._markDone();
    }
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
    this._taskDoneSub?.unsubscribe();
    this._taskDoneSub = null;
    this.offerTaskId.set(null);
    this._phase.set('idle');
  }
}
