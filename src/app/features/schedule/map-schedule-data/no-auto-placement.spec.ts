import { mapToScheduleDays } from './map-to-schedule-days';
import { TaskCopy, TaskWithDueTime } from '../../tasks/task.model';
import { TaskRepeatCfg } from '../../task-repeat-cfg/task-repeat-cfg.model';
import { PlannerDayMap } from '../../planner/planner.model';
import { ScheduleCalendarMapEntry, ScheduleDay, SVE } from '../schedule.model';
import { SVEType } from '../schedule.const';

// The schedule places nothing automatically: only items with an explicit time
// (timed tasks, timed repeat projections, calendar events, lunch/work blocks)
// get a time slot. Untimed tasks and untimed repeat projections get none.

const H = 60 * 60 * 1000;
const D0 = '1970-01-01';
const D1 = '1970-01-02';
const D2 = '1970-01-03';
const at = (day: number, hours: number, minutes = 0): number =>
  new Date(1970, 0, 1 + day, hours, minutes, 0, 0).getTime();
const NOW = at(0, 9);

const task = (id: string, add?: Partial<TaskCopy>): TaskCopy =>
  ({
    id,
    title: id,
    tagIds: [],
    subTaskIds: [],
    timeSpent: 0,
    timeEstimate: H,
    ...add,
  }) as TaskCopy;

const timedTask = (id: string, dueWithTime: number): TaskWithDueTime =>
  ({ ...task(id), dueWithTime, reminderId: 'R_ID' }) as TaskWithDueTime;

const repeatCfg = (id: string, startTime?: string): TaskRepeatCfg =>
  ({
    id,
    startDate: '1969-01-01',
    startTime,
    lastTaskCreationDay: '1969-12-31',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: true,
    repeatCycle: 'DAILY',
    repeatEvery: 1,
    defaultEstimate: H,
  }) as Partial<TaskRepeatCfg> as TaskRepeatCfg;

const UNTIMED_TYPES: SVEType[] = [
  SVEType.Task,
  SVEType.TaskPlannedForDay,
  SVEType.SplitTask,
  SVEType.SplitTaskPlannedForDay,
  SVEType.SplitTaskContinued,
  SVEType.RepeatProjection,
  SVEType.RepeatProjectionSplit,
  SVEType.RepeatProjectionSplitContinued,
  SVEType.RepeatProjectionSplitContinuedLast,
];

const allEntries = (days: ScheduleDay[]): SVE[] => days.flatMap((d) => d.entries);

const summarize = (days: ScheduleDay[]): [string, [string, string, number, number][]][] =>
  days.map((d) => [
    d.dayDate,
    d.entries.map((e): [string, string, number, number] => [
      e.id,
      e.type,
      e.start,
      e.duration,
    ]),
  ]);

interface Input {
  tasks: TaskCopy[];
  scheduledTasks: TaskWithDueTime[];
  timedCfgs: TaskRepeatCfg[];
  untimedCfgs: TaskRepeatCfg[];
  calendar: ScheduleCalendarMapEntry[];
  plannerDayMap: PlannerDayMap;
}

const run = (input: Partial<Input>, dayDates = [D0, D1, D2]): ScheduleDay[] =>
  mapToScheduleDays(
    NOW,
    dayDates,
    input.tasks ?? [],
    input.scheduledTasks ?? [],
    input.timedCfgs ?? [],
    input.untimedCfgs ?? [],
    input.calendar ?? [],
    null,
    input.plannerDayMap ?? {},
    { startTime: '9:00', endTime: '17:00' },
    { startTime: '12:00', endTime: '13:00' },
    NOW,
  );

const expectNoUntimedPlacement = (days: ScheduleDay[], ids: string[]): void => {
  const entries = allEntries(days);
  expect(entries.filter((e) => UNTIMED_TYPES.includes(e.type))).toEqual([]);
  ids.forEach((id) => {
    expect(entries.filter((e) => e.id.startsWith(id))).toEqual([]);
  });
  days.forEach((d) => expect(d.beyondBudgetTasks).toEqual([]));
};

describe('mapToScheduleDays() places nothing automatically', () => {
  // R1
  it('does not place untimed Today tasks into any time slot on any day', () => {
    const days = run({
      tasks: [task('TODAY_1'), task('TODAY_2', { timeEstimate: 30 * H })],
    });

    expect(days.length).toBe(3);
    expectNoUntimedPlacement(days, ['TODAY_1', 'TODAY_2']);
  });

  // R1: the current task used to be moved to the front of the flow
  it('does not place the current untimed task either', () => {
    const days = mapToScheduleDays(
      NOW,
      [D0, D1],
      [task('CURRENT')],
      [],
      [],
      [],
      [],
      'CURRENT',
      {},
    );

    expectNoUntimedPlacement(days, ['CURRENT']);
  });

  // R2
  it('does not place untimed tasks planned for a day in the planner', () => {
    const days = run({
      plannerDayMap: { [D0]: [task('PLANNED_D0')], [D1]: [task('PLANNED_D1')] },
    });

    expectNoUntimedPlacement(days, ['PLANNED_D0', 'PLANNED_D1']);
  });

  // R2
  it('does not place untimed tasks that only have a dueDay', () => {
    const days = run({
      tasks: [task('DUE_D0', { dueDay: D0 }), task('DUE_D1', { dueDay: D1 })],
    });

    expectNoUntimedPlacement(days, ['DUE_D0', 'DUE_D1']);
  });

  // R3
  it('does not project untimed repeat cfgs into time slots', () => {
    const days = run({ untimedCfgs: [repeatCfg('R_UNTIMED')] });

    expectNoUntimedPlacement(days, ['R_UNTIMED']);
  });

  // R5: the beyond-budget list used to collect a day's overflow of dueDay tasks
  it('leaves beyondBudgetTasks empty even when untimed day tasks exceed the day', () => {
    const days = run({
      tasks: [task('HUGE_DUE_D0', { dueDay: D0, timeEstimate: 48 * H })],
      plannerDayMap: { [D1]: [task('HUGE_PLANNED_D1', { timeEstimate: 48 * H })] },
    });

    expectNoUntimedPlacement(days, ['HUGE_DUE_D0', 'HUGE_PLANNED_D1']);
  });

  // R4
  describe('timed items', () => {
    const timedInput: Partial<Input> = {
      scheduledTasks: [timedTask('TIMED', at(0, 10)), timedTask('TIMED_D1', at(1, 16))],
      timedCfgs: [repeatCfg('R_TIMED', '14:00')],
      calendar: [
        {
          items: [
            {
              id: 'CAL',
              title: 'CAL',
              start: at(1, 11),
              duration: H / 2,
            } as ScheduleCalendarMapEntry['items'][number],
          ],
        },
      ],
    };

    it('are placed at their own start and duration', () => {
      expect(summarize(run(timedInput))).toEqual([
        [
          D0,
          [
            ['TIMED', SVEType.ScheduledTask, at(0, 10), H],
            ['LUNCH_BREAK_' + D0, SVEType.LunchBreak, at(0, 12), H],
            // timed repeats are not projected onto today (createSortedBlockerBlocks)
          ],
        ],
        [
          D1,
          [
            ['CAL_' + D1, SVEType.CalendarEvent, at(1, 11), H / 2],
            ['LUNCH_BREAK_' + D1, SVEType.LunchBreak, at(1, 12), H],
            ['R_TIMED_' + D1, SVEType.ScheduledRepeatProjection, at(1, 14), H],
            ['TIMED_D1', SVEType.ScheduledTask, at(1, 16), H],
          ],
        ],
        [
          D2,
          [
            ['LUNCH_BREAK_' + D2, SVEType.LunchBreak, at(2, 12), H],
            ['R_TIMED_' + D2, SVEType.ScheduledRepeatProjection, at(2, 14), H],
          ],
        ],
      ]);
    });

    it('are not shifted or split by untimed items', () => {
      const withUntimed = run({
        ...timedInput,
        tasks: [task('TODAY'), task('DUE_D1', { dueDay: D1 })],
        untimedCfgs: [repeatCfg('R_UNTIMED')],
        plannerDayMap: { [D2]: [task('PLANNED_D2', { timeEstimate: 10 * H })] },
      });

      expect(withUntimed).toEqual(run(timedInput));
      expectNoUntimedPlacement(withUntimed, [
        'TODAY',
        'DUE_D1',
        'R_UNTIMED',
        'PLANNED_D2',
      ]);
    });
  });
});
