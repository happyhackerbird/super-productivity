import { Action } from '@ngrx/store';
import { TaskCopy } from '../../tasks/task.model';
import { PlannerActions } from './planner.actions';
import { isPlannerFramedListTask } from './planner-task-groups.util';

export interface CarryOverParams {
  // undone tasks whose day has passed, as the Overdue column shows them
  overdueTasks: TaskCopy[];
  today: string;
  // stored order of the planned days, to keep each list's order
  plannerDays: { [day: string]: string[] | undefined };
  // TODAY_TAG.taskIds; carried tasks are appended after them
  storedTodayTaskIds: readonly string[];
}

/**
 * Picks the overdue tasks of the two framed lists (the plain list and the
 * second list) and plans their move to today. Tasks of a group stay where they
 * are and keep showing in Overdue. Timed tasks are not part of the framed
 * lists, and a sub task follows its parent when both are carried.
 *
 * Every action names one task: a bulk op naming every task could not be split
 * by conflict resolution and would stop sync (UnsupportedMultiEntityConflictError).
 */
export const planCarryOverToToday = ({
  overdueTasks,
  today,
  plannerDays,
  storedTodayTaskIds,
}: CarryOverParams): Action[] => {
  const candidates = overdueTasks.filter(
    (task) =>
      !task.dueWithTime &&
      !!task.dueDay &&
      task.dueDay < today &&
      isPlannerFramedListTask(task),
  );
  const candidateIds = new Set(candidates.map((task) => task.id));
  const tasks = candidates.filter(
    (task) => !task.parentId || !candidateIds.has(task.parentId),
  );

  const rankInDay = (task: TaskCopy): number => {
    const index = (plannerDays[task.dueDay as string] || []).indexOf(task.id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  tasks.sort((a, b) =>
    a.dueDay !== b.dueDay
      ? (a.dueDay as string) < (b.dueDay as string)
        ? -1
        : 1
      : rankInDay(a) - rankInDay(b),
  );

  const todayCount = storedTodayTaskIds.filter((id) => !candidateIds.has(id)).length;
  return tasks.map((task, index) =>
    PlannerActions.transferTask({
      task,
      prevDay: task.dueDay as string,
      newDay: today,
      targetIndex: todayCount + index,
      today,
    }),
  );
};
