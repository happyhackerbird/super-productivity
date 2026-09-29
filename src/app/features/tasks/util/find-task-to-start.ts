import { Task, TaskState } from '../task.model';

/**
 * The task a plain "start tracking" (header play button, toggleStart) picks when
 * nothing is running: the last tracked task if it can still be tracked, otherwise
 * the first undone trackable task of the main list (subtasks instead of parents).
 */
export const findTaskToStart = (
  state: Pick<TaskState, 'entities' | 'lastCurrentTaskId'>,
  mainListTaskIds: string[],
): string | null => {
  const { entities } = state;
  const lastTask = state.lastCurrentTaskId && entities[state.lastCurrentTaskId];
  if (lastTask && !lastTask.isDone && !lastTask.subTaskIds.length) {
    return lastTask.id;
  }
  for (const id of mainListTaskIds) {
    const task = entities[id] as Task | undefined;
    if (!task) {
      continue;
    }
    const candidates = task.subTaskIds.length > 0 ? task.subTaskIds : [id];
    const nextId = candidates.find((cid) => entities[cid] && !entities[cid]!.isDone);
    if (nextId) {
      return nextId;
    }
  }
  return null;
};
