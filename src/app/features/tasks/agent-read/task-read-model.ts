import { getDbDateStr, isValidDBDateStr } from '../../../util/get-db-date-str';
import { isPlannerFramedListTask } from '../../planner/store/planner-task-groups.util';
import { Task } from '../task.model';

/**
 * The open-task list this app publishes for the assistant read tools
 * (`PUT /api/capture/read-model`). Mirrors the server's strict schema in
 * `packages/super-sync-server/src/capture/capture-read.model.ts` and its
 * bounds in `capture-read.const.ts`: the server refuses the whole list when
 * one field breaks them, so the builder never sends what it cannot vouch for.
 */

/** A calendar-valid `YYYY-MM-DD`. */
export type Day = string;

export interface ReadTask {
  id: string;
  title: string;
  projectId?: string;
  projectTitle?: string;
  tagIds?: string[];
  tagTitles?: string[];
  parentId?: string;
  dueDay?: Day;
  dueWithTime?: number;
  /** The logical day the task is planned for (`dueWithTime` shifted by the day start). */
  plannedDay?: Day;
  deadlineDay?: Day;
  deadlineWithTime?: number;
  /** The logical day of the deadline. */
  deadlineOn?: Day;
  /** Planned for a day in a framed list: carried over to today once that day passed. */
  carryOver?: true;
}

export interface TaskReadModelV1 {
  v: 1;
  today: Day;
  /**
   * When the app's next logical days begin, in epoch ms: `dayStarts[0]` is the
   * start of the day after `today`, each next entry one logical day later.
   */
  dayStarts: number[];
  todayTaskIds: string[];
  overdueTaskIds: string[];
  truncated: boolean;
  tasks: ReadTask[];
}

export const READ_MODEL_MAX_TASKS = 1000;
/** Kept under the server's 1 MiB body limit, with room for the request envelope. */
export const READ_MODEL_MAX_BYTES = 900_000;
/** Counted in code points, as the server counts. */
export const READ_MODEL_TITLE_MAX_CHARS = 500;
/** Project and tag titles, in code points. */
export const READ_MODEL_NAME_MAX_CHARS = 200;
export const READ_MODEL_ID_MAX_CHARS = 64;
export const READ_MODEL_MAX_TAGS = 50;
export const READ_MODEL_MAX_DAY_STARTS = 8;

interface TaskReadModelInput {
  tasks: readonly Task[];
  undoneTodayTaskIds: readonly string[];
  overdueTaskIds: readonly string[];
  todayStr: string;
  dayStarts: readonly number[];
  startOfNextDayDiffMs: number;
  projects: readonly { id: string; title: string }[];
  tags: readonly { id: string; title: string }[];
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toValidDay = (value: unknown): Day | undefined =>
  typeof value === 'string' && isValidDBDateStr(value) ? value : undefined;

const toLogicalDay = (timestamp: number, startOfNextDayDiffMs: number): Day | undefined =>
  toValidDay(getDbDateStr(new Date(timestamp - startOfNextDayDiffMs)));

const isFittingId = (id: unknown): id is string =>
  typeof id === 'string' && id.length > 0 && id.length <= READ_MODEL_ID_MAX_CHARS;

const cutCodePoints = (text: string, max: number): string => {
  const codePoints = [...text];
  return codePoints.length > max ? codePoints.slice(0, max).join('') : text;
};

const toReadTask = (
  task: Task,
  startOfNextDayDiffMs: number,
  projectTitles: ReadonlyMap<string, string>,
  tagTitles: ReadonlyMap<string, string>,
): ReadTask => {
  const readTask: ReadTask = {
    id: task.id,
    title: cutCodePoints(
      typeof task.title === 'string' ? task.title : '',
      READ_MODEL_TITLE_MAX_CHARS,
    ),
  };

  if (isFittingId(task.projectId)) {
    readTask.projectId = task.projectId;
    const projectTitle = projectTitles.get(task.projectId);
    if (projectTitle) {
      readTask.projectTitle = cutCodePoints(projectTitle, READ_MODEL_NAME_MAX_CHARS);
    }
  }

  // A tag id without a known tag is left out of both, so ids and titles pair by position.
  const tags = (Array.isArray(task.tagIds) ? task.tagIds : [])
    .filter(isFittingId)
    .slice(0, READ_MODEL_MAX_TAGS)
    .flatMap((tagId) => {
      const title = tagTitles.get(tagId);
      return typeof title === 'string' ? [{ tagId, title }] : [];
    });
  if (tags.length) {
    readTask.tagIds = tags.map(({ tagId }) => tagId);
    readTask.tagTitles = tags.map(({ title }) =>
      cutCodePoints(title, READ_MODEL_NAME_MAX_CHARS),
    );
  }

  if (isFittingId(task.parentId)) {
    readTask.parentId = task.parentId;
  }

  const dueDay = toValidDay(task.dueDay);
  const hasDueWithTime = isFiniteNumber(task.dueWithTime);
  if (dueDay) readTask.dueDay = dueDay;
  if (hasDueWithTime) readTask.dueWithTime = task.dueWithTime as number;
  const plannedDay = hasDueWithTime
    ? toLogicalDay(task.dueWithTime as number, startOfNextDayDiffMs)
    : dueDay;
  if (plannedDay) readTask.plannedDay = plannedDay;

  const deadlineDay = toValidDay(task.deadlineDay);
  const hasDeadlineWithTime = isFiniteNumber(task.deadlineWithTime);
  if (deadlineDay) readTask.deadlineDay = deadlineDay;
  if (hasDeadlineWithTime) readTask.deadlineWithTime = task.deadlineWithTime as number;
  const deadlineOn = hasDeadlineWithTime
    ? toLogicalDay(task.deadlineWithTime as number, startOfNextDayDiffMs)
    : deadlineDay;
  if (deadlineOn) readTask.deadlineOn = deadlineOn;

  if (!hasDueWithTime && dueDay && isPlannerFramedListTask(task)) {
    readTask.carryOver = true;
  }
  return readTask;
};

const byteLength = (model: TaskReadModelV1): number =>
  new TextEncoder().encode(JSON.stringify(model)).length;

/**
 * Builds the list from a store snapshot. Pure: no store access, no logging.
 * Open tasks only, in Today order, then Overdue order, then by day; each task
 * directly followed by its open subtasks. Capped by count, then by size,
 * dropping from the end.
 */
export const buildTaskReadModel = (input: TaskReadModelInput): TaskReadModelV1 => {
  const projectTitles = new Map(input.projects.map((p) => [p.id, p.title]));
  const tagTitles = new Map(input.tags.map((t) => [t.id, t.title]));

  const openTasks = input.tasks.filter(
    (task) => task.isDone === false && isFittingId(task.id),
  );
  const openById = new Map(openTasks.map((task) => [task.id, task]));
  const readById = new Map(
    openTasks.map((task) => [
      task.id,
      toReadTask(task, input.startOfNextDayDiffMs, projectTitles, tagTitles),
    ]),
  );

  // A subtask follows its parent when both are kept; otherwise it ranks alone.
  const childrenOf = new Map<string, Task[]>();
  const attachedIds = new Set<string>();
  for (const parent of openTasks) {
    const children = (Array.isArray(parent.subTaskIds) ? parent.subTaskIds : [])
      .map((childId) => openById.get(childId))
      .filter(
        (child): child is Task =>
          !!child && child.parentId === parent.id && !attachedIds.has(child.id),
      );
    if (children.length) {
      childrenOf.set(parent.id, children);
      children.forEach((child) => attachedIds.add(child.id));
    }
  }
  const rankedAlone = openTasks.filter((task) => !attachedIds.has(task.id));

  const todayRank = new Map(input.undoneTodayTaskIds.map((id, i) => [id, i]));
  const overdueRank = new Map(input.overdueTaskIds.map((id, i) => [id, i]));
  const dayOf = (task: Task): Day | undefined => {
    const readTask = readById.get(task.id) as ReadTask;
    return readTask.plannedDay ?? readTask.deadlineOn;
  };
  const todayUnits = rankedAlone
    .filter((task) => todayRank.has(task.id))
    .sort((a, b) => (todayRank.get(a.id) as number) - (todayRank.get(b.id) as number));
  const overdueUnits = rankedAlone
    .filter((task) => !todayRank.has(task.id) && overdueRank.has(task.id))
    .sort(
      (a, b) => (overdueRank.get(a.id) as number) - (overdueRank.get(b.id) as number),
    );
  const restUnits = rankedAlone
    .filter((task) => !todayRank.has(task.id) && !overdueRank.has(task.id))
    .map((task, index) => ({ task, index, day: dayOf(task) }))
    .sort((a, b) => {
      if (a.day !== b.day) {
        if (a.day === undefined) return 1;
        if (b.day === undefined) return -1;
        return a.day < b.day ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ task }) => task);

  const ordered: ReadTask[] = [];
  const emitted = new Set<string>();
  const emit = (task: Task): void => {
    if (emitted.has(task.id)) return;
    emitted.add(task.id);
    ordered.push(readById.get(task.id) as ReadTask);
    (childrenOf.get(task.id) ?? []).forEach(emit);
  };
  [...todayUnits, ...overdueUnits, ...restUnits].forEach(emit);

  const byCount = ordered.slice(0, READ_MODEL_MAX_TASKS);
  const toModel = (count: number, truncated: boolean): TaskReadModelV1 => {
    const tasks = byCount.slice(0, count);
    const keptIds = new Set(tasks.map((task) => task.id));
    return {
      v: 1,
      today: input.todayStr,
      dayStarts: [...input.dayStarts],
      todayTaskIds: input.undoneTodayTaskIds.filter((id) => keptIds.has(id)),
      overdueTaskIds: input.overdueTaskIds.filter((id) => keptIds.has(id)),
      truncated,
      tasks,
    };
  };

  const full = toModel(byCount.length, byCount.length < ordered.length);
  if (byteLength(full) <= READ_MODEL_MAX_BYTES) return full;

  // The largest prefix that fits: what dropping from the end one by one keeps.
  let low = 0;
  let high = byCount.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(toModel(mid, true)) <= READ_MODEL_MAX_BYTES) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return toModel(low, true);
};
