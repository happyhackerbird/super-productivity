# Plan

## Coordinator record

Owner: the bus lease (coordinated repository, server route); this record is the durable state.
Last mutation: 2026-11-17 ~16:11 UTC: AO-134 r1 failed (event 89); recorded, event 89 closed, reported to the operator.
Next safe action: wait for the operator (Q3): the cause of the r1 failure and whether a re-run is allowed. Do not `aos requeue` AO-134 until its cause is recorded and fixed. After a re-run reaches review: step-6 checks (locked paths, removed specs, `aos integrate AO-134 --wait`), then one independent review task `--reviews AO-134` pinning the candidate SHA, asking it to re-run the schedule specs.

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
| AO-134 | implementation (claude, server, headless; requires merge-check + review) | `tasks/01-schedule-no-auto-placement.md` @ 03b366cc | — | repo workflow `test_command` (empty `--accept`) | r1 | failed 2026-11-17 16:10:07 (about 2 min after ready; stage=cleanup; no result commit, no worker report) | — | bus event 89 |

Attempts used: 1 of 1 implementation (r1 failed, cause unknown) + 0 of 1 review. Repairs used: 0 of 1. Max 2 concurrent.

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
| Q3 | coordinator | AO-134 r1 failed about 2 min after start, with no commit and no report: probably the environment (sandbox, login or image), not the work. The coordinator user cannot read the run log or the sandbox state (`aos show` gives only status=failed, stage=cleanup). Needed: the cause from the run log on the server, and whether a re-run after the fix counts against the single attempt from Q2. Recommendation: treat an environment failure as not using up the attempt; one `aos requeue AO-134 --ready` once the cause is fixed and recorded. | operator | open |

### Handovers
- 2026-11-17 ~16:00 UTC: headless coordinator turn reconstructed: no prior record, no open tasks for
  this goal, no duplicates created. Event 83 had been escalated by turns; 84 is the same message.
