import { z } from 'zod';
import {
  READ_MODEL_ID_MAX_CHARS,
  READ_MODEL_MAX_DAY_STARTS,
  READ_MODEL_MAX_TAGS,
  READ_MODEL_MAX_TASKS,
  READ_MODEL_NAME_MAX_CHARS,
  READ_MODEL_TITLE_MAX_CHARS,
} from './capture-read.const';

/**
 * `TaskReadModelV1`: the open-task list a device publishes for the read tools.
 * Strict, so a field the server does not know (notes, time spent, time
 * estimate) is refused rather than stored. Mirrored in the app at
 * `src/app/features/tasks/agent-read/task-read-model.ts`.
 */

/** A calendar-valid `YYYY-MM-DD`; `2024-02-30` is refused. */
const DaySchema = z.iso.date();

/** Counted in code points, like the app's cut and the capture title limit. */
const codePoints = (max: number): z.ZodString =>
  z.string().refine((value) => [...value].length <= max, {
    message: `At most ${max} characters`,
  });

const OptionalIdSchema = z.string().max(READ_MODEL_ID_MAX_CHARS);

const ReadTaskSchema = z
  .object({
    id: z.string().min(1).max(READ_MODEL_ID_MAX_CHARS),
    title: codePoints(READ_MODEL_TITLE_MAX_CHARS),
    projectId: OptionalIdSchema.optional(),
    projectTitle: codePoints(READ_MODEL_NAME_MAX_CHARS).optional(),
    tagIds: z.array(OptionalIdSchema).max(READ_MODEL_MAX_TAGS).optional(),
    tagTitles: z
      .array(codePoints(READ_MODEL_NAME_MAX_CHARS))
      .max(READ_MODEL_MAX_TAGS)
      .optional(),
    parentId: OptionalIdSchema.optional(),
    dueDay: DaySchema.optional(),
    dueWithTime: z.number().optional(),
    plannedDay: DaySchema.optional(),
    deadlineDay: DaySchema.optional(),
    deadlineWithTime: z.number().optional(),
    deadlineOn: DaySchema.optional(),
    carryOver: z.literal(true).optional(),
  })
  .strict();

const isStrictlyIncreasing = (values: number[]): boolean =>
  values.every((value, i) => i === 0 || value > values[i - 1]);

export const TaskReadModelSchema = z
  .object({
    v: z.literal(1),
    today: DaySchema,
    /**
     * When the app's next logical days begin, in epoch ms: `dayStarts[0]` is
     * the start of the day after `today`, each next entry one day later.
     */
    dayStarts: z
      .array(z.number())
      .min(1)
      .max(READ_MODEL_MAX_DAY_STARTS)
      .refine(isStrictlyIncreasing, { message: 'dayStarts must increase' }),
    todayTaskIds: z.array(z.string()).max(READ_MODEL_MAX_TASKS),
    overdueTaskIds: z.array(z.string()).max(READ_MODEL_MAX_TASKS),
    truncated: z.boolean(),
    tasks: z.array(ReadTaskSchema).max(READ_MODEL_MAX_TASKS),
  })
  .strict();

export type ReadTask = z.infer<typeof ReadTaskSchema>;
export type TaskReadModelV1 = z.infer<typeof TaskReadModelSchema>;
