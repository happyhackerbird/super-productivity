import { Task, TaskState } from '../task.model';
import { findTaskToStart } from './find-task-to-start';

const task = (id: string, partial: Partial<Task> = {}): Task =>
  ({ id, isDone: false, subTaskIds: [], ...partial }) as Task;

const stateOf = (
  tasks: Task[],
  lastCurrentTaskId: string | null = null,
): Pick<TaskState, 'entities' | 'lastCurrentTaskId'> => ({
  entities: Object.fromEntries(tasks.map((t) => [t.id, t])),
  lastCurrentTaskId,
});

describe('findTaskToStart', () => {
  it('picks the first undone task of the main list', () => {
    const state = stateOf([task('a', { isDone: true }), task('b'), task('c')]);
    expect(findTaskToStart(state, ['a', 'b', 'c'])).toBe('b');
  });

  it('prefers the last tracked task while it is still trackable', () => {
    const state = stateOf([task('a'), task('b')], 'b');
    expect(findTaskToStart(state, ['a', 'b'])).toBe('b');
  });

  it('ignores a last tracked task that is done or became a parent', () => {
    expect(
      findTaskToStart(stateOf([task('a'), task('b', { isDone: true })], 'b'), ['a']),
    ).toBe('a');
    expect(
      findTaskToStart(
        stateOf([task('a'), task('p', { subTaskIds: ['s'] }), task('s')], 'p'),
        ['a'],
      ),
    ).toBe('a');
  });

  it('starts the first undone subtask instead of a parent', () => {
    const state = stateOf([
      task('p', { subTaskIds: ['s1', 's2'] }),
      task('s1', { isDone: true }),
      task('s2'),
    ]);
    expect(findTaskToStart(state, ['p'])).toBe('s2');
  });

  it('returns null when nothing can be tracked', () => {
    expect(findTaskToStart(stateOf([task('a', { isDone: true })]), ['a'])).toBeNull();
    expect(findTaskToStart(stateOf([]), ['missing'])).toBeNull();
  });
});
