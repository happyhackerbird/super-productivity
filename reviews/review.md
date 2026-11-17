# AO-136: AO-134 repair r3 review

**Verdict: accept with follow-ups.** Source review found no confirmed candidate-introduced product defect. This is not a runtime approval: dependency setup did not complete, and Angular specs, lint and visual behavior were **not exercised**. The required execution evidence remains outstanding.

- Target: `1f73dce390f5224e98a124e10c11650e234e9c99`.
- Acceptance revision: `5df3e19cccb91fb17aa99bfe13f4720974eb58ec`, `tasks/01-schedule-no-auto-placement.md`, Repair r3 takes precedence.
- Code base: `1435efa96c2debc8e99305bead8d2e69ee259f30`.
- Exact detached checkout: `/tmp/target`; `rev-parse HEAD` matched target.
- Reviewer: AO-136, OpenAI coding assistant; method: ordinary. Two read-only reviewer slices assessed changed expectations and timed-path invariance. Neither implemented the candidate. No builder report or pre-existing `reviews/` content was read.

## Execution stop and limitations

Started the workflow installation in `/tmp/target`:

`ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts --no-audit --no-fund --fetch-retries 5 --maxsockets 4`

A 600-second wait raised `subprocess.TimeoutExpired`; captured npm output was empty. This was a wait timeout, not an npm failure exit. Process inspection subsequently showed npm still running after about 11 minutes. A diagnostic glob over potential npm log directories returned **`EACCES: permission denied, stat '/root/.npm/_logs'`**. This was a reviewer diagnostic lookup, not evidence that npm itself required that directory or that package-network access was denied. Per the explicit stop-on-denial instruction, execution stopped. The outstanding npm process was terminated by the reviewer, yielding exit **143**, output `Terminated`. No fallback installation, permission workaround, or retry was attempted.

Consequently `npx ts-patch install`, `npm run env`, the four package builds, `npm run test:file src/app/features/schedule/map-schedule-data/`, and `npm run checkFile` were **not run**. There was no Angular attempt, no exit 137, no observed spec pass/fail count, and no lint result. The instruction to attempt Angular once could not be fulfilled after this stop; no alternative runner was used. Fail-on-base claims below are explicitly source-derived, not observed red/green results. No browser, week/month surface, or standalone runtime smoke was exercised. Only the Python review-delivery check is run after the stop to deliver this report; that is not product validation.

## Requirements

All source references below refer to the exact candidate. `map/` abbreviates `src/app/features/schedule/map-schedule-data/`.

| Requirement | Status | Evidence and limits |
| --- | --- | --- |
| R1 | met | Source: `map/map-to-schedule-days.ts:89–100` supplies an empty task array to `createScheduleDays`; ordinary/current untimed tasks cannot reach the flow producer. New spec `no-auto-placement.spec.ts:113–136` checks Today and current-task inputs across days. Spec execution: not exercised. |
| R2 | met | Source: the same call passes `{}` for planner membership and `[]` for tasks, removing both planner and dueDay entry channels. `create-schedule-days.ts:136–150` shows the two now-empty producers. New spec lines 140–154 separately supplies planner-only and dueDay-only inputs. Spec execution: not exercised. |
| R3 | met | Source: untimed repeat configs become `[]`, so `create-schedule-days.ts:115–118,178–190` cannot produce their occurrences. Timed configs still enter blocker construction unchanged at `map-to-schedule-days.ts:77–87`. New spec lines 158–162 and 193–219 cover the two classes. Spec execution: not exercised. |
| R4 | met | Source trace below finds unchanged timed blocker arguments, independent scheduled-task selection, empty-flow block insertion, and retained midnight/multiday converters. Every changed existing expectation was checked; none removed or changed a timed placement value. New R4 assertions pin representative day/start/duration values, not all edge cases. Runtime equivalence: not exercised. |
| R5, amended | met | Source: empty flow/planner/repeat inputs produce empty per-day `beyondBudgetTasks`; budget insertion predicates exclude scheduled blocker types. Consumers safely retain day-indexed empty lists. `beyondBudgetDays` is ordinarily `[[], …]`, not literally an outer `[]`; it contains no events. Month concat, day-page `some`, and week fallback handle this shape. UI runtime: not exercised. Leaving beyond-budget UI unchanged is required, not a defect. |
| R6 | not exercised | Structurally compliant by source review: one new spec, five existing mapper-level specs adapted, no spec deleted, no timed assertion weakened. Nineteen existing tests have expectation changes; eight new tests cover the requirements. [INFERENCE] R1–R3 new cases fail on base for the reasons below. No Angular execution proves candidate pass or base failure. |

“Met” above denotes source-established behavior, not observed test success. All spec-only runtime evidence remains not exercised.

## Scope and protected inputs

`git diff --stat 1435efa96c2d 1f73dce3 -- .` lists exactly seven files, 285 insertions and 484 deletions:

- `map-to-schedule-days.ts` (28 changed diff lines);
- new `no-auto-placement.spec.ts` (239 lines);
- `map-to-schedule-days.spec.ts`;
- `map-to-schedule-days-extended.spec.ts`;
- `month-view-repeat-projection-day.spec.ts`;
- `scheduled-repeat-projection-dedup.spec.ts`;
- `wait-for-completion-repeat-projection.spec.ts`.

All are under `src/app/features/schedule/map-schedule-data/`. The entire remainder of `src/app/features/schedule/` was compared with `git diff --exit-code` excluding only those seven paths: exit 0, no output. Thus the upstream mapping units, their own specs, model/const files, and beyond-budget UI are byte-identical to base. `git diff --name-only --diff-filter=D … -- '*.spec.ts'` returned no deletions.

The sole production change replaces the three flow inputs with `[]`, `[]`, `{}`, removes the now-obsolete current-first/filter preparation and its local helper/import, and adds an explanatory comment. Removing that preparation does not alter the independent scheduled-task input. No other production change or unrequested change was found.

Protected comparison returned exit 0 with no output for `tasks/`, `scripts/check*`, `AGENTS.md`, `CLAUDE.md`, `aos-*.toml`, `karma.conf.js`, `angular.json`, `tsconfig*.json`, and `package*.json`. Test-loading configuration and package manifests/lockfile are unchanged. No new skip/filter or deleted spec was found. Existing timezone guards remain; test loading was not exercised at runtime.

## R4: timed-path analysis

1. `map/map-to-schedule-days.ts:77–87` passes scheduled tasks, timed repeat configs, calendar data, work/lunch config, rendered-day count, realNow and logical-day offset to blocker construction exactly as base did.
2. Base's removed `resortTasksWithCurrentFirst` reordered only `tasks`, then filtered out numeric `dueWithTime`. It never reordered `scheduledTasks`. The caller supplies these independently at `schedule.service.ts:107–120`; scheduled ordering comes from `features/work-context/store/work-context.selectors.ts:398–413`.
3. **Planner map caveat checked:** `features/planner/store/planner.selectors.ts:155–167` does not intrinsically exclude timed tasks. However, `work-context.selectors.ts:398–403` independently includes unfinished timed tasks from the active entity map in `timelineTasks.planned`. Explicit scheduling removes planner membership (`features/planner/store/planner.reducer.ts:32–45`); planning/moving clears timed scheduling (`features/tasks/store/task.reducer.ts:720–750`, `root-store/meta/task-shared-meta-reducers/planner-shared.reducer.ts:45–58`). A stale planner membership alongside a scheduled task can lose an automatically placed duplicate, not its explicit-time blocker. No supported caller path was found in which an ordinary unfinished timed task depends solely on `plannerDayMap`. Arbitrary inconsistent direct inputs containing a timed task only in the planner map are not an equivalence proof; this remains a static-analysis boundary, not a demonstrated product defect.
4. `map/create-view-entries-for-day.ts:48–58` still inserts blockers when flow tasks are empty. `insert-blocked-blocks-view-entries-for-schedule.ts:28–38` explicitly handles empty entries. `create-view-entries-for-block.ts:11–76` converts timed tasks/projections, calendar, lunch and timed continuations.
5. `create-blocked-blocks-by-day-map.ts:44–95,109–162` retains cross-day partitioning and timed task/repeat/calendar split routing. Continuation conversion at `create-view-entries-for-block.ts:54–76` and filtering at `create-schedule-days.ts:244–282` are unchanged. New fixtures do not independently exercise midnight/multiday timed entries; their invariance is source evidence only.
6. Work boundaries are still created at `create-sorted-blocker-blocks.ts:147–211`. The existing converter does not emit work-start/end cards; that predates this patch. Lunch has its explicit branch at `create-view-entries-for-block.ts:45–53`. New R4 fixtures use work hours but do not independently pin boundary blocks.

## R5: empty budget and consumers

`create-schedule-days.ts:39–47,136–168,192–205` initializes flow from `[]`, combines it with an empty planner map, and keeps both fully-beyond and carried flow empty. The additional budget insertion branches at lines 219–255 require `isDayAssignedEntry`; lines 321–334 limit that predicate to flow-task variants, not scheduled-task/repeat/calendar/lunch blocker variants. Thus those branches do not repopulate the budget from timed entries. The mapper's original early return also remains safe.

- `map-schedule-days-to-schedule-events.ts:14–36,131` maps each empty task budget to an empty array while preserving day indexing.
- `schedule-day-page.ts:22–33` checks `some(d => d.length > 0)` and derives its empty-page flag without indexing an absent event.
- `schedule/schedule.component.ts:326–328` computes month events with `events().concat(...beyondBudget())`; empty inner arrays add nothing.
- `schedule-week/schedule-week.component.ts:163–169` defaults missing input/day arrays to `[]`; its template guards the budget badge by positive count at `schedule-week.component.html:15`.

No UI/model consumer change is needed on this source trace. Actual rendering was not exercised.

## Every changed existing expectation

Candidate line numbers; filenames in `map/`. Original test names and input fixtures are unchanged. Removed object descriptions include their original data/occurrence/split metadata. `h`, `hTz`, `dhTz`, and `minAfterNowTs` below are the existing fixture helpers, not newly evaluated values.

### `map-to-schedule-days.spec.ts` — twelve tests

1. **should work for simple case**, lines 96–123: today's `Task` entries `1` at `hTz(0)` for `h(1)` and `2` at `hTz(1)` for `h(2)` become `[]`. Other day/budget fields unchanged. Allowed R1: both untimed.
2. **should work for simple scheduled case**, lines 144–169: count 3 → 1; remove `N1` split at `hTz(0)` for `h(.5)` and continuation at `minAfterNowTs(90)` for `h(.5)`. Preserve full scheduled `S1` at `minAfterNowTs(30)` for `h(1)`. Allowed R1; no timed weakening.
3. **should work for very long scheduled tasks**, lines 186–193: tomorrow count 1 → 0; remove start `dhTz(1,9)` and duration `h(1)` assertions for untimed overflow `N1`. Today's scheduled `S1` start `dhTz(0,9)`, duration `h(9)` and count remain. Allowed R1, not a timed continuation deletion.
4. **should split multiple times**, lines 217–241: count 5 → 2; remove `N1` segments at `hTz(0)`, `minAfterNowTs(60)`, `minAfterNowTs(120)` for `h(.5)`, `h(.5)`, `h(1)`. Preserve `S1`/`S2` at minutes 30/90 for `h(.5)` each. Allowed R1.
5. **should show repeat for next day**, lines 268–291: remove today's untimed `N1` at `hTz(0)` for `h(2)`. Preserve tomorrow's timed `R1_1970-01-02` at `h(24)` for `h(1)` and occurrence fields. Allowed R1.
6. **should spit around scheduled repeat task cases**, lines 321–346: remove today's `N1` at `h(0)` for `h(23)-60000`; remove tomorrow's `N2` splits at `hTz(24)` and `hTz(26)` for `h(1)` each. Keep timed `R1_1970-01-02` at `hTz(25)` for `h(1)`. Allowed R1.
7. **should work for NON-scheduled repeat task cases**, lines 377–391: remove `N1` at `hTz(0)` for `h(23)-60000`, tomorrow's untimed `R1` projection at `hTz(24)` for `h(2)`, and `N2` at `26*H+TZ_OFFSET` for `h(1)`; both days now empty. Allowed R1/R3.
8. **should work for for tasks spanning multiple days**, lines 421–461: remove untimed `N1` split segments on days 0/1/2 at `dhTz(0,9)`, `dhTz(1,11)`, `dhTz(2,11)`, durations `h(8)`, `h(6)`, `h(2)`. Both timed R1 projections remain at 09:00 for two hours with occurrence metadata. Allowed R1; removed multiday task is untimed.
9. **should sort in planned tasks to their days**, lines 498–503: remove day-1 `N1` at `hTz(0)` for `h(2)`; day-2 `FD1` at 82800000 for `h(1)` and `FD2` at 86400000 for `h(2)`; day-4 `FD3` at 255600000 for `h(1)` and `FD4` at 259200000 for `h(.5)`. All four day entries empty, day identities/budgets unchanged. Allowed R1/R2.
10. **should calculate the right duration of repeat task projections**, lines 540–569: remove untimed `R1` split/last-continuation pairs: day 1 `hTz(9)`/`hTz(13)` for `h(3)`/`h(1)`; day 2 115200000/129600000 for `h(3)`/`h(1)`. Remove associated split/occurrence fields with those objects. Preserve lunch at `hTz(12)` and 126000000, each `h(1)`, including data. Allowed R3, lunch unchanged.
11. **should work for an example with all the stuff**, lines 621–712: remove day-1 `N1` at `hTz(9)` for `h(2)`; day-2 untimed `R2` segments at `dhTz(1,9)`/`dhTz(1,10.5)` for one hour each, `FD1` segments at `dhTz(1,11.5)`/`dhTz(1,13)` for .5/3.5 hours, and `FD2` at `dhTz(1,16.5)` for .5 hours with `isBeyondBudget: true`; remove day-3 untimed `R2` at `dhTz(2,9)` for two hours. All S1/S2, timed R1 and lunch values retained. Allowed R1/R2/R3 and amended R5.
12. **should keep every segment of a flow projection pointing at its own occurrence day**, lines 970–979: remove untimed projection segment count 3 and occurrence-day array `[NDS,NDS,NDS]`; replace with empty segments. Add exact second-day scheduled S2 assertion at local 1970-01-02 01:00 for `h(.5)`. Allowed R3; timed check strengthened.

### `map-to-schedule-days-extended.spec.ts` — three tests

13. **should work for scheduled repeats that neighbor workStart workEnd blocks**, lines 134–166: remove untimed `RepeatProjection` objects `lmjFQzTdJh8aSak3cu9SN_2024-08-05`, `Foclw2saS0jZ3LfLVM5fd_2024-08-05`, `QRZ1qaGbKJSO-1-RoIh7F_2024-08-05`, starts 1722842100000/1722843900000/1722845100000, durations 1800000/1200000/300000. Preserve timed `wSs2q4YWkZZjthJrUeIos_2024-08-05` at 1722841200000 for 900000 and occurrence metadata. Removed fixtures have no `startTime`, regardless of title. Allowed R3.
14. **should move an undated task whole to the next workday**, lines 203–207: tomorrow's count 1, type Task, local Jan 21 2026 09:00 start and one-hour duration become `entries: []`; today remains empty. Allowed R1.
15. **should keep a task due today on its day as beyond budget**, lines 210–215: budget IDs `['T']` become budget `[]`; both day entries remain empty. Allowed R2/amended R5.

### Remaining files — four tests

16. `month-view-repeat-projection-day.spec.ts:63`, **does not project a monthly occurrence onto month view grid cell 0**: untimed projection days `['1970-01-01']` → `[]`. Allowed R3.
17. Same file lines 70–75, **still projects on week view day 0 when now is mid-day**: untimed projection days `['1970-01-01','1970-01-02']` → `[]`. Allowed R3. Timed month-range/two-day-range tests at 131–162 unchanged.
18. `scheduled-repeat-projection-dedup.spec.ts:212–215`, untimed **shows only the concrete instance, not the projection**: count 1 → 0; remove first ID `U1`; retain no-RepeatProjection assertion. U1 has dueDay but no dueWithTime; UCFG has no startTime. Allowed R2/R3. Timed dedup expectations unchanged.
19. `wait-for-completion-repeat-projection.spec.ts:63–64`, **projects a normal untimed daily cfg on the following days**: days `WEEK.slice(1)` (Jan 2–4) → `[]`. Allowed R3. Timed and untimed wait-for-completion negative checks unchanged.

No existing test name, test case, or spec file was deleted. Some names now misleadingly describe old behavior; this is a maintenance follow-up, not a timed-behavior defect.

## New coverage and fail-on-base assessment

`no-auto-placement.spec.ts` adds eight cases: Today tasks including a long task (113–120), current untimed task (123–136), planner channel (140–145), dueDay channel (149–154), untimed recurrence (158–162), oversized day-assigned tasks and budget emptiness (165–172), exact timed placement (193–220), and equality of timed-only versus mixed input (222–237).

[INFERENCE] Base forwards the new R1 one-hour task into available flow time; R2 planner tasks enter `create-schedule-days.ts:136–150`, and dueDay tasks take the matching-day branch there; R3's daily untimed config reaches `create-view-entries-for-day.ts:98–133`. Each produces an entry that the respective absence assertions reject. These are meaningful fail-on-base cases, but no base execution was performed.

The exact R4 assertions retain day 0 task 10:00/lunch 12:00; day 1 calendar 11:00 for 30 minutes, lunch 12:00, repeat 14:00, task 16:00; day 2 lunch 12:00/repeat 14:00. Non-calendar durations are one hour. Same-day timed-repeat suppression is existing behavior. Work boundaries, midnight/multiday timed continuations, equal-start ordering and timed currentId are not independently pinned by the new fixture.

Additional test limitations, not confirmed product defects:

- The oversized R5 fixture may already have empty budget lists on base because its partially visible task is excluded from the fully-beyond list; entry absence still fails. The changed extended-spec `['T'] → []` assertion provides a genuine budget-list transition.
- Several absence checks would pass for no returned days; the first R1 and exact R4 cases protect day output for their fixtures.
- `UNTIMED_TYPES` at lines 52–61 includes `RepeatProjectionSplitContinuedLast`, also used by a timed repeat continuation, and omits `SplitTaskContinuedLast`. ID checks cover the supplied untimed fixtures; no new timed fixture crosses midnight. Do not reuse that list as a universal timed/untimed classifier.

## Findings and follow-ups

**Confirmed product defects:** none. **Suspected product defects:** none substantiated. **Unexpected changes:** none.

Follow-ups:

1. Complete the prescribed setup, schedule-spec run and `checkFile` on a permitted execution host. All seven modified TypeScript paths are listed in `target-check.txt`. No lint success or failure is inferred.
2. `map-to-schedule-days.ts:20,23–24,49–65`: `currentId` is now unused. `unScheduledTaskRepeatCfgs` and `plannerDayMap` no longer affect placement but still participate in the early-empty guard; they are not wholly unread parameters. Leave API cleanup to a separately scoped change unless lint reports a problem, as requested.
3. Align stale spec names with their new assertions; consider the specific edge-coverage limitations above without expanding this minimal production repair.

No persisted-model, NgRx write, sync wire, plugin API, translation, dependency or settings changes occur. Upstream flow code is intentionally retained to reduce merge cost. Local view mapping does not introduce cross-client persisted semantics.
