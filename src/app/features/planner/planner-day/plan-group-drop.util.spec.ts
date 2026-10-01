import {
  GroupDropParams,
  planGroupDrop,
  planWholeGroupMove,
} from './plan-group-drop.util';
import {
  createPlannerGroupId,
  partitionTasksByPlannerGroup,
} from '../store/planner-task-groups.util';
import { PlannerActions } from '../store/planner.actions';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { moveTaskInTodayList } from '../../work-context/store/work-context-meta.actions';
import { WorkContextType } from '../../work-context/work-context.model';
import { TODAY_TAG } from '../../tag/tag.const';
import { TaskCopy } from '../../tasks/task.model';
import { plannerReducer, PlannerState } from '../store/planner.reducer';
import { moveItemAfterAnchor } from '../../work-context/store/work-context-meta.helper';
import { Action } from '@ngrx/store';

const TODAY = '2026-09-29';
const D1 = '2026-09-30';
const D2 = '2026-10-01';

const task = (id: string, o: Partial<TaskCopy> = {}): TaskCopy =>
  ({ id, subTaskIds: [], ...o }) as TaskCopy;

const params = (o: Partial<GroupDropParams> & { task: TaskCopy }): GroupDropParams => ({
  prevDay: D1,
  newDay: D1,
  today: TODAY,
  targetGroupId: null,
  targetTaskIds: [],
  dropIndex: 0,
  dayTaskIds: [],
  storedTodayTaskIds: [],
  ...o,
});

const types = (actions: Action[]): string[] => actions.map((a) => a.type);

const setGroup = (id: string, plannerGroup: string | null): Action =>
  TaskSharedActions.updateTask({ task: { id, changes: { plannerGroup } } });

const todayMove = (taskId: string, afterTaskId: string | null): Action =>
  moveTaskInTodayList({
    taskId,
    afterTaskId,
    workContextType: WorkContextType.TAG,
    workContextId: TODAY_TAG.id,
    src: 'UNDONE',
    target: 'UNDONE',
  });

// applies the planned order actions with the real reducers
const applyToDay = (day: string, order: string[], actions: Action[]): string[] => {
  let state: PlannerState = {
    days: { [day]: order },
    addPlannedTasksDialogLastShown: undefined,
  };
  actions.forEach((a) => (state = plannerReducer(state, a)));
  return state.days[day];
};

const applyToToday = (order: string[], actions: Action[]): string[] =>
  actions.reduce((acc, a) => {
    if (a.type !== moveTaskInTodayList.type) {
      return acc;
    }
    const { taskId, afterTaskId } = a as ReturnType<typeof moveTaskInTodayList>;
    return moveItemAfterAnchor(taskId, afterTaskId, acc);
  }, order);

describe('planGroupDrop()', () => {
  describe('new group', () => {
    it('should only write the membership for a task of the same day', () => {
      const actions = planGroupDrop(
        params({
          task: task('a'),
          targetGroupId: 'g1',
          dayTaskIds: ['a', 'b'],
        }),
      );
      expect(actions).toEqual([setGroup('a', `${D1}:g1`)]);
    });

    it('should transfer first and then write the membership for another day', () => {
      const t = task('a');
      const actions = planGroupDrop(
        params({
          task: t,
          prevDay: D1,
          newDay: D2,
          targetGroupId: 'g1',
          dayTaskIds: ['x', 'y'],
        }),
      );
      expect(actions).toEqual([
        PlannerActions.transferTask({
          task: t,
          prevDay: D1,
          newDay: D2,
          targetIndex: 2,
          targetTaskId: undefined,
          today: TODAY,
        }),
        setGroup('a', `${D2}:g1`),
      ]);
    });

    it('should transfer a timed task of the same day', () => {
      const t = task('a', { dueWithTime: 123 });
      const actions = planGroupDrop(
        params({ task: t, targetGroupId: 'g1', dayTaskIds: ['x'] }),
      );
      expect(types(actions)).toEqual([
        PlannerActions.transferTask.type,
        TaskSharedActions.updateTask.type,
      ]);
    });
  });

  describe('existing lists on a planned day', () => {
    // raw order interleaves group g1 (a, c, e), the ungrouped list (b, d) and a
    // stale id
    const RAW = ['a', 'b', 'stale', 'c', 'd', 'e'];
    const G1 = ['a', 'c', 'e'];
    const UNGROUPED = ['b', 'd'];
    const inG1 = (id: string): TaskCopy => task(id, { plannerGroup: `${D1}:g1` });

    const expectListOrder = (
      p: GroupDropParams,
      list: string[],
      expected: string[],
    ): Action[] => {
      const actions = planGroupDrop(p);
      const raw = applyToDay(D1, RAW, actions);
      const members = new Set([...list, p.task.id]);
      expect(raw.filter((id) => members.has(id))).toEqual(expected);
      expect(raw.length).toBe(RAW.length);
      return actions;
    };

    it('should reorder inside a group to the start', () => {
      const actions = expectListOrder(
        params({
          task: inG1('e'),
          targetGroupId: 'g1',
          targetTaskIds: G1,
          dropIndex: 0,
          dayTaskIds: RAW,
        }),
        G1,
        ['e', 'a', 'c'],
      );
      expect(types(actions)).toEqual([PlannerActions.moveInList.type]);
    });

    it('should reorder inside a group downwards', () => {
      expectListOrder(
        params({
          task: inG1('a'),
          targetGroupId: 'g1',
          targetTaskIds: G1,
          dropIndex: 1,
          dayTaskIds: RAW,
        }),
        G1,
        ['c', 'a', 'e'],
      );
    });

    it('should reorder inside a group to the end', () => {
      expectListOrder(
        params({
          task: inG1('a'),
          targetGroupId: 'g1',
          targetTaskIds: G1,
          dropIndex: 2,
          dayTaskIds: RAW,
        }),
        G1,
        ['c', 'e', 'a'],
      );
    });

    it('should emit nothing for a drop that changes nothing', () => {
      expect(
        planGroupDrop(
          params({
            task: inG1('c'),
            targetGroupId: 'g1',
            targetTaskIds: G1,
            dropIndex: 1,
            dayTaskIds: RAW,
          }),
        ),
      ).toEqual([]);
    });

    it('should move an ungrouped task into the middle of a group', () => {
      const actions = expectListOrder(
        params({
          task: task('d'),
          targetGroupId: 'g1',
          targetTaskIds: G1,
          dropIndex: 1,
          dayTaskIds: RAW,
        }),
        G1,
        ['a', 'd', 'c', 'e'],
      );
      expect(actions[actions.length - 1]).toEqual(setGroup('d', `${D1}:g1`));
    });

    it('should only write the membership when the order already fits', () => {
      const actions = planGroupDrop(
        params({
          task: task('b'),
          targetGroupId: 'g1',
          targetTaskIds: G1,
          dropIndex: 1,
          dayTaskIds: RAW,
        }),
      );
      expect(actions).toEqual([setGroup('b', `${D1}:g1`)]);
    });

    it('should move a grouped task to the end of the ungrouped list and clear it', () => {
      const actions = expectListOrder(
        params({
          task: inG1('a'),
          targetGroupId: null,
          targetTaskIds: UNGROUPED,
          dropIndex: 2,
          dayTaskIds: RAW,
        }),
        UNGROUPED,
        ['b', 'd', 'a'],
      );
      expect(actions[actions.length - 1]).toEqual(setGroup('a', null));
    });

    it('should move a task between groups', () => {
      const actions = planGroupDrop(
        params({
          task: inG1('a'),
          targetGroupId: 'g2',
          targetTaskIds: ['d'],
          dropIndex: 1,
          dayTaskIds: RAW,
        }),
      );
      const raw = applyToDay(D1, RAW, actions);
      expect(raw.indexOf('a')).toBeGreaterThan(raw.indexOf('d'));
      expect(actions[actions.length - 1]).toEqual(setGroup('a', `${D1}:g2`));
    });

    it('should clear a value of another day when dropped into the plain list', () => {
      const actions = planGroupDrop(
        params({
          task: task('b', { plannerGroup: `${D2}:g9` }),
          targetGroupId: null,
          targetTaskIds: ['b', 'd'],
          dropIndex: 0,
          dayTaskIds: ['b', 'd'],
        }),
      );
      expect(actions).toEqual([setGroup('b', null)]);
    });

    it('should not write the membership when it stays the same', () => {
      const actions = planGroupDrop(
        params({
          task: task('b'),
          targetGroupId: null,
          targetTaskIds: UNGROUPED,
          dropIndex: 1,
          dayTaskIds: RAW,
        }),
      );
      expect(types(actions)).toEqual([PlannerActions.moveInList.type]);
    });

    it('should skip the order when the target member is missing in the raw order', () => {
      const actions = planGroupDrop(
        params({
          task: task('b'),
          targetGroupId: 'g1',
          targetTaskIds: ['unknown'],
          dropIndex: 0,
          dayTaskIds: RAW,
        }),
      );
      expect(actions).toEqual([setGroup('b', `${D1}:g1`)]);
    });
  });

  describe('transfer from another day', () => {
    it('should insert before the member at the drop index', () => {
      const t = task('z', { plannerGroup: `${D1}:g1` });
      const actions = planGroupDrop(
        params({
          task: t,
          prevDay: D1,
          newDay: D2,
          targetGroupId: 'g2',
          targetTaskIds: ['c', 'e'],
          dropIndex: 1,
          dayTaskIds: ['a', 'c', 'd', 'e'],
        }),
      );
      expect(actions).toEqual([
        PlannerActions.transferTask({
          task: t,
          prevDay: D1,
          newDay: D2,
          targetIndex: 3,
          targetTaskId: 'e',
          today: TODAY,
        }),
        setGroup('z', `${D2}:g2`),
      ]);
    });

    it('should clear the membership when dropped into the ungrouped list', () => {
      const t = task('z', { plannerGroup: `${D1}:g1` });
      const actions = planGroupDrop(
        params({
          task: t,
          prevDay: D1,
          newDay: D2,
          targetTaskIds: ['a'],
          dropIndex: 1,
          dayTaskIds: ['a'],
        }),
      );
      expect(types(actions)).toEqual([
        PlannerActions.transferTask.type,
        TaskSharedActions.updateTask.type,
      ]);
      expect(actions[1]).toEqual(setGroup('z', null));
    });

    it('should append to today when the target is not part of the stored order', () => {
      const t = task('z');
      const actions = planGroupDrop(
        params({
          task: t,
          prevDay: D1,
          newDay: TODAY,
          targetGroupId: 'g1',
          targetTaskIds: ['unordered'],
          dropIndex: 0,
          dayTaskIds: ['a', 'unordered'],
          storedTodayTaskIds: ['a'],
        }),
      );
      expect(actions[0]).toEqual(
        PlannerActions.transferTask({
          task: t,
          prevDay: D1,
          newDay: TODAY,
          targetIndex: 1,
          targetTaskId: undefined,
          today: TODAY,
        }),
      );
    });
  });

  describe('today', () => {
    const RAW = ['a', 'b', 'c', 'd', 'e'];
    const G1 = ['a', 'c', 'e'];
    const inG1 = (id: string): TaskCopy => task(id, { plannerGroup: `${TODAY}:g1` });
    const today = (o: Partial<GroupDropParams> & { task: TaskCopy }): GroupDropParams =>
      params({
        prevDay: TODAY,
        newDay: TODAY,
        dayTaskIds: RAW,
        storedTodayTaskIds: RAW,
        targetGroupId: 'g1',
        targetTaskIds: G1,
        ...o,
      });

    it('should reorder inside a group via the today list', () => {
      const actions = planGroupDrop(today({ task: inG1('e'), dropIndex: 0 }));
      expect(actions).toEqual([todayMove('e', null)]);
      expect(applyToToday(RAW, actions).filter((id) => G1.includes(id))).toEqual([
        'e',
        'a',
        'c',
      ]);
    });

    it('should reorder inside a group downwards', () => {
      const actions = planGroupDrop(today({ task: inG1('a'), dropIndex: 2 }));
      expect(applyToToday(RAW, actions).filter((id) => G1.includes(id))).toEqual([
        'c',
        'e',
        'a',
      ]);
    });

    it('should emit nothing for a drop that changes nothing', () => {
      expect(planGroupDrop(today({ task: inG1('c'), dropIndex: 1 }))).toEqual([]);
    });

    it('should skip the order when the anchor is not part of the stored order', () => {
      const actions = planGroupDrop(
        today({
          task: task('b'),
          dropIndex: 3,
          storedTodayTaskIds: ['a', 'b', 'c', 'd'],
        }),
      );
      expect(actions).toEqual([setGroup('b', `${TODAY}:g1`)]);
    });

    it('should place a timed task of today after transferring it', () => {
      const t = task('d', { dueWithTime: 123 });
      const actions = planGroupDrop(today({ task: t, dropIndex: 1 }));
      expect(types(actions)).toEqual([
        PlannerActions.transferTask.type,
        moveTaskInTodayList.type,
        TaskSharedActions.updateTask.type,
      ]);
      expect(
        applyToToday(RAW, actions).filter((id) => [...G1, 'd'].includes(id)),
      ).toEqual(['a', 'd', 'c', 'e']);
    });
  });
});

describe('planWholeGroupMove', () => {
  const NOW = 1_800_000_000_000;
  const OLD_A = createPlannerGroupId(NOW - 2000);
  const OLD_B = createPlannerGroupId(NOW - 1000);
  const inGroup = (id: string, day: string, groupId: string): TaskCopy =>
    task(id, { plannerGroup: `${day}:${groupId}` });

  // Applies the changes and reads the day back the way the planner shows it.
  const shownLists = (
    dayTasks: TaskCopy[],
    changes: { id: string; plannerGroup: string | null }[],
  ): string[][] => {
    const byId = new Map(changes.map((c) => [c.id, c.plannerGroup]));
    const updated = dayTasks.map((t) =>
      byId.has(t.id) ? { ...t, plannerGroup: byId.get(t.id) } : t,
    );
    const { ungroupedTasks, taskGroups } = partitionTasksByPlannerGroup(updated, D2);
    return [
      ungroupedTasks.map((t) => t.id),
      ...taskGroups.map((g) => g.tasks.map((t) => t.id)),
    ];
  };

  const target = (): {
    ungrouped: TaskCopy[];
    groupA: TaskCopy[];
    groupB: TaskCopy[];
  } => ({
    ungrouped: [task('u1'), task('u2')],
    groupA: [inGroup('a1', D2, OLD_A)],
    groupB: [inGroup('b1', D2, OLD_B)],
  });
  const moved = [task('m1'), task('m2')];

  const run = (insertAt: number): string[][] => {
    const { ungrouped, groupA, groupB } = target();
    const changes = planWholeGroupMove({
      movedTasks: moved,
      newDay: D2,
      ungroupedTasks: ungrouped,
      taskGroups: [
        { id: OLD_A, tasks: groupA },
        { id: OLD_B, tasks: groupB },
      ],
      insertAt,
      now: NOW,
    });
    return shownLists([...ungrouped, ...groupA, ...groupB, ...moved], changes);
  };

  it('placed first, the moved tasks become the framed list and the old one a group', () => {
    expect(run(0)).toEqual([['m1', 'm2'], ['u1', 'u2'], ['a1'], ['b1']]);
  });

  it('placed between groups, earlier groups keep their place', () => {
    expect(run(2)).toEqual([['u1', 'u2'], ['a1'], ['m1', 'm2'], ['b1']]);
  });

  it('placed last, only the moved tasks change', () => {
    const { ungrouped, groupA, groupB } = target();
    const changes = planWholeGroupMove({
      movedTasks: moved,
      newDay: D2,
      ungroupedTasks: ungrouped,
      taskGroups: [
        { id: OLD_A, tasks: groupA },
        { id: OLD_B, tasks: groupB },
      ],
      insertAt: 3,
      now: NOW,
    });
    expect(changes.map((c) => c.id)).toEqual(['m1', 'm2']);
    expect(run(3)).toEqual([['u1', 'u2'], ['a1'], ['b1'], ['m1', 'm2']]);
  });

  it('moving a group of the same day to the front empties its old place', () => {
    const groupB = [inGroup('b1', D2, OLD_B), inGroup('b2', D2, OLD_B)];
    const ungrouped = [task('u1')];
    const groupA = [inGroup('a1', D2, OLD_A)];
    const changes = planWholeGroupMove({
      movedTasks: groupB,
      newDay: D2,
      ungroupedTasks: ungrouped,
      taskGroups: [
        { id: OLD_A, tasks: groupA },
        { id: OLD_B, tasks: groupB },
      ],
      insertAt: 0,
      now: NOW,
    });
    expect(shownLists([...ungrouped, ...groupA, ...groupB], changes)).toEqual([
      ['b1', 'b2'],
      ['u1'],
      ['a1'],
    ]);
  });

  it('a later group stays after the moved one when empty groups are dropped before it', () => {
    const OLD_C = createPlannerGroupId(NOW - 500);
    const groupA = [inGroup('a1', D2, OLD_A)];
    const groupB = [inGroup('b1', D2, OLD_B)];
    const groupC = [inGroup('c1', D2, OLD_C)];
    const changes = planWholeGroupMove({
      movedTasks: [...groupA, ...groupB],
      newDay: D2,
      ungroupedTasks: [],
      taskGroups: [
        { id: OLD_A, tasks: groupA },
        { id: OLD_B, tasks: groupB },
        { id: OLD_C, tasks: groupC },
      ],
      insertAt: 3,
      now: NOW,
    });
    expect(shownLists([...groupA, ...groupB, ...groupC], changes)).toEqual([
      [],
      ['a1', 'b1'],
      ['c1'],
    ]);
  });
});
