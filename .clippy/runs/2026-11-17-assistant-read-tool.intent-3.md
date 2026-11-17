# Intent-falsification artifact — convergence cycle 3 (run 2026-11-17-assistant-read-tool)

Produced by a fresh-context opus dispatch against the tree at ae8ce46c15; transcribed by the orchestrator from the dispatch's returned report. The dispatch executed about 45 reads/searches and 4 node probes (URL normalisation, a TRUNCATE in PGlite, zod date checks, roll-over arithmetic under TZ=Europe/Berlin); it ran no suite, build, Prisma, E2E or server access.

Verdict: NOT intent-clean (D-track deltas; one mechanical-falsification-candidate). Mechanical pass skipped this cycle.

## Per-R# lines

- {R1, D4 D5 D9 D10 (proof D12), compared D5(6) roll-over with the fork's day-change carry-over and with DST day lengths; compared the overdue rule with `task.selectors.ts:526-610`, finding (IF3-1, IF3-2)}
- {R2, D6 D13 D14 D17, `handleMcpPost` unchanged (`capture-mcp.routes.ts:57-105`); v18.0.0 and v19.3.1 validate with `createValidate` (`git show <tag>:src/app/op-log/validation/validation-fn.ts`), so released clients accept the new synced key, finding (IF3-7, IF3-10e)}
- {R3, D1 D3 D5 D6 D7 D10 D11 D17, per-account row lookup holds; a server row created with a sync JWT only, and an opt-in left stale, finding (IF3-3)}
- {R4, D1 D2 D10 D11 D14 D16, DELETE plus a never-inserting publish holds; full restore attacked, finding (IF3-4, IF3-11)}
- {R5 (+refinement), D1 D4 D7 D9 D15 D17 D18, encryption untouched; where the privacy text is shown, finding (IF3-8)}
- {R6, D9 D10 D17, `isSyncInProgressSync()` exists (`sync-wrapper.service.ts:249-251`); client/server bounds mirror and the unchanged-skip, finding (IF3-5, IF3-6)}
- {R7, D4 D5 D9, named-field copy, `.strict()`, no `includeNotes`, served}
- {R8, D14 D1, `git diff --stat 4db0e11236 01ef235b57 -- packages/super-sync-server packages/sync-core packages/shared-schema` is empty, so the image differs from v20.0.0 only by this run, finding (IF3-10)}
- {R9, D5 D7, `get_task {id}` matches `electron/mcp/mcp-tools.ts:183,186`, served}
- {R10, D12 D13, the E2E blocks WebSocket (`e2e/pages/supersync.page.ts:40-46`) and SuperSync has no interval polling, so the 90 s poll covers the trailing run, served}
- {R11, D15, `git diff --name-status 01ef235b57..HEAD` shows only run-state additions; the settings component's only consumers are `main.ts`, `sync-form.const.ts:757` and its spec, served}
- {R12, D6 D7 D14, tool list independent of the switch; probe named, served}
- {R13, D5 D6 D15, no `electron/` path in D15, served}

## Per-finding lines

- {IF3-1 on a new day the fork moves yesterday's unfinished plain-list tasks into Today when the app opens (`planner-carry-over.effects.ts:32-39`, `planner-carry-over.util.ts:31-37`), while D5(6) reports them as overdue, R1, stakes: none, route: [VERIFIED — surfaced]}
- {IF3-2 stepping 86 400 000 ms from `todayEndsAt` gives the wrong day for one hour around a DST change (executed, TZ=Europe/Berlin, 2026-10-25T22:30Z: app day 2026-10-25, server day 2026-10-26); the app uses `setDate` (`date.service.ts:46-54`), R1, stakes: none, route: [VERIFIED — surfaced]}
- {IF3-3 the F21 cure reopens two ways: (a) a sync-JWT holder creates the server row, D11 then shows "on" with a resume button whose click publishes, and the layered D11 bodies contradict each other for (enabled, nothing published, no opt-in); (b) capture "Turn off" writes only `captureKey: null` (`agent-capture.service.ts:117-119`), so `captureRead: true` stays, and the unchanged-skip can suppress the 409 that would clear it, R3, stakes: S1 (low likelihood), route: [VERIFIED — surfaced]}
- {IF3-4 the edited restore TRUNCATE fails as a whole on any dump taken before the fork migration (executed in PGlite: `relation "capture_read_models" does not exist`, `capture_grants` rows left: 1), so revoked connections come back, R4, stakes: S1 (low), route: [VERIFIED — surfaced]}
- {IF3-5 the builder does not enforce every server bound: calendar-invalid days pass a lexical check but fail `z.iso.date` (executed: `2024-02-30` false), no cap on `tagIds`, no id length cap — one task makes every publish a 400, R6, stakes: none, route: [VERIFIED — surfaced]}
- {IF3-6 the unchanged-skip memory lets a fresher device keep silent after a staler device published, R6, stakes: none, route: [VERIFIED — surfaced]}
- {IF3-7 the automatic opt-in clear on 409 is a config write concurrent with the other device's own, and whole-singleton LWW (`lww-update.meta-reducer.ts:683-700`) can drop an unrelated unsynced setting, R2, stakes: S4 (low), route: [VERIFIED — surfaced]}
- {IF3-8 `CAPTURE_PRIVACY` renders only while capture is off (`agent-capture-settings.component.html:27-31`), so the new sentence never shows at the read switch; the wiki "Turn off" line (`docs/wiki/3.01-API.md:188`) is not updated, R5, stakes: none, route: [VERIFIED — surfaced]}
- {IF3-9 candidate: node probe of the D8 path check, predicate expected-match:`contains ..: true`, result `/api/capture/%2e%2e/sync/data -> /api/sync/data contains ..: false` (also `.%2E`, `%2E.`), D8, stakes: none, route: mechanical-falsification-candidate}
- {IF3-10 procedure gaps: (a) live service name not recorded; (b) no RAM cost; (c) no probe of the official image restarting against a database that already holds the fork migration; (d) the one-off migrator is unnamed and not force-removed (`migration-sql.spec.ts:396-407`); (e) rollback drops the table while the fork image still serves, R8, stakes: S4 for (c) and (e), route: [VERIFIED — surfaced]}
- {IF3-11 the settings state when `getAccess()` fails is undefined; falling back to "off" hides the stop button, R4, stakes: S3 by displayed state (transient), route: [VERIFIED — surfaced]}
