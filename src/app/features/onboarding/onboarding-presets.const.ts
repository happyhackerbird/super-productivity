import { AppFeaturesConfig } from '../config/global-config.model';

/**
 * Applied only when a new user explicitly picks "Just a to-do list" in the
 * first-task onboarding card. Never applied automatically: an automatic
 * appFeatures write would sync to (and override) the user's other devices.
 */
export const SIMPLE_TODO_FEATURES: AppFeaturesConfig = {
  isTimeTrackingEnabled: false,
  isFocusModeEnabled: false,
  isSchedulerEnabled: false,
  isPlannerEnabled: false,
  isBoardsEnabled: false,
  isScheduleDayPanelEnabled: false,
  isIssuesPanelEnabled: false,
  isProjectNotesEnabled: true,
  isSyncIconEnabled: true,
  isSearchEnabled: true,
  isDonatePageEnabled: true,
  isHabitsEnabled: false,
  isFinishDayEnabled: false,
};
