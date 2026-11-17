# Review AO-134: schedule view, no automatic placement of untimed items

Assess the exact candidate of task AO-134: branch `ao/AO-134` at
`04003d364f2ddbffcbbac0d909a522359eebd779`, judged against the brief
`tasks/01-schedule-no-auto-placement.md` (requirements R1–R6) on main at
`1435efa96c2debc8e99305bead8d2e69ee259f30` (the run's start revision; this task has no separate
acceptance proof, by operator decision). You did not implement it. No builder conclusion is
supplied; do not read the builder's report or `reviews/` before your own assessment.

## Setup

In your sandbox: `git worktree add /tmp/target 04003d364f2ddbffcbbac0d909a522359eebd779`; verify
`git -C /tmp/target rev-parse HEAD` prints it. Install as the repository's workflow does
(`npm ci --ignore-scripts`, `npx ts-patch install`, `npm run env`, then the package builds named in
`aos-workflow.toml`) and run the checks below in `/tmp/target`.

## What to check

1. Per requirement R1–R6 of `tasks/01-schedule-no-auto-placement.md`: met, not met or not
   exercised, with the output that shows it. Read the source; do not rely on spec names.
2. Run the Angular specs: every spec under `src/app/features/schedule/` (at least
   `src/app/features/schedule/map-schedule-data/` in full, plus any schedule component spec that
   consumes `beyondBudgetTasks` / `beyondBudgetDays`), with `npm run test:file <path>` or
   `ng test --watch=false --include`. Keep the pass/fail/skip summary lines. If the sandbox cannot
   run Karma/ChromeHeadless, say so plainly with the error and mark the affected requirements
   "not exercised"; do not claim they pass.
3. Show that the new specs for R1, R2 and R3 would fail without the change: run them (or the
   relevant cases) against the base `1435efa96c2debc8e99305bead8d2e69ee259f30` and keep the output.
4. Removed or weakened tests. The candidate deletes whole spec files
   (`create-schedule-view-entries-for-normal-tasks.spec.ts`,
   `insert-blocked-blocks-view-entries-for-schedule.spec.ts`) and rewrites several others. Compare
   test names between base and candidate; for each removed or changed expectation, judge whether it
   encoded only the old auto-placement (allowed by R6) or covered timed behaviour that R4 says must
   stay unchanged (a defect).
5. R4 in particular: timed tasks (`dueWithTime`), timed repeat projections, calendar events,
   work-start/end and lunch blocks keep the same start, duration and day — including tasks that
   span midnight or several days, and the split/continued entries of timed items, if the base
   produced them.
6. R5: the schedule view, week and month (`schedule.component.ts` `monthEvents`,
   `schedule-day-page.ts`, `map-schedule-days-to-schedule-events.ts`), does not break and leaves
   no empty "beyond budget" UI for untimed tasks. Note any now-dead input (e.g. unused parameters
   of `mapToScheduleDays`) as a follow-up, not a defect, unless it breaks something.
7. Scope: no change to persisted models, NgRx state, sync/op-log, plugin API or translations; any
   change outside `src/app/features/schedule/` is an unrequested change to report. Run
   `npm run checkFile` on the modified `.ts` files and keep the output.
8. Protected inputs: compare `tasks/`, `scripts/check*`, `AGENTS.md`, `CLAUDE.md`, `aos-*.toml`,
   test-loading config (`karma.conf.js`, `angular.json`, `tsconfig*.json`) between base and
   candidate.

Method: ordinary review.

## Return

Under `reviews/` only, committed on your branch:

- `reviews/review.md`: per requirement R1..R6 (met, not met, not exercised, with the output);
  confirmed versus suspected defects with file:line; unrequested changes; removed or weakened
  tests; limitations; verdict `accept`, `accept with follow-ups` or `reject`.
- `reviews/review.json` with fields `target_sha` (`04003d364f2ddbffcbbac0d909a522359eebd779`),
  `acceptance_revision` (`1435efa96c2debc8e99305bead8d2e69ee259f30`), `feature`
  (`schedule-no-auto-placement`), `verdict`, `requirements` (`{"R1": {"status": ..., "evidence":
  ...}, ...}`), `reviewer`, `method` (`"ordinary"`), `confirmed_findings`, `suspected_findings`,
  `unexpected_changes`, `protected_inputs`, `test_loading`, `limitations`.
- `reviews/target-check.txt`: checkout path, rev-parse output, both exact revisions, every command
  and its output (trim long logs to the summary lines and failures).

Delivery check: `python3 scripts/check_review.py --target 04003d364f2ddbffcbbac0d909a522359eebd779 --acceptance 1435efa96c2debc8e99305bead8d2e69ee259f30 --feature schedule-no-auto-placement`.
A negative verdict delivered is a successful review.

If a test contradicts this brief, or something you need is missing, stop and say so in your report.
Do not work around it.

Leave existing code outside this task as it is. No product code changes, no acceptance, merge,
push or settings changes.
