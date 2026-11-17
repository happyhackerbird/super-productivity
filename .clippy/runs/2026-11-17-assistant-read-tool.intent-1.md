# Intent-falsification artifact — convergence cycle 1 (run 2026-11-17-assistant-read-tool)

Produced by a fresh-context opus dispatch against the tree at 98119085ae; transcribed by the orchestrator from the dispatch's returned report (the report ran no suite, build or E2E; Prisma `migrate deploy` behaviour, ChatGPT's tool refresh and the IF7 timing were marked "inferred, unverified" by it).

Verdict: NOT intent-clean (D-track deltas). Mechanical pass skipped this cycle.

## Per-R# lines

- {R1, D4 D5 D6 D9 D10, compared the `TODAY` filter with what the Today view renders and whether the done-state reaches ChatGPT, finding (IF5, IF6)}
- {R2, D6, traced what the `/mcp` request path newly depends on, finding (IF3)}
- {R3, D3 D6 D7, other account (served: `capture-grant.store.ts:146`), no token (served: `capture-mcp.routes.ts:74-80`), sync-JWT holder granting itself read access, finding (IF1)}
- {R4, D1 D2 D3 D16, attacked rollback, concurrency and backups, finding (IF2, IF8, IF9)}
- {R5, D1 D4, D15 list holds no sync/op-log path and `isEncryptionMandatory` (`super-sync.ts:162-164`) is untouched, served}
- {R6, D9 D10, read `app.component.ts:293` and `agent-capture.service.ts:69,162-170`: runs in the web build, finding (IF7, IF14)}
- {R7, D4 D5 D9, looked for a notes path: named-field copy, `.strict()` schema, no `includeNotes`, served}
- {R8, D14, cross-arch build sound (`Dockerfile:69-74`); migrations default off (`Dockerfile:83`), finding (IF3, IF2, IF4, IF6)}
- {R9, D5 D7, names match `electron/mcp/mcp-tools.ts:82-85`, served (note IF15)}
- {R10, D12 D13, harness builds from local source (`package.json:69-70`), encryption on (`e2e/utils/supersync-helpers.ts:217`), finding (IF5, IF10)}
- {R11, D15, `git log 01ef235b57..HEAD` → only the bootstrap commit; `tools/extract-i18n.js:36` writes only `t.const.ts`, finding (IF11, IF12)}

## Per-finding lines

- {IF1 a sync JWT alone can switch reading on (`PUT /read-access` behind `middleware.ts:30-50`; JWT lifetime 365 days `auth.ts:19`), mint a capture token (`capture.routes.ts:194-198`) and read the list the operator's devices then publish — without the encryption password; capture's own switch needs the synced, encrypted `captureKey` (`agent-capture.service.ts:69,106-112`), C3/C6 (S1), route: [VERIFIED — surfaced]}
- {IF2 rollback leaves `capture_read_models`; the official `disableCaptureKey` (`capture-key.store.ts:56-69`) never deletes it and the app's `DELETE /read-access` gets 404, C4 (S3), route: [VERIFIED — surfaced]}
- {IF3 every `/mcp` request and the capture switch-off transaction would depend on the new table; the image defaults to `RUN_MIGRATIONS_ON_STARTUP=false` (`Dockerfile:83`) and the pending-migration check only warns (`migration-status.ts:38-44`), so a swap without the migration returns 500 on `create_task`, C5 (S4), route: [VERIFIED — surfaced]}
- {IF4 the rollback claim may stay "unverified" although the throwaway Postgres can execute it, C9 (S5), route: [VERIFIED — surfaced]}
- {IF5 the Today view also shows an overdue panel (`work-view.component.ts:379-381`, `task.selectors.ts:521-558`, incl. unplanned tasks with a missed deadline) and subtasks nested under a parent due today (`work-context.selectors.ts:88-93` drops them from the id list); date filters drop deadline-only tasks, C1/C2, route: [VERIFIED — surfaced]}
- {IF6 the tool list changes with every toggle and the procedure does not order "switch on" before "refresh ChatGPT", nor name a probe, C11, route: [VERIFIED — surfaced]}
- {IF7 the credential store sets its in-memory config (`credential-store.service.ts:317`) before the epoch bumps (`provider-manager.service.ts:340-357`); `_cfgOrError()` (`super-sync.ts:774-776`) runs after the publisher's last fence check, account fence (S2), route: [VERIFIED — surfaced]}
- {IF8 `enableReadAccess` names no lock; the existing pattern locks the key row (`capture-oauth.store.ts:28-34`, `FOR SHARE`), so a concurrent switch-off can leave a row, C4 (S3), route: [VERIFIED — surfaced]}
- {IF9 full `pg_dump` backups kept 14 days (`scripts/backup.sh:34,107,135`) hold plaintext after switch-off; whether the live server runs it is unverified, C4 (S3, low), route: [VERIFIED — surfaced]}
- {IF10 candidate `rg -n "DROP TABLE IF EXISTS" packages/super-sync-server/tests/capture-pglite.helper.ts`, predicate any-match, result `28: DROP TABLE IF EXISTS capture_auth, capture_connect_codes, capture_items, capture_grants, capture_keys, users;` — the new FK makes dropping `users` fail from the second test on, D13, route: mechanical-falsification-candidate}
- {IF11 candidate `git ls-files .clippy clippy.config`, predicate any-outside-scope:<D15 list>, result: seven tracked run-state files — a tracker commit shows as `M` and trips D15's acceptance, D15, route: mechanical-falsification-candidate}
- {IF12 `SuperSyncHttpStatusError` is not exported (`super-sync.ts:71`; absent from `packages/sync-providers/src/super-sync.ts`), so D10's 404/409 branches have no type to test, D8/D10, route: [VERIFIED — surfaced]}
- {IF13 candidate `rg -n -i "can't read|cannot read|can only add" docs/wiki/3.01-API.md packages/super-sync-server/src packages/super-sync-server/README.md src/assets/i18n/en.json`, predicate any-outside-scope:{capture-oauth.routes.ts, en.json}, result includes `docs/wiki/3.01-API.md:179` and `en.json:1588` (`ENCRYPTION_SETUP_INTRO`), F14/D7/D11, route: mechanical-falsification-candidate}
- {IF14 the builder caps task count but not bytes; a body over 1 MiB gets 413 on every run, visible only in the log and a stale "Last shared" line, R6 (low), route: [VERIFIED — surfaced]}
- {IF15 `list_tasks` reuses the upstream name with a different input schema, so a later merge with upstream's relay design (`docs/plans/2026-10-26-assistant-connector-directories.md:409-416`) picks one schema by hand, R9 (low), route: [VERIFIED — surfaced]}
- {IF16 the brief's "do not depend on ChatGPT's unverified behaviour, or name the probe" and Settled 1 are not enumerated as requirements, record fidelity, route: [VERIFIED — surfaced]}
