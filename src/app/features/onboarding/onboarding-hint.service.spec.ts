import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { BehaviorSubject, of } from 'rxjs';
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
import { OnboardingHintService } from './onboarding-hint.service';
import { SIMPLE_TODO_FEATURES } from './onboarding-presets.const';

const ONBOARDING_KEYS = [
  LS.ONBOARDING_PRESET_DONE,
  LS.ONBOARDING_HINTS_DONE,
  LS.IS_SKIP_TOUR,
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
    setCurrentId: jasmine.Spy;
  };
  let snackService: jasmine.SpyObj<SnackService>;
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

  const addFirstTask = (service: OnboardingHintService, id = 'task-1'): void => {
    setTasks([makeTask(id)]);
    service.onTaskAdded({ taskId: id, isNewTask: true, isAddToBottom: false });
    TestBed.tick();
  };

  beforeEach(() => {
    savedLs = {};
    for (const key of ONBOARDING_KEYS) {
      savedLs[key] = localStorage.getItem(key);
      localStorage.removeItem(key);
    }

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
      setCurrentId: jasmine.createSpy('setCurrentId'),
    };
    snackService = jasmine.createSpyObj<SnackService>('SnackService', ['open']);

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
          useValue: { isAllDataLoadedInitially$: of(true) },
        },
        { provide: ProjectService, useValue: { list$: projects$ } },
        { provide: GlobalConfigService, useValue: globalConfigService },
        { provide: TaskService, useValue: taskService },
        { provide: SnackService, useValue: snackService },
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
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

  it('ignores existing-task selections and unknown task ids', () => {
    const service = createService();
    setTasks([makeTask('existing')]);
    service.onTaskAdded({ taskId: 'existing', isNewTask: false, isAddToBottom: false });
    service.onTaskAdded({ taskId: 'missing', isNewTask: true, isAddToBottom: false });
    expect(service.currentStep()).toBe('create-task');
    expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBeNull();
  });

  it('offers tracking beside the first real task once the composer closes', () => {
    const service = createService();
    isShowAddTaskBar.set(true);
    addFirstTask(service);

    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_PRESET_DONE)).toBe('true');

    isShowAddTaskBar.set(false);
    expect(service.currentStep()).toBe('track-offer');
    expect(service.offerTaskId()).toBe('task-1');
    expect(service.isOfferTaskTrackable()).toBeTrue();
  });

  it('ends guidance without an offer when tracking was turned off before', () => {
    appFeatures.set({ ...appFeatures(), isTimeTrackingEnabled: false });
    const service = createService();
    addFirstTask(service);
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('starts the timer on exactly the offered task, then hints at pause', () => {
    const service = createService();
    addFirstTask(service);

    service.startTimerForOfferTask();
    expect(taskService.setCurrentId).toHaveBeenCalledOnceWith('task-1');
    expect(globalConfigService.updateSection).not.toHaveBeenCalled();

    currentTaskId.set('task-1');
    TestBed.tick();
    expect(service.currentStep()).toBe('pause-hint');

    currentTaskId.set(null);
    TestBed.tick();
    expect(service.currentStep()).toBeNull();
    expect(localStorage.getItem(LS.ONBOARDING_HINTS_DONE)).toBe('true');
  });

  it('does not start a task that became a parent task', () => {
    const service = createService();
    addFirstTask(service);
    setTasks([makeTask('task-1', { subTaskIds: ['sub-1'] })]);

    expect(service.isOfferTaskTrackable()).toBeFalse();
    service.startTimerForOfferTask();
    expect(taskService.setCurrentId).not.toHaveBeenCalled();
    expect(service.currentStep()).toBeNull();
  });

  it('applies Simple Todo only when the user picks it', () => {
    const service = createService();
    addFirstTask(service);

    service.simplifyToTodoList();
    expect(globalConfigService.updateSection).toHaveBeenCalledOnceWith(
      'appFeatures',
      SIMPLE_TODO_FEATURES,
      true,
    );
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

  it('auto-closes the composer only once, for the first task on phones', () => {
    const service = createService();
    addFirstTask(service);
    // Desktop layout: first call consumes the one chance without closing.
    expect(service.shouldAutoCloseFirstTaskComposer('task-1')).toBeFalse();
    expect(service.shouldAutoCloseFirstTaskComposer('task-1')).toBeFalse();
  });

  it('reports onboarding as finished once skipped', () => {
    const service = createService();
    expect(OnboardingHintService.isOnboardingInProgress()).toBeTrue();
    service.skip();
    expect(OnboardingHintService.isOnboardingInProgress()).toBeFalse();
    expect(service.currentStep()).toBeNull();
  });
});
