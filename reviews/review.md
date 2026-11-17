# Review of AO-134 — schedule view: no automatic placement of untimed items

- Target: `ao/AO-134` at `04003d364f2ddbffcbbac0d909a522359eebd779` (single commit
  `04003d364 feat(schedule): stop auto-placing untimed items in the schedule view`)
- Acceptance revision / brief: `1435efa96c2debc8e99305bead8d2e69ee259f30`,
  `tasks/01-schedule-no-auto-placement.md` (R1–R6)
- Reviewer: AO-135 (Claude Opus 5.5), method: ordinary. I did not read the builder report or `reviews/`
  of AO-134 before this assessment.
- Full commands and output: `reviews/target-check.txt`.

## Headline

**Karma could not run in this sandbox.** `ng test` is killed during the esbuild build with exit 137,
even for one spec file. The kill happens with about 2.7 GB still reported free, so the cause is the
sandbox memory cap. The esbuild goroutine dump follows the kill. Following brief item 2 and the
operator's ruling (operator-i90 in reply to AO-135-i1), every requirement whose evidence needs a spec
run is **not exercised**, and so is item 3 (the base runs). No Karma pass is claimed.

Evidence that does not depend on a spec run:

- source reading, with file:line below;
- the test-name and expectation diff;
- scope and protected-input diffs;
- `npm run checkFile` (all 13 files pass);
- a targeted static `tsc` (0 errors in schedule files).

Before the operator ruled out workarounds, I also ran the unchanged spec files with jasmine-core in
Node (esbuild bundle, TZ=Europe/Berlin), plus a base-vs-candidate differential probe. Those results are
in `target-check.txt` under "SUPPLEMENTARY, NOT A SPEC PASS". They agree with the source reading.
Requirement status does not rest on them.

## Change in one paragraph

`createScheduleDays` (`create-schedule-days.ts:10-46`) no longer takes untimed input. Per day it renders
only that day's blocker blocks via `createViewEntriesForDay` → `createViewEntriesForBlock`
(`create-view-entries-for-day.ts:12-13`). It drops any entry that starts after the day ends, with
`Log.err` (`:24-38`), and returns `beyondBudgetTasks: []` (`:44`). `mapToScheduleDays` no longer
computes `nonScheduledTasks` and the current-task reorder; it calls `createScheduleDays(dayDates,
blockerBlocksDayMap)` (`map-to-schedule-days.ts:92`).

These are deleted: the flow helpers `create-schedule-view-entries-for-normal-tasks.ts`,
`insert-blocked-blocks-view-entries-for-schedule.ts` and `get-tasks-within-and-beyond-budget.ts`; the
type guards `isFlowableEntryVE`, `isTaskDataType` and `isContinuedTaskType`; and `SCHEDULE_FLOW_TYPES`.
No remaining importer of any of them exists (grep over `src`, `packages`, `electron`, `e2e`).

## Requirements

| Req | Status | Basis |
|---|---|---|
| R1 | not exercised | Met by source reading; no Karma run |
| R2 | not exercised | Met by source reading; no Karma run |
| R3 | not exercised | Met by source reading; no Karma run |
| R4 | not exercised | Met by source reading; no Karma run |
| R5 | not exercised | Met by source reading; no Karma run (component specs could not load anywhere) |
| R6 | not exercised | Spec content reviewed; the "fails on master" run (item 3) not done under Karma |

**R1** (untimed Today task gets no slot): `tasks` is only used in the empty-input early return
(`map-to-schedule-days.ts:63`). Untimed tasks never reach `createScheduleDays`, which renders only
`blockerBlocksDayMap[dayDate]` (`create-schedule-days.ts:19-22`). Timed tasks reach the blocker map
only through `scheduledTasks` (`createBlockedBlocksByDayMap`, unchanged). `currentId` is no longer used
either, so the old current-task-first reorder is gone.

**R2** (planner and `dueDay`-only tasks get no slot): `plannerDayMap` is only read for the early
return (`plannerDayKeys`). The `dueDay` and `plannedForDay` handling (`isDayAssignedTask`,
`asPlannedForDayTask` and so on) is deleted with the flow path.

**R3** (untimed repeat projections get no slot; timed unchanged): `unScheduledTaskRepeatCfgs` is only
used in the early return. `createViewEntriesForNonScheduledRepeatProjections` is deleted. Timed cfgs
still flow `scheduledTaskRepeatCfgs` → `createBlockedBlocksByDayMap` → `ScheduledRepeatProjection` /
`RepeatProjectionSplitContinuedLast` entries (`create-view-entries-for-block.ts`, unchanged).

**R4** (timed items unchanged):

- The blocker pipeline (`create-sorted-blocker-blocks.ts`, `create-blocked-blocks-by-day-map.ts`,
  `create-view-entries-for-block.ts`) is untouched.
- In base, with no flow entries, `insertBlockedBlocksViewEntriesForSchedule` only appended each
  block's entries, and the final sort is the same (`SCHEDULE_VIEW_TYPE_ORDER` tie-break kept).
- With flow entries present, base moved only flow entries. `moveEntries` / `moveAllEntriesAfterTime`
  shift only `isFlowableEntryVE`. Timed `ScheduledTask`, `ScheduledRepeatProjection`, calendar and
  lunch entries were never moved.
- The candidate's own R4 specs pin absolute positions, not only base-equals-candidate.
- Rewritten specs keep every timed expectation (`ScheduledTask`, `ScheduledRepeatProjection`,
  `LunchBreak`, calendar) unchanged.
- Supplementary only: the Node differential probe compared timed entries (id, type, start, duration,
  day) on base and candidate across 18 scenarios. These covered a midnight-spanning timed task, a 30 h
  multi-day task, a midnight-spanning timed repeat, a calendar event across midnight, the DST switch,
  work+lunch versus default hours, now at 00:00 / 02:00 / 09:00 / 15:37, a +4 h start-of-next-day
  offset, and runs with and without untimed items. Every scenario was identical.

**R5** (beyond-budget empty; view does not break):

- `beyondBudgetTasks: []` is hard-coded (`create-schedule-days.ts:44`), so
  `mapScheduleDaysToScheduleEvents` yields empty `beyondBudgetDays`
  (`map-schedule-days-to-schedule-events.ts:18`).
- `monthEvents = events().concat(...[])` (`schedule.component.ts:328`) stays well-defined.
- `schedule-day-page.ts:27,33`: `hasBeyondBudgetEvents` is false and `hasNoEvents` depends on the
  visible events alone.
- The week header's beyond-budget badge renders only when `count > 0`
  (`schedule-week.component.html:15`).
- `isBeyondBudget` is never set on an entry any more, so the event tooltip and styling stay off.
- Result: no empty beyond-budget UI is left behind. No template change was needed, and none was made.

**R6** (specs): see "Removed or weakened tests". The new `no-auto-placement.spec.ts` has R1 (2 cases),
R2 (2), R3 (1), R5 (1) and R4 (2) cases. The R1–R3 cases assert outcomes that base produces
differently by construction (base flows these tasks), so they should fail on base. This was not shown
under Karma.

## Removed or weakened tests

Base versus candidate test names are in `target-check.txt`. Every removed or rewritten expectation
encoded untimed flow placement, which R6 allows. I found none that covered timed behaviour.

- `create-schedule-view-entries-for-normal-tasks.spec.ts` (3 tests, deleted with its unit): it laid out
  untimed tasks back to back from a start time. Pure flow.
- `insert-blocked-blocks-view-entries-for-schedule.spec.ts` (6 tests, deleted with its unit): it split
  or moved flow tasks and projections around blocks (#10194 "tiny slice"). Pure flow. Inserting a
  block without flow entries is covered by `create-view-entries-for-block.spec.ts` (unchanged) and the
  new `create-schedule-days.spec.ts`.
- `create-schedule-days.spec.ts`: 18 tests replaced by 3 tests of the new signature. The removed ones
  covered week-window filtering of untimed, `dueDay` and planner tasks. The two "Tasks with
  dueWithTime" cases fed a `dueWithTime` task in as a *non-scheduled flow task* directly into the old
  `createScheduleDays`. That bypassed `mapToScheduleDays`, which always filtered timed tasks out of
  the flow, so they tested the flow filter, not real timed placement. Allowed.
- `map-to-schedule-days-extended.spec.ts`: removed the #10194 "tiny slice before work end" block
  (untimed and `dueDay` tasks) and the three untimed `RepeatProjection` expectations. The timed entries
  of the remaining test are unchanged.
- `map-to-schedule-days.spec.ts` (14 tests kept, 1 renamed): only untimed `Task`, `SplitTask*`,
  `TaskPlannedForDay`, `RepeatProjection*` entries were deleted. Each change has a comment, and
  `entries.length` counts were lowered to match. The renamed
  "should keep every segment of a flow projection pointing at its own occurrence day" became "not
  placed". Its subject (an untimed projection's `sourceOccurrenceDate`) no longer exists. Timed
  `sourceOccurrenceDate` on `ScheduledRepeatProjection` entries is still asserted ("spit around
  scheduled repeat task cases", "should work for an example with all the stuff"). I checked
  "should work for very long scheduled tasks" in base: its removed day-2 entry (09:00, 1 h) was the
  untimed N1 being flowed, not a timed continuation (S1 runs 09:00–18:00 and does not cross midnight).
  So removing it is allowed.
- `month-view-repeat-projection-day.spec.ts`, `wait-for-completion-repeat-projection.spec.ts`,
  `scheduled-repeat-projection-dedup.spec.ts` (untimed half): rewritten to expect no untimed
  projection. The timed halves (`ScheduledRepeatProjection` dedup, timed `waitForCompletion`) are
  unchanged.
- `invalid-schedule-cfg-clock-string.spec.ts`: the #5358 guard moved from `createScheduleDays`, whose
  work-start parsing was deleted, to `mapToScheduleDays` with an empty work start. That is still a
  meaningful no-throw check, because `createBlockedBlocksByDayMap` parses the config. Not weakened.

## Findings

**Confirmed defects:** none.

**Suspected (low, not demonstrated):**

1. `create-schedule-days.ts:25-35`: an entry that starts after its day's end is now dropped with
   `Log.err` for every type. Base pushed `SplitTaskContinuedLast` / `RepeatProjectionSplitContinuedLast`
   entries to the next day instead. Blocker entries are keyed by their own day, so this should not be
   reachable. The probe, including the +4 h start-of-next-day offset, never hit it, but I have no
   Karma evidence for unusual offsets.
2. `no-auto-placement.spec.ts:52-61`: `UNTIMED_TYPES` includes `RepeatProjectionSplitContinuedLast`,
   which is also the type of a *timed* repeat's after-midnight tail
   (`create-view-entries-for-block.ts`). `expectNoUntimedPlacement` would therefore fail on a future
   case that includes a midnight-spanning timed repeat. This is a test-precision nit, not a product
   defect. Relatedly, no spec at the `mapToScheduleDays` level covers midnight-spanning or multi-day
   timed items, in base or in candidate. That splitting is pinned one level down, in the unchanged
   `create-blocked-blocks-by-day-map.spec.ts` (`ScheduledTaskSplit`). No such test was removed, but
   adding one would make the R4 pin complete.

**Follow-ups (dead code, not defects):**

- `mapToScheduleDays` keeps the now-unused parameters `tasks` (except the early return),
  `unScheduledTaskRepeatCfgs`, `currentId` and `plannerDayMap`. `ScheduleService`
  (`schedule.service.ts:107-121`) still computes them.
- `ScheduleDay.beyondBudgetTasks`, `beyondBudgetDays` mapping, the `schedule-week` badge /
  `beyondBudgetStats`, `isBeyondBudget` tooltip and SCSS, and the related translation key are now
  unreachable. Removing them was out of scope by the brief (no translation changes).
- `SVEEntryForNextDay` (`schedule.model.ts:112`) and the never-produced `SVEType` flow values
  (`Task`, `SplitTask`, `TaskPlannedForDay` …) remain.
- Store screenshots and the video scenarios (`e2e/store-screenshots`, `e2e/store-video`) will show
  fewer schedule events. The schedule e2e tests I read seed timed tasks by clicking the grid; the
  #5358 e2e test only needs a non-empty input and still works.
- **Run the schedule specs under Karma** (`npm run test:file` for `src/app/features/schedule/`) on a
  host with enough memory before merging. Do the same against base for the new R1–R3 cases.

## Unrequested changes

None. Every change is under `src/app/features/schedule/`. Persisted models, NgRx, sync / op-log,
plugin API and translations are untouched (empty diff outside the schedule folder).

## Protected inputs and test loading

No change between base and candidate in `tasks/`, `scripts/check*`, `AGENTS.md`, `CLAUDE.md`,
`aos-*.toml`, `src/karma.conf.js`, `angular.json`, `tsconfig*.json`, `src/tsconfig*.json` or
`src/test.ts`. The test-loading config is unchanged. New specs follow the `*.spec.ts` naming and sit
under `src/`, so Karma's default include picks them up.

## Limitations

- No Karma or ChromeHeadless run (exit 137, memory cap). So there is no spec pass/fail/skip summary
  for any requirement, and item 3 (new specs failing on base) is not exercised.
- Full `tsc -p src/tsconfig.spec.json` was also killed (137). The targeted `tsc` (ts-patch plugins
  disabled) found 0 errors in schedule files. Its 23 errors elsewhere are the same set as on base.
- The supplementary Node runner and probe are not Karma or Chrome, use shims, and cannot load
  component specs. They were run before the operator's ruling and are recorded only for transparency.

## Verdict

**accept with follow-ups.** By source reading, the change does exactly what R1–R5 ask, keeps the
timed path untouched, and removes the dead flow path without touching anything outside
`src/app/features/schedule/`. The test rewrites remove only flow expectations. The main follow-up is
mandatory: run the schedule specs under Karma, and the new R1–R3 cases against base, on a host that
can build them. If those fail, this verdict does not hold.
