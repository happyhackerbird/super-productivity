import { describe, expect, it } from 'vitest';
import {
  TRACKER_DEFAULT_TIME_ZONE,
  TRACKER_DOC_MAX_BYTES,
} from '../src/tracker/tracker.const';
import {
  resolveDay,
  todayIn,
  validateTrackerDoc,
} from '../src/tracker/tracker-doc.model';

const goal = (
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  period: '2026-Q4',
  pillar: 'credibility',
  text: 'Ship it',
  done: false,
  ...extra,
});

const task = (
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  title: 'Write post',
  day: '2026-11-20',
  done: false,
  ...extra,
});

describe('validateTrackerDoc', () => {
  it('accepts an empty object and a full document', () => {
    expect(validateTrackerDoc({}).ok).toBe(true);
    const full = {
      timeZone: 'Asia/Tokyo',
      goals: [goal('g1')],
      tasks: [task('t1', { doneDay: '', pillar: 'access' }), task('t2', { day: '' })],
    };
    const res = validateTrackerDoc(full);
    expect(res.ok).toBe(true);
  });

  it('keeps unknown keys at every level', () => {
    const input = {
      theme: { dark: true },
      goals: [goal('g1', { color: 'red' })],
      tasks: [task('t1', { questId: 'q', entryId: null, effort: 'normal' })],
    };
    const res = validateTrackerDoc(input);
    if (!res.ok) throw new Error(res.reason);
    expect(res.doc).toEqual(input);
  });

  it('rejects an unusable time zone', () => {
    const res = validateTrackerDoc({ timeZone: 'Mars/Olympus' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid');
  });

  it.each([
    ['bad pillar on goal', { goals: [goal('g', { pillar: 'x' })] }],
    ['empty goal text', { goals: [goal('g', { text: '' })] }],
    ['goal text too long', { goals: [goal('g', { text: 'x'.repeat(301) })] }],
    ['goal done not boolean', { goals: [goal('g', { done: 'no' })] }],
    ['task day malformed', { tasks: [task('t', { day: '20-11-2026' })] }],
    ['task title too long', { tasks: [task('t', { title: 'x'.repeat(151) })] }],
    ['task pillar bad', { tasks: [task('t', { pillar: 'zzz' })] }],
    ['task doneDay malformed', { tasks: [task('t', { doneDay: 'yesterday' })] }],
    ['task id empty', { tasks: [task('')] }],
    ['goals not an array', { goals: {} }],
  ])('rejects %s', (_name, input) => {
    const res = validateTrackerDoc(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('invalid');
      expect(res.issues.length).toBeGreaterThan(0);
      expect(res.issues.length).toBeLessThanOrEqual(5);
    }
  });

  it('rejects duplicate ids within goals and within tasks, but not across', () => {
    expect(validateTrackerDoc({ goals: [goal('a'), goal('a')] }).ok).toBe(false);
    expect(validateTrackerDoc({ tasks: [task('a'), task('a')] }).ok).toBe(false);
    expect(validateTrackerDoc({ goals: [goal('a')], tasks: [task('a')] }).ok).toBe(true);
  });

  it('caps the number of goals and tasks', () => {
    const goals = Array.from({ length: 301 }, (_, i) => goal(`g${i}`));
    expect(validateTrackerDoc({ goals }).ok).toBe(false);
    const tasks = Array.from({ length: 1501 }, (_, i) => task(`t${i}`));
    expect(validateTrackerDoc({ tasks }).ok).toBe(false);
  });

  it('reports a too large document apart from an invalid one', () => {
    const res = validateTrackerDoc({ notes: 'x'.repeat(TRACKER_DOC_MAX_BYTES + 1) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('too_large');
    expect(validateTrackerDoc({ notes: 'x'.repeat(1000) }).ok).toBe(true);
  });

  it('rejects a non-object document', () => {
    expect(validateTrackerDoc([]).ok).toBe(false);
    expect(validateTrackerDoc(null).ok).toBe(false);
    expect(validateTrackerDoc('x').ok).toBe(false);
  });
});

describe('todayIn', () => {
  // 2026-11-20T16:30:00Z: already the 21st in Tokyo, still the 20th in Los Angeles.
  const instant = Date.UTC(2026, 10, 20, 16, 30);

  it('uses the given time zone', () => {
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-11-21');
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-11-20');
  });

  it('falls back to the default zone when missing or invalid', () => {
    const expected = todayIn(TRACKER_DEFAULT_TIME_ZONE, instant);
    expect(expected).toBe('2026-11-20');
    expect(todayIn(undefined, instant)).toBe(expected);
    expect(todayIn('Not/AZone', instant)).toBe(expected);
  });
});

describe('resolveDay', () => {
  it('resolves keywords against today', () => {
    expect(resolveDay('today', '2026-11-30')).toBe('2026-11-30');
    expect(resolveDay('tomorrow', '2026-11-30')).toBe('2026-12-01');
    expect(resolveDay('tomorrow', '2026-12-31')).toBe('2027-01-01');
  });

  it('passes an empty day and a valid date through', () => {
    expect(resolveDay('', '2026-11-30')).toBe('');
    expect(resolveDay('2026-02-03', '2026-11-30')).toBe('2026-02-03');
  });

  it('returns null for anything else', () => {
    expect(resolveDay('next week', '2026-11-30')).toBeNull();
    expect(resolveDay('2026-13-01', '2026-11-30')).toBeNull();
    expect(resolveDay('2026-02-30', '2026-11-30')).toBeNull();
  });
});
