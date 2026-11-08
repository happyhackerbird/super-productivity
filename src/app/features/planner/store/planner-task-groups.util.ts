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
 * Stored value of the second framed list. It names no day on purpose: the two
 * framed lists (the plain list and this one) carry their tasks over to today,
 * so membership follows the task wherever it is planned. Older clients parse
 * it as "no group" and show the task in the plain list.
 */
export const PLANNER_SECOND_LIST_GROUP = 'second-list';

export const isPlannerSecondListTask = (task: Pick<TaskCopy, 'plannerGroup'>): boolean =>
  task.plannerGroup === PLANNER_SECOND_LIST_GROUP;

/**
 * True for tasks of the two framed lists (the plain list and the second list),
 * which carry over to today when their day has passed. Tasks of a group stay
 * on their day and show up in Overdue instead.
 */
export const isPlannerFramedListTask = (task: Pick<TaskCopy, 'plannerGroup'>): boolean =>
  parsePlannerGroupValue(task.plannerGroup) === null;

/**
 * The value that puts a task into one of the lists of a day: null for the
 * plain list, the day-less marker for the second framed list, `<day>:<id>`
 * for a group.
 */
export const buildPlannerListValue = (
  day: string,
  listId: string | null,
): string | null =>
  listId === null
    ? null
    : listId === PLANNER_SECOND_LIST_GROUP
      ? PLANNER_SECOND_LIST_GROUP
      : buildPlannerGroupValue(day, listId);

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
 * Splits the tasks of a day into the plain list, the second framed list and
 * its groups. A group only exists as long as one of the day's tasks names it,
 * so there are no empty groups.
 */
export const partitionTasksByPlannerGroup = (
  tasks: TaskCopy[],
  day: string,
): {
  ungroupedTasks: TaskCopy[];
  secondListTasks: TaskCopy[];
  taskGroups: PlannerTaskGroup[];
} => {
  let groupMap: Map<string, TaskCopy[]> | undefined;
  let ungroupedTasks: TaskCopy[] | undefined;
  const secondListTasks: TaskCopy[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const isSecondList = isPlannerSecondListTask(task);
    const groupId = isSecondList ? null : getPlannerGroupIdForDay(task, day);
    if (!isSecondList && groupId === null) {
      ungroupedTasks?.push(task);
      continue;
    }
    if (!groupMap || !ungroupedTasks) {
      groupMap = new Map();
      ungroupedTasks = tasks.slice(0, i);
    }
    if (isSecondList || groupId === null) {
      secondListTasks.push(task);
      continue;
    }
    const group = groupMap.get(groupId);
    if (group) {
      group.push(task);
    } else {
      groupMap.set(groupId, [task]);
    }
  }

  if (!groupMap || !ungroupedTasks) {
    return { ungroupedTasks: tasks, secondListTasks, taskGroups: [] };
  }
  return {
    ungroupedTasks,
    secondListTasks,
    taskGroups: Array.from(groupMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, groupTasks]) => ({ id, tasks: groupTasks })),
  };
};

/**
 * Splits tasks from several days (the overdue list) by their stored group,
 * whatever day the group was made on. Groups are ordered by the full stored
 * value, so older days come first and a day's groups keep creation order.
 */
export const partitionTasksByAnyPlannerGroup = (
  tasks: TaskCopy[],
): { ungroupedTasks: TaskCopy[]; taskGroups: PlannerTaskGroup[] } => {
  const ungroupedTasks: TaskCopy[] = [];
  const groupMap = new Map<string, TaskCopy[]>();
  for (const task of tasks) {
    const key = parsePlannerGroupValue(task.plannerGroup) ? task.plannerGroup! : null;
    if (key === null) {
      ungroupedTasks.push(task);
      continue;
    }
    const group = groupMap.get(key);
    if (group) {
      group.push(task);
    } else {
      groupMap.set(key, [task]);
    }
  }
  return {
    ungroupedTasks,
    taskGroups: Array.from(groupMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, groupTasks]) => ({ id, tasks: groupTasks })),
  };
};
