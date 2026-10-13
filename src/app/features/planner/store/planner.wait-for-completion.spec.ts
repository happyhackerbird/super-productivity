import * as fromSelectors from './planner.selectors';
import { PlannerState } from './planner.reducer';
import { Task } from '../../tasks/task.model';
import { getDbDateStr } from '../../../util/get-db-date-str';
import {
  DEFAULT_TASK_REPEAT_CFG,
  TaskRepeatCfg,
} from '../../task-repeat-cfg/task-repeat-cfg.model';
import { ScheduleItemType } from '../planner.model';

// A recurring task with "Only create next task after completion"
// (waitForCompletion) must only show its open instance; the planner must not
// draw repeat projections for it on the following days.
describe('Planner Selectors - waitForCompletion repeat projections', () => {
  const today = getDbDateStr();
  const dayAfterToday = (n: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return getDbDateStr(d);
  };
  const dayDates = [today, dayAfterToday(1), dayAfterToday(2), dayAfterToday(3)];

  const emptyPlannerState: PlannerState = {
    days: {},
    addPlannedTasksDialogLastShown: undefined,
  };

  const defaultScheduleConfig = {
    isWorkStartEndEnabled: false,
    workStart: '09:00',
    workEnd: '17:00',
    isLunchBreakEnabled: false,
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:00',
  };

  const dailyCfg = (
    id: string,
    overrides: Partial<TaskRepeatCfg> = {},
  ): TaskRepeatCfg => ({
    ...DEFAULT_TASK_REPEAT_CFG,
    id,
    repeatCycle: 'DAILY',
    repeatEvery: 1,
    startDate: '2020-01-01',
    lastTaskCreationDay: today,
    ...overrides,
  });

  const openInstance = (repeatCfgId: string): Task =>
    ({
      id: `${repeatCfgId}_${today}`,
      title: 'Open instance',
      created: Date.now(),
      isDone: false,
      subTaskIds: [],
      tagIds: [],
      projectId: 'project1',
      timeSpentOnDay: {},
      timeEstimate: 0,
      timeSpent: 0,
      attachments: [],
      repeatCfgId,
      dueDay: today,
    }) as Task;

  const getDays = (
    cfgs: TaskRepeatCfg[],
    tasks: Task[],
  ): ReturnType<ReturnType<typeof fromSelectors.selectPlannerDays>['projector']> =>
    fromSelectors
      .selectPlannerDays(
        dayDates,
        cfgs,
        tasks.map((t) => t.id),
        [],
        [],
        today,
      )
      .projector(
        new Map(tasks.map((t) => [t.id, t])),
        emptyPlannerState,
        defaultScheduleConfig,
        0,
      );

  const projectedCfgIdsOn = (
    day: ReturnType<typeof getDays>[number],
  ): (string | undefined)[] => [
    ...day.noStartTimeRepeatProjections.map((rp) => rp.repeatCfg.id),
    ...day.scheduledIItems
      .filter((si) => si.type === ScheduleItemType.RepeatProjection)
      .map((si) => (si as { repeatCfg: TaskRepeatCfg }).repeatCfg.id),
  ];

  it('shows only the open instance of an untimed waitForCompletion cfg', () => {
    const cfg = dailyCfg('WAIT', { waitForCompletion: true });
    const task = openInstance('WAIT');

    const days = getDays([cfg], [task]);

    expect(days[0].tasks.map((t) => t.id)).toEqual([task.id]);
    days.forEach((day) =>
      expect(projectedCfgIdsOn(day)).withContext(day.dayDate).not.toContain('WAIT'),
    );
  });

  it('draws no timed projections for a waitForCompletion cfg with a start time', () => {
    const cfg = dailyCfg('WAIT', {
      waitForCompletion: true,
      startTime: '09:00',
      defaultEstimate: 60 * 60 * 1000,
    });

    const days = getDays([cfg], [openInstance('WAIT')]);

    days.forEach((day) =>
      expect(projectedCfgIdsOn(day)).withContext(day.dayDate).not.toContain('WAIT'),
    );
    days.slice(1).forEach((day) => expect(day.timeEstimate).toBe(0));
  });

  it('still projects a normal daily cfg on every following day', () => {
    const cfg = dailyCfg('NORMAL');

    const days = getDays([cfg], [openInstance('NORMAL')]);

    days
      .slice(1)
      .forEach((day) =>
        expect(projectedCfgIdsOn(day)).withContext(day.dayDate).toEqual(['NORMAL']),
      );
  });
});
