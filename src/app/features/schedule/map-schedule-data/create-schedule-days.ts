import { BlockedBlockByDayMap, ScheduleDay, SVE } from '../schedule.model';
import { createViewEntriesForDay } from './create-view-entries-for-day';
import { dateStrToUtcDate } from '../../../util/date-str-to-utc-date';
import { Log } from '../../../core/log';

// Nothing is placed automatically: a day only shows its blocker blocks (timed
// tasks, timed repeat projections, calendar events, work start/end, lunch).
// Untimed tasks (Today list, planner day, dueDay only) and untimed repeat
// projections get no time slot, so there is nothing left "beyond budget".
export const createScheduleDays = (
  dayDates: string[],
  blockerBlocksDayMap: BlockedBlockByDayMap,
): ScheduleDay[] =>
  dayDates.map((dayDate, i) => {
    const nextDayStartDate = dateStrToUtcDate(dayDate);
    nextDayStartDate.setHours(24, 0, 0, 0);
    const nextDayStart = nextDayStartDate.getTime();

    const viewEntries = createViewEntriesForDay(
      dayDate,
      blockerBlocksDayMap[dayDate] || [],
    );

    const viewEntriesToRenderForDay: SVE[] = viewEntries.filter((entry) => {
      if (entry.start >= nextDayStart) {
        // `entry.data` carries content for most SVE variants (a TaskCopy, a
        // TaskRepeatCfg, a calendar event) — log ids and the timing fields
        // this branch is actually about, never the entry itself.
        Log.err('Entry start time after next day start', {
          entryId: entry.id,
          entryType: entry.type,
          start: entry.start,
          duration: entry.duration,
        });
        return false;
      }
      return true;
    });

    return {
      dayDate,
      entries: viewEntriesToRenderForDay,
      isToday: i === 0,
      beyondBudgetTasks: [],
    };
  });
