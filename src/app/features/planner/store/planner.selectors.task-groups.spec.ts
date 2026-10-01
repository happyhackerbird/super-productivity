import * as fromSelectors from './planner.selectors';
import { PlannerState } from './planner.reducer';
import { Task } from '../../tasks/task.model';
import { getDbDateStr } from '../../../util/get-db-date-str';
import { PlannerDay } from '../planner.model';

describe('Planner Selectors - task groups', () => {
  const today = getDbDateStr();
  const tomorrow = getDbDateStr(new Date(Date.now() + 86400000));

  const createMockTask = (overrides: Partial<Task> & { id: string }): Task => {
    const { id, ...rest } = overrides;
    return {
      id,
      title: `Task ${id}`,
      created: Date.now(),
      isDone: false,
      subTaskIds: [],
      tagIds: [],
      projectId: 'project1',
      timeSpentOnDay: {},
      timeEstimate: 0,
      timeSpent: 0,
      attachments: [],
      ...rest,
    };
  };

  const scheduleConfig = {
    isWorkStartEndEnabled: false,
    workStart: '09:00',
    workEnd: '17:00',
    isLunchBreakEnabled: false,
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:00',
  };

  const getDay = (
    day: string,
    tasks: Task[],
    plannerState: PlannerState,
    todayListTaskIds: string[] = [],
  ): PlannerDay =>
    fromSelectors
      .selectPlannerDays([day], [], todayListTaskIds, [], [], today)
      .projector(
        new Map(tasks.map((t) => [t.id, t])),
        plannerState,
        scheduleConfig,
        0,
      )[0];

  const ids = (tasks: { id: string }[] | undefined): string[] =>
    (tasks || []).map((t) => t.id);

  it('should leave a day without grouped tasks unchanged and ungrouped', () => {
    const tasks = [createMockTask({ id: 'a' }), createMockTask({ id: 'b' })];
    const day = getDay(tomorrow, tasks, {
      days: { [tomorrow]: ['a', 'b'] },
      addPlannedTasksDialogLastShown: undefined,
    });

    expect(ids(day.tasks)).toEqual(['a', 'b']);
    expect(ids(day.ungroupedTasks)).toEqual(['a', 'b']);
    expect(day.taskGroups).toEqual([]);
  });

  it('should split a planned day into the ungrouped list and its groups', () => {
    const tasks = [
      createMockTask({ id: 'a', plannerGroup: `${tomorrow}:g2` }),
      createMockTask({ id: 'b' }),
      createMockTask({ id: 'c', plannerGroup: `${tomorrow}:g1` }),
      createMockTask({ id: 'd', plannerGroup: `${tomorrow}:g2` }),
    ];
    const day = getDay(tomorrow, tasks, {
      days: { [tomorrow]: ['a', 'b', 'c', 'd'] },
      addPlannedTasksDialogLastShown: undefined,
    });

    expect(ids(day.tasks)).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(day.ungroupedTasks)).toEqual(['b']);
    expect((day.taskGroups || []).map((g) => [g.id, ids(g.tasks)])).toEqual([
      ['g1', ['c']],
      ['g2', ['a', 'd']],
    ]);
    expect(day.itemsTotal).toBe(4);
  });

  it('should group tasks of today by the order of the today list', () => {
    const tasks = [
      createMockTask({ id: 'a', dueDay: today, plannerGroup: `${today}:g1` }),
      createMockTask({ id: 'b', dueDay: today }),
      createMockTask({ id: 'c', dueDay: today, plannerGroup: `${today}:g1` }),
    ];
    const day = getDay(
      today,
      tasks,
      { days: {}, addPlannedTasksDialogLastShown: undefined },
      ['c', 'b', 'a'],
    );

    expect(ids(day.ungroupedTasks)).toEqual(['b']);
    expect((day.taskGroups || []).map((g) => ids(g.tasks))).toEqual([['c', 'a']]);
  });

  it('should show a task as ungrouped when its value names another day', () => {
    const tasks = [createMockTask({ id: 'a', plannerGroup: `${today}:g1` })];
    const day = getDay(tomorrow, tasks, {
      days: { [tomorrow]: ['a'] },
      addPlannedTasksDialogLastShown: undefined,
    });

    expect(ids(day.ungroupedTasks)).toEqual(['a']);
    expect(day.taskGroups).toEqual([]);
  });

  it('should drop a group when its last task is no longer part of the day', () => {
    const tasks = [createMockTask({ id: 'a', plannerGroup: `${tomorrow}:g1` })];
    const day = getDay(tomorrow, tasks, {
      days: { [tomorrow]: [] },
      addPlannedTasksDialogLastShown: undefined,
    });

    expect(day.taskGroups).toEqual([]);
  });
});
