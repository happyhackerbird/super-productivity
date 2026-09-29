import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { provideMockStore } from '@ngrx/store/testing';
import { MatDialog } from '@angular/material/dialog';
import { PlannerDayComponent } from './planner-day.component';
import { PlannerDay } from '../planner.model';
import { TaskService } from '../../tasks/task.service';
import { DateService } from '../../../core/date/date.service';
import { LayoutService } from '../../../core-ui/layout/layout.service';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MockStore } from '@ngrx/store/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TaskCopy } from '../../tasks/task.model';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { PlannerActions } from '../store/planner.actions';
import { selectPlannerState } from '../store/planner.selectors';
import { selectTodayTaskIds } from '../../work-context/store/work-context.selectors';
import { selectTodayTagTaskIds } from '../../tag/store/tag.reducer';

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
    const container = { data: DAY };

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
        dropEv(task('a'), { previousContainer: { data: DAY } as never }),
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
          previousContainer: { data: DAY } as never,
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
        dropEv(grouped, { previousContainer: { data: DAY } as never, currentIndex: 2 }),
      );

      expect(dispatch).toHaveBeenCalledOnceWith(
        TaskSharedActions.updateTask({
          task: { id: 'c', changes: { plannerGroup: null } },
        }),
      );
    });

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
