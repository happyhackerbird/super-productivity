import { createScheduleDays } from './create-schedule-days';
import { DEFAULT_TASK, TaskWithDueTime } from '../../tasks/task.model';
import { BlockedBlockByDayMap, BlockedBlockType } from '../schedule.model';
import { SVEType } from '../schedule.const';
import { getDbDateStr } from '../../../util/get-db-date-str';

const H = 60 * 60 * 1000;

const createTimedTask = (id: string, dueWithTime: number): TaskWithDueTime =>
  ({
    ...DEFAULT_TASK,
    id,
    title: id,
    projectId: 'test-project',
    timeEstimate: H,
    dueWithTime,
  }) as TaskWithDueTime;

describe('createScheduleDays', () => {
  let todayStr: string;
  let tomorrowStr: string;
  let todayAt: (hours: number) => number;

  beforeEach(() => {
    const today = new Date(2026, 0, 20, 10, 0, 0);
    todayStr = getDbDateStr(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrowStr = getDbDateStr(tomorrow);
    todayAt = (hours) => new Date(2026, 0, 20, hours, 0, 0).getTime();
  });

  it('should return one day per dayDate with no entries and no beyond-budget tasks when there are no blockers', () => {
    const result = createScheduleDays([todayStr, tomorrowStr], {});

    expect(result).toEqual([
      { dayDate: todayStr, entries: [], isToday: true, beyondBudgetTasks: [] },
      { dayDate: tomorrowStr, entries: [], isToday: false, beyondBudgetTasks: [] },
    ]);
  });

  it('should render the blocker blocks of each day at their own time', () => {
    const task = createTimedTask('timed', todayAt(14));
    const blockerBlocksDayMap: BlockedBlockByDayMap = {
      [todayStr]: [
        {
          start: todayAt(12),
          end: todayAt(13),
          entries: [
            {
              start: todayAt(12),
              end: todayAt(13),
              type: BlockedBlockType.LunchBreak,
              data: { startTime: '12:00', endTime: '13:00' },
            },
          ],
        },
        {
          start: todayAt(14),
          end: todayAt(15),
          entries: [
            {
              start: todayAt(14),
              end: todayAt(15),
              type: BlockedBlockType.ScheduledTask,
              data: task,
            },
          ],
        },
      ],
    };

    const result = createScheduleDays([todayStr, tomorrowStr], blockerBlocksDayMap);

    expect(result[0].entries).toEqual([
      {
        id: 'LUNCH_BREAK_' + todayStr,
        start: todayAt(12),
        type: SVEType.LunchBreak,
        data: { startTime: '12:00', endTime: '13:00' },
        duration: H,
      },
      {
        id: 'timed',
        start: todayAt(14),
        type: SVEType.ScheduledTask,
        data: task,
        duration: H,
      },
    ]);
    expect(result[0].beyondBudgetTasks).toEqual([]);
    expect(result[1].entries).toEqual([]);
    expect(result[1].beyondBudgetTasks).toEqual([]);
  });

  it('should drop a blocker entry that starts after the end of its day', () => {
    const lateStart = todayAt(24) + H;
    const task = createTimedTask('tooLate', lateStart);
    const result = createScheduleDays([todayStr], {
      [todayStr]: [
        {
          start: lateStart,
          end: lateStart + H,
          entries: [
            {
              start: lateStart,
              end: lateStart + H,
              type: BlockedBlockType.ScheduledTask,
              data: task,
            },
          ],
        },
      ],
    });

    expect(result[0].entries).toEqual([]);
  });
});
