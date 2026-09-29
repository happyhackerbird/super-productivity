import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Action } from '@ngrx/store';
import { BehaviorSubject, Subject } from 'rxjs';
import { LS } from '../../core/persistence/storage-keys.const';
import { LayoutService } from '../../core-ui/layout/layout.service';
import { DataInitStateService } from '../../core/data-init/data-init-state.service';
import { SnackService } from '../../core/snack/snack.service';
import { AppFeaturesConfig } from '../config/global-config.model';
import { GlobalConfigService } from '../config/global-config.service';
import { DEFAULT_GLOBAL_CONFIG } from '../config/default-global-config.const';
import { ProjectService } from '../project/project.service';
import { selectTaskEntities } from '../tasks/store/task.selectors';
import { Task } from '../tasks/task.model';
import { TaskService } from '../tasks/task.service';
import { WorkContextType } from '../work-context/work-context.model';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { LOCAL_ACTIONS } from '../../util/local-actions.token';
import { OnboardingHintService } from './onboarding-hint.service';
import { SIMPLE_TODO_DISABLED_FEATURES } from './onboarding-presets.const';

const ONBOARDING_KEYS = [
  LS.ONBOARDING_PRESET_DONE,
  LS.ONBOARDING_HINTS_DONE,
  LS.IS_SKIP_TOUR,
  LS.EXAMPLE_TASKS_CREATED,
];

const makeTask = (id: string, partial: Partial<Task> = {}): Task =>
  ({ id, title: id, isDone: false, subTaskIds: [], ...partial }) as Task;

describe('OnboardingHintService', () => {
  let store: MockStore;
  let isShowAddTaskBar: WritableSignal<boolean>;
  let currentTaskId: WritableSignal<string | null>;
  let appFeatures: WritableSignal<AppFeaturesConfig>;
  let syncEnabled: WritableSignal<boolean>;
  let projects$: BehaviorSubject<{ id: string }[]>;
  let globalConfigService: {
    appFeatures: WritableSignal<AppFeaturesConfig>;
    sync: () => { isEnabled: boolean };
    updateSection: jasmine.Spy;
  };
  let taskService: {
    currentTaskId: WritableSignal<string | null>;
  };
  let snackService: jasmine.SpyObj<SnackService>;
  let localActions$: Subject<Action>;
  let dataLoaded$: BehaviorSubject<boolean> | Subject<boolean>;
  let savedLs: Record<string, string | null>;

  const setTasks = (tasks: Task[]): void => {
    store.overrideSelector(
      selectTaskEntities,
      Object.fromEntries(tasks.map((t) => [t.id, t])),
    );
    store.refreshState();
  };

  const createService = (): OnboardingHintService => {
    const service = TestBed.inject(OnboardingHintService);
    TestBed.tick();
    return service;
  };

  const dispatchAddTask = (task: Task, extra: { isExampleTask?: boolean } = {}): void => {
    localActions$.next(
      TaskSharedActions.addTask({
        task,
        workContextId: 'INBOX_PROJECT',
        workContextType: WorkContextType.PROJECT,
        isAddToBacklog: false,
        isAddToBottom: false,
        ...extra,
      }),
    );
    TestBed.tick();
  };

  const addFirstTask = (_service: OnboardingHintService, id = 'task-1'): void => {
    const task = makeTask(id);
    setTasks([task]);
    dispatchAddTask(task);
  };

  beforeEach(() => {
    savedLs = {};
    for (const key of ONBOARDING_KEYS) {
      savedLs[key] = localStorage.getItem(key);
      localStorage.removeItem(key);
    }
    // A fresh install seeds example tasks; tests that need an older install unset it.
    localStorage.setItem(LS.EXAMPLE_TASKS_CREATED, 'true');

    isShowAddTaskBar = signal(false);
    currentTaskId = signal(null);
    appFeatures = signal({ ...DEFAULT_GLOBAL_CONFIG.appFeatures });
    syncEnabled = signal(false);
    projects$ = new BehaviorSubject<{ id: string }[]>([{ id: 'INBOX_PROJECT' }]);

    globalConfigService = {
      appFeatures,
      sync: () => ({ isEnabled: syncEnabled() }),
      updateSection: jasmine.createSpy('updateSection'),
    };
    taskService = {
      currentTaskId,
    };
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    localActions$ = new Subject<Action>();
    dataLoaded$ = new BehaviorSubject(true);

    TestBed.configureTestingModule({
      providers: [
        OnboardingHintService,
        provideMockStore(),
        {
          provide: LayoutService,
          useValue: { isShowAddTaskBar, isShowMobileBottomNav: signal(false) },
        },
        {
          provide: DataInitStateService,
          useValue: {
            get isAllDataLoadedInitially$() {
              return dataLoaded$;
            },
          },
        },
        { provide: ProjectService, useValue: { list$: projects$ } },
        { provide: GlobalConfigService, useValue: globalConfigService },
        { provide: TaskService, useValue: taskService },
        { provide: SnackService, useValue: snackService },
        { provide: LOCAL_ACTIONS, useValue: localActions$ },
      ],
    });
    store = TestBed.inject(MockStore);
    setTasks([]);
  });

  afterEach(() => {
    // overrideSelector mutates the shared memoized selector; reset it so the
    // override cannot leak into specs that run later.
    store.resetSelectors();
    for (const key of ONBOARDING_KEYS) {
      const value = savedLs[key];
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }
  });

  it('points at + for a new user and hides while the composer is open', () => {
    const service = createService();
    expect(service.currentStep()).toBe('create-task');

    isShowAddTaskBar.set(true);
    expect(service.currentStep()).toBeNull();

    isShowAddTaskBar.set(false);
    expect(service.currentStep()).toBe('create-task');
  });

  it('never writes feature settings without an explicit choice', () => {
    const service = createService();
    addFirstTask(service);
    service.skip();
    expect(globalConfigService.updateSection).not.toHaveBeenCalled();
  });

  it('skips guidance for returning users with more than the default projects', () => {
    projects$.next([{ id: 'INBOX_PROJECT' }, { id: 'p1' }, { id: 'p2' }]);
    const service = createService();
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('skips guidance when sync is already enabled', () => {
    syncEnabled.set(true);
    const service = createService();
    expect(service.currentStep()).toBeNull();
    expect(OnboardingHintService.isOnboardingInProgress()).toBeFalse();
  });

  it('treats a first task from an earlier session as a dismissed offer', () => {
    localStorage.setItem(LS.ONBOARDING_PRESET_DONE, 'true');
    const service = createService();
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('ignores example tasks, repeat instances and unknown task ids', () => {
    const service = createService();
    const example = makeTask('example');
    const repeated = makeTask('repeated', { repeatCfgId: 'cfg-1' });
    setTasks([example, repeated]);
    dispatchAddTask(example, { isExampleTask: true });
    dispatchAddTask(repeated);
    dispatchAddTask(makeTask('missing'));
    expect(service.currentStep()).toBe('create-task');
    expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBeNull();
  });

  it('counts a task created outside the global add-task bar', () => {
    // e.g. planner inline add, boards, share: all dispatch addTask locally
    const service = createService();
    addFirstTask(service, 'planner-task');
    expect(service.currentStep()).toBe('track-offer');
    expect(service.offerTaskId()).toBe('planner-task');
  });

  it('ignores tasks added before data has loaded', () => {
    dataLoaded$ = new Subject<boolean>();
    const service = createService();
    addFirstTask(service);
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBeNull();

    dataLoaded$.next(true);
    TestBed.tick();
    expect(service.currentStep()).toBe('create-task');
  });

  it('skips guidance for installs whose tasks were not seeded by us', () => {
    localStorage.removeItem(LS.EXAMPLE_TASKS_CREATED);
    setTasks([makeTask('old-task')]);
    const service = createService();
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('keeps guiding when the only existing tasks are seeded examples', () => {
    setTasks([makeTask('example')]);
    const service = createService();
    expect(service.currentStep()).toBe('create-task');
  });

  it('ends guidance when the user enables sync mid-onboarding', () => {
    const service = createService();
    expect(service.currentStep()).toBe('create-task');
    syncEnabled.set(true);
    TestBed.tick();
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('offers tracking after the first real task once the composer closes', () => {
    const service = createService();
    isShowAddTaskBar.set(true);
    addFirstTask(service);

    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBe('true');

    isShowAddTaskBar.set(false);
    expect(service.currentStep()).toBe('track-offer');
    expect(service.offerTaskId()).toBe('task-1');
  });

  it('ends guidance without an offer when tracking was turned off before', () => {
    appFeatures.set({ ...appFeatures(), isTimeTrackingEnabled: false });
    const service = createService();
    addFirstTask(service);
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('explains pausing once tracking starts, naming the running task', () => {
    const service = createService();
    addFirstTask(service);
    expect(service.currentStep()).toBe('track-offer');

    // Started via the header play button, a task play button or a shortcut.
    currentTaskId.set('task-1');
    TestBed.tick();
    expect(service.currentStep()).toBe('pause-hint');
    expect(service.currentTaskTitle()).toBe('task-1');
    expect(globalConfigService.updateSection).not.toHaveBeenCalled();

    currentTaskId.set(null);
    TestBed.tick();
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('switches features off only when the user picks a to-do list', () => {
    const service = createService();
    addFirstTask(service);

    service.simplifyToTodoList();
    expect(globalConfigService.updateSection).toHaveBeenCalledOnceWith(
      'appFeatures',
      SIMPLE_TODO_DISABLED_FEATURES,
      true,
    );
    // Never re-enables anything the user may have hidden.
    expect(
      Object.values(SIMPLE_TODO_DISABLED_FEATURES).every((isOn) => isOn === false),
    ).toBeTrue();
    expect(snackService.open).toHaveBeenCalledTimes(1);
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('ends the offer when its task disappears', () => {
    const service = createService();
    addFirstTask(service);
    setTasks([]);
    TestBed.tick();
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('never auto-closes the composer on desktop layouts', () => {
    // The phone case (touch + bottom nav) is covered by the mobile e2e spec,
    // because touch intent cannot be simulated in the unit test browser.
    const service = createService();
    addFirstTask(service);
    expect(service.shouldAutoCloseFirstTaskComposer('task-1')).toBeFalse();
    expect(service.shouldAutoCloseFirstTaskComposer('other-task')).toBeFalse();
  });

  it('reports onboarding as finished once skipped', () => {
    const service = createService();
    expect(OnboardingHintService.isOnboardingInProgress()).toBeTrue();
    service.skip();
    expect(OnboardingHintService.isOnboardingInProgress()).toBeFalse();
    expect(service.currentStep()).toBeNull();
  });
});
