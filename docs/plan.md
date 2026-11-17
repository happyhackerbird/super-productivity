# Plan

## Coordinator record

Owner: the bus lease (coordinated repository, server route); this record is the durable state.
Last mutation: 2026-11-17 ~17:30 UTC: event 97 (AO-135 question AO-135-i1: Karma killed in the sandbox, exit 137, memory cap) answered from the brief's item 2 (operator-i90): no workaround, affected requirements "not exercised", finish the source review and deliver. Event 98 (job 57, record push 7df76363) closed. AO-135 still running (r1, claude).
Next safe action: wait for the review task. Expect R1-R4 spec evidence "not exercised" (Karma does not run in the sandbox); then the recommendation stays closed and the operator decides how specs get run (e.g. on a host with more memory, or a sandbox memory change). Bring that question with the review result. When it delivers: read reviews/review.md and target-check.txt on its branch, save `reviews/AO-134.md`, record push, then `aos integrate AO-134 --wait`, then `aos accept-request AO-134 --memo-file ...`; the memo must carry the section "For the AO-134 accept memo" below (deletion size, upstream-merge cost vs a minimal change, dead beyond-budget UI) stated plainly. If the reviewer could not run Karma, R1-R5 are "not exercised" and the recommendation stays closed; report to the operator.

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
| 2026-11-17 16:10 | Delivery check for the implementation | Repo default command (`test:tools` after package builds), as for AO-11; Angular specs evidenced in the worker report and re-run by the reviewer | Karma needs ChromeHeadless, unverified in the sandbox; an environment failure would burn the single attempt. No proof pipeline per operator (Q2) | Review verdict per R1-R6 with spec output |

### Assignments
| Task | Stage | Brief (path @ commit) | Depends on | Acceptance | Run | State | Candidate / result | Evidence |
|---|---|---|---|---|---|---|---|---|
| AO-134 | implementation (claude, server, headless; requires merge-check + review) | `tasks/01-schedule-no-auto-placement.md` @ 03b366cc | — | repo workflow `test_command` (empty `--accept`) | r1, r2 | r1 failed 2026-11-17 16:10:07: environment, the worker Claude account hit its session limit (run report: harness exit 1 after 16 s, "You've hit your session limit"); no work done. r2 requeued 16:13:40 after the operator moved the worker provider to another account (event 91) | — | bus events 89, 91 |
| AO-134 | (cont.) r2 | | | | r2 | review 2026-11-17 16:53 (verdict pass on the workflow `test_command`); event 93 | `ao/AO-134` @ 04003d364f2ddbffcbbac0d909a522359eebd779, base 1435efa96c2d, one commit, 18 files under `src/app/features/schedule/` (+425/-2565; deletes the flow-placement path and its specs, adds `no-auto-placement.spec.ts`) | Coordinator step-6 (17:00): locked/config paths (tasks, scripts/check*, aos-*.toml, AGENTS.md, CLAUDE.md, package*, angular.json, karma, eslint, docs) untouched; removed exports have no remaining references in `src/`. Branch is not in the coordinator mirror; read from the GitHub fork. Worker report not readable from this turn (bus API call not permitted); the reviewer must judge independently anyway. Merge check not yet run (after the record push that follows the review). |
| AO-135 | independent review (claude, server, headless; `--reviews AO-134`) | `tasks/02-review-AO-134.md` @ 326e06a1 | AO-134 candidate 04003d36 | `python3 scripts/check_review.py --target 04003d36… --acceptance 1435efa9… --feature schedule-no-auto-placement` | r1 | running; question AO-135-i1 (17:22, Karma build killed, exit 137 sandbox memory cap) answered 17:30 from brief item 2 (event 97) | — | Same model family as the build (claude): the only exercised review harness (methods.md); say so in the recommendation |

Attempts used: 1 of 1 implementation (r2 delivered; r1 was an environment failure the operator ruled does not count, event 91) + 1 of 1 review (being commissioned). Repairs used: 0 of 1. Max 2 concurrent.

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

### Proof on main
| Feature | Files | Commit | Author task / run | Attack task / run | Attack record |
|---|---|---|---|---|---|

### Open questions
| Id | From | Question | Owner | Answer (when) |
|---|---|---|---|---|
| Q1 | coordinator | Scope of "nothing scheduled automatically". Besides untimed Today tasks, the same flow-placement also puts into time slots (a) tasks planned for a specific day in the planner without a time (`plannerDayMap`, create-schedule-days.ts:136-150), (b) tasks with a due day but no time (`task.dueDay`, :144-146), and (c) untimed recurring-task projections (`repeatCfgsToProjectForDay`, :175-191). Recommendation: all of them leave the time slots ("only items with an explicit time"); timed repeat projections, timed tasks and calendar events stay. The "beyond budget" lists then stay empty. | operator | all three out, as recommended (event 86, 2026-11-17) |
| Q2 | coordinator | Allowance. Proposal: one implementation task (claude, server, headless, `--require merge-check --require review`; the implementer writes the unit specs, as for AO-11) plus one independent review task; 1 repair; max 2 concurrent; stop and report on a brief gap. Alternative with stronger proof: separate acceptance-author and attack tasks first (+2 runs). | operator | proposal as stated, no extra author/attack runs (event 86, 2026-11-17) |
| Q3 | coordinator | AO-134 r1 failed about 2 min after start, with no commit and no report: probably the environment (sandbox, login or image), not the work. The coordinator user cannot read the run log or the sandbox state (`aos show` gives only status=failed, stage=cleanup). Needed: the cause from the run log on the server, and whether a re-run after the fix counts against the single attempt from Q2. Recommendation: treat an environment failure as not using up the attempt; one `aos requeue AO-134 --ready` once the cause is fixed and recorded. | operator | Cause: the worker Claude token hit its session limit. The worker provider was moved to another account. Requeue unchanged; this retry does not count as the repair (event 91, 2026-11-17). Correction: the full JSON from `aos show AO-134` does include the run report. |

### Handovers
- 2026-11-17 ~16:00 UTC: headless coordinator turn reconstructed: no prior record, no open tasks for
  this goal, no duplicates created. Event 83 had been escalated by turns; 84 is the same message.
