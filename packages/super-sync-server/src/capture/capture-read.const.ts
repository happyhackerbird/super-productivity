/**
 * Limits and texts of task reading (fork): the open-task list the app shares
 * with connected assistants. The wire limits mirror the app's builder
 * (`src/app/features/tasks/agent-read/task-read-model.ts`); loosening them is
 * compatible, tightening is not.
 */

/** `PUT /api/capture/read-model`; the app keeps its list under 900 KB. */
export const CAPTURE_READ_MODEL_BODY_LIMIT_BYTES = 1024 * 1024;

// TaskReadModelV1 (wire format).
export const READ_MODEL_MAX_TASKS = 1000;
export const READ_MODEL_MAX_DAY_STARTS = 8;
export const READ_MODEL_ID_MAX_CHARS = 64;
/** Counted in code points, as the app cuts titles. */
export const READ_MODEL_TITLE_MAX_CHARS = 500;
/** Project and tag titles, in code points. */
export const READ_MODEL_NAME_MAX_CHARS = 200;
export const READ_MODEL_MAX_TAGS = 50;

// The read tools.
export const READ_QUERY_MAX_CHARS = 200;
export const READ_LIST_DEFAULT_LIMIT = 50;
export const READ_LIST_MAX_LIMIT = 100;

export const READ_SWITCHED_OFF_TEXT =
  'Task reading is switched off in Super Productivity.';
export const READ_NOT_SHARED_TEXT =
  'No task list has been shared yet. Open Super Productivity and let it sync.';
export const READ_STALE_TEXT =
  'The shared task list is more than a week old. Open Super Productivity to refresh it.';
export const READ_OVERDUE_ALONE_TEXT = 'Use overdue on its own.';
export const READ_UNKNOWN_TASK_TEXT = 'No open task with that id.';
