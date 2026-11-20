import { z } from 'zod';
import {
  TRACKER_DEFAULT_TIME_ZONE,
  TRACKER_DOC_MAX_BYTES,
  TRACKER_MAX_GOALS,
  TRACKER_MAX_TASKS,
} from './tracker.const';

/**
 * The tracker document: one JSON object per account. Only the keys below are
 * checked; every other key, at the top level and inside a goal or task, is
 * kept untouched, so the page can store more than the server knows about.
 */

export const PILLARS = ['credibility', 'visibility', 'access'] as const;

const isDay = (value: string): boolean => z.iso.date().safeParse(value).success;
const DaySchema = z.string().refine(isDay, 'Expected a date as YYYY-MM-DD');
const OptionalDaySchema = z.union([z.literal(''), DaySchema]);

export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
};

const PillarSchema = z.enum(PILLARS);

export const GoalSchema = z.looseObject({
  id: z.string().min(1).max(100),
  period: z.string().min(1).max(100),
  pillar: PillarSchema,
  text: z.string().min(1).max(300),
  done: z.boolean(),
});

export const TaskSchema = z.looseObject({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(150),
  day: OptionalDaySchema,
  done: z.boolean(),
  doneDay: OptionalDaySchema.optional(),
  pillar: z.union([z.literal(''), PillarSchema]).optional(),
});

const duplicateIds = (items: Array<{ id: string }> | undefined): number | null => {
  const seen = new Set<string>();
  for (const [index, item] of (items ?? []).entries()) {
    if (seen.has(item.id)) return index;
    seen.add(item.id);
  }
  return null;
};

export const TrackerDocSchema = z
  .looseObject({
    timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional(),
    goals: z.array(GoalSchema).max(TRACKER_MAX_GOALS).optional(),
    tasks: z.array(TaskSchema).max(TRACKER_MAX_TASKS).optional(),
  })
  .check((ctx) => {
    for (const key of ['goals', 'tasks'] as const) {
      const index = duplicateIds(ctx.value[key]);
      if (index !== null) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          path: [key, index, 'id'],
          message: 'Duplicate id',
        });
      }
    }
  });

export type TrackerGoal = z.infer<typeof GoalSchema>;
export type TrackerTask = z.infer<typeof TaskSchema>;
export type TrackerDoc = z.infer<typeof TrackerDocSchema>;

export interface TrackerIssue {
  path: string;
  message: string;
}

export type ValidatedTrackerDoc =
  | { ok: true; doc: TrackerDoc }
  | { ok: false; reason: 'invalid'; issues: TrackerIssue[] }
  | { ok: false; reason: 'too_large'; issues: TrackerIssue[] };

const MAX_ISSUES = 5;

export const toIssues = (error: z.ZodError): TrackerIssue[] =>
  error.issues.slice(0, MAX_ISSUES).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

/** Invalid wins over too large: size is only measured on a document that parses. */
export const validateTrackerDoc = (input: unknown): ValidatedTrackerDoc => {
  const parsed = TrackerDocSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', issues: toIssues(parsed.error) };
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data)) > TRACKER_DOC_MAX_BYTES) {
    return { ok: false, reason: 'too_large', issues: [] };
  }
  return { ok: true, doc: parsed.data };
};

/** Today in the document's zone, as YYYY-MM-DD; a missing or unknown zone means the default. */
export const todayIn = (timeZone: string | undefined, now: number): string => {
  const zone =
    timeZone && isValidTimeZone(timeZone) ? timeZone : TRACKER_DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

/** Plain calendar arithmetic on the date parts; no time zone involved. */
const addCalendarDays = (day: string, days: number): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
};

/** A day argument: "today", "tomorrow", "" (undated) or YYYY-MM-DD; null when none of those. */
export const resolveDay = (input: string, today: string): string | null => {
  if (input === 'today') return today;
  if (input === 'tomorrow') return addCalendarDays(today, 1);
  if (input === '') return '';
  return isDay(input) ? input : null;
};
