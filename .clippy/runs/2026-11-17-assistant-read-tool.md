# Run: 2026-11-17-assistant-read-tool

Status: in-progress
Phase: investigate-design
Task: ChatGPT reads the operator's tasks through the self-hosted SuperSync /mcp (list_tasks / get_task over a plaintext read model), create_task unchanged.
Mode: auto-battle
Profile: lean
Cycles complete: 0
Branch: assistant-read-tool (from upstream-v20.0.0 @ 01ef235b57)
Dispatch models: impl opus, verify opus (clippy.config/models; brief "Settled" item 7)

## Requirements record

Operator request, verbatim (2026-11-17, session cwd freelance_bot):
"/Users/lilly/code/super-productivity/.clippy/briefs/2026-11-17-assistant-read-tool.md. run this with clippy"

The brief is the request body: `.clippy/briefs/2026-11-17-assistant-read-tool.md` (committed with this tracker; cite by section heading).

- R1 — An authenticated MCP `tools/call list_tasks` against the SuperSync `/mcp` returns the open tasks the syncing client shows for today, and answers "upcoming". (brief: Goal, Observable done-state)
- R2 — Adding tasks through the same connector keeps working as now (`create_task`). (brief: Goal)
- R3 — A caller without read access is refused. (brief: Observable done-state)
- R4 — Switching read access off removes the stored read data. (brief: Observable done-state)
- R5 — Sync encryption stays on; the read source is a separate plaintext read model of open tasks on the operator's server. (brief: Settled 2)
- R6 — Freshness is "as of the app's last sync"; the operator's client is the WEB build. (brief: Settled 3, Background)
- R7 — Task notes are not included. (brief: Settled 4)
- R8 — The server runs an image built from this fork; the run delivers a written deploy procedure and does not deploy. (brief: Settled 5, Boundaries)
- R9 — Upstream's planned names are used where they exist: `tasks:read`, `list_tasks`, `get_task`. (brief: Settled 6)
- R10 — Done-state is proven locally with the repo's `e2e:supersync` harness: a web client syncs tasks, then the MCP call returns them. (brief: Observable done-state)
- R11 — Boundaries: base `upstream-v20.0.0` @ `01ef235b57`; no edits to `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.codex/**`, `tests/acceptance/`, `tests/fixtures/`, `tasks/`, `scripts/check*`, `aos-*.toml`, `docs/plan.md`; fork-only code in new files where possible, minimal hooks in upstream files; no Contabo deploy, no live image swap, no push to origin `master`, encryption not turned off. (brief: Boundaries)

## Run notes

- Bootstrap: `git check-ignore -v .clippy/runs/x.md` exit 1 (clear); `clippy.config/` created this run; prior tracker `2026-09-28-ao-8-planner-task-groups.md` is Status COMPLETE (statiker), so this is a fresh run.
- Push hold: commits stay local until verify; the pre-push hook runs lint + full `npm test` (brief Background).

## Findings

## Design decisions

## Pin register
