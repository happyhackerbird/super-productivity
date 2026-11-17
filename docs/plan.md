# Plan

## Coordinator record

Owner: the bus lease (coordinated repository, server route); this record is the durable state.
Last mutation: 2026-11-17 ~19:15 UTC: event 115: AO-136-r2 delivered (`ao/AO-136` @ 935e2f92, accept with follow-ups; R1-R5 met by source, R6 not exercised; no runtime: `npm ci` stopped, no Karma, no checkFile). Judged and recorded in `reviews/AO-134.md`.
Next safe action: after this record push: `aos record-check AO-134 review --commit 1f73dce3…` (AO-136), `aos integrate AO-134 --wait`, `aos accept-request AO-134` (memo names the missing checkFile). Then `--close-only` accept requests for AO-135 (superseded) and AO-136. Wait for the `accept-settled` event.

### Goal and authorization
- Outcome (operator message, bus events 83 and 84, 2026-11-17): in the Schedule view nothing is
  placed automatically. Tasks from the Today list without a scheduled time must no longer be put
  into free time slots. Only items the user scheduled by hand (an explicit time) appear in time
  slots. No replacement list, no new UI; manual scheduling stays as is. Cover the change with tests.
- Pointers the operator gave: `src/app/features/schedule/map-schedule-data/create-schedule-days.ts`
  (`nonScheduledTasks` -> `flowTasksLeftAfterDay`) and `create-view-entries-for-day.ts`
  (`createScheduleViewEntriesForNormalTasks`).
- Constraints: schedule view mapping only; no persisted-model, sync or plugin API change expected
  (to be confirmed by the implementer and reviewer).
- Authorized: repo super-productivity, the change itself. Allowance (Q2, event 86): one
  implementation task (claude, server, headless/unattended, worker writes the unit specs), one
  independent review task, at most one repair, at most two tasks at once; no acceptance-author or
  attack tasks. Stop and report on a brief gap.
- Needs a fresh yes: accept/merge, scope change, more attempts than Q2 grants, anything outward.

### Decisions
| When (UTC) | Question | Route and method (version) | Why not simpler | What permits the next step |
|---|---|---|---|---|
| 2026-11-17 16:00 | Is the brief finishable now? | Implementation task after operator answers Q1/Q2; no assessment/design task | The operator located the code path; the remaining unknown is a product scope question, not a technical one | Operator answers Q1 and Q2 |
| 2026-11-17 17:25 | Model for non-implementation tasks (operator, event 96) | From now on review, assessment, test attack and acceptance authoring may run `--harness pi --model openai-codex/gpt-6-astra` or `openai-codex/gpt-6.1-sol` (`aos add --model`). gpt-6.1-sol is unproven on this worker: on a model failure fall back to gpt-6-astra and say so. Implementation stays claude. AO-135 is not restarted | Operator instruction; spares the Claude limit and gives review a different model family | Applies to the next commissioned non-implementation task (e.g. a re-review after a repair) |
| 2026-11-17 18:00 | AO-134 approach: deletion (04003d36) or minimal change (operator, event 104) | Repair 1 of 1: change only `map-to-schedule-days.ts` so that untimed tasks, untimed repeat configs and planner days no longer go into `createScheduleDays`. The upstream mapping files and their specs stay untouched; a new spec covers R1-R3 and R4. Brief amended (section "Repair r3"). Re-review on pi / openai-codex/gpt-6-astra | Operator's choice: keeps upstream merges clean (see the accept-memo section) | AO-134-r3 candidate in `review` |
| 2026-11-17 18:00 | How the schedule specs are run (Q4, operator, event 104) | Option (b): the operator runs the schedule specs on their Mac against the new candidate, and the new R1-R3 specs against base, then sends the summary lines. No extra test-only run, and no waiting for a sandbox memory change | Operator's choice | Operator's summary lines recorded in `reviews/AO-134.md` |
| 2026-11-17 18:47 | AO-136 retry and fallback (operator, event 111) | Requeue AO-136 once, unchanged (environment failure, not counted). If it fails again on the model or the login, switch the re-review to the claude harness and record it, without asking again | Operator instruction | AO-136-r2 outcome |
| 2026-11-17 16:10 | Delivery check for the implementation | Repo default command (`test:tools` after package builds), as for AO-11; Angular specs evidenced in the worker report and re-run by the reviewer | Karma needs ChromeHeadless, unverified in the sandbox; an environment failure would burn the single attempt. No proof pipeline per operator (Q2) | Review verdict per R1-R6 with spec output |

### Assignments
| Task | Stage | Brief (path @ commit) | Depends on | Acceptance | Run | State | Candidate / result | Evidence |
|---|---|---|---|---|---|---|---|---|
| AO-134 | implementation (claude, server, headless; requires merge-check + review) | `tasks/01-schedule-no-auto-placement.md` @ 03b366cc | — | repo workflow `test_command` (empty `--accept`) | r1, r2 | r1 failed 2026-11-17 16:10:07: environment, the worker Claude account hit its session limit (run report: harness exit 1 after 16 s, "You've hit your session limit"); no work done. r2 requeued 16:13:40 after the operator moved the worker provider to another account (event 91) | — | bus events 89, 91 |
| AO-134 | (cont.) r2 | | | | r2 | review 2026-11-17 16:53 (verdict pass on the workflow `test_command`); event 93 | `ao/AO-134` @ 04003d364f2ddbffcbbac0d909a522359eebd779, base 1435efa96c2d, one commit, 18 files under `src/app/features/schedule/` (+425/-2565; deletes the flow-placement path and its specs, adds `no-auto-placement.spec.ts`) | Coordinator step-6 (17:00): locked/config paths (tasks, scripts/check*, aos-*.toml, AGENTS.md, CLAUDE.md, package*, angular.json, karma, eslint, docs) untouched; removed exports have no remaining references in `src/`. Branch is not in the coordinator mirror; read from the GitHub fork. Worker report not readable from this turn (bus API call not permitted); the reviewer must judge independently anyway. Merge check not yet run (after the record push that follows the review). |
| AO-134 | (cont.) r3 repair | `tasks/01-schedule-no-auto-placement.md`, section "Repair r3" | — | repo workflow `test_command` | r3 | review 2026-11-17 18:11 (verdict pass on the workflow `test_command`; run started from main 5df3e19c); event 106 | `ao/AO-134` @ 1f73dce390f5224e98a124e10c11650e234e9c99, merge base 1435efa96c2d; two commits (04003d36 + r3 fix), net diff 7 files under `map-schedule-data/` (+285/-484): `map-to-schedule-days.ts` (passes `[]`, `[]`, `{}` into `createScheduleDays`; drops `nonScheduledTasks` and `resortTasksWithCurrentFirst`), new `no-auto-placement.spec.ts`, five `mapToScheduleDays`-level specs | Coordinator step-6 (18:15): `git diff --stat 1435efa96c2d 1f73dce3 -- src` lists only the allowed files; nothing changed outside `src`; upstream mapping units and their specs byte-identical to base; no spec file deleted. Note: a `--no-ff` merge carries the rejected 04003d36 commit in history (net diff is fine). Worker report not read (reviewer judges independently). |
| AO-136 | re-review of AO-134-r3 (pi, openai-codex/gpt-6-astra per event 96; server, headless; `--reviews AO-134`) | `tasks/03-review-AO-134-r3.md` @ a8acc967 | AO-134 candidate 1f73dce3 | `python3 scripts/check_review.py --target 1f73dce3… --acceptance 5df3e19c… --feature schedule-no-auto-placement` | r1 | added and readied 2026-11-17 18:13 (event 106; re-review authorized in event 104). r1 failed 18:15:37 (event 109): ~2.5 min, stage cleanup, no commit, no report body; cause unknown (likely environment or capability: first pi / gpt-6-astra run on this worker). Q5 answered (event 111): environment, worker OpenAI login expired (401 after 27 s), renewed 18:44 UTC; not counted. r2 requeued ~18:47. r2 review 2026-11-17 ~19:05 (delivery check pass; event 115) | `ao/AO-136` @ 935e2f92e48236eeeb2870ec956b2ae5d66b9578: accept with follow-ups; R1-R5 met (source), R6 not exercised; 0 confirmed, 0 suspected; no runtime (npm ci stopped after 11 min, exit 143) | bus events 109, 111, 115; `reviews/AO-134.md` |
| AO-135 | independent review (claude, server, headless; `--reviews AO-134`) | `tasks/02-review-AO-134.md` @ 326e06a1 | AO-134 candidate 04003d36 | `python3 scripts/check_review.py --target 04003d36… --acceptance 1435efa9… --feature schedule-no-auto-placement` | r1 | review 2026-11-17 17:28 (delivery check pass; event 100). Question AO-135-i1 answered 17:24 from brief item 2 (event 97) | `ao/AO-135` @ 7865c9bcda2fab0b889173bac9db6f806c3a293b: verdict accept with follow-ups; R1-R6 not exercised; 0 confirmed, 2 suspected low; summary in `reviews/AO-134.md` | Same model family as the build (claude): the only exercised review harness (methods.md); say so in the recommendation |

Attempts used: 1 of 1 implementation (r2 delivered; r1 was an environment failure the operator ruled does not count, event 91) + 1 of 1 review (AO-135 r1 delivered). Repairs used: 1 of 1 (AO-134-r3, event 104). Re-review of r3 authorized by the operator (event 104): AO-136, in use. Max 2 concurrent.

Earlier tasks on the bus for this repo (before this record existed): AO-8 cancelled, AO-9 cancelled,
AO-11 done (overdue-column drag into groups, single claude headless task, no proof pipeline).

### For the AO-134 accept memo (operator, event 96; coordinator's own reading of 04003d36, not the independent review)
- Size: 1435efa9..04003d36 removes 2,565 lines and adds 425. Production code: -1,043/+37 (whole
  files deleted: `insert-blocked-blocks-view-entries-for-schedule.ts` 359,
  `create-schedule-view-entries-for-normal-tasks.ts` 46, `get-tasks-within-and-beyond-budget.ts` 37;
  `create-schedule-days.ts` -405, `create-view-entries-for-day.ts` -129, `SCHEDULE_FLOW_TYPES`,
  `isFlowableEntryVE`/`isTaskDataType`/`isContinuedTaskType`). Specs: -1,522/+388 (two spec files
  deleted, five rewritten, `no-auto-placement.spec.ts` +239).
- Upstream merge cost: in the 6 months before the fork point (2026-05-17..10-10), 8 upstream
  commits touched the deleted/rewritten mapping files (#7994, #9314, #9377, #9671, #9982, #10141,
  #10209, #10689), about one every three weeks. With the candidate, each such future upstream
  commit is a modify/delete or content conflict to resolve by hand, and upstream's own specs for
  those files (which encode auto-placement) conflict too. A minimal change (in
  `map-to-schedule-days.ts`, pass no untimed tasks, no untimed repeat cfgs and an empty planner map
  into `createScheduleDays`, about 5-10 lines, plus the new spec) leaves those files byte-identical
  to upstream, so upstream edits to them merge cleanly; conflicts are then limited to those few
  lines, and upstream specs that assert auto-placement through `mapToScheduleDays` would still
  need adapting at merge (that cost is the same either way). The minimal route keeps ~1,000 lines
  of code that is unreachable in production. Judgement: for a fork that wants to keep merging
  upstream, the minimal change is materially cheaper; the deletion is cleaner only if the fork
  does not plan to track upstream in this area.
- Beyond-budget UI after the candidate: dead in production. `beyondBudgetTasks` is always `[]`
  (`create-schedule-days.ts:44`), and `map-schedule-days-to-schedule-events.ts` is the only
  producer of `isBeyondBudget` and of `TaskPlannedForDay`; nothing produces
  `SplitTaskPlannedForDay` any more. So the week header badge (`schedule-week.component.html:15-30`,
  `beyondBudgetStats`/`beyondBudgetTooltips`), the `beyondBudget` inputs in
  `schedule-day-panel.component.html:33` and `schedule.component.html:168,180`, `monthEvents`'
  concat, the `is-beyond-budget` class/tooltip and `TaskPlannedForDay`/`SplitTaskPlannedForDay`
  branches in `schedule-event.component.{ts,html,scss}`, and `schedule-week-drag.service.ts:910`
  all remain but never fire. They render nothing (the badge is behind `count > 0`), so nothing
  visible is left over; specs still feed them synthetic data. The brief (R5) allowed leaving them
  when removal is more than trivial; whether R5 is met is the reviewer's call.
- For the 1f73dce3 memo (event 113): spec evidence is the operator's Mac run (not an AOS record;
  `reviews/AO-134.md`); `npm run checkFile` not run by the operator, so cite AO-136's run of it or
  say it is missing. `origin/upstream-v20.0.0` (01ef235b57) is not on master; the candidate merges
  onto it without conflict (`git merge-tree`, coordinator check); the bus merge check covers master only.

### Proof on main
| Feature | Files | Commit | Author task / run | Attack task / run | Attack record |
|---|---|---|---|---|---|

### Open questions
| Id | From | Question | Owner | Answer (when) |
|---|---|---|---|---|
| Q1 | coordinator | Scope of "nothing scheduled automatically". Besides untimed Today tasks, the same flow-placement also puts into time slots (a) tasks planned for a specific day in the planner without a time (`plannerDayMap`, create-schedule-days.ts:136-150), (b) tasks with a due day but no time (`task.dueDay`, :144-146), and (c) untimed recurring-task projections (`repeatCfgsToProjectForDay`, :175-191). Recommendation: all of them leave the time slots ("only items with an explicit time"); timed repeat projections, timed tasks and calendar events stay. The "beyond budget" lists then stay empty. | operator | all three out, as recommended (event 86, 2026-11-17) |
| Q2 | coordinator | Allowance. Proposal: one implementation task (claude, server, headless, `--require merge-check --require review`; the implementer writes the unit specs, as for AO-11) plus one independent review task; 1 repair; max 2 concurrent; stop and report on a brief gap. Alternative with stronger proof: separate acceptance-author and attack tasks first (+2 runs). | operator | proposal as stated, no extra author/attack runs (event 86, 2026-11-17) |
| Q3 | coordinator | AO-134 r1 failed about 2 min after start, with no commit and no report: probably the environment (sandbox, login or image), not the work. The coordinator user cannot read the run log or the sandbox state (`aos show` gives only status=failed, stage=cleanup). Needed: the cause from the run log on the server, and whether a re-run after the fix counts against the single attempt from Q2. Recommendation: treat an environment failure as not using up the attempt; one `aos requeue AO-134 --ready` once the cause is fixed and recorded. | operator | Cause: the worker Claude token hit its session limit. The worker provider was moved to another account. Requeue unchanged; this retry does not count as the repair (event 91, 2026-11-17). Correction: the full JSON from `aos show AO-134` does include the run report. |
| Q4 (evidence in, event 113) | coordinator | AO-135 could not run Karma (sandbox memory cap, exit 137), so R1-R6 of AO-134 have no spec evidence and the accept recommendation is closed. How should the schedule specs (and the new R1-R3 cases against base 1435efa9) be run on 04003d36? Options: (a) operator raises the sandbox memory cap, then one re-review run (pi, gpt-6-astra per event 96) limited to the spec runs; needs a fresh yes (review allowance used). (b) Operator runs `npm run test:file` on the schedule folder on a host with enough memory and posts the summary lines; coordinator records them. Recommendation: (a), so the evidence is an AOS run. Also open from event 96: deletion vs minimal change (see accept-memo section) | operator | (b): the operator runs the specs on their Mac (new candidate; new R1-R3 specs against base). Minimal change chosen (event 104, 2026-11-17) |
| Q5 | coordinator | AO-136-r1 (re-review on pi / openai-codex/gpt-6-astra) failed ~2.5 min after start with no commit and no report body; the coordinator cannot see the run log. Needed: the cause from the server log (model route/login, pi image, sandbox), and whether a retry counts against the re-review authorization. Recommendation: fix the cause, then one `aos requeue AO-136 --ready` that does not count as an attempt (as Q3); if gpt-6-astra is not reachable on the worker, fall back to `--harness claude` (the exercised review harness), recorded as a decision | operator | Environment: worker OpenAI login expired (401 27 s into the run), renewed 18:44 UTC; not counted; requeue once unchanged; on a second model/login failure switch to the claude harness without asking (event 111, 2026-11-17) |

### Handovers
- 2026-11-17 ~16:00 UTC: headless coordinator turn reconstructed: no prior record, no open tasks for
  this goal, no duplicates created. Event 83 had been escalated by turns; 84 is the same message.
