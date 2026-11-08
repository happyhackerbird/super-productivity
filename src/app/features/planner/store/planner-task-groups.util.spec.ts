import {
  buildPlannerGroupValue,
  buildPlannerListValue,
  createPlannerGroupId,
  isPlannerFramedListTask,
  isPlannerSecondListTask,
  parsePlannerGroupValue,
  partitionTasksByAnyPlannerGroup,
  partitionTasksByPlannerGroup,
  PLANNER_SECOND_LIST_GROUP,
} from './planner-task-groups.util';
import { TaskCopy } from '../../tasks/task.model';

const t = (id: string, plannerGroup?: unknown): TaskCopy =>
  ({ id, plannerGroup }) as unknown as TaskCopy;

describe('planner-task-groups.util', () => {
  describe('createPlannerGroupId()', () => {
    it('should sort ids by creation time', () => {
      const earlier = createPlannerGroupId(1_000_000);
      const later = createPlannerGroupId(1_000_001);
      expect(earlier < later).toBe(true);
    });

    it('should keep sorting when the base-36 length of the timestamp grows', () => {
      const short = createPlannerGroupId(35);
      const long = createPlannerGroupId(36 ** 8);
      expect(short < long).toBe(true);
    });

    it('should create different ids for the same timestamp', () => {
      expect(createPlannerGroupId(5)).not.toBe(createPlannerGroupId(5));
    });

    it('should not contain a colon', () => {
      expect(createPlannerGroupId(5)).not.toContain(':');
    });
  });

  describe('parsePlannerGroupValue()', () => {
    it('should parse a value built by buildPlannerGroupValue()', () => {
      const value = buildPlannerGroupValue('2026-09-30', 'g1');
      expect(value).toBe('2026-09-30:g1');
      expect(parsePlannerGroupValue(value)).toEqual({ day: '2026-09-30', id: 'g1' });
    });

    it('should keep colons inside the id', () => {
      expect(parsePlannerGroupValue('2026-09-30:a:b')).toEqual({
        day: '2026-09-30',
        id: 'a:b',
      });
    });

    [
      undefined,
      null,
      '',
      'g1',
      '2026-09-30',
      '2026-09-30:',
      '2026-9-30:g1',
      'xxxx-xx-xx:g1',
      5,
      {},
    ].forEach((value) => {
      it(`should treat ${JSON.stringify(value)} as no value`, () => {
        expect(parsePlannerGroupValue(value)).toBeNull();
      });
    });
  });

  describe('second list', () => {
    it('should read the second list marker as no group', () => {
      expect(parsePlannerGroupValue(PLANNER_SECOND_LIST_GROUP)).toBeNull();
    });

    it('should tell second list tasks apart from the others', () => {
      expect(isPlannerSecondListTask(t('a', PLANNER_SECOND_LIST_GROUP))).toBe(true);
      expect(isPlannerSecondListTask(t('b'))).toBe(false);
      expect(isPlannerSecondListTask(t('c', '2026-09-30:g1'))).toBe(false);
    });

    it('should count the plain list and the second list as framed, groups not', () => {
      expect(isPlannerFramedListTask(t('a'))).toBe(true);
      expect(isPlannerFramedListTask(t('b', null))).toBe(true);
      expect(isPlannerFramedListTask(t('c', PLANNER_SECOND_LIST_GROUP))).toBe(true);
      expect(isPlannerFramedListTask(t('d', '2026-09-30:g1'))).toBe(false);
    });

    it('should build the value of each list', () => {
      expect(buildPlannerListValue('2026-09-30', null)).toBeNull();
      expect(buildPlannerListValue('2026-09-30', PLANNER_SECOND_LIST_GROUP)).toBe(
        PLANNER_SECOND_LIST_GROUP,
      );
      expect(buildPlannerListValue('2026-09-30', 'g1')).toBe('2026-09-30:g1');
    });
  });

  describe('partitionTasksByPlannerGroup()', () => {
    it('should return all tasks as ungrouped when no task has a value', () => {
      const tasks = [t('a'), t('b', null)];
      const r = partitionTasksByPlannerGroup(tasks, '2026-09-30');
      expect(r.ungroupedTasks).toBe(tasks);
      expect(r.secondListTasks).toEqual([]);
      expect(r.taskGroups).toEqual([]);
    });

    it('should split the second list from the plain list and the groups', () => {
      const tasks = [
        t('a', PLANNER_SECOND_LIST_GROUP),
        t('b'),
        t('c', '2026-09-30:g1'),
        t('d', PLANNER_SECOND_LIST_GROUP),
        t('e'),
      ];
      const r = partitionTasksByPlannerGroup(tasks, '2026-09-30');
      expect(r.ungroupedTasks.map((x) => x.id)).toEqual(['b', 'e']);
      expect(r.secondListTasks.map((x) => x.id)).toEqual(['a', 'd']);
      expect(r.taskGroups.map((g) => g.tasks.map((x) => x.id))).toEqual([['c']]);
    });

    it('should split the second list on a day without groups', () => {
      const r = partitionTasksByPlannerGroup(
        [t('a'), t('b', PLANNER_SECOND_LIST_GROUP)],
        '2026-09-30',
      );
      expect(r.ungroupedTasks.map((x) => x.id)).toEqual(['a']);
      expect(r.secondListTasks.map((x) => x.id)).toEqual(['b']);
      expect(r.taskGroups).toEqual([]);
    });

    it('should split tasks by group and keep the day order inside each list', () => {
      const tasks = [
        t('a', '2026-09-30:g2'),
        t('b'),
        t('c', '2026-09-30:g1'),
        t('d', '2026-09-30:g2'),
        t('e'),
      ];
      const r = partitionTasksByPlannerGroup(tasks, '2026-09-30');
      expect(r.ungroupedTasks.map((x) => x.id)).toEqual(['b', 'e']);
      expect(r.taskGroups.map((g) => [g.id, g.tasks.map((x) => x.id)])).toEqual([
        ['g1', ['c']],
        ['g2', ['a', 'd']],
      ]);
    });

    it('should treat a value naming another day as ungrouped', () => {
      const r = partitionTasksByPlannerGroup(
        [t('a', '2026-09-29:g1'), t('b', '2026-09-30:g1')],
        '2026-09-30',
      );
      expect(r.ungroupedTasks.map((x) => x.id)).toEqual(['a']);
      expect(r.taskGroups.map((g) => g.tasks.map((x) => x.id))).toEqual([['b']]);
    });

    it('should treat malformed values as ungrouped', () => {
      const r = partitionTasksByPlannerGroup(
        [t('a', 'nope'), t('b', 7), t('c', '2026-09-30:')],
        '2026-09-30',
      );
      expect(r.ungroupedTasks.map((x) => x.id)).toEqual(['a', 'b', 'c']);
      expect(r.taskGroups).toEqual([]);
    });

    it('should never return an empty group', () => {
      const r = partitionTasksByPlannerGroup([t('a', '2026-09-30:g1')], '2026-09-30');
      expect(r.taskGroups.every((g) => g.tasks.length > 0)).toBe(true);
    });
  });

  describe('partitionTasksByAnyPlannerGroup', () => {
    it('keeps groups from different days apart and ungrouped tasks in order', () => {
      const r = partitionTasksByAnyPlannerGroup([
        t('a'),
        t('b', '2026-09-28:g1'),
        t('c', 'bad'),
        t('d', '2026-09-27:g1'),
        t('e', '2026-09-28:g1'),
      ]);
      expect(r.ungroupedTasks.map((x) => x.id)).toEqual(['a', 'c']);
      expect(r.taskGroups.map((g) => [g.id, g.tasks.map((x) => x.id)])).toEqual([
        ['2026-09-27:g1', ['d']],
        ['2026-09-28:g1', ['b', 'e']],
      ]);
    });
  });
});
