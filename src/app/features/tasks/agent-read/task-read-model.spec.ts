import { isValidDBDateStr } from '../../../util/get-db-date-str';
import { Task } from '../task.model';
import { createTask } from '../task.test-helper';
import {
  buildTaskReadModel,
  READ_MODEL_ID_MAX_CHARS,
  READ_MODEL_MAX_BYTES,
  READ_MODEL_MAX_DAY_STARTS,
  READ_MODEL_MAX_TAGS,
  READ_MODEL_MAX_TASKS,
  READ_MODEL_NAME_MAX_CHARS,
  READ_MODEL_TITLE_MAX_CHARS,
  ReadTask,
  TaskReadModelV1,
} from './task-read-model';

const HOUR = 60 * 60 * 1000;
const TODAY = '2026-11-18';
const DAY_STARTS = [new Date(2026, 10, 19).getTime(), new Date(2026, 10, 20).getTime()];

type Input = Parameters<typeof buildTaskReadModel>[0];

const build = (tasks: Task[], overrides: Partial<Input> = {}): TaskReadModelV1 =>
  buildTaskReadModel({
    tasks,
    undoneTodayTaskIds: [],
    overdueTaskIds: [],
    todayStr: TODAY,
    dayStarts: DAY_STARTS,
    startOfNextDayDiffMs: 0,
    projects: [],
    tags: [],
    ...overrides,
  });

const ids = (model: TaskReadModelV1): string[] => model.tasks.map((t) => t.id);
const byId = (model: TaskReadModelV1, id: string): ReadTask | undefined =>
  model.tasks.find((t) => t.id === id);
const codePointLength = (text: string): number => [...text].length;

const ALLOWED_TASK_KEYS = new Set([
  'id',
  'title',
  'projectId',
  'projectTitle',
  'tagIds',
  'tagTitles',
  'parentId',
  'dueDay',
  'dueWithTime',
  'plannedDay',
  'deadlineDay',
  'deadlineWithTime',
  'deadlineOn',
  'carryOver',
]);

/** Every bound of the server's strict TaskReadModelV1 schema (D4). */
const expectWithinWireLimits = (model: TaskReadModelV1): void => {
  expect(Object.keys(model).sort()).toEqual(
    [
      'dayStarts',
      'overdueTaskIds',
      'tasks',
      'today',
      'todayTaskIds',
      'truncated',
      'v',
    ].sort(),
  );
  expect(model.v).toBe(1);
  expect(isValidDBDateStr(model.today)).toBeTrue();
  expect(model.dayStarts.length).toBeGreaterThanOrEqual(1);
  expect(model.dayStarts.length).toBeLessThanOrEqual(READ_MODEL_MAX_DAY_STARTS);
  model.dayStarts.forEach((start, i) => {
    expect(Number.isFinite(start)).toBeTrue();
    if (i > 0) expect(start).toBeGreaterThan(model.dayStarts[i - 1]);
  });
  expect(model.todayTaskIds.length).toBeLessThanOrEqual(READ_MODEL_MAX_TASKS);
  expect(model.overdueTaskIds.length).toBeLessThanOrEqual(READ_MODEL_MAX_TASKS);
  expect(typeof model.truncated).toBe('boolean');
  expect(model.tasks.length).toBeLessThanOrEqual(READ_MODEL_MAX_TASKS);
  for (const task of model.tasks) {
    Object.keys(task).forEach((key) => expect(ALLOWED_TASK_KEYS.has(key)).toBeTrue());
    expect(task.id.length).toBeGreaterThanOrEqual(1);
    expect(task.id.length).toBeLessThanOrEqual(READ_MODEL_ID_MAX_CHARS);
    expect(typeof task.title).toBe('string');
    expect(codePointLength(task.title)).toBeLessThanOrEqual(READ_MODEL_TITLE_MAX_CHARS);
    for (const key of ['projectId', 'parentId'] as const) {
      if (task[key] !== undefined) {
        expect(task[key]!.length).toBeLessThanOrEqual(READ_MODEL_ID_MAX_CHARS);
      }
    }
    if (task.projectTitle !== undefined) {
      expect(codePointLength(task.projectTitle)).toBeLessThanOrEqual(
        READ_MODEL_NAME_MAX_CHARS,
      );
    }
    if (task.tagIds !== undefined) {
      expect(task.tagIds.length).toBeLessThanOrEqual(READ_MODEL_MAX_TAGS);
      task.tagIds.forEach((id) =>
        expect(id.length).toBeLessThanOrEqual(READ_MODEL_ID_MAX_CHARS),
      );
    }
    if (task.tagTitles !== undefined) {
      expect(task.tagTitles.length).toBeLessThanOrEqual(READ_MODEL_MAX_TAGS);
      task.tagTitles.forEach((title) =>
        expect(codePointLength(title)).toBeLessThanOrEqual(READ_MODEL_NAME_MAX_CHARS),
      );
    }
    for (const key of ['dueDay', 'plannedDay', 'deadlineDay', 'deadlineOn'] as const) {
      if (task[key] !== undefined) expect(isValidDBDateStr(task[key]!)).toBeTrue();
    }
    for (const key of ['dueWithTime', 'deadlineWithTime'] as const) {
      if (task[key] !== undefined) expect(Number.isFinite(task[key])).toBeTrue();
    }
    if (task.carryOver !== undefined) expect(task.carryOver).toBeTrue();
  }
  expect(new TextEncoder().encode(JSON.stringify(model)).length).toBeLessThanOrEqual(
    READ_MODEL_MAX_BYTES,
  );
};

describe('buildTaskReadModel', () => {
  it('keeps open tasks only and never carries notes or time fields', () => {
    const model = build([
      createTask({ id: 'open', title: 'Open', notes: 'secret', timeSpent: 5 }),
      createTask({ id: 'done', title: 'Done', isDone: true }),
      createTask({ id: 'unknown', isDone: undefined as unknown as boolean }),
    ]);
    expect(ids(model)).toEqual(['open']);
    const json = JSON.stringify(model);
    expect(json).not.toContain('notes');
    expect(json).not.toContain('timeSpent');
    expect(json).not.toContain('timeEstimate');
    expect(json).not.toContain('secret');
    expect(model.tasks[0]).toEqual({ id: 'open', title: 'Open' });
  });

  it('copies the wire fields and resolves project and tag titles', () => {
    const model = build(
      [
        createTask({
          id: 't1',
          title: 'Write',
          projectId: 'p1',
          tagIds: ['tag1', 'missing', 'tag2'],
          dueDay: '2026-11-20',
          deadlineDay: '2026-11-25',
        }),
        createTask({ id: 't2', projectId: 'gone', tagIds: [] }),
      ],
      {
        projects: [{ id: 'p1', title: 'Home' }],
        tags: [
          { id: 'tag1', title: 'Urgent' },
          { id: 'tag2', title: 'Calls' },
        ],
      },
    );
    expect(byId(model, 't1')).toEqual({
      id: 't1',
      title: 'Write',
      projectId: 'p1',
      projectTitle: 'Home',
      tagIds: ['tag1', 'tag2'],
      tagTitles: ['Urgent', 'Calls'],
      dueDay: '2026-11-20',
      plannedDay: '2026-11-20',
      deadlineDay: '2026-11-25',
      deadlineOn: '2026-11-25',
      carryOver: true,
    });
    expect(byId(model, 't2')).toEqual({ id: 't2', title: 'DEFAULT', projectId: 'gone' });
  });

  it('puts timed tasks and deadlines on their logical day under a day-start offset', () => {
    const model = build(
      [
        createTask({
          id: 'early',
          dueWithTime: new Date(2026, 10, 18, 2, 0).getTime(),
          deadlineWithTime: new Date(2026, 10, 20, 3, 30).getTime(),
        }),
        createTask({ id: 'late', dueWithTime: new Date(2026, 10, 18, 5, 0).getTime() }),
      ],
      { startOfNextDayDiffMs: 4 * HOUR },
    );
    expect(byId(model, 'early')).toEqual(
      jasmine.objectContaining({ plannedDay: '2026-11-17', deadlineOn: '2026-11-19' }),
    );
    expect(byId(model, 'early')!.dueWithTime).toBe(
      new Date(2026, 10, 18, 2, 0).getTime(),
    );
    expect(byId(model, 'late')!.plannedDay).toBe('2026-11-18');
  });

  it('omits a calendar-invalid day or timestamp and keeps the rest of the task', () => {
    const model = build([
      createTask({
        id: 'bad',
        title: 'Still here',
        dueDay: '2024-02-30',
        deadlineDay: '2026-13-01',
        projectId: 'p1',
      }),
      createTask({ id: 'nan', dueWithTime: Number.NaN, deadlineWithTime: Infinity }),
    ]);
    expect(byId(model, 'bad')).toEqual({
      id: 'bad',
      title: 'Still here',
      projectId: 'p1',
    });
    expect(byId(model, 'nan')).toEqual({ id: 'nan', title: 'DEFAULT' });
  });

  it('drops a task with an over-long id and omits over-long references', () => {
    const longId = 'x'.repeat(READ_MODEL_ID_MAX_CHARS + 1);
    const maxId = 'y'.repeat(READ_MODEL_ID_MAX_CHARS);
    const model = build(
      [
        createTask({ id: longId }),
        createTask({
          id: maxId,
          projectId: longId,
          parentId: longId,
          tagIds: [longId, 'ok'],
        }),
      ],
      // Both tags known: the over-long id is left out for its length alone.
      {
        tags: [
          { id: longId, title: 'Long' },
          { id: 'ok', title: 'OK' },
        ],
      },
    );
    expect(ids(model)).toEqual([maxId]);
    expect(model.tasks[0]).toEqual({
      id: maxId,
      title: 'DEFAULT',
      tagIds: ['ok'],
      tagTitles: ['OK'],
    });
  });

  it('cuts tags to 50 and titles by code point', () => {
    const tagIds = Array.from({ length: 51 }, (_, i) => `tag${i}`);
    const emoji = '😀';
    const model = build(
      [
        createTask({
          id: 't1',
          title: emoji.repeat(READ_MODEL_TITLE_MAX_CHARS + 3),
          projectId: 'p1',
          tagIds,
        }),
      ],
      {
        projects: [{ id: 'p1', title: emoji.repeat(READ_MODEL_NAME_MAX_CHARS + 1) }],
        tags: tagIds.map((id) => ({ id, title: `${id}-${'é'.repeat(250)}` })),
      },
    );
    const task = model.tasks[0];
    expect(task.tagIds!.length).toBe(READ_MODEL_MAX_TAGS);
    expect(task.tagIds![49]).toBe('tag49');
    expect(task.tagTitles!.length).toBe(READ_MODEL_MAX_TAGS);
    expect(codePointLength(task.tagTitles![0])).toBe(READ_MODEL_NAME_MAX_CHARS);
    expect(task.title).toBe(emoji.repeat(READ_MODEL_TITLE_MAX_CHARS));
    expect(task.projectTitle).toBe(emoji.repeat(READ_MODEL_NAME_MAX_CHARS));
  });

  it('marks carry-over only for a day-planned task in a framed list', () => {
    const model = build([
      createTask({ id: 'plain', dueDay: '2026-11-10' }),
      createTask({ id: 'second', dueDay: '2026-11-10', plannerGroup: 'second-list' }),
      createTask({ id: 'group', dueDay: '2026-11-10', plannerGroup: '2026-11-10:g1' }),
      createTask({ id: 'timed', dueWithTime: new Date(2026, 10, 10, 9).getTime() }),
      createTask({ id: 'unplanned' }),
      createTask({ id: 'invalid', dueDay: '2026-02-30' }),
    ]);
    const carried = model.tasks.filter((t) => t.carryOver).map((t) => t.id);
    expect(carried.sort()).toEqual(['plain', 'second']);
  });

  it('orders Today, then Overdue, then by day with undated last, subtasks after parents', () => {
    const tasks = [
      createTask({ id: 'undated' }),
      createTask({ id: 'later', dueDay: '2026-11-25' }),
      createTask({ id: 'deadline', deadlineDay: '2026-11-21' }),
      createTask({ id: 'soon', dueDay: '2026-11-20' }),
      createTask({ id: 'over1', dueDay: '2026-11-01' }),
      createTask({ id: 'over2', dueDay: '2026-11-02' }),
      createTask({
        id: 'today2',
        dueDay: TODAY,
        subTaskIds: ['sub-b', 'sub-done', 'sub-a'],
      }),
      createTask({ id: 'sub-a', parentId: 'today2' }),
      createTask({ id: 'sub-b', parentId: 'today2' }),
      createTask({ id: 'sub-done', parentId: 'today2', isDone: true }),
      createTask({ id: 'today1', dueDay: TODAY }),
      // Its parent is done: the subtask stands where its own rank puts it.
      createTask({ id: 'done-parent', isDone: true, subTaskIds: ['orphan'] }),
      createTask({ id: 'orphan', parentId: 'done-parent', dueDay: '2026-11-22' }),
    ];
    const model = build(tasks, {
      undoneTodayTaskIds: ['today1', 'today2'],
      overdueTaskIds: ['over2', 'over1'],
    });
    expect(ids(model)).toEqual([
      'today1',
      'today2',
      'sub-b',
      'sub-a',
      'over2',
      'over1',
      'soon',
      'deadline',
      'orphan',
      'later',
      'undated',
    ]);
    expect(model.todayTaskIds).toEqual(['today1', 'today2']);
    expect(model.overdueTaskIds).toEqual(['over2', 'over1']);
    expect(model.truncated).toBeFalse();
    expect(model.today).toBe(TODAY);
    expect(model.dayStarts).toEqual(DAY_STARTS);
  });

  it('caps the count, keeps Today first and sets truncated', () => {
    const tasks = Array.from({ length: READ_MODEL_MAX_TASKS + 5 }, (_, i) =>
      createTask({ id: `t${i}` }),
    );
    const lastId = `t${READ_MODEL_MAX_TASKS + 4}`;
    const model = build(tasks, { undoneTodayTaskIds: [lastId, 'not-kept'] });
    expect(model.tasks.length).toBe(READ_MODEL_MAX_TASKS);
    expect(model.tasks[0].id).toBe(lastId);
    expect(model.todayTaskIds).toEqual([lastId]);
    expect(model.truncated).toBeTrue();
    expect(byId(model, `t${READ_MODEL_MAX_TASKS - 1}`)).toBeUndefined();
  });

  it('caps the size by dropping from the end, keeps Today first and sets truncated', () => {
    // 500 three-byte characters per title: 1000 tasks would be about 1.5 MB.
    const tasks = Array.from({ length: READ_MODEL_MAX_TASKS }, (_, i) =>
      createTask({ id: `t${i}`, title: '€'.repeat(READ_MODEL_TITLE_MAX_CHARS) }),
    );
    const todayId = `t${READ_MODEL_MAX_TASKS - 1}`;
    const model = build(tasks, { undoneTodayTaskIds: [todayId] });
    const size = new TextEncoder().encode(JSON.stringify(model)).length;
    expect(size).toBeLessThanOrEqual(READ_MODEL_MAX_BYTES);
    expect(model.tasks.length).toBeLessThan(READ_MODEL_MAX_TASKS);
    expect(model.tasks[0].id).toBe(todayId);
    expect(model.truncated).toBeTrue();
    // The largest prefix that fits: the next task in order would not.
    const nextId = `t${model.tasks.length - 1}`;
    expect(byId(model, nextId)).toBeUndefined();
    const oneMore = {
      ...model,
      tasks: [
        ...model.tasks,
        { id: nextId, title: '€'.repeat(READ_MODEL_TITLE_MAX_CHARS) },
      ],
    };
    expect(new TextEncoder().encode(JSON.stringify(oneMore)).length).toBeGreaterThan(
      READ_MODEL_MAX_BYTES,
    );
  });

  it('builds a model within every wire limit from untidy data', () => {
    const tagIds = Array.from({ length: 60 }, (_, i) => `tag${i}`);
    const tasks: Task[] = Array.from({ length: READ_MODEL_MAX_TASKS + 20 }, (_, i) =>
      createTask({
        id: i % 97 === 0 ? 'z'.repeat(70) + i : `task-${i}`,
        title: '😀'.repeat(READ_MODEL_TITLE_MAX_CHARS + (i % 5)),
        projectId: i % 3 === 0 ? 'p'.repeat(65) : 'p1',
        parentId: i % 11 === 0 ? 'q'.repeat(65) : undefined,
        tagIds: i % 50 === 0 ? tagIds : tagIds.slice(0, 2),
        dueDay: i % 4 === 0 ? '2024-02-30' : '2026-11-10',
        dueWithTime: i % 6 === 0 ? new Date(2026, 10, 18, 1).getTime() : undefined,
        deadlineDay: i % 7 === 0 ? '2026-11-31' : undefined,
        deadlineWithTime: i % 8 === 0 ? Number.NaN : undefined,
        plannerGroup: i % 2 === 0 ? null : '2026-11-10:g1',
      }),
    );
    const model = build(tasks, {
      undoneTodayTaskIds: tasks.slice(0, 1100).map((t) => t.id),
      overdueTaskIds: tasks.map((t) => t.id).reverse(),
      startOfNextDayDiffMs: 4 * HOUR,
      projects: [{ id: 'p1', title: 'é'.repeat(300) }],
      tags: tagIds.map((id) => ({ id, title: '😀'.repeat(250) })),
      dayStarts: Array.from({ length: READ_MODEL_MAX_DAY_STARTS }, (_, k) =>
        new Date(2026, 10, 19 + k, 4).getTime(),
      ),
    });
    expect(model.tasks.length).toBeGreaterThan(0);
    expect(model.truncated).toBeTrue();
    expectWithinWireLimits(model);
    // Tag ids and titles pair by position.
    model.tasks.forEach((task) =>
      expect(task.tagTitles?.length ?? 0).toBe(task.tagIds?.length ?? 0),
    );
  });
});
