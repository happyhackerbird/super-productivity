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
