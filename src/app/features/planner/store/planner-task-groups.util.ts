import { nanoid } from 'nanoid';
import { TaskCopy } from '../../tasks/task.model';
import { PlannerTaskGroup } from '../planner.model';

const DAY_STR_LENGTH = 10;
const DAY_STR_REG_EX = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_PAD_LENGTH = 9;
const BASE_36 = 36;
const RANDOM_SUFFIX_LENGTH = 6;

/**
 * Group ids sort by creation time, so the groups of a day keep the order they
 * were created in without any stored order.
 */
export const createPlannerGroupId = (now: number = Date.now()): string =>
  `${now.toString(BASE_36).padStart(TIMESTAMP_PAD_LENGTH, '0')}-${nanoid(
    RANDOM_SUFFIX_LENGTH,
  )}`;

export const buildPlannerGroupValue = (day: string, groupId: string): string =>
  `${day}:${groupId}`;

/**
 * Returns null for everything that is not `<YYYY-MM-DD>:<non-empty id>`. The
 * field is also reachable for plugins and the REST API, so a malformed value
 * must read as "no group" rather than throw.
 */
export const parsePlannerGroupValue = (
  value: unknown,
): { day: string; id: string } | null => {
  if (typeof value !== 'string' || value[DAY_STR_LENGTH] !== ':') {
    return null;
  }
  const day = value.slice(0, DAY_STR_LENGTH);
  const id = value.slice(DAY_STR_LENGTH + 1);
  return id && DAY_STR_REG_EX.test(day) ? { day, id } : null;
};

export const getPlannerGroupIdForDay = (
  task: Pick<TaskCopy, 'plannerGroup'>,
  day: string,
): string | null => {
  if (!task.plannerGroup) {
    return null;
  }
  const parsed = parsePlannerGroupValue(task.plannerGroup);
  return parsed && parsed.day === day ? parsed.id : null;
};

/**
 * Splits the tasks of a day into the ungrouped list and its groups. A group only
 * exists as long as one of the day's tasks names it, so there are no empty groups.
 */
export const partitionTasksByPlannerGroup = (
  tasks: TaskCopy[],
  day: string,
): { ungroupedTasks: TaskCopy[]; taskGroups: PlannerTaskGroup[] } => {
  let groupMap: Map<string, TaskCopy[]> | undefined;
  let ungroupedTasks: TaskCopy[] | undefined;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const groupId = getPlannerGroupIdForDay(task, day);
    if (groupId === null) {
      ungroupedTasks?.push(task);
      continue;
    }
    if (!groupMap || !ungroupedTasks) {
      groupMap = new Map();
      ungroupedTasks = tasks.slice(0, i);
    }
    const group = groupMap.get(groupId);
    if (group) {
      group.push(task);
    } else {
      groupMap.set(groupId, [task]);
    }
  }

  if (!groupMap || !ungroupedTasks) {
    return { ungroupedTasks: tasks, taskGroups: [] };
  }
  return {
    ungroupedTasks,
    taskGroups: Array.from(groupMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, groupTasks]) => ({ id, tasks: groupTasks })),
  };
};
