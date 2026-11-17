# Intent-falsification artifact — convergence cycle 4 (run 2026-11-17-assistant-read-tool)

Produced by a fresh-context opus dispatch against the tree at fd5fd00fe4; transcribed by the orchestrator from the dispatch's returned report. The dispatch executed about 45 reads/searches and 6 probes (`dayStarts` anchors under TZ=Europe/Berlin; the app's `isValidDBDateStr` against zod `z.iso.date()` over 4,620,000 strings, 0 mismatches; D16's statement and an accounts-only CASCADE in PGlite; shell quoting of D16; D8's regex against 10 paths; `docker compose run --help`); it ran no suite, build, Prisma, E2E or server access.

Verdict: NOT intent-clean (D-track deltas; one mechanical-falsification-candidate). Mechanical pass skipped this cycle.

## Per-R# lines

- {R1, D4 D5 D9 D10 (proof D12), carry-over rule vs `planner-carry-over.util.ts:31-63` (matches D9/D5); `dayStarts` anchor (probe); which "today" source the snapshot uses, finding (IF4-3, IF4-7, IF4-11)}
- {R2, D6 D13 D14 D17, `handleMcpPost` untouched; pin P2 does not fire (`agent-capture.service.spec.ts:114-118,245-248` records `update:null` from `captureKey === null`); post-deploy check, finding (IF4-5, IF4-6)}
- {R3, D1 D3 D5 D6 D10 D11 D17, a row created with a sync JWT gets its own id and no device publishes into it, served (integrity note IF4-10)}
- {R4, D1 D2 D3 D10 D11 D14 D16, D16's statement executed with and without the table (ok / ok, rows left 0); accounts-only restore cascades (`backup-and-recovery.md:87-88`); switch-off error handling and where the stop button can be reached, finding (IF4-1, IF4-2)}
- {R5 (+refinement), D1 D4 D9 D17 D18, encryption untouched; cycle-4 fields against "titles and dates", finding (IF4-9)}
- {R6, D9 D10 D17, D9's date bound agrees with the server (0 of 4,620,000 mismatches); the 409 path after a server-side wipe, finding (IF4-8)}
- {R7, D4 D5 D9, `dayStarts` and `carryOver` carry no text; `.strict()` holds; `Summary` drops `carryOver`, served}
- {R8, D14 D16, `docker compose run --help` lists no image option; `Dockerfile:95` CMD is replaced by the one-off command, finding (IF4-5)}
- {R9, D5 D7, names unchanged, served}
- {R10, D12 D13, the GET body D12 and D2 expect vs D3's cycle-4 shape, finding (IF4-4)}
- {R11, D15, no `app.component.spec.ts`; `AgentCaptureService` appears only in the two specs already in D15, served}
- {R12, D6 D14, a probe is named for tool visibility; nothing checks `create_task` through ChatGPT after the tool list changes, finding (IF4-6)}
- {R13, D5 D6 D15, no `electron/` path in D15, served}

## Per-finding lines

- {IF4-1 D8 resolves every non-2xx to `{ ok: false }`; D10's `switchOff` does not say to throw on it, so a refused DELETE clears the opt-in with no error while the list stays served, R4, stakes: S3 (low likelihood; not caught by the specified specs), route: [VERIFIED — surfaced]}
- {IF4-2 the read block sits in the capture-enabled branch (`agent-capture-settings.component.html:25-41`); a device that lost its synced `captureKey` (whole-config conflict or import) shows no read state and no stop button while the server still serves the list, R4, stakes: S3 by displayed state (low; not caught), route: [VERIFIED — surfaced]}
- {IF4-3 "as `getLogicalTomorrowMs` does" yields times on the next day, not day starts; both readings pass D10's "23 or 25 h apart" check (probe), and with the wrong anchor `n = 0` the next morning, R1, stakes: none (medium likelihood; not caught), route: [VERIFIED — surfaced]}
- {IF4-4 candidate `rg -n -o -F "{ enabled: false, publishedAt: null }" .clippy/runs/2026-11-17-assistant-read-tool.md`, predicate any-match, result lines 114 (D2), 127, 179 (D12) — the expected GET body omits the `enableId` D3 now returns, D3 dependents / R10, stakes: none (caught loudly by `toEqual`), route: mechanical-falsification-candidate}
- {IF4-5 D14(f) says "with the image overridden to the fork tag" but `docker compose run` has no image flag; without a working override the one-off runs the official image (a no-op) and the migration happens at start instead, R8/R2, stakes: S4 (low; not caught by P-a..P-d), route: [VERIFIED — surfaced]}
- {IF4-6 nothing checks `create_task` through ChatGPT after the tool list changes, R12/R2, stakes: S4 detection (not locally catchable), route: [VERIFIED — surfaced]}
- {IF4-7 `DateService.todayStr()` reads the clock while the selectors use the store's `selectTodayStr`, which updates after the sync window (`app-state.effects.ts:22-33`); after midnight the list can carry the new day with yesterday's Today ids, R1, stakes: none (timing inferred; not caught), route: [VERIFIED — surfaced]}
- {IF4-8 with 409 writing nothing, a device with a stale id re-sends the full body every run indefinitely after a server-side wipe, R6, stakes: none, route: [VERIFIED — surfaced]}
- {IF4-9 `dayStarts` reveals the device's time zone and day-start setting and `carryOver` whether a task is in a planner group; D18 covers only project and tag titles, R5, stakes: none, route: [VERIFIED — surfaced]}
- {IF4-10 `GET /read-access` returns the enablement id to any holder of the sync login token, who can then overwrite the shared list with made-up tasks, R3, stakes: none (integrity; they can already add tasks), route: [VERIFIED — surfaced]}
- {IF4-11 after a roll-over, same-day tasks are in list order while the app shows the planner's day order, which the list does not carry, R1, stakes: none, route: [VERIFIED — surfaced]}

Round-3 cures re-attacked and held: D8 allowlist (10 paths), D9 date bound, D16 statement and quoting, `isPlannerFramedListTask` takes only `plannerGroup` (`planner-task-groups.util.ts:39-40`). Note: `capture-grant.store.ts` has no `randomUUID`; the repo's id patterns are SQL `gen_random_uuid()::text` (`capture-queue.store.ts:166`) and `randomBytes`.
