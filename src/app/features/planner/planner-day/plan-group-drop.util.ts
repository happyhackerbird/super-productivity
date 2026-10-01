import { Action } from '@ngrx/store';
import { TaskCopy } from '../../tasks/task.model';
import { PlannerActions } from '../store/planner.actions';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { moveTaskInTodayList } from '../../work-context/store/work-context-meta.actions';
import { WorkContextType } from '../../work-context/work-context.model';
import { TODAY_TAG } from '../../tag/tag.const';
import {
  buildPlannerGroupValue,
  createPlannerGroupId,
} from '../store/planner-task-groups.util';
import { PlannerTaskGroup } from '../planner.model';

export interface GroupDropParams {
  task: TaskCopy;
  prevDay: string;
  newDay: string;
  today: string;
  // null for the ungrouped list
  targetGroupId: string | null;
  // ids shown in the list the task was dropped into
  targetTaskIds: string[];
  dropIndex: number;
  // order of all tasks of newDay: planner day ids or the today list ids
  dayTaskIds: string[];
  // TODAY_TAG.taskIds, which can lack tasks that are shown for today
  storedTodayTaskIds: string[];
}

/**
 * Plans a drop into one of the lists of a planner day that has task groups.
 *
 * Order and group are independent: the order of a day stays one flat list
 * (changed by the existing order actions, which older clients understand) and
 * the group is a field of the task. Only the order relative to the other tasks
 * of the same list matters for what is shown.
 */
export const planGroupDrop = ({
  task,
  prevDay,
  newDay,
  today,
  targetGroupId,
  targetTaskIds,
  dropIndex,
  dayTaskIds,
  storedTodayTaskIds,
}: GroupDropParams): Action[] => {
  const actions: Action[] = [];
  const isToday = newDay === today;
  const listIds = targetTaskIds.filter((id) => id !== task.id);
  const orderWithoutTask = dayTaskIds.filter((id) => id !== task.id);
  const insertIndex = getInsertIndex(listIds, dropIndex, orderWithoutTask);

  const todayMoveIfPossible = (): Action | undefined => {
    if (insertIndex === -1) {
      return undefined;
    }
    const afterTaskId = insertIndex === 0 ? null : orderWithoutTask[insertIndex - 1];
    // the today list can only place tasks relative to its stored ids
    return storedTodayTaskIds.includes(task.id) &&
      (afterTaskId === null || storedTodayTaskIds.includes(afterTaskId))
      ? moveTaskInTodayList({
          taskId: task.id,
          afterTaskId,
          workContextType: WorkContextType.TAG,
          workContextId: TODAY_TAG.id,
          src: 'UNDONE',
          target: 'UNDONE',
        })
      : undefined;
  };

  if (prevDay === newDay && !task.dueWithTime) {
    const fromIndex = dayTaskIds.indexOf(task.id);
    if (
      insertIndex !== -1 &&
      fromIndex !== -1 &&
      !isShownAtDropIndex(task.id, listIds, dropIndex, dayTaskIds)
    ) {
      const orderAction = isToday
        ? todayMoveIfPossible()
        : PlannerActions.moveInList({
            targetDay: newDay,
            fromIndex,
            toIndex: insertIndex,
          });
      if (orderAction) {
        actions.push(orderAction);
      }
    }
  } else {
    const targetTaskId = insertIndex === -1 ? undefined : orderWithoutTask[insertIndex];
    const isTargetUsable =
      !!targetTaskId && (!isToday || storedTodayTaskIds.includes(targetTaskId));
    actions.push(
      PlannerActions.transferTask({
        task,
        prevDay,
        newDay,
        targetIndex: isTargetUsable
          ? insertIndex
          : isToday
            ? storedTodayTaskIds.filter((id) => id !== task.id).length
            : orderWithoutTask.length,
        targetTaskId: isTargetUsable ? targetTaskId : undefined,
        today,
      }),
    );
    // transferTask does not change the order within today
    const orderAction = prevDay === newDay && isToday && todayMoveIfPossible();
    if (orderAction) {
      actions.push(orderAction);
    }
  }

  const targetValue = targetGroupId
    ? buildPlannerGroupValue(newDay, targetGroupId)
    : null;
  if (targetValue !== (task.plannerGroup ?? null)) {
    actions.push(
      TaskSharedActions.updateTask({
        task: { id: task.id, changes: { plannerGroup: targetValue } },
      }),
    );
  }

  return actions;
};

/**
 * Index in the order of the day (without the dragged task) at which the task
 * needs to be inserted to be shown at dropIndex of its list, -1 if unknown.
 */
const getInsertIndex = (
  listIds: string[],
  dropIndex: number,
  orderWithoutTask: string[],
): number => {
  if (listIds.length === 0) {
    return -1;
  }
  if (dropIndex < listIds.length) {
    return orderWithoutTask.indexOf(listIds[Math.max(dropIndex, 0)]);
  }
  const lastIndex = orderWithoutTask.indexOf(listIds[listIds.length - 1]);
  return lastIndex === -1 ? -1 : lastIndex + 1;
};

const isShownAtDropIndex = (
  taskId: string,
  listIds: string[],
  dropIndex: number,
  dayTaskIds: string[],
): boolean => {
  const members = new Set(listIds).add(taskId);
  const shown = dayTaskIds.filter((id) => members.has(id));
  return shown.length === members.size && shown.indexOf(taskId) === dropIndex;
};

export interface WholeGroupMoveParams {
  // the moved tasks, in their order
  movedTasks: TaskCopy[];
  newDay: string;
  // the lists of newDay before the move; they may still contain moved tasks
  ungroupedTasks: TaskCopy[];
  taskGroups: PlannerTaskGroup[];
  // position among [ungrouped list, ...taskGroups]: 0 makes the moved tasks the
  // ungrouped list, taskGroups.length + 1 puts them after the last group
  insertAt: number;
  now?: number;
}

/**
 * Plans the group values that place a whole moved group at insertAt on newDay.
 * Groups sort by id, so the moved group and every list after it get fresh,
 * increasing ids; lists before it keep theirs. Placed first, the moved tasks
 * become the ungrouped list and the former ungrouped tasks the first group.
 */
export const planWholeGroupMove = ({
  movedTasks,
  newDay,
  ungroupedTasks,
  taskGroups,
  insertAt,
  now = Date.now(),
}: WholeGroupMoveParams): { id: string; plannerGroup: string | null }[] => {
  const movedIds = new Set(movedTasks.map((task) => task.id));
  const keep = (tasks: TaskCopy[]): TaskCopy[] =>
    tasks.filter((task) => !movedIds.has(task.id));
  const lists: { id: string | null; tasks: TaskCopy[] }[] = [
    { id: null, tasks: keep(ungroupedTasks) },
    ...taskGroups.map((group) => ({ id: group.id, tasks: keep(group.tasks) })),
  ];
  const position = Math.min(Math.max(insertAt, 0), lists.length);
  const moved = { id: null, tasks: movedTasks };
  lists.splice(position, 0, moved);

  const changes: { id: string; plannerGroup: string | null }[] = [];
  let freshIdCount = 0;
  let isAfterMoved = false;
  lists
    .filter((list, index) => index === 0 || list.tasks.length > 0)
    .forEach((list, index) => {
      isAfterMoved ||= list === moved;
      const groupId =
        index === 0
          ? null
          : !isAfterMoved && list.id
            ? list.id
            : createPlannerGroupId(now + freshIdCount++);
      const value = groupId ? buildPlannerGroupValue(newDay, groupId) : null;
      list.tasks.forEach((task) => {
        if ((task.plannerGroup ?? null) !== value) {
          changes.push({ id: task.id, plannerGroup: value });
        }
      });
    });
  return changes;
};
