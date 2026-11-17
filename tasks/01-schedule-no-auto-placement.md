# 01 – Schedule view: no automatic placement of untimed items

## Goal (operator, bus events 83/84/86, 2026-11-17)

In the Schedule view nothing is placed automatically. Only items with an explicit time (tasks with
`dueWithTime`, timed recurring-task projections, calendar events and other existing blocker
blocks such as work-start/end and lunch) appear in time slots. No replacement list, no new UI;
manual scheduling stays exactly as it is.

Operator decision Q1 (event 86): all three of these are no longer placed into time slots:

1. untimed tasks from the Today list (today: flowed into free slots),
2. untimed tasks planned for a day in the planner (`plannerDayMap`) and untimed tasks with a
   `dueDay` but no time,
3. untimed projected recurring tasks (repeat configs without a start time).

Consequence the operator accepted: the "beyond budget" lists (`beyondBudgetTasks` /
`beyondBudgetDays`) stay empty.

## Pointers (coordinator's reading of master @ 47b220343; unverified, confirm against the source before building on them)

- `src/app/features/schedule/map-schedule-data/map-to-schedule-days.ts` ~line 74: `nonScheduledTasks`.
- `src/app/features/schedule/map-schedule-data/create-schedule-days.ts`: `flowTasksLeftAfterDay`
  (line 39 onward), `plannerDayMap` / `dueDay` handling (~136-150), `getTasksWithinAndBeyondBudget`,
  `repeatCfgsToProjectForDay` (~175-191), `beyondBudgetTasks`.
- `src/app/features/schedule/map-schedule-data/create-view-entries-for-day.ts`:
  `createScheduleViewEntriesForNormalTasks`.
- Consumers of the beyond-budget output: `map-schedule-days-to-schedule-events.ts`,
  `schedule-day-page.ts`, `schedule/schedule.component.ts` (`monthEvents`).

## Repair r3 (operator decision, bus event 104, 2026-11-17) — supersedes the reject note and anything below that conflicts

Candidate 04003d36 deleted and rewrote the upstream flow-placement code. The operator chose the
minimal change instead, so future upstream edits to those files merge cleanly. R1-R4 and R6 stand;
the constraint "prefer removing the dead flow-placement path" is withdrawn.

1. Restore every file under `src/app/features/schedule/` that 04003d36 changed or deleted to be
   byte-identical to base `1435efa96c2debc8e99305bead8d2e69ee259f30`
   (`git checkout 1435efa96c2d -- <paths>`), except the files allowed in 2 and 3. The upstream
   mapping units (`create-schedule-days.ts`, `create-view-entries-for-day.ts`,
   `insert-blocked-blocks-view-entries-for-schedule.ts`,
   `create-schedule-view-entries-for-normal-tasks.ts`, `get-tasks-within-and-beyond-budget.ts`,
   `is-schedule-types-type.ts`, schedule model/const files), their own unit specs and the
   beyond-budget UI stay byte-identical to base. No spec file is deleted.
2. Production change only in `src/app/features/schedule/map-schedule-data/map-to-schedule-days.ts`
   (about 10 lines): stop passing untimed tasks, `unScheduledTaskRepeatCfgs` and `plannerDayMap`
   into `createScheduleDays` (pass `[]`, `[]`, `{}`). Timed tasks, timed repeat projections,
   calendar events and work/lunch blockers must be placed exactly as before (R4). If that changes
   any timed entry, or another production file must change, stop and report.
3. Specs: one new spec file for R1, R2, R3 (each must fail on base) and R4 (pins timed placement),
   driven through `mapToScheduleDays`. In existing specs that call `mapToScheduleDays` (e.g.
   `map-to-schedule-days.spec.ts`, `map-to-schedule-days-extended.spec.ts`,
   `month-view-repeat-projection-day.spec.ts`, `wait-for-completion-repeat-projection.spec.ts`,
   `scheduled-repeat-projection-dedup.spec.ts`) adapt only expectations that encode untimed
   placement through `mapToScheduleDays`; timed expectations keep their values. List each changed
   expectation and why. Specs that test the upstream units directly are not changed.
4. R5 now reads: `beyondBudgetTasks` / `beyondBudgetDays` are empty because nothing untimed reaches
   `createScheduleDays`; leave the beyond-budget UI as it is.
5. Check before committing: `git diff --stat 1435efa96c2d HEAD -- src` lists only
   `map-to-schedule-days.ts`, the new spec and the `mapToScheduleDays`-level specs from 3.
6. Evidence as below: `npm run checkFile` on modified `.ts`; attempt the Karma runs and, if the
   sandbox kills them (exit 137), say so plainly and never claim a pass (the operator runs the
   schedule specs on another host). Report the candidate commit.

## Requirements

- R1 An untimed task in the Today list produces no schedule view entry in any time slot, on any day.
- R2 An untimed task planned for a day (planner) and an untimed task with only a `dueDay` produce
  no time-slot entry on that day or any other.
- R3 An untimed recurring-task projection produces no time-slot entry. Timed repeat projections
  are unchanged.
- R4 Unchanged: tasks with `dueWithTime`, timed repeat projections, calendar events and the other
  existing blocker blocks are placed exactly as before (same start, duration, day).
- R5 `beyondBudgetTasks` / `beyondBudgetDays` are empty for all inputs; the view does not break on
  that (no error, no leftover empty "beyond budget" UI that was only there for untimed tasks — if
  removing such UI would be more than a trivial template/condition change, stop and report instead).
- R6 Unit specs: update the existing specs under `src/app/features/schedule/` whose expectations
  encode the old auto-placement, and add specs that would fail on master for R1, R2 and R3 and
  that pin R4. For each removed or rewritten expectation, say in the report why.

## Constraints

- Change only the schedule view mapping and, if needed, its direct consumers in
  `src/app/features/schedule/`. No persisted-model, NgRx state, sync/op-log, plugin API or
  translation change is expected; if you find one is needed, stop and report.
- Prefer removing the dead flow-placement path over leaving unused code, but keep the change small
  and readable; do not refactor unrelated schedule code.
- Follow `CLAUDE.md`/`AGENTS.md` (lint, `npm run checkFile` on every modified `.ts`/`.scss`).

## Verification the result must carry

- The output of `npm run test:file` (or `ng test --watch=false --include`) for every spec under
  `src/app/features/schedule/` you touched, plus the full set under
  `src/app/features/schedule/map-schedule-data/`, with pass/fail counts. If the sandbox cannot run
  the Karma/Chrome tests, say so plainly with the error; do not claim they pass.
- The output of `npm run checkFile` on all modified files.
- The delivery check of this task is the repository's default command (`npm run test:tools` after
  the package builds); it does not run the Angular specs, so the evidence above is required.

## Return

- The candidate commit on your branch.
- A report: per requirement R1–R6, what changed and the evidence; every spec expectation removed or
  changed and why; anything you noticed but left alone.

## Runtime and method

Claude Code, server sandbox, headless, unattended. No subagent method required.

If a test contradicts this brief, or something you need is missing, stop and say so in your report. Do not work around it.

Leave existing code outside this task as it is.
