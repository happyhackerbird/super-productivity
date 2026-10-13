import { mapToScheduleDays } from './map-to-schedule-days';
import { TaskRepeatCfg } from '../../task-repeat-cfg/task-repeat-cfg.model';
import { SVEType } from '../schedule.const';

const H = 60 * 60 * 1000;

// A recurring task with "Only create next task after completion"
// (waitForCompletion) only ever has its open instance; the schedule must not
// draw repeat projections for it on the following days.
const NOW = new Date(1970, 0, 1, 9, 0, 0, 0).getTime();
const WEEK = ['1970-01-01', '1970-01-02', '1970-01-03', '1970-01-04'];

const dailyCfg = (add?: Partial<TaskRepeatCfg>): TaskRepeatCfg =>
  ({
    id: 'R_DAILY',
    startDate: '1969-12-01',
    startTime: undefined,
    lastTaskCreationDay: '1970-01-01',
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
    isPaused: false,
    ...add,
  }) as Partial<TaskRepeatCfg> as TaskRepeatCfg;

const projectionDays = (cfg: TaskRepeatCfg): string[] => {
  const isTimed = !!cfg.startTime;
  return mapToScheduleDays(
    NOW,
    WEEK,
    [],
    [],
    isTimed ? [cfg] : [],
    isTimed ? [] : [cfg],
    [],
    null,
    {},
    undefined,
    undefined,
    NOW,
  )
    .flatMap((d) =>
      d.entries
        .filter(
          (e) =>
            e.type.startsWith('RepeatProjection') ||
            e.type === SVEType.ScheduledRepeatProjection,
        )
        .map(() => d.dayDate),
    )
    .sort();
};

describe('waitForCompletion repeat cfgs are not projected in the schedule', () => {
  it('projects a normal untimed daily cfg on the following days', () => {
    expect(projectionDays(dailyCfg())).toEqual(WEEK.slice(1));
  });

  it('does not project an untimed waitForCompletion cfg on any day', () => {
    expect(projectionDays(dailyCfg({ waitForCompletion: true }))).toEqual([]);
  });

  it('projects a normal timed daily cfg on the following days', () => {
    expect(projectionDays(dailyCfg({ startTime: '10:00' }))).toEqual(WEEK.slice(1));
  });

  it('does not project a timed waitForCompletion cfg on any day', () => {
    expect(
      projectionDays(dailyCfg({ startTime: '10:00', waitForCompletion: true })),
    ).toEqual([]);
  });
});
