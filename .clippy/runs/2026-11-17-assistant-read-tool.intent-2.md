# Intent-falsification artifact — convergence cycle 2 (run 2026-11-17-assistant-read-tool)

Produced by a fresh-context opus dispatch against the tree at d435c17c7c; transcribed by the orchestrator from the dispatch's returned report. The dispatch executed about 35 reads/searches, 2 node probes (zod length counting, URL dot segments) and 1 `git ls-tree`; it ran no suite, build, Prisma or server access, and marked claims resting on those "inferred, not executed".

Verdict: NOT intent-clean (D-track deltas; one mechanical-falsification-candidate). Mechanical pass skipped this cycle.

## Per-R# lines

- {R1, D4 D5 D9 D10 (proof D12), day rollover; "upcoming" against the planner's repeat projections (`planner.selectors.ts:210`); subtask order (`packages/plugin-api/src/types.ts:403`), finding (IF2-6, IF2-7, IF2-16)}
- {R2, D6 D13 D14, `create_task` path unchanged by D6; deploy path migrates inside the replacement container, finding (IF2-4)}
- {R3, D1 D3 D5 D6 D7 D17, other account / switched off / no token / sync JWT on `/mcp` / capture token on `/api/capture/read-*` / enabling with a JWT alone — all refused, served}
- {R4, D1 D2 D10 D11 D16 D17, the device opt-in can be lost while the server row stays (`lww-update.meta-reducer.ts:683`; `global-config.reducer.ts:190-192`); publish after DELETE is a 409, finding (IF2-2)}
- {R5, D1 D4 D9 D15 D17, encryption untouched; field set against "titles and dates", account fence, privacy texts, finding (IF2-8, IF2-3, IF2-9)}
- {R6, D9 D10 D17, a settings save merges the section (`sync-config.service.ts:383`), so `captureRead` survives; trailing throttle run and invalid dates, finding (IF2-12, IF2-11)}
- {R7, D4 D5 D9, no notes path; executed probe: zod 4 `z.string().max(500)` counts code points (accepts 500 emoji, rejects 501), served}
- {R8, D14, migrate order, live preconditions, later upstream migrations, write cost, finding (IF2-4, IF2-14, IF2-15)}
- {R9, D5 D7, upstream specs refuse `tasks:read` as an OAuth scope (`capture-oauth.pglite.spec.ts:272,464`), finding (IF2-10, low)}
- {R10, D12 D13, the E2E cannot tell a working after-sync publisher from a broken one, finding (IF2-5)}
- {R11, D15, base chain holds; a dependent spec sits outside D15's list, finding (IF2-1, IF2-13)}
- {R12, D6 D7 D14, three tools whatever the switch, OAuth untouched, probe named, served}
- {R13, D5 D6 D15, no file under `electron/` in D15's list, served}

## Per-finding lines

- {IF2-1 candidate `rg -n "TestBed.createComponent\(AgentCaptureSettingsComponent\)" src e2e`, predicate any-outside-scope:<D15 list>, result `src/app/features/tasks/agent-capture/agent-capture-settings/agent-capture-settings.component.spec.ts:36`; that spec provides no `Store` (`:76-86`) and 10 of its 12 setups render the enabled branch, so the hooked child component fails injection (predicted, not executed), D15/R11, stakes: none, route: mechanical-falsification-candidate}
- {IF2-2 the server can be "on" while every device shows "off" and offers no stop button: a GLOBAL_CONFIG conflict replaces the whole config (`lww-update.meta-reducer.ts:683`), an import keeps only local-only keys (`global-config.reducer.ts:190-192`), or a slow device's `captureRead: null` wins, R4/R6, stakes: S3 by displayed state, route: [VERIFIED — surfaced]}
- {IF2-3 the D8 fence callback does not close F27: the credential store swaps its in-memory config (`credential-store.service.ts:317`) before the epoch moves (`provider-manager.service.ts:340-356`), same provider object, so the callback passes; upstream's capture fence has the same hole, R5, stakes: S2 (low likelihood), route: [VERIFIED — surfaced]}
- {IF2-4 D14(1) migrates inside the replacement container, inverting upstream's migrate-first order (`scripts/deploy.sh:369,421,431`; `env.example:263-266`), and the live `_prisma_migrations` state and `REQUIRE_DATABASE_POOL_LIMITS` precondition (`migrate-deploy.sh:136-152`) are unknown to the design, R8/R2, stakes: S4 (S5 secondary), route: [VERIFIED — surfaced]}
- {IF2-5 `switchOn` publishes by itself and D12 creates every task before switching on, so the E2E passes with a dead after-sync pipeline, R10/R6, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-6 `today` and `todayTaskIds` are frozen at publish; on a new day before the app syncs, TODAY returns yesterday's list, R1, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-7 "upcoming" omits future recurring instances the planner shows and the description does not say so, R1, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-8 Settled 2 accepts "task titles and dates"; D4 also publishes project and tag titles, time estimate and time spent, and the switch text omits the time fields; R5 dropped the bound, R5, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-9 with reading on, a sync JWT alone can mint a token and read the list; the wiki privacy paragraph (`docs/wiki/3.01-API.md:188-197`) and `CAPTURE_PRIVACY` do not say so, R5, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-10 `tasks:read` here means an account switch while upstream plans per-grant consent, so a later merge decides authorization semantics by hand, R9, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-11 `getDbDateStr` renders an invalid date as `NaN-NaN-NaN`; one such task makes the strict schema reject every publish, R6, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-12 the trailing throttle run can snapshot during a later sync, R6, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-13 executed probe: `'/api/capture/../sync/data'.startsWith('/api/capture/')` is true and resolves to `/api/sync/data`, D8, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-14 an upstream migration dated before 20261117 and released later would be pending after the fork's; whether `migrate deploy` accepts that is unprobed (executed: `git ls-tree upstream/master` at f8fa5e1589 shows none pending now), R8, stakes: S5 (low), route: [VERIFIED — surfaced]}
- {IF2-15 the publisher rewrites the whole payload on every run with no unchanged-model skip and the write volume is not stated, R8, stakes: none, route: [VERIFIED — surfaced]}
- {IF2-16 nested subtasks are returned in entity order, the client shows them in the parent's `subTaskIds` order, R1, stakes: none, route: [VERIFIED — surfaced]}
