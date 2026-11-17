# Impl plan — run 2026-11-17-assistant-read-tool (produced at [READY], cycle 6)

Four units, sequential, each run in place in the main checkout by an opus subagent (clippy.config/models: impl opus). Sequential, not parallel: the pre-commit hook runs prettier on staged files and then lints the whole tree (`.husky/pre-commit`), so a second writer's half-finished state would fail the first one's commit; the unit path sets are disjoint all the same.

Design source for every unit: `.clippy/runs/2026-11-17-assistant-read-tool.compose.md`.

- U1 server — first. Decisions D1, D2, D3, D4 (server schema), D5, D6, D7, D13, D16. Pins P1, P3, P9. Paths: `packages/super-sync-server/**`, `docs/wiki/3.01-API.md`, `docs/wiki/3.02-Settings-and-Preferences.md`.
- U2 provider and app — after U1 (shares only the wire contract D4). Decisions D4 (app types and bounds), D8, D9, D10, D11, D17. Pins P2, P4, P10 (prettier on `t.const.ts`). Paths: `packages/sync-providers/**`, `src/app/**`, `src/assets/i18n/en.json`.
- U3 end to end — after U1 and U2. Decision D12. Paths: `e2e/tests/sync/supersync-agent-read.spec.ts`.
- U4 delivery — after U1 (needs the migration and image); placed last so the image is built from the final tree. Decision D14. Pins P5, P6, P10. Paths: `docs/runbooks/supersync-fork-image.md`.

D15 (closed file set) and D18 are checked at verify over the whole diff.
