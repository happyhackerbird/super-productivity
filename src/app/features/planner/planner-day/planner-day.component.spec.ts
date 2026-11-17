import { signal } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { MatDialog } from '@angular/material/dialog';
import { PlannerDayComponent } from './planner-day.component';
import { PlannerDay } from '../planner.model';
import { TaskService } from '../../tasks/task.service';
import { DateService } from '../../../core/date/date.service';
import { LayoutService } from '../../../core-ui/layout/layout.service';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CdkDragDrop, CdkDragStart, DragRef } from '@angular/cdk/drag-drop';
import { of } from 'rxjs';
import { TaskCopy, TaskWithSubTasks } from '../../tasks/task.model';
import { ScheduleExternalDragService } from '../../schedule/schedule-week/schedule-external-drag.service';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { PlannerActions } from '../store/planner.actions';
import { selectPlannerState } from '../store/planner.selectors';
import { selectTodayTaskIds } from '../../work-context/store/work-context.selectors';
import { selectTodayTagTaskIds } from '../../tag/store/tag.reducer';
import { TaskMultiSelectService } from '../../tasks/task-multi-select.service';
import { isMultiEntityOperation } from '../../../op-log/util/get-op-entity-ids.util';
import { PersistentActionMeta } from '../../../op-log/core/persistent-action.interface';
import { Action } from '@ngrx/store';
import { PLANNER_SECOND_LIST_GROUP } from '../store/planner-task-groups.util';

describe('PlannerDayComponent', () => {
  const createComponent = (
    currentLocale: string,
    isoTextLocale: string | null,
  ): PlannerDayComponent => {
    TestBed.configureTestingModule({
      imports: [PlannerDayComponent],
      providers: [
        provideMockStore(),
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
        { provide: TaskService, useValue: {} },
        { provide: DateService, useValue: {} },
        { provide: LayoutService, useValue: { isXs: signal(false) } },
        {
          provide: DateTimeFormatService,
          useValue: {
            currentLocale: signal(currentLocale),
            isoTextLocale: signal(isoTextLocale),
          },
        },
      ],
    });
    TestBed.overrideComponent(PlannerDayComponent, { set: { template: '' } });
    const component = TestBed.createComponent(PlannerDayComponent).componentInstance;
    component.day = { dayDate: '2026-05-11' } as PlannerDay;
    return component;
  };

  const getDayLabel = (component: PlannerDayComponent): string =>
    (
      component as unknown as {
        dayLabel: () => string;
      }
    ).dayLabel();

  const createRenderedComponent = (): ComponentFixture<PlannerDayComponent> => {
    TestBed.configureTestingModule({
      imports: [PlannerDayComponent, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
        { provide: TaskService, useValue: {} },
        { provide: DateService, useValue: {} },
        { provide: LayoutService, useValue: { isXs: signal(false) } },
        {
          provide: DateTimeFormatService,
          useValue: {
            currentLocale: signal('en'),
            isoTextLocale: signal('en'),
          },
        },
      ],
    });
    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en', {
      F: {
        PLANNER: {
          DAY_LOAD: 'Planned: {{planned}} / Available: {{available}}',
          NO_TASKS: 'No tasks',
        },
      },
      G: { ADD: 'Add' },
    });
    translateService.use('en');

    const fixture = TestBed.createComponent(PlannerDayComponent);
    fixture.componentInstance.day = {
      dayDate: '2026-05-11',
      timeEstimate: 0,
      timeLimit: 0,
      itemsTotal: 0,
      tasks: [],
      deadlineTasks: [],
      noStartTimeRepeatProjections: [],
      allDayEvents: [],
      scheduledIItems: [],
      availableHours: 7 * 60 * 60 * 1000,
      progressPercentage: 0,
    };
    fixture.detectChanges();
    return fixture;
  };

  beforeAll(() => registerLocaleData(localeDe, 'de-DE'));

  describe('task groups', () => {
    const DAY = '2026-05-11';
    const task = (id: string, o: Partial<TaskCopy> = {}): TaskCopy =>
      ({ id, subTaskIds: [], ...o }) as TaskCopy;
    // Not a `.task-group` list, so drops take the single-task path.
    const element = { nativeElement: document.createElement('div') };
    const container = { data: DAY, element };

    afterEach(() => TestBed.inject(MockStore).resetSelectors());

    const dropEv = (
      t: TaskCopy,
      o: Partial<CdkDragDrop<string, string, TaskCopy>> = {},
    ): CdkDragDrop<string, string, TaskCopy> =>
      ({
        item: { data: t },
        container,
        previousContainer: container,
        previousIndex: 0,
        currentIndex: 1,
        isPointerOverContainer: true,
        ...o,
      }) as unknown as CdkDragDrop<string, string, TaskCopy>;

    const createForDrop = (
      isTaskGroupingEnabled: boolean,
      day: Partial<PlannerDay>,
    ): { component: PlannerDayComponent; dispatch: jasmine.Spy } => {
      TestBed.configureTestingModule({
        imports: [PlannerDayComponent],
        providers: [
          provideMockStore({
            selectors: [
              {
                selector: selectPlannerState,
                value: {
                  days: { [DAY]: ['a', 'b', 'c'] },
                  addPlannedTasksDialogLastShown: undefined,
                },
              },
              { selector: selectTodayTaskIds, value: [] },
              { selector: selectTodayTagTaskIds, value: [] },
            ],
          }),
          { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
          { provide: TaskService, useValue: {} },
          { provide: DateService, useValue: { todayStr: () => '2026-05-10' } },
          { provide: LayoutService, useValue: { isXs: signal(false) } },
          {
            provide: DateTimeFormatService,
            useValue: { currentLocale: signal('en'), isoTextLocale: signal('en') },
          },
        ],
      });
      TestBed.overrideComponent(PlannerDayComponent, { set: { template: '' } });
      const fixture = TestBed.createComponent(PlannerDayComponent);
      fixture.componentRef.setInput('isTaskGroupingEnabled', isTaskGroupingEnabled);
      fixture.componentInstance.day = {
        dayDate: DAY,
        tasks: [],
        scheduledIItems: [],
        ...day,
      } as PlannerDay;
      const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
      return { component: fixture.componentInstance, dispatch };
    };

    it('starts a group for a drop on the new group zone', () => {
      const { component, dispatch } = createForDrop(true, {});
      component.dropInNewGroup(
        dropEv(task('a'), { previousContainer: { data: DAY, element } as never }),
      );

      expect(dispatch).toHaveBeenCalledTimes(1);
      const action = dispatch.calls.mostRecent().args[0] as ReturnType<
        typeof TaskSharedActions.updateTask
      >;
      expect(action.type).toBe(TaskSharedActions.updateTask.type);
      expect(action.task.id).toBe('a');
      expect(action.task.changes.plannerGroup).toMatch(new RegExp(`^${DAY}:.+`));
    });

    it('ignores a drop for the new group zone when the pointer left it', () => {
      const { component, dispatch } = createForDrop(true, {});
      component.dropInNewGroup(
        dropEv(task('a'), {
          previousContainer: { data: DAY, element } as never,
          isPointerOverContainer: false,
        }),
      );

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('keeps the previous reorder for a day without groups', () => {
      const { component, dispatch } = createForDrop(true, { taskGroups: [] });
      component.drop('TODO', [task('a'), task('b')], dropEv(task('a')));

      expect(dispatch).toHaveBeenCalledOnceWith(
        PlannerActions.moveInList({ targetDay: DAY, fromIndex: 0, toIndex: 1 }),
      );
    });

    it('clears the group of a task that is dropped into the ungrouped list', () => {
      const grouped = task('c', { plannerGroup: `${DAY}:g1` });
      const { component, dispatch } = createForDrop(true, {
        taskGroups: [{ id: 'g1', tasks: [grouped] }],
      });
      component.drop(
        'TODO',
        [task('a'), task('b')],
        dropEv(grouped, {
          previousContainer: { data: DAY, element } as never,
          currentIndex: 2,
        }),
      );

      expect(dispatch).toHaveBeenCalledOnceWith(
        TaskSharedActions.updateTask({
          task: { id: 'c', changes: { plannerGroup: null } },
        }),
      );
    });

    it('puts a task dropped into the second list into it', () => {
      const plain = task('a');
      const { component, dispatch } = createForDrop(true, {
        ungroupedTasks: [plain, task('b')],
        secondListTasks: [],
      });
      component.dropInSecondList(
        [],
        dropEv(plain, {
          previousContainer: { data: DAY, element } as never,
          currentIndex: 0,
        }),
      );

      expect(dispatch).toHaveBeenCalledOnceWith(
        TaskSharedActions.updateTask({
          task: { id: 'a', changes: { plannerGroup: PLANNER_SECOND_LIST_GROUP } },
        }),
      );
    });

    it('clears the marker of a second list task dropped into the plain list', () => {
      const second = task('c', { plannerGroup: PLANNER_SECOND_LIST_GROUP });
      const { component, dispatch } = createForDrop(true, {
        ungroupedTasks: [task('a'), task('b')],
        secondListTasks: [second],
      });
      component.drop(
        'TODO',
        [task('a'), task('b')],
        dropEv(second, {
          previousContainer: { data: DAY, element } as never,
          currentIndex: 2,
        }),
      );

      expect(dispatch).toHaveBeenCalledOnceWith(
        TaskSharedActions.updateTask({
          task: { id: 'c', changes: { plannerGroup: null } },
        }),
      );
    });

    it('adds a whole group dropped onto the second list to it', fakeAsync(() => {
      const OTHER_DAY = '2026-05-12';
      const members = ['m1', 'm2'].map((id) =>
        task(id, { plannerGroup: `${OTHER_DAY}:g1` }),
      );
      const { component, dispatch } = createForDrop(true, {
        ungroupedTasks: [task('a')],
        secondListTasks: [task('s1', { plannerGroup: PLANNER_SECOND_LIST_GROUP })],
        taskGroups: [],
      });
      const groupEl = document.createElement('div');
      groupEl.classList.add('task-group');
      const source = {
        data: OTHER_DAY,
        element: { nativeElement: groupEl },
        getSortedItems: () => members.map((data) => ({ data })),
      };
      const secondListEl = document.createElement('div');
      secondListEl.classList.add('second-list-items', 'normal-tasks-items--framed');
      TestBed.inject(TaskMultiSelectService).togglePlannerGroup(
        members.map((m) => m.id),
        'm1',
        document.createElement('div'),
      );

      component.dropInSecondList(
        [],
        dropEv(members[0], {
          previousContainer: source as never,
          container: { data: DAY, element: { nativeElement: secondListEl } } as never,
        }),
      );
      tick();

      const actions = dispatch.calls.allArgs().map(([a]) => a as Action);
      expect(actions).toEqual([
        ...members.map((m, index) =>
          PlannerActions.transferTask({
            task: m,
            prevDay: OTHER_DAY,
            newDay: DAY,
            targetIndex: 3 + index,
            today: '2026-05-10',
          }),
        ),
        ...members.map((m) =>
          TaskSharedActions.updateTask({
            task: { id: m.id, changes: { plannerGroup: PLANNER_SECOND_LIST_GROUP } },
          }),
        ),
      ]);
    }));

    it('does not plan group drops when task groups are not enabled', () => {
      const grouped = task('c', { plannerGroup: `${DAY}:g1` });
      const { component, dispatch } = createForDrop(false, {
        taskGroups: [{ id: 'g1', tasks: [grouped] }],
      });
      component.drop('TODO', [task('a'), task('b'), grouped], dropEv(grouped));

      expect(dispatch).toHaveBeenCalledOnceWith(
        PlannerActions.moveInList({ targetDay: DAY, fromIndex: 0, toIndex: 1 }),
      );
    });

    // Sync: a bulk update naming every member would be one multi-entity op,
    // which conflict resolution cannot split.
    it('moves a selected group to another day with one entity per action', fakeAsync(() => {
      const OTHER_DAY = '2026-05-12';
      const members = ['m1', 'm2', 'm3'].map((id) =>
        task(id, { plannerGroup: `${OTHER_DAY}:g1` }),
      );
      const { component, dispatch } = createForDrop(true, {
        ungroupedTasks: [task('a')],
        taskGroups: [],
      });
      const groupEl = document.createElement('div');
      groupEl.classList.add('task-group');
      const source = {
        data: OTHER_DAY,
        element: { nativeElement: groupEl },
        getSortedItems: () => members.map((data) => ({ data })),
      };
      TestBed.inject(TaskMultiSelectService).togglePlannerGroup(
        members.map((m) => m.id),
        'm1',
        document.createElement('div'),
      );

      component.drop(
        'TODO',
        [task('a')],
        dropEv(members[0], { previousContainer: source as never }),
      );
      tick();

      const actions = dispatch.calls.allArgs().map(([a]) => a as Action);
      expect(actions.map((a) => a.type)).toEqual([
        ...members.map(() => PlannerActions.transferTask.type),
        ...members.map(() => TaskSharedActions.updateTask.type),
      ]);
      for (const action of actions) {
        const meta = (action as Action & { meta: PersistentActionMeta }).meta;
        expect(isMultiEntityOperation(meta)).withContext(action.type).toBeFalse();
        expect(meta.isBulk).withContext(action.type).toBeFalsy();
      }
      expect(TestBed.inject(TaskMultiSelectService).selectedIds().size).toBe(0);
    }));

    it('lets untimed tasks only enter a scheduled list that has items', () => {
      const { component } = createForDrop(true, {});
      const canEnter = (
        component as unknown as {
          canEnterScheduled: (drag: { data: TaskCopy }) => boolean;
        }
      ).canEnterScheduled;

      expect(canEnter({ data: task('a') })).toBe(false);
      expect(canEnter({ data: task('a', { dueWithTime: 5 }) })).toBe(true);
      component.day = {
        ...component.day,
        scheduledIItems: [{}],
      } as unknown as PlannerDay;
      expect(canEnter({ data: task('a') })).toBe(true);
    });
  });

  it('uses the UI language for the weekday label with ISO formatting enabled', () => {
    const component = createComponent('sv', 'de');

    expect(getDayLabel(component)).toBe('Mo');
  });

  it('preserves Angular weekday formatting for non-ISO locales', () => {
    const component = createComponent('de-DE', null);

    expect(getDayLabel(component)).toBe('Mo.');
  });

  it('labels planned and available time and displays an explicit zero', () => {
    const fixture = createRenderedComponent();
    const dayLoad = fixture.nativeElement.querySelector('.day-load');

    expect(dayLoad?.textContent.trim()).toBe('Planned: 0m / Available: 7h');
  });
});

describe('PlannerDayComponent side nav drag (#11210)', () => {
  const task = { id: 't1' } as TaskCopy;
  const taskWithSubTasks = { id: 't1', subTasks: [] } as unknown as TaskWithSubTasks;
  const dragRef = {} as DragRef;
  let component: PlannerDayComponent;
  let store: MockStore;
  let externalDragService: ScheduleExternalDragService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlannerDayComponent],
      providers: [
        provideMockStore(),
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
        {
          provide: TaskService,
          useValue: { getByIdWithSubTaskData$: () => of(taskWithSubTasks) },
        },
        { provide: DateService, useValue: {} },
        { provide: LayoutService, useValue: { isXs: signal(false) } },
        {
          provide: DateTimeFormatService,
          useValue: { currentLocale: signal('en-US'), isoTextLocale: signal(null) },
        },
      ],
    });
    TestBed.overrideComponent(PlannerDayComponent, { set: { template: '' } });
    component = TestBed.createComponent(PlannerDayComponent).componentInstance;
    component.day = { dayDate: '2026-05-11', isToday: true } as PlannerDay;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    externalDragService = TestBed.inject(ScheduleExternalDragService);
  });

  const sameListDrop = (): CdkDragDrop<string, string, TaskCopy> => {
    // The fork's whole-group drop check reads the source list element.
    const container = {
      data: '2026-05-11',
      element: { nativeElement: document.createElement('div') },
    };
    return {
      container,
      previousContainer: container,
      item: { data: task },
      currentIndex: 0,
      previousIndex: 0,
    } as unknown as CdkDragDrop<string, string, TaskCopy>;
  };

  it('registers the dragged task with its subtasks so the side nav can handle it', () => {
    component.onDragStarted(task, {
      source: { _dragRef: dragRef },
    } as unknown as CdkDragStart);

    expect(externalDragService.activeTask()).toBe(taskWithSubTasks);
    expect(externalDragService.activeDragRef()).toBe(dragRef);

    component.onDragEnded();
    expect(externalDragService.activeTask()).toBeNull();
  });

  it('skips the in-list reorder when the side nav already handled the drop', () => {
    externalDragService.setCancelNextDrop(true);

    component.drop('TODO', [task], sameListDrop());

    expect(store.dispatch).not.toHaveBeenCalled();
    expect(externalDragService.isCancelNextDrop()).toBe(false);
  });

  it('reorders within today when no external drop happened', () => {
    component.drop('TODO', [task], sameListDrop());

    expect(store.dispatch).toHaveBeenCalledWith(
      TaskSharedActions.moveTaskInTodayTagList({ toTaskId: 't1', fromTaskId: 't1' }),
    );
  });
});
