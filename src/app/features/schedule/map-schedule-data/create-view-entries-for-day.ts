import { BlockedBlock, SVE } from '../schedule.model';
import { createViewEntriesForBlock } from './create-view-entries-for-block';
import { SCHEDULE_VIEW_TYPE_ORDER } from '../schedule.const';

// Only items with an explicit time end up in time slots: timed tasks, timed
// repeat projections, calendar events and the work-start/end and lunch blocks.
// Untimed tasks and untimed repeat projections are never auto-placed.
export const createViewEntriesForDay = (
  dayDate: string,
  blockedBlocksForDay: BlockedBlock[],
): SVE[] => {
  const viewEntries: SVE[] = blockedBlocksForDay.flatMap((blockedBlock) =>
    createViewEntriesForBlock(blockedBlock, dayDate),
  );

  viewEntries.sort((a, b) => {
    if (a.start - b.start === 0) {
      return SCHEDULE_VIEW_TYPE_ORDER[a.type] - SCHEDULE_VIEW_TYPE_ORDER[b.type];
    }
    return a.start - b.start;
  });

  return viewEntries;
};
