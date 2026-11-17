import { signal, WritableSignal } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { AuthFailSPError } from '@sp/sync-providers/errors';
import { BehaviorSubject } from 'rxjs';
import { DateService } from '../../../core/date/date.service';
import { Log } from '../../../core/log';
import { SyncWrapperService } from '../../../imex/sync/sync-wrapper.service';
import { SyncEpochChangedError } from '../../../op-log/core/errors/sync-errors';
import { SyncProviderId } from '../../../op-log/sync-providers/provider.const';
import {
  SyncProviderManager,
  SyncStatusChangePayload,
} from '../../../op-log/sync-providers/provider-manager.service';
import {
  selectStartOfNextDayDiffMs,
  selectTodayStr,
} from '../../../root-store/app-state/app-state.selectors';
import { getDbDateStr } from '../../../util/get-db-date-str';
import { CaptureKeyConfig, SyncConfig } from '../../config/global-config.model';
import { GlobalConfigService } from '../../config/global-config.service';
import { selectAllProjects } from '../../project/store/project.selectors';
import { selectAllTags } from '../../tag/store/tag.reducer';
import { selectUndoneTodayTaskIds } from '../../work-context/store/work-context.selectors';
import { AgentCaptureService } from '../agent-capture/agent-capture.service';
import { NativeCaptureImporter } from '../native-capture/native-capture-importer.service';
import {
  selectAllTasksInActiveProjects,
  selectOverdueTasksWithSubTasks,
} from '../store/task.selectors';
import { TaskWithSubTasks } from '../task.model';
import { createTask } from '../task.test-helper';
import { TaskReadModelV1 } from './task-read-model';
import { TaskReadPublisherService } from './task-read-publisher.service';

type ApiResult = { ok: true; data: unknown } | { ok: false; status: number };
type ApiOptions = {
  method: 'GET' | 'PUT' | 'DELETE';
  body?: string;
  assertBeforeSend?: () => void;
};

const TODAY = '2026-11-18';
const SECRET_TITLE = 'Call the notary about the will';
const PROJECT_TITLE = 'Private project';
const ENABLE_ID = 'enable-1';

describe('TaskReadPublisherService', () => {
  let service: TaskReadPublisherService;
  let store: MockStore;
  let syncing$: BehaviorSubject<boolean>;
  let syncStatus$: BehaviorSubject<SyncStatusChangePayload>;
  let syncCfg: WritableSignal<Partial<SyncConfig> | undefined>;
  let isCaptureEnabled: WritableSignal<boolean>;
  let isSyncInProgress: boolean;
  let provider: { id: SyncProviderId; captureApiRequest: jasmine.Spy };
  let providerManager: {
    getActiveProvider: () => unknown;
    syncStatus$: BehaviorSubject<SyncStatusChangePayload>;
    syncEpoch: number;
    assertSyncEpochUnchanged: (captured: number, context: string) => void;
  };
  let updateSection: jasmine.Spy;
  /** Requests that got past `assertBeforeSend`, i.e. that were sent. */
  let sent: Array<{ path: string; method: string; body?: unknown }>;
  /** Answers by `METHOD path`; a function may throw like a failed request. */
  let answers: Record<string, ApiResult | (() => ApiResult)>;
  /** Runs inside the fake request, before the provider's assertBeforeSend. */
  let beforeSend: () => void;

  const syncOnce = (result: SyncStatusChangePayload = 'IN_SYNC'): void => {
    syncStatus$.next('SYNCING');
    syncing$.next(true);
    syncStatus$.next(result);
    syncing$.next(false);
  };
  const publishes = (): Array<{ enableId: string; model: TaskReadModelV1 }> =>
    sent
      .filter((r) => r.path === '/api/capture/read-model')
      .map((r) => r.body as { enableId: string; model: TaskReadModelV1 });

  beforeEach(() => {
    syncing$ = new BehaviorSubject(false);
    syncStatus$ = new BehaviorSubject<SyncStatusChangePayload>('UNKNOWN_OR_CHANGED');
    syncCfg = signal<Partial<SyncConfig> | undefined>({ captureRead: ENABLE_ID });
    isCaptureEnabled = signal(true);
    isSyncInProgress = false;
    sent = [];
    answers = {};
    beforeSend = () => undefined;
    provider = {
      id: SyncProviderId.SuperSync,
      captureApiRequest: jasmine
        .createSpy('captureApiRequest')
        .and.callFake(async (path: string, options: ApiOptions): Promise<ApiResult> => {
          // As the provider: credentials load first, then the fence, then the send.
          await Promise.resolve();
          beforeSend();
          options.assertBeforeSend?.();
          sent.push({
            path,
            method: options.method,
            body: options.body === undefined ? undefined : JSON.parse(options.body),
          });
          const answer = answers[`${options.method} ${path}`];
          if (typeof answer === 'function') return answer();
          return answer ?? { ok: true, data: { publishedAt: 1 } };
        }),
    };
    providerManager = {
      getActiveProvider: () => provider,
      syncStatus$,
      syncEpoch: 1,
      assertSyncEpochUnchanged: (captured: number, context: string) => {
        if (captured !== providerManager.syncEpoch) {
          throw new SyncEpochChangedError(captured, providerManager.syncEpoch, context);
        }
      },
    };
    updateSection = jasmine
      .createSpy('updateSection')
      .and.callFake((_key: string, cfg: Partial<SyncConfig>) =>
        syncCfg.update((current) => ({ ...current, ...cfg })),
      );

    TestBed.configureTestingModule({
      providers: [
        provideMockStore({
          selectors: [
            {
              selector: selectAllTasksInActiveProjects,
              value: [
                createTask({
                  id: 't1',
                  title: SECRET_TITLE,
                  projectId: 'p1',
                  dueDay: TODAY,
                  notes: 'private notes',
                }),
                createTask({ id: 'o1', title: 'Old', dueDay: '2026-11-01' }),
                createTask({ id: 'd1', title: 'Done', isDone: true }),
              ],
            },
            { selector: selectUndoneTodayTaskIds, value: ['t1'] },
            {
              selector: selectOverdueTasksWithSubTasks,
              value: [{ id: 'o1' } as TaskWithSubTasks],
            },
            { selector: selectAllProjects, value: [{ id: 'p1', title: PROJECT_TITLE }] },
            { selector: selectAllTags, value: [] },
            { selector: selectTodayStr, value: TODAY },
            { selector: selectStartOfNextDayDiffMs, value: 0 },
          ],
        }),
        { provide: GlobalConfigService, useValue: { sync: syncCfg, updateSection } },
        { provide: SyncProviderManager, useValue: providerManager },
        {
          provide: SyncWrapperService,
          useValue: {
            isSyncInProgress$: syncing$,
            isSyncInProgressSync: () => isSyncInProgress,
          },
        },
        {
          provide: AgentCaptureService,
          useValue: {
            isEnabled: isCaptureEnabled,
            isSuperSyncActive: () => provider.id === SyncProviderId.SuperSync,
          },
        },
      ],
    });
    store = TestBed.inject(MockStore);
    service = TestBed.inject(TaskReadPublisherService);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('publishing', () => {
    it('publishes after a sync, at most once a minute with one trailing run', fakeAsync(() => {
      service.start();
      syncOnce();
      flushMicrotasks();
      expect(publishes().length).toBe(1);

      syncOnce();
      syncOnce();
      flushMicrotasks();
      expect(publishes().length).toBe(1);

      tick(60_000);
      expect(publishes().length).toBe(2);
      tick(60_000);
    }));

    it('sends the stored id with the open-task list', fakeAsync(() => {
      service.start();
      syncOnce();
      flushMicrotasks();
      const [{ enableId, model }] = publishes();
      expect(enableId).toBe(ENABLE_ID);
      expect(model.today).toBe(TODAY);
      expect(model.tasks.map((t) => t.id)).toEqual(['t1', 'o1']);
      expect(model.todayTaskIds).toEqual(['t1']);
      expect(model.overdueTaskIds).toEqual(['o1']);
      expect(model.tasks[0].projectTitle).toBe(PROJECT_TITLE);
      expect(JSON.stringify(model)).not.toContain('private notes');
      tick(60_000);
    }));

    it('does not publish after a failed sync', fakeAsync(() => {
      service.start();
      syncOnce('ERROR');
      syncOnce('UNKNOWN_OR_CHANGED');
      tick(60_000);
      expect(provider.captureApiRequest).not.toHaveBeenCalled();
    }));

    it('does not publish while a sync is in progress', fakeAsync(() => {
      service.start();
      isSyncInProgress = true;
      syncOnce();
      tick(60_000);
      expect(provider.captureApiRequest).not.toHaveBeenCalled();
    }));

    it('does not publish while capture is off, another provider is active or reading is unset', fakeAsync(() => {
      service.start();
      isCaptureEnabled.set(false);
      syncOnce();
      tick(60_000);

      isCaptureEnabled.set(true);
      provider.id = SyncProviderId.WebDAV;
      syncOnce();
      tick(60_000);

      provider.id = SyncProviderId.SuperSync;
      syncCfg.set({ captureRead: null });
      syncOnce();
      tick(60_000);
      syncCfg.set({});
      syncOnce();
      tick(60_000);
      expect(provider.captureApiRequest).not.toHaveBeenCalled();
    }));

    it('after a 409 writes no config and sends nothing for that id again', fakeAsync(() => {
      answers['PUT /api/capture/read-model'] = { ok: false, status: 409 };
      service.start();
      syncOnce();
      flushMicrotasks();
      expect(publishes().length).toBe(1);
      tick(60_000);

      syncOnce();
      tick(60_000);
      expect(publishes().length).toBe(1);
      expect(updateSection).not.toHaveBeenCalled();

      // A new enablement synced from another device is published again.
      syncCfg.set({ captureRead: 'enable-2' });
      syncOnce();
      flushMicrotasks();
      expect(publishes().length).toBe(2);
      expect(publishes()[1].enableId).toBe('enable-2');
      tick(60_000);
    }));

    it('sends nothing when the sync target changes before the send', fakeAsync(() => {
      const log = spyOn(Log, 'log');
      const err = spyOn(Log, 'err');
      beforeSend = () => {
        providerManager.syncEpoch = 2;
      };
      service.start();
      syncOnce();
      tick(60_000);
      expect(provider.captureApiRequest).toHaveBeenCalledTimes(1);
      expect(sent).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        'Agent task read publish abandoned: sync target changed',
      );
      expect(err).not.toHaveBeenCalled();
    }));

    it('publishNow sends nothing while capture is off or another provider is active', async () => {
      isCaptureEnabled.set(false);
      await service.publishNow();
      isCaptureEnabled.set(true);
      provider.id = SyncProviderId.WebDAV;
      await service.publishNow();
      expect(provider.captureApiRequest).not.toHaveBeenCalled();
    });

    it('sends nothing when the provider was swapped before the send', async () => {
      const other = { ...provider };
      beforeSend = () => {
        providerManager.getActiveProvider = () => other;
      };
      await service.publishNow();
      expect(sent).toEqual([]);
    });

    it('keeps publishing after failed runs and never rejects', fakeAsync(() => {
      const err = spyOn(Log, 'err');
      const outcomes: Array<() => ApiResult> = [
        () => ({ ok: false, status: 500 }),
        () => {
          throw new AuthFailSPError('Authentication failed (HTTP 401)');
        },
        () => {
          throw new TypeError('Failed to fetch');
        },
        () => ({ ok: true, data: { publishedAt: 2 } }),
      ];
      answers['PUT /api/capture/read-model'] = () =>
        (outcomes.shift() as (typeof outcomes)[0])();
      service.start();
      for (let i = 0; i < 4; i++) {
        syncOnce();
        tick(60_000);
      }
      expect(provider.captureApiRequest).toHaveBeenCalledTimes(4);
      expect(err.calls.allArgs()).toEqual([
        ['Agent task read publish failed', { status: 500 }],
        ['Agent task read publish failed', { reason: 'AuthFailSPError' }],
        ['Agent task read publish failed', { reason: 'TypeError' }],
      ]);
    }));

    it('logs a server without task reading once per session', async () => {
      const log = spyOn(Log, 'log');
      const err = spyOn(Log, 'err');
      answers['PUT /api/capture/read-model'] = { ok: false, status: 404 };
      await service.publishNow();
      await service.publishNow();
      expect(log).toHaveBeenCalledOnceWith(
        'Agent task read: this server does not support task reading',
      );
      expect(err).not.toHaveBeenCalled();
    });

    it('never logs task or project titles', async () => {
      const logged: unknown[] = [];
      const record = (...args: unknown[]): void => {
        logged.push(args);
      };
      (['log', 'err', 'warn', 'info', 'debug', 'verbose', 'critical'] as const).forEach(
        (method) => spyOn(Log, method).and.callFake(record),
      );
      const outcomes: Array<() => ApiResult> = [
        () => ({ ok: true, data: { publishedAt: 2 } }),
        () => ({ ok: false, status: 404 }),
        () => ({ ok: false, status: 500 }),
        () => {
          throw new Error(SECRET_TITLE);
        },
        () => ({ ok: false, status: 409 }),
      ];
      answers['PUT /api/capture/read-model'] = () =>
        (outcomes.shift() as (typeof outcomes)[0])();
      for (let i = 0; i < 5; i++) {
        await service.publishNow();
      }
      beforeSend = () => {
        providerManager.syncEpoch = 9;
      };
      syncCfg.set({ captureRead: 'enable-2' });
      await service.publishNow();

      expect(logged.length).toBeGreaterThan(0);
      const text = JSON.stringify(logged);
      expect(text).not.toContain(SECRET_TITLE);
      expect(text).not.toContain(PROJECT_TITLE);
    });

    it('sends dayStarts at the instants the logical day turns, across a 25-hour day', async () => {
      const offset = 4 * 60 * 60 * 1000;
      // The ambient zone's fall-back day (Berlin in October, LA in November).
      const longDay = findDayLongerThan24h(2026);
      const today = longDay ? getDbDateStr(addDays(longDay, -1)) : TODAY;
      store.overrideSelector(selectTodayStr, today);
      store.overrideSelector(selectStartOfNextDayDiffMs, offset);
      store.refreshState();

      await service.publishNow();
      const { dayStarts } = publishes()[0].model;
      const logicalDay = (ms: number): string => getDbDateStr(new Date(ms - offset));
      expect(dayStarts.length).toBe(8);
      dayStarts.forEach((start, k) => {
        expect(logicalDay(start - 1)).toBe(getDbDateStr(addDays(parseDay(today), k)));
        expect(logicalDay(start)).toBe(getDbDateStr(addDays(parseDay(today), k + 1)));
      });
      if (longDay) {
        // dayStarts[0] begins the long day, dayStarts[1] ends it.
        expect(dayStarts[1] - dayStarts[0]).toBe(25 * 60 * 60 * 1000);
      }
    });
  });

  describe('access', () => {
    it('reads the server state; a server without task reading reads as off', async () => {
      const access = { enabled: true, enableId: ENABLE_ID, publishedAt: 5 };
      answers['GET /api/capture/read-access'] = { ok: true, data: access };
      expect(await service.getAccess()).toEqual(access);

      answers['GET /api/capture/read-access'] = { ok: false, status: 404 };
      expect(await service.getAccess()).toEqual({
        enabled: false,
        enableId: null,
        publishedAt: null,
      });
    });

    it('rejects any other failure or an unexpected answer', async () => {
      answers['GET /api/capture/read-access'] = { ok: false, status: 500 };
      await expectAsync(service.getAccess()).toBeRejected();
      answers['GET /api/capture/read-access'] = { ok: true, data: { enabled: 'yes' } };
      await expectAsync(service.getAccess()).toBeRejected();
    });

    it('switches on: stores the id the server returned, then publishes against it', async () => {
      syncCfg.set({});
      answers['PUT /api/capture/read-access'] = {
        ok: true,
        data: { enabled: true, enableId: 'server-id', publishedAt: null },
      };
      await service.switchOn();
      expect(updateSection).toHaveBeenCalledOnceWith(
        'sync',
        { captureRead: 'server-id' },
        true,
      );
      expect(publishes().map((p) => p.enableId)).toEqual(['server-id']);
    });

    it('stores nothing when the server refuses switching on', async () => {
      syncCfg.set({});
      for (const answer of [
        { ok: false, status: 409 } as const,
        { ok: false, status: 500 } as const,
        { ok: true, data: { enabled: true, enableId: null, publishedAt: null } } as const,
        (): ApiResult => {
          throw new TypeError('Failed to fetch');
        },
      ]) {
        answers['PUT /api/capture/read-access'] = answer;
        await expectAsync(service.switchOn()).toBeRejected();
      }
      expect(updateSection).not.toHaveBeenCalled();
      expect(publishes()).toEqual([]);
    });

    it('forgets a refusal when switched on again', async () => {
      answers['PUT /api/capture/read-model'] = { ok: false, status: 409 };
      await service.publishNow();
      await service.publishNow();
      expect(publishes().length).toBe(1);

      answers['PUT /api/capture/read-model'] = { ok: true, data: { publishedAt: 3 } };
      answers['PUT /api/capture/read-access'] = {
        ok: true,
        data: { enabled: true, enableId: ENABLE_ID, publishedAt: 1 },
      };
      await service.switchOn();
      expect(publishes().length).toBe(2);
    });

    // Pin P4: the synced id is cleared only after the server deleted the list
    // (ok) or has none (404); otherwise switching off throws and changes nothing.
    const switchOffCases: Array<{
      name: string;
      answer: ApiResult | (() => ApiResult);
      isCleared: boolean;
    }> = [
      { name: 'ok', answer: { ok: true, data: { enabled: false } }, isCleared: true },
      { name: '404', answer: { ok: false, status: 404 }, isCleared: true },
      { name: '500', answer: { ok: false, status: 500 }, isCleared: false },
      {
        name: 'a thrown request',
        answer: () => {
          throw new TypeError('Failed to fetch');
        },
        isCleared: false,
      },
    ];
    switchOffCases.forEach(({ name, answer, isCleared }) => {
      it(`switchOff with ${name} ${isCleared ? 'clears' : 'throws and keeps'} captureRead`, async () => {
        answers['DELETE /api/capture/read-access'] = answer;
        if (isCleared) {
          await service.switchOff();
          expect(updateSection).toHaveBeenCalledOnceWith(
            'sync',
            { captureRead: null },
            true,
          );
          expect(service.enableId()).toBeNull();
        } else {
          await expectAsync(service.switchOff()).toBeRejected();
          expect(updateSection).not.toHaveBeenCalled();
          expect(service.enableId()).toBe(ENABLE_ID);
        }
      });
    });
  });
});

describe('AgentCaptureService.switchOff and task reading', () => {
  it('clears the synced read opt-in together with the capture key', async () => {
    const key: CaptureKeyConfig = { v: 1, privateKeyPkcs8: 'priv', publicKeySpki: 'pub' };
    const updateSection = jasmine.createSpy('updateSection');
    const provider = {
      id: SyncProviderId.SuperSync,
      disableCaptureKey: jasmine.createSpy().and.resolveTo(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideMockStore(),
        { provide: NativeCaptureImporter, useValue: {} },
        {
          provide: GlobalConfigService,
          useValue: {
            sync: signal({ captureKey: key, captureRead: ENABLE_ID }),
            cfg: signal(undefined),
            updateSection,
          },
        },
        {
          provide: SyncProviderManager,
          useValue: { getActiveProvider: () => provider, syncEpoch: 1 },
        },
        { provide: DateService, useValue: { todayStr: () => TODAY } },
        { provide: SyncWrapperService, useValue: { isSyncInProgress$: syncingNever() } },
      ],
    });
    await TestBed.inject(AgentCaptureService).switchOff();
    expect(provider.disableCaptureKey).toHaveBeenCalled();
    expect(updateSection).toHaveBeenCalledOnceWith(
      'sync',
      { captureKey: null, captureRead: null },
      true,
    );
  });
});

const syncingNever = (): BehaviorSubject<boolean> => new BehaviorSubject(false);

const parseDay = (day: string): Date => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/** The ambient zone's first day of `year` longer than 24 hours, or null. */
const findDayLongerThan24h = (year: number): Date | null => {
  for (let day = new Date(year, 0, 1); day.getFullYear() === year; ) {
    const next = addDays(day, 1);
    if (next.getTime() - day.getTime() > 24 * 60 * 60 * 1000) return day;
    day = next;
  }
  return null;
};
