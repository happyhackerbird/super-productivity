import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { combineLatest } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  first,
  mergeMap,
  switchMap,
} from 'rxjs/operators';
import { GlobalTrackingIntervalService } from '../../../core/global-tracking-interval/global-tracking-interval.service';
import { SyncWrapperService } from '../../../imex/sync/sync-wrapper.service';
import { SyncTriggerService } from '../../../imex/sync/sync-trigger.service';
import { HydrationStateService } from '../../../op-log/apply/hydration-state.service';
import { waitForSyncWindow } from '../../../util/wait-for-sync-window.operator';
import { selectUndoneOverdue } from '../../tasks/store/task.selectors';
import { selectTodayStr } from '../../../root-store/app-state/app-state.selectors';
import { selectTodayTagTaskIds } from '../../tag/store/tag.reducer';
import { selectPlannerState } from './planner.selectors';
import { planCarryOverToToday } from './planner-carry-over.util';
import { TaskLog } from '../../../core/log';

@Injectable()
export class PlannerCarryOverEffects {
  private _store$ = inject(Store);
  private _globalTrackingIntervalService = inject(GlobalTrackingIntervalService);
  private _syncWrapperService = inject(SyncWrapperService);
  private _syncTriggerService = inject(SyncTriggerService);
  private _hydrationState = inject(HydrationStateService);

  /**
   * On every day change (and once after start-up) the tasks of the two framed
   * planner lists whose day has passed move to today, each list in its order.
   * Grouped tasks are left to the Overdue column. Same gating as
   * TaskDueEffects.removeOverdueFormToday$: after the initial sync, outside a
   * sync window and after the current sync, so a device does not move tasks
   * another device already handled.
   */
  carryOverFramedListsToToday$ = createEffect(() => {
    return this._syncTriggerService.afterInitialSyncDoneAndDataLoadedInitially$.pipe(
      first(),
      switchMap(() =>
        this._globalTrackingIntervalService.todayDateStr$.pipe(
          distinctUntilChanged(),
          waitForSyncWindow(
            this._hydrationState,
            'PlannerCarryOverEffects:carryOverFramedListsToToday$',
          ),
          switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
          debounceTime(1000),
          switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
          switchMap(() =>
            combineLatest([
              this._store$.select(selectUndoneOverdue),
              this._store$.select(selectTodayStr),
              this._store$.select(selectPlannerState),
              this._store$.select(selectTodayTagTaskIds),
            ]).pipe(first()),
          ),
          mergeMap(([overdueTasks, today, plannerState, storedTodayTaskIds]) => {
            const actions = planCarryOverToToday({
              overdueTasks,
              today,
              plannerDays: plannerState.days,
              storedTodayTaskIds,
            });
            if (actions.length) {
              TaskLog.log(
                '[PlannerCarryOverEffects] Carrying framed lists over to today',
                {
                  count: actions.length,
                },
              );
            }
            return actions;
          }),
        ),
      ),
    );
  });
}
