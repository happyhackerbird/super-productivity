# Plan

## Coordinator record

Owner: the bus lease (coordinated repository, server route); this record is the durable state.
Last mutation: 2026-11-17 16:56:08 UTC: `aos add` AO-135 (independent review of AO-134 @ 04003d36; brief and `scripts/check_review.py` landed at 326e06a1) and `aos ready AO-135`; event 93 closed.
Next safe action: wait for the review task. When it delivers: read reviews/review.md and target-check.txt on its branch, save `reviews/AO-134.md`, record push, then `aos integrate AO-134 --wait`, then `aos accept-request AO-134 --memo-file ...`. If the reviewer could not run Karma, R1-R5 are "not exercised" and the recommendation stays closed; report to the operator.

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
| 2026-11-17 16:10 | Delivery check for the implementation | Repo default command (`test:tools` after package builds), as for AO-11; Angular specs evidenced in the worker report and re-run by the reviewer | Karma needs ChromeHeadless, unverified in the sandbox; an environment failure would burn the single attempt. No proof pipeline per operator (Q2) | Review verdict per R1-R6 with spec output |

### Assignments
| Task | Stage | Brief (path @ commit) | Depends on | Acceptance | Run | State | Candidate / result | Evidence |
|---|---|---|---|---|---|---|---|---|
| AO-134 | implementation (claude, server, headless; requires merge-check + review) | `tasks/01-schedule-no-auto-placement.md` @ 03b366cc | — | repo workflow `test_command` (empty `--accept`) | r1, r2 | r1 failed 2026-11-17 16:10:07: environment, the worker Claude account hit its session limit (run report: harness exit 1 after 16 s, "You've hit your session limit"); no work done. r2 requeued 16:13:40 after the operator moved the worker provider to another account (event 91) | — | bus events 89, 91 |
| AO-134 | (cont.) r2 | | | | r2 | review 2026-11-17 16:53 (verdict pass on the workflow `test_command`); event 93 | `ao/AO-134` @ 04003d364f2ddbffcbbac0d909a522359eebd779, base 1435efa96c2d, one commit, 18 files under `src/app/features/schedule/` (+425/-2565; deletes the flow-placement path and its specs, adds `no-auto-placement.spec.ts`) | Coordinator step-6 (17:00): locked/config paths (tasks, scripts/check*, aos-*.toml, AGENTS.md, CLAUDE.md, package*, angular.json, karma, eslint, docs) untouched; removed exports have no remaining references in `src/`. Branch is not in the coordinator mirror; read from the GitHub fork. Worker report not readable from this turn (bus API call not permitted); the reviewer must judge independently anyway. Merge check not yet run (after the record push that follows the review). |
| AO-135 | independent review (claude, server, headless; `--reviews AO-134`) | `tasks/02-review-AO-134.md` @ 326e06a1 | AO-134 candidate 04003d36 | `python3 scripts/check_review.py --target 04003d36… --acceptance 1435efa9… --feature schedule-no-auto-placement` | r1 pending | ready 2026-11-17 16:56:08 | — | Same model family as the build (claude): the only exercised review harness (methods.md); say so in the recommendation |

Attempts used: 1 of 1 implementation (r2 delivered; r1 was an environment failure the operator ruled does not count, event 91) + 1 of 1 review (being commissioned). Repairs used: 0 of 1. Max 2 concurrent.

Earlier tasks on the bus for this repo (before this record existed): AO-8 cancelled, AO-9 cancelled,
AO-11 done (overdue-column drag into groups, single claude headless task, no proof pipeline).

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
