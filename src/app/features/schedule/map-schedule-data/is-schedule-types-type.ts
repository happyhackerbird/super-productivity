import { ScheduleEvent } from '../schedule.model';
import { SVEType } from '../schedule.const';

// export const isDraggableVE = (viewEntry: SVE): viewEntry is SVETask => {
//   return (
//     viewEntry.type === SVEType.Task ||
//     viewEntry.type === SVEType.SplitTask ||
//     viewEntry.type === SVEType.TaskPlannedForDay ||
//     viewEntry.type === SVEType.SplitTaskPlannedForDay
//   );
// };

export const isDraggableSE = (se: ScheduleEvent): se is ScheduleEvent => {
  return (
    se.type === SVEType.Task ||
    se.type === SVEType.ScheduledTask ||
    se.type === SVEType.SplitTask ||
    se.type === SVEType.TaskPlannedForDay ||
    se.type === SVEType.SplitTaskPlannedForDay
  );
};
