import { AppFeaturesConfig } from '../config/global-config.model';

/**
 * Switched off only when a new user explicitly picks "Just a to-do list" in the
 * first-task onboarding card. Never applied automatically: an automatic
 * appFeatures write would sync to (and override) the user's other devices.
 * Features that stay on are left untouched, so nothing the user hid comes back.
 */
export const SIMPLE_TODO_DISABLED_FEATURES: Partial<AppFeaturesConfig> = {
  isTimeTrackingEnabled: false,
  isFocusModeEnabled: false,
  isSchedulerEnabled: false,
  isPlannerEnabled: false,
  isBoardsEnabled: false,
  isScheduleDayPanelEnabled: false,
  isIssuesPanelEnabled: false,
  isHabitsEnabled: false,
  isFinishDayEnabled: false,
};
