# Re-review AO-134 (repair r3): schedule view, no automatic placement of untimed items

Assess the exact candidate of task AO-134 after its repair: branch `ao/AO-134` at
`1f73dce390f5224e98a124e10c11650e234e9c99`, judged against the brief
`tasks/01-schedule-no-auto-placement.md` as it stands on main at
`5df3e19cccb91fb17aa99bfe13f4720974eb58ec` (the r3 run's start revision; read its section
"Repair r3" first, it supersedes conflicting text below it). The code base the candidate changes
is `1435efa96c2debc8e99305bead8d2e69ee259f30` (the branch's merge base with main; main has moved
since only in `docs/`, `tasks/` and `reviews/`). This task has no separate acceptance proof, by
operator decision. You did not implement it. No builder conclusion is supplied; do not read the
builder's report or `reviews/` before your own assessment.

The branch carries two commits: `04003d36` (an earlier attempt that deleted the upstream
flow-placement code, rejected) and `1f73dce3` (the repair that restores it and makes the minimal
change). Judge the net result `1435efa96c2d..1f73dce3`.

## Setup

In your sandbox: `git worktree add /tmp/target 1f73dce390f5224e98a124e10c11650e234e9c99`; verify
`git -C /tmp/target rev-parse HEAD` prints it. Install as the repository's workflow does
(`npm ci --ignore-scripts`, `npx ts-patch install`, `npm run env`, then the package builds named in
`aos-workflow.toml`) and run the checks below in `/tmp/target`.

## What to check

1. Per requirement R1–R6 (with R5 as amended in "Repair r3", item 4): met, not met or not
   exercised, with the output or source lines that show it. Read the source; do not rely on spec
   names.
2. Scope of the repair (items 1, 2 and 5 of "Repair r3"):
   `git diff --stat 1435efa96c2d 1f73dce3 -- .` must list only
   `map-schedule-data/map-to-schedule-days.ts`, one new spec, and specs that call
   `mapToScheduleDays`. Confirm the upstream mapping units and their own specs are byte-identical
   to base and no spec file is deleted.
3. R4 by reading and, where you can, running: the only production change is that
   `mapToScheduleDays` passes `[]`, `[]`, `{}` instead of untimed tasks, untimed repeat configs and
   `plannerDayMap` into `createScheduleDays`. Check from the source of `createScheduleDays` and the
   blocker path whether that can change any timed entry (timed tasks, timed repeat projections,
   calendar events, work-start/end and lunch blocks; tasks spanning midnight or several days; the
   current task `currentId` ordering), e.g. whether `plannerDayMap` ever carried timed items that
   now vanish.
4. Changed expectations in existing specs: compare test names and expectations between base and
   candidate for every changed spec. For each removed or changed expectation, judge whether it
   encoded only untimed placement through `mapToScheduleDays` (allowed) or timed behaviour R4 says
   must stay (a defect).
5. Angular specs: attempt once to run `src/app/features/schedule/map-schedule-data/` with
   `npm run test:file <path>` or `ng test --watch=false --include`. The previous review sandbox was
   killed by its memory cap (exit 137); if that happens again, record the error, do not retry or
   work around it, and mark spec-only evidence "not exercised". The operator runs the specs on
   another host. Never claim a pass you did not observe.
6. R5: `beyondBudgetTasks` / `beyondBudgetDays` are empty for all inputs and the week/month views
   (`schedule.component.ts` `monthEvents`, `schedule-day-page.ts`,
   `map-schedule-days-to-schedule-events.ts`) do not break on that. Leftover beyond-budget UI is
   expected by the amended R5, not a defect. Note now-unused parameters of `mapToScheduleDays`
   (e.g. `currentId`, `unScheduledTaskRepeatCfgs`, `plannerDayMap`) as a follow-up unless lint
   fails on them.
7. `npm run checkFile` on the modified `.ts` files; keep the output.
8. Protected inputs: compare `tasks/`, `scripts/check*`, `AGENTS.md`, `CLAUDE.md`, `aos-*.toml`,
   test-loading config (`karma.conf.js`, `angular.json`, `tsconfig*.json`, `package*.json`)
   between `1435efa96c2d` and the candidate.

Method: ordinary review.

## Return

Under `reviews/` only, committed on your branch:

- `reviews/review.md`: per requirement R1..R6 (met, not met, not exercised, with the output);
  confirmed versus suspected defects with file:line; unrequested changes; removed or weakened
  tests; limitations; verdict `accept`, `accept with follow-ups` or `reject`.
- `reviews/review.json` with fields `target_sha` (`1f73dce390f5224e98a124e10c11650e234e9c99`),
  `acceptance_revision` (`5df3e19cccb91fb17aa99bfe13f4720974eb58ec`), `feature`
  (`schedule-no-auto-placement`), `verdict`, `requirements` (`{"R1": {"status": ..., "evidence":
  ...}, ...}`), `reviewer`, `method` (`"ordinary"`), `confirmed_findings`, `suspected_findings`,
  `unexpected_changes`, `protected_inputs`, `test_loading`, `limitations`.
- `reviews/target-check.txt`: checkout path, rev-parse output, both exact revisions, every command
  and its output (trim long logs to the summary lines and failures).

Delivery check: `python3 scripts/check_review.py --target 1f73dce390f5224e98a124e10c11650e234e9c99 --acceptance 5df3e19cccb91fb17aa99bfe13f4720974eb58ec --feature schedule-no-auto-placement`.
A negative verdict delivered is a successful review.

If a test contradicts this brief, or something you need is missing, stop and say so in your report.
Do not work around it.

Leave existing code outside this task as it is. No product code changes, no acceptance, merge,
push or settings changes.
