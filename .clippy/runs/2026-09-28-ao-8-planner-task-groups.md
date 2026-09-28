# Run: AO-8 planner plan view — unlabelled task groups by drag and drop, synced

Status: [READY]
Phase: investigate-design
Skill: statiker 0.2.104
Effort: standard
Budget: cycles 5 / rounds 2 / verify 2

## Requirement head

INTENT (operator brief, verbatim words; layout mutation: the brief's markdown headings are rendered as plain `Section:` labels so they do not parse as record headings):

Task AO-8: Planner plan view: unlabelled task groups created by drag and drop, synced
Repo: super-productivity Tier: 1 Constraints: none
Execute the task below. Commit by pathspec on the current branch. Do not push. Do not merge. Do not deploy. The acceptance commands are the requirement's check and will be re-run after you close.
Acceptance:
test -d node_modules || npm ci
npx cross-env TZ='Europe/Berlin' ng test --watch=false --include='src/app/features/planner/\*_/_.spec.ts'
npm run e2e:file e2e/tests/planner/planner-task-groups.spec.ts -- --retries=0

Section: Planner: unlabelled task groups, created by drag and drop

The run record is required.

Section: What the operator wants

In the planner's plan view, a day's list of tasks can be split into groups. A group is a run of tasks set visibly apart from the rest of the list. Groups have no label, no title and no settings; labelling is explicitly not wanted.

Creating a group is done only by drag and drop:

The operator drags a task to the end of a day's list and drops it a little apart from the last task (below it, with a gap). That starts a new group holding that task.
Today, dropping a task in that separated position opens the schedule dialog for the task. In the plan view that outcome is replaced: the drop starts a new group instead. First reproduce and record what the current drop does and where it is handled, then replace it. Scheduling a task must stay reachable by its other existing entry points.
Further tasks can be dragged into an existing group, reordered inside it, moved between groups, and dragged back out into the ungrouped list.

Section: Settled by the operator

1. Data model: yours to decide, after investigation. Read the planner feature (src/app/features/planner/), its store, and how a day's task order is stored and synced before designing. Start from docs/repository-map.md and the repo's CLAUDE.md / AGENTS.md. Record the decision and its basis. Prefer the smallest representation that survives sync.
2. Drop target: something sensible. The separated drop position at the end of the list is the trigger (see above). The exact geometry (gap zone or distance threshold) is yours; it must be hittable on purpose and hard to hit by accident, with a visible drop indicator.
3. Empty groups disappear. When the last task leaves a group (dragged out, moved to another day, completed and removed from the list, deleted), the group is gone. No empty group is ever shown or stored.
4. Groups sync. Grouping is persisted and synced across devices like the rest of planner state. Follow the repo's sync rules in CLAUDE.md (op-log, LOCAL_ACTIONS, reproduce-first for sync changes) and docs/sync-and-op-log/. Data written by this version must not break a client that does not know groups, and data without groups must load unchanged.

Section: Out of scope

Group labels, colours, collapse, or any group settings.
Any way to create a group other than drag and drop.
Groups outside the planner's plan view.
Pushing, opening a PR, or touching master.

Section: Required of the work

Unit tests for the new state logic (reducers, selectors, any migration).
A Playwright spec at e2e/tests/planner/planner-task-groups.spec.ts covering: a separated drop at the end of a list creates a group and opens no schedule dialog; a task dragged into the group joins it; dragging the last task out removes the group; grouping survives a reload.
Live verification against the running app. Green tests are supporting evidence, not the proof. Start the real app, drive the real gesture with real pointer events (mouse down, stepped moves, mouse up; no dispatched synthetic drop, no direct store calls), and save evidence under .tmp/ao-8-evidence/ (git-ignored; never commit it). Drive the lanes with whichever is easier: the Claude in Chrome tools or the repo's Playwright harness. In Chrome, work only in a tab you created, only on the local dev server's address; do not read, use or close any other tab. If a drag through the Chrome tools does not move the task after three attempts, switch to Playwright and say so in the report. The Playwright spec named above is required either way. One lane per scenario, each with a screenshot and a pass condition written down before the lane runs:
Lane 1. Baseline on master, before any edit: the separated drop at the end of a list. Record what happens (expected: the schedule dialog opens). Screenshot.
Lane 2. Same drop on the branch: a group exists, no dialog opened. Screenshot and a screen recording of the whole drag.
Lane 3. A second task dragged into the group; a task reordered inside it. Screenshot.
Lane 4. Last task dragged out: the group is gone. Screenshot.
Lane 5. Reload: grouping unchanged. Screenshot.
Lane 6. Regression: an ordinary reorder inside the ungrouped list and a drag to another day behave as on master. Screenshots of both.
Look at every screenshot yourself and say in the report whether it shows what the pass condition claims. The report lists each lane, its pass condition, the result, and the file path.
npm run checkFile <file> on every modified .ts and .scss file.
The worktree starts without node_modules; install with npm ci.
The report states what was verified by an executed check and what was only reasoned, and names anything about the gesture that needs the operator's hands to judge.

Derived requirements (problem altitude; solutions are D-lines):

R1. In the plan view, dropping a dragged task in a separated position below the end of a day's task list starts a new group on that day holding exactly that task, and opens no schedule dialog.
R2. The pre-change behaviour of that drop and the code location handling it are reproduced on the unmodified tree and recorded before any product edit.
R3. Every other existing way to schedule a task (schedule dialog from the task's own controls, drops among existing timed items) keeps working.
R4. A task can be dragged into an existing group, reordered inside it, moved between groups of the same day, and dragged back into the ungrouped list; each ends in the state the gesture shows.
R5. A group is rendered visibly apart from the ungrouped list and from other groups, with no label, title, or settings.
R6. The new-group drop target is hittable on purpose, hard to hit by accident, and shows a visible indicator while a drag hovers it.
R7. No empty group is ever shown; no empty group is stored once the state change that emptied it has been applied (drag out, move to another day, removal from the list, deletion).
R8. Grouping persists across reload and travels through the op-log to other devices like other planner state; one replay-atomic transition is one op; replayed or remote ops trigger no effects.
R9. Data written by this version does not break a client that does not know groups (state validation passes there, unknown data is inert); data without groups loads unchanged and renders exactly as before.
R10. Ordinary reorder inside the ungrouped list and drag to another day behave as on master.
R11. New state logic (reducers, selectors) has unit tests; the named Playwright spec exists and covers create-without-dialog, join, last-out-removes, reload-survives; both acceptance commands pass.
R12. Professional standard: no new root dependency; no `any`; no new setting; no local restyle of Material or shared UI; every modified .ts and .scss passes `npm run checkFile`; no user content logged; the planner day template gains no per-change-detection function calls.
R13. Customer-legible mirror: In the planner you can now split a day into groups. Drag a task below the end of a day's list, into the marked gap, and drop it: it starts a new group, set apart from the rest. Drag more tasks into a group, reorder them, move them between groups, or drag them back out. A group with no tasks left disappears by itself. Groups have no names or settings. Dropping a task below the list no longer opens the schedule dialog; scheduling is still available from the task itself. Groups are saved and sync to your other devices.

## Cycle 1

- F1 [VERIFIED] record: effort standard — write set adds an optional persisted field and one persistent action (additive, revertible by reverting its commits: met); no schema migration or version bump (met); sync conflict/transaction machinery itself untouched (met); nothing sends or spends outward (met); light is ineligible because stored shared state changes (unmet for light) — basis: planner.reducer.ts:10-15, planner.actions.ts, validation-fn.ts:49
- F2 [VERIFIED] record: preflight ok — basis: STATIKER-GIT VERDICT: {"verdict": "PREFLIGHT_OK", "route": "proceed", "tracker": ".clippy/runs/2026-09-28-ao-8-planner-task-groups.md", "ops": [], "branch": "ao/AO-8", "worktree": true}
- F3 [VERIFIED] branch ao/AO-8 HEAD equals master (both 878c9a3b4), so the unmodified worktree is the master baseline — basis: executed `git rev-parse HEAD master`
- F4 [VERIFIED] a day's order for non-today days is stored in planner.days keyed by date string as an array of task ids; today's order is stored in TODAY_TAG.taskIds and planner.days of today is not the display source — basis: planner.reducer.ts:10-15, planner.selectors.ts:181-185, planner-shared.reducer.ts:66-69
- F5 [VERIFIED] planner state is validated with typia createValidate (not the equals variant), so an extra optional property on the planner slice passes validation on a client whose model lacks it — basis: validation-fn.ts:39-49,179-180
- F6 [VERIFIED] unknown action types are tolerated by the op codec: decodeActionType returns the raw string when no code is registered and the comment names future-version actions — basis: src/app/op-log/persistence/compact/action-type-codes.ts:237-252, operation-codec.service.ts:52-53
- F7 [VERIFIED] the repo bars in-band sentinel values inside synced payloads because released clients persist them and fail validation — basis: docs/sync-and-op-log/contributor-sync-model.md section "Clearing a field"
- F8 [VERIFIED] existing planner reducers build new planner state by spreading the previous slice, so an unknown extra property survives their writes — basis: planner.reducer.ts:67-73, task-shared-helpers.ts:396-402
- F9 [VERIFIED] baseline lane 1 (unmodified tree, real pointer events: down, stepped moves, up): releasing task Gamma 70, 120 and 200 px below the bottom edge of the Today column's task list opens the schedule dialog and leaves the order unchanged; at 24 px (over the Add button) no dialog opens and the drop is an ordinary reorder; during the drag the active container is the `.scheduled-items` drop list, which stays the active container even when the pointer is outside every list — basis: executed `npx playwright test --config .tmp/ao-8-evidence/lanes/playwright.lanes.config.ts lane1`, output lines `RESULT 70 scheduleDialogVisible= true`, `RESULT 120 scheduleDialogVisible= true`, `RESULT 200 scheduleDialogVisible= true`, `RESULT 24 scheduleDialogVisible= false`; screenshots .tmp/ao-8-evidence/lane1-baseline-offset70.png and lane1-baseline-offset70-hover.png viewed by the desk
- F10 [VERIFIED] the baseline drop is handled in PlannerDayComponent.drop with targetList SCHEDULED, bound to the `.scheduled-items` cdkDropList; it calls editTaskReminderOrReScheduleIfPossible, which opens DialogScheduleTaskComponent for a task without dueWithTime — basis: planner-day.component.ts:120-132,165-181, planner-day.component.html:108-116
- F11 [VERIFIED] LWW update application is unsupported for the map storage pattern, which is PLANNER alone; every existing planner op already lives with that — basis: lww-update.meta-reducer.ts:671-679, entity-registry.ts:300-306
- F12 [VERIFIED] existing planner ops that concern one task use entityType PLANNER with entityId equal to the task id (transferTask, moveBeforeTask, planTaskForDay) — basis: planner.actions.ts:29-46,62-87
- F13 [VERIFIED] deleteTask, deleteTasks and moveToArchive do not remove ids from planner.days; stale ids are filtered at the selector and garbage-collected by the non-persistent cleanupOldAndUndefinedPlannerTasks, which also deletes the day entry of today — basis: task-shared-crud.reducer.ts:416-443, task-shared-lifecycle.reducer.ts:35-53, planner.reducer.ts:75-107, planner.selectors.ts:186-190
- F14 [VERIFIED] the work-context action moveTaskInTodayList places a task after an anchor id (null = start) in a tag's taskIds and is the today-list reorder used by the work view; its follow-up effects fire only when src or target is DONE or BACKLOG — basis: work-context-meta.actions.ts:14-32, tag.reducer.ts:230-260, work-context-meta.helper.ts:13-40, task-related-model.effects.ts:87-121
- F15 [VERIFIED] planner keyboard reorder collects rows with the selector `.normal-tasks planner-task` inside the day scope and sends display indices as moveInList raw indices — basis: planner-task.component.ts:615-670
- F16 [VERIFIED] drop lists get a dashed primary outline from the global stylesheet while a drag is in flight (classes cdk-drop-list-receiving and cdk-drop-list-dragging); no local style is needed for the indicator — basis: src/styles/components/\_overwrite-material.scss:466-477, screenshot lane1-baseline-offset70-hover.png
- F17 [VERIFIED] a SuperSync planner E2E precedent exists and Docker is reachable on this host after the desk started colima — basis: e2e/tests/sync/supersync-planner.spec.ts, executed `docker info --format '{{.ServerVersion}}'` returning 27.4.0
- D1 [COMMITTED] data model: PlannerState gains one optional field `taskGroups?: { [dayDate: string]: { [taskId: string]: string } }`, a per-day map from task id to an opaque group id; absent or empty means no groups; a group is never stored as an entity, it exists only as the value shared by member entries, so an empty group has no stored form; membership is scoped to the day key, so a task that reaches another day by any path is ungrouped there without any reducer having to know; rejected alternatives: marker ids inside planner.days (in-band sentinel, F7), boundary ids per day (meaning shifts under reorder and concurrent edits), a field on the task entity (hot model, plugin API surface) — basis: F4, F5, F7, F8, docs/sync-and-op-log/persisted-model-fields.md
- D2 [COMMITTED] group id is a creation-sortable opaque string built at the drop site as zero-padded base-36 Date.now (9 chars) plus `-` plus nanoid(6); groups of a day render in ascending string order of their id, so group order is stable under reordering of tasks and needs no stored order; the id travels in the action payload, so replay is deterministic — basis: F4, nanoid already imported in src/app/features/note/note.service.ts:12
- D3 [COMMITTED] one new persistent action `PlannerActions.setTaskGroup` (type string `[Planner] Set Task Group`) with props `{ day: string; taskId: string; groupId: string | null }`, meta isPersistent, entityType PLANNER, entityId the task id, opType Update; null clears membership (null survives JSON, undefined does not); the planner reducer writes or deletes the entry, deletes a day key left empty, deletes the taskGroups field when no day is left, ignores a groupId that is an empty string or not a string or null, and returns the same state reference on a no-op; registered as ActionType.PLANNER_SET_TASK_GROUP with compact code `LG`; no schema version bump — basis: F6, F12, contributor-sync-model.md section "Clearing a field", AGENTS.md sync rule 10
- D4 [COMMITTED] order and membership stay independent facts: a drop that changes order emits the existing order op, a drop that changes membership emits setTaskGroup, a drop that changes both emits the order op then setTaskGroup; every combination of the two is a valid renderable state because display derives from order filtered by membership, so the pair is a deliberate composition and not one replay-atomic transition; a client that does not know groups still receives and applies the order and day-move ops; creating a new group changes membership only and emits one op — basis: contributor-sync-model.md paragraph on intent versus replay-atomic transition, F6, D1, D2
- D5 [COMMITTED] display derivation lives in getPlannerDay: PlannerDay gains `ungroupedTasks: TaskCopy[]` and `taskGroups: { id: string; tasks: TaskCopy[] }[]`; normalTasks of the day are partitioned by the day's membership map in their existing order; entries whose task is not among the day's normalTasks are ignored; `tasks` keeps its meaning (all normal tasks) so estimates, counts and other consumers are unchanged; both new fields are optional on the PlannerDay interface so existing fixtures stay valid, and the template falls back to `tasks` when `ungroupedTasks` is undefined — basis: planner.selectors.ts:166-190,262-285, planner.model.ts:11-24
- D6 [COMMITTED] pruning of membership entries (R7): a pure helper removes task ids from taskGroups (all days, or one day) and is called wherever planner.days is already pruned (planner reducer handlers for scheduleTaskWithTime, unscheduleTask, moveBeforeTask, cleanupOldAndUndefinedPlannerTasks; helpers removeTaskFromPlannerDays, removeTasksFromPlannerDays, removeTasksFromSinglePlannerDay, addTaskToPlannerDay; handleTransferTask) and additionally in handleDeleteTask, handleDeleteTasks and handleMoveToArchive including sub task ids; cleanup drops taskGroups days strictly before today and entries of unknown tasks but keeps today, because today's groups are live; every helper returns the same reference when taskGroups is absent, so data without groups is untouched; residual named, not hidden: a task that leaves Today by a path touching none of these sites keeps an inert entry, never rendered, until cleanup — basis: F13, F8, planner.reducer.ts:31-107, task-shared-helpers.ts:373-520
- D7 [COMMITTED] drop geometry: inside the day column the order is ungrouped list, Add button, the groups, then a new-group drop zone; each group and the zone are separate cdkDropLists carrying the day string as data; the zone has a fixed height of one planner item and a top margin of var(--s2), is invisible at rest and shows the global dashed outline during any drag plus the drag placeholder when hovered; its size never changes with drag state, so cdk's cached rectangles stay true; a drop on the zone counts only when `isPointerOverContainer` is true, which removes the sticky-container accident seen in F9; the `.scheduled-items` list is disabled as a drop target and collapsed when the day has no scheduled items, so the old dialog outcome is gone at that position, and it stays a drop target when the day has timed items — basis: F9, F10, F16, INTENT "In the plan view that outcome is replaced"
- D8 [COMMITTED] drop planning is a pure function `planGroupDrop` returning the list of actions for a drop: inputs are the task, prevDay, newDay, today, the target (`null` for ungrouped, a group id, or a new id for the zone), the target list's displayed ids, the drop index, the raw order of newDay (planner.days of that day, or the today task ids), and the task's current group id in prevDay; it computes an after-anchor (previous member of the target list; at index 0 the raw predecessor of the first member; none for an empty target) and emits: same day and no dueWithTime: for Today `moveTaskInTodayList` with afterTaskId, src and target UNDONE, workContext TAG and TODAY id, for other days `moveInList` with raw indices, omitted when the raw order would not change or the anchor is missing from the raw order; otherwise `transferTask` with targetIndex the raw insert index and targetTaskId the raw id at that index; then `setTaskGroup` when the target group differs from the current membership in newDay — basis: F4, F14, D4, planner-shared.reducer.ts:42-160, planner.reducer.ts:111-121
- D9 [COMMITTED] regression guard by construction (R10): the ungrouped list keeps the untouched legacy drop code path whenever the target day renders no groups and the dragged task has no membership entry in its previous day; the planned path runs only when groups are involved — basis: planner-day.component.ts:120-163, D8
- D10 [COMMITTED] keyboard reorder becomes list-scoped: rows are collected from the task's own list container (the ungrouped list or its group) instead of the whole `.normal-tasks` block, and for days other than Today the indices sent to moveInList are raw indices looked up by id in planner.days; in a day without groups and without stale ids this sends the same indices as before — basis: F15, D5
- D11 [COMMITTED] documentation: one short paragraph on groups is added to docs/wiki/4.03-Planner-View.md, flagged in the close for human prose review because it is a Concepts note; no new translation key, no setting — basis: docs/documentation-guide.md
- D12 [COMMITTED] unit U1 state: model field, action and registration, reducer, pruning helper and call sites, selector partition, unit specs; precedent: follows src/app/features/planner/store/planner.actions.ts, judged sound; red-first pin: new specs planner.reducer.task-groups.spec.ts, planner.selectors.task-groups.spec.ts and planner-task-groups-prune.spec.ts fail on the current tree (action and fields do not exist) and pass only through the unit; U1 is the tracer because every later unit reads its state shape — basis: D1, D2, D3, D5, D6
- D13 [COMMITTED] unit U2 plan view: planner-day template, component and styles, planGroupDrop util with spec, keyboard scoping in planner-task, wiki paragraph, and the Playwright spec e2e/tests/planner/planner-task-groups.spec.ts driving real pointer events; precedent: follows src/app/features/planner/planner-day/planner-day.component.ts, judged sound; red-first pin: the Playwright spec fails on the tree after U1 (the separated drop opens the schedule dialog, F9) and passes only through the unit; ordering: after U1 — basis: D7, D8, D9, D10, D11
- D14 [COMMITTED] unit U3 sync proof: e2e/tests/sync/supersync-planner-task-groups.spec.ts, two simulated clients, client A creates a group by the real gesture and adds a second task, both sync, client B shows the same group with the same members and order, then A drags the last task out and B shows no group; precedent: follows e2e/tests/sync/supersync-planner.spec.ts, judged sound; red-first pin: the spec fails on the tree after U1 alone (no gesture creates a group) and is run with `npm run e2e:supersync:file`; ordering: after U2 — basis: F17, the requirement head's sync requirement, AGENTS.md reproduce-first rule
- F18 [VERIFIED] unit U1 write-set: src/app/features/planner/planner.model.ts — basis: D12
- F19 [VERIFIED] unit U1 write-set: src/app/features/planner/store/planner.actions.ts — basis: D12
- F20 [VERIFIED] unit U1 write-set: src/app/features/planner/store/planner.reducer.ts — basis: D12
- F21 [VERIFIED] unit U1 write-set: src/app/features/planner/store/planner.selectors.ts — basis: D12
- F22 [VERIFIED] unit U1 write-set: src/app/features/planner/store/planner-task-groups.util.ts — basis: D12
- F23 [VERIFIED] unit U1 write-set: src/app/features/planner/store/planner-task-groups.util.spec.ts — basis: D12
- F24 [VERIFIED] unit U1 write-set: src/app/features/planner/store/planner.reducer.task-groups.spec.ts — basis: D12
- F25 [VERIFIED] unit U1 write-set: src/app/features/planner/store/planner.selectors.task-groups.spec.ts — basis: D12
- F26 [VERIFIED] unit U1 write-set: src/app/op-log/core/action-types.enum.ts — basis: D12
- F27 [VERIFIED] unit U1 write-set: src/app/op-log/persistence/compact/action-type-codes.ts — basis: D12
- F28 [VERIFIED] unit U1 write-set: src/app/root-store/meta/task-shared-meta-reducers/task-shared-helpers.ts — basis: D12
- F29 [VERIFIED] unit U1 write-set: src/app/root-store/meta/task-shared-meta-reducers/planner-shared.reducer.ts — basis: D12
- F30 [VERIFIED] unit U1 write-set: src/app/root-store/meta/task-shared-meta-reducers/task-shared-crud.reducer.ts — basis: D12
- F31 [VERIFIED] unit U1 write-set: src/app/root-store/meta/task-shared-meta-reducers/task-shared-lifecycle.reducer.ts — basis: D12
- F32 [VERIFIED] unit U1 write-set: src/app/root-store/meta/task-shared-meta-reducers/planner-task-groups-prune.spec.ts — basis: D12
- F33 [VERIFIED] unit U2 write-set: src/app/features/planner/planner-day/planner-day.component.ts — basis: D13
- F34 [VERIFIED] unit U2 write-set: src/app/features/planner/planner-day/planner-day.component.html — basis: D13
- F35 [VERIFIED] unit U2 write-set: src/app/features/planner/planner-day/planner-day.component.scss — basis: D13
- F36 [VERIFIED] unit U2 write-set: src/app/features/planner/planner-day/planner-day.component.spec.ts — basis: D13
- F37 [VERIFIED] unit U2 write-set: src/app/features/planner/planner-day/plan-group-drop.util.ts — basis: D13
- F38 [VERIFIED] unit U2 write-set: src/app/features/planner/planner-day/plan-group-drop.util.spec.ts — basis: D13
- F39 [VERIFIED] unit U2 write-set: src/app/features/planner/planner-task/planner-task.component.ts — basis: D13
- F40 [VERIFIED] unit U2 write-set: e2e/tests/planner/planner-task-groups.spec.ts — basis: D13
- F41 [VERIFIED] unit U2 write-set: docs/wiki/4.03-Planner-View.md — basis: D13
- F42 [VERIFIED] unit U3 write-set: e2e/tests/sync/supersync-planner-task-groups.spec.ts — basis: D14
- F43 [VERIFIED] record: before the first lock, while no pin existed, the desk repaired one form defect in place: the first D14 line cited a head requirement by bare id in its basis, and two appended repair attempts were removed again; content of D14 is otherwise unchanged; from the first lock on the record is append-only — basis: sweep verdicts foreign-id-suspect at line 112 and corrects-nothing at line 138, both observed by the desk in this session
