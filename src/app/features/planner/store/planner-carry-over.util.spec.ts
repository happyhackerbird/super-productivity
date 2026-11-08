import { Action } from '@ngrx/store';
import { planCarryOverToToday } from './planner-carry-over.util';
import { PlannerActions } from './planner.actions';
import { PLANNER_SECOND_LIST_GROUP } from './planner-task-groups.util';
import { TaskCopy } from '../../tasks/task.model';
import { PersistentActionMeta } from '../../../op-log/core/persistent-action.interface';
import { isMultiEntityOperation } from '../../../op-log/util/get-op-entity-ids.util';

const TODAY = '2026-10-02';
const D_MINUS_1 = '2026-10-01';
const D_MINUS_2 = '2026-09-30';

const task = (id: string, o: Partial<TaskCopy> = {}): TaskCopy =>
  ({ id, subTaskIds: [], dueDay: D_MINUS_1, ...o }) as TaskCopy;

const moves = (actions: Action[]): [string, string, number][] =>
  actions.map((a) => {
    const t = a as ReturnType<typeof PlannerActions.transferTask>;
    return [t.task.id, t.prevDay, t.targetIndex];
  });

describe('planCarryOverToToday()', () => {
  it('should move the plain list and the second list to today, in day and list order', () => {
    const actions = planCarryOverToToday({
      overdueTasks: [
        task('p2'),
        task('s1', { plannerGroup: PLANNER_SECOND_LIST_GROUP }),
        task('old', { dueDay: D_MINUS_2 }),
        task('p1'),
        task('g1', { plannerGroup: `${D_MINUS_1}:g1` }),
      ],
      today: TODAY,
      plannerDays: { [D_MINUS_1]: ['p1', 's1', 'p2'], [D_MINUS_2]: ['old'] },
      storedTodayTaskIds: [],
    });

    expect(actions.every((a) => a.type === PlannerActions.transferTask.type)).toBe(true);
    expect(moves(actions)).toEqual([
      ['old', D_MINUS_2, 0],
      ['p1', D_MINUS_1, 1],
      ['s1', D_MINUS_1, 2],
      ['p2', D_MINUS_1, 3],
    ]);
    const first = actions[0] as ReturnType<typeof PlannerActions.transferTask>;
    expect(first.newDay).toBe(TODAY);
    expect(first.today).toBe(TODAY);
  });

  it('should keep the second list marker on the moved task', () => {
    const [action] = planCarryOverToToday({
      overdueTasks: [task('s1', { plannerGroup: PLANNER_SECOND_LIST_GROUP })],
      today: TODAY,
      plannerDays: {},
      storedTodayTaskIds: [],
    }) as ReturnType<typeof PlannerActions.transferTask>[];
    expect(action.task.plannerGroup).toBe(PLANNER_SECOND_LIST_GROUP);
  });

  it('should leave grouped, timed and current tasks alone', () => {
    const actions = planCarryOverToToday({
      overdueTasks: [
        task('grouped', { plannerGroup: `${D_MINUS_2}:g1` }),
        task('timed', { dueDay: undefined, dueWithTime: 1 }),
        task('today', { dueDay: TODAY }),
        task('later', { dueDay: '2026-10-03' }),
        task('noDay', { dueDay: undefined }),
      ],
      today: TODAY,
      plannerDays: {},
      storedTodayTaskIds: [],
    });
    expect(actions).toEqual([]);
  });

  it('should let a sub task follow its carried parent instead of moving it twice', () => {
    const actions = planCarryOverToToday({
      overdueTasks: [
        task('parent', { subTaskIds: ['child'] }),
        task('child', { parentId: 'parent' }),
        task('orphan', { parentId: 'elsewhere' }),
      ],
      today: TODAY,
      plannerDays: { [D_MINUS_1]: ['parent', 'child', 'orphan'] },
      storedTodayTaskIds: [],
    });
    expect(moves(actions).map(([id]) => id)).toEqual(['parent', 'orphan']);
  });

  it('should append after the tasks already on today, ignoring stale carried ids', () => {
    const actions = planCarryOverToToday({
      overdueTasks: [task('a'), task('b')],
      today: TODAY,
      plannerDays: { [D_MINUS_1]: ['a', 'b'] },
      storedTodayTaskIds: ['t1', 'a', 't2'],
    });
    expect(moves(actions)).toEqual([
      ['a', D_MINUS_1, 2],
      ['b', D_MINUS_1, 3],
    ]);
  });

  it('should put tasks missing from the stored day order last', () => {
    const actions = planCarryOverToToday({
      overdueTasks: [task('unknown'), task('b'), task('a')],
      today: TODAY,
      plannerDays: { [D_MINUS_1]: ['a', 'b'] },
      storedTodayTaskIds: [],
    });
    expect(moves(actions).map(([id]) => id)).toEqual(['a', 'b', 'unknown']);
  });

  // Sync: a bulk op naming every task would be one multi-entity op, which
  // conflict resolution cannot split.
  it('should stay single-entity', () => {
    const actions = planCarryOverToToday({
      overdueTasks: ['a', 'b', 'c'].map((id) => task(id)),
      today: TODAY,
      plannerDays: {},
      storedTodayTaskIds: [],
    });
    expect(actions.length).toBe(3);
    for (const action of actions) {
      const meta = (action as Action & { meta: PersistentActionMeta }).meta;
      expect(isMultiEntityOperation(meta)).withContext(action.type).toBeFalse();
      expect(meta.isBulk).withContext(action.type).toBeFalsy();
    }
  });
});
