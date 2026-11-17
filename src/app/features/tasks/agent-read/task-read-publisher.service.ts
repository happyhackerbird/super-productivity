import { computed, DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import type { SuperSyncProvider } from '@sp/sync-providers/super-sync';
import {
  asyncScheduler,
  exhaustMap,
  filter,
  map,
  pairwise,
  throttleTime,
  withLatestFrom,
} from 'rxjs';
import { Log } from '../../../core/log';
import { SyncWrapperService } from '../../../imex/sync/sync-wrapper.service';
import { SyncEpochChangedError } from '../../../op-log/core/errors/sync-errors';
import { SyncProviderId } from '../../../op-log/sync-providers/provider.const';
import { SyncProviderManager } from '../../../op-log/sync-providers/provider-manager.service';
import {
  selectStartOfNextDayDiffMs,
  selectTodayStr,
} from '../../../root-store/app-state/app-state.selectors';
import { getDbDateStr } from '../../../util/get-db-date-str';
import { GlobalConfigService } from '../../config/global-config.service';
import { selectAllProjects } from '../../project/store/project.selectors';
import { selectAllTags } from '../../tag/store/tag.reducer';
import { selectUndoneTodayTaskIds } from '../../work-context/store/work-context.selectors';
import { AgentCaptureService } from '../agent-capture/agent-capture.service';
import {
  selectAllTasksInActiveProjects,
  selectOverdueTasksWithSubTasks,
} from '../store/task.selectors';
import { getLogicalTodayStartMs } from '../util/is-task-overdue';
import { buildTaskReadModel, READ_MODEL_MAX_DAY_STARTS } from './task-read-model';

const MIN_RUN_INTERVAL_MS = 60 * 1000;
const READ_ACCESS_PATH = '/api/capture/read-access';
const READ_MODEL_PATH = '/api/capture/read-model';
const FENCE_CONTEXT = 'publishTaskReadModel';

/** The account's read enablement as the server reports it. */
export interface TaskReadAccess {
  enabled: boolean;
  enableId: string | null;
  publishedAt: number | null;
}

/** A read-access request the server answered with a non-2xx status. */
export class TaskReadRequestError extends Error {
  override readonly name = 'TaskReadRequestError';

  constructor(readonly status: number) {
    super(`Task read access request failed (HTTP ${status})`);
  }
}

const toAccess = (data: unknown): TaskReadAccess => {
  const access = (data ?? {}) as Record<string, unknown>;
  const { enabled, enableId, publishedAt } = access;
  if (
    typeof enabled !== 'boolean' ||
    (enableId !== null && typeof enableId !== 'string') ||
    (publishedAt !== null && typeof publishedAt !== 'number')
  ) {
    throw new Error('Unexpected task read access response');
  }
  return { enabled, enableId, publishedAt };
};

/**
 * Starts of the logical days after `todayStr`: entry k is the instant the
 * app's day string turns to `todayStr` plus k + 1 calendar days.
 */
const getNextDayStarts = (todayStr: string, startOfNextDayDiffMs: number): number[] => {
  const [year, month, day] = todayStr.split('-').map(Number);
  return Array.from({ length: READ_MODEL_MAX_DAY_STARTS }, (_, k) => {
    const nextDay = new Date(year, month - 1, day);
    nextDay.setDate(nextDay.getDate() + k + 1);
    return getLogicalTodayStartMs(getDbDateStr(nextDay), startOfNextDayDiffMs);
  });
};

/**
 * Task reading on SuperSync: publishes this device's open-task list after
 * each sync while the account's synced opt-in (`sync.captureRead`) is set,
 * and switches reading on and off for the account.
 */
@Injectable({ providedIn: 'root' })
export class TaskReadPublisherService {
  private _store = inject(Store);
  private _destroyRef = inject(DestroyRef);
  private _globalConfig = inject(GlobalConfigService);
  private _providerManager = inject(SyncProviderManager);
  private _syncWrapper = inject(SyncWrapperService);
  private _capture = inject(AgentCaptureService);

  private readonly _tasks = this._store.selectSignal(selectAllTasksInActiveProjects);
  private readonly _undoneTodayTaskIds = this._store.selectSignal(
    selectUndoneTodayTaskIds,
  );
  private readonly _overdueTasks = this._store.selectSignal(
    selectOverdueTasksWithSubTasks,
  );
  private readonly _projects = this._store.selectSignal(selectAllProjects);
  private readonly _tags = this._store.selectSignal(selectAllTags);
  private readonly _todayStr = this._store.selectSignal(selectTodayStr);
  private readonly _startOfNextDayDiffMs = this._store.selectSignal(
    selectStartOfNextDayDiffMs,
  );

  readonly enableId = computed(() => this._globalConfig.sync()?.captureRead ?? null);

  /** The enablement the server refused (409) this session; never retried. */
  private _refusedEnableId: string | null = null;
  private _hasLoggedUnsupported = false;

  /**
   * Publishes on the falling edge of every sync that left the app IN_SYNC,
   * like the capture import, at most once a minute plus one trailing run.
   */
  start(): void {
    this._syncWrapper.isSyncInProgress$
      .pipe(
        pairwise(),
        withLatestFrom(this._providerManager.syncStatus$),
        filter(
          ([[wasSyncing, isSyncing], status]) =>
            wasSyncing && !isSyncing && status === 'IN_SYNC',
        ),
        map(() => undefined),
        // Before the throttle, so syncs while reading is off use no slot.
        filter(
          () =>
            this._capture.isEnabled() &&
            this._capture.isSuperSyncActive() &&
            this.enableId() !== null,
        ),
        throttleTime(MIN_RUN_INTERVAL_MS, asyncScheduler, {
          leading: true,
          trailing: true,
        }),
        exhaustMap(() => this._publishLogged()),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe();
  }

  /** Never rejects. */
  publishNow(): Promise<void> {
    return this._publishLogged();
  }

  /** The server's view; a server without task reading (404) reads as off. */
  async getAccess(): Promise<TaskReadAccess> {
    const result = await this._superSyncOrError().captureApiRequest<unknown>(
      READ_ACCESS_PATH,
      { method: 'GET' },
    );
    if (!result.ok) {
      if (result.status === 404) {
        return { enabled: false, enableId: null, publishedAt: null };
      }
      throw new TaskReadRequestError(result.status);
    }
    return toAccess(result.data);
  }

  /**
   * Server first: a refusal saves nothing. Then the synced opt-in, so every
   * device publishes against the same enablement, then one publish.
   */
  async switchOn(): Promise<void> {
    this._refusedEnableId = null;
    const result = await this._superSyncOrError().captureApiRequest<unknown>(
      READ_ACCESS_PATH,
      { method: 'PUT' },
    );
    if (!result.ok) {
      throw new TaskReadRequestError(result.status);
    }
    const { enabled, enableId } = toAccess(result.data);
    if (!enabled || !enableId) {
      throw new Error('Unexpected task read access response');
    }
    this._globalConfig.updateSection('sync', { captureRead: enableId }, true);
    await this.publishNow();
  }

  /**
   * Deletes the shared list on the server first, so a failed request changes
   * nothing and can be retried; a server without task reading (404) holds no
   * list. Then clears the synced opt-in.
   */
  async switchOff(): Promise<void> {
    const result = await this._superSyncOrError().captureApiRequest<unknown>(
      READ_ACCESS_PATH,
      { method: 'DELETE' },
    );
    if (!result.ok && result.status !== 404) {
      throw new TaskReadRequestError(result.status);
    }
    this._globalConfig.updateSection('sync', { captureRead: null }, true);
  }

  /** A rejection here would end the trigger pipeline. */
  private async _publishLogged(): Promise<void> {
    try {
      await this._publish();
    } catch (e) {
      if (e instanceof SyncEpochChangedError) {
        Log.log('Agent task read publish abandoned: sync target changed');
        return;
      }
      Log.err('Agent task read publish failed', {
        reason: e instanceof Error ? e.name : 'unknown',
      });
    }
  }

  private async _publish(): Promise<void> {
    // Checked again: state can change during the throttle.
    if (this._syncWrapper.isSyncInProgressSync()) return;

    // One synchronous block: fence, opt-in and store snapshot are taken together.
    const provider = this._providerManager.getActiveProvider();
    const enableId = this.enableId();
    if (provider?.id !== SyncProviderId.SuperSync || !enableId) return;
    if (!this._capture.isEnabled()) return;
    if (this._refusedEnableId !== null) {
      if (this._refusedEnableId === enableId) return;
      // The opt-in changed since the refusal: forget it.
      this._refusedEnableId = null;
    }
    const epoch = this._providerManager.syncEpoch;
    const todayStr = this._todayStr();
    const startOfNextDayDiffMs = this._startOfNextDayDiffMs();
    const model = buildTaskReadModel({
      tasks: this._tasks(),
      undoneTodayTaskIds: this._undoneTodayTaskIds(),
      overdueTaskIds: this._overdueTasks().map((task) => task.id),
      todayStr,
      dayStarts: getNextDayStarts(todayStr, startOfNextDayDiffMs),
      startOfNextDayDiffMs,
      projects: this._projects(),
      tags: this._tags(),
    });

    const result = await (provider as SuperSyncProvider).captureApiRequest<unknown>(
      READ_MODEL_PATH,
      {
        method: 'PUT',
        body: JSON.stringify({ enableId, model }),
        assertBeforeSend: () => {
          // The epoch bumps only after a provider swap completes; the identity
          // check covers the moment in between.
          if (this._providerManager.getActiveProvider() !== provider) {
            throw new SyncEpochChangedError(
              epoch,
              this._providerManager.syncEpoch,
              FENCE_CONTEXT,
            );
          }
          this._providerManager.assertSyncEpochUnchanged(epoch, FENCE_CONTEXT);
        },
      },
    );
    if (result.ok) return;
    if (result.status === 409) {
      // The enablement is gone (switched off or replaced): stop until it changes.
      this._refusedEnableId = enableId;
      return;
    }
    if (result.status === 404) {
      // Expected on a server without task reading; once per session.
      if (!this._hasLoggedUnsupported) {
        this._hasLoggedUnsupported = true;
        Log.log('Agent task read: this server does not support task reading');
      }
      return;
    }
    Log.err('Agent task read publish failed', { status: result.status });
  }

  private _superSyncOrError(): SuperSyncProvider {
    if (!this._capture.isSuperSyncActive()) {
      throw new Error('Super Sync is not the active sync provider');
    }
    return this._providerManager.getActiveProvider() as SuperSyncProvider;
  }
}
