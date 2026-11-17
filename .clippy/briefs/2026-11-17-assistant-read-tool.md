# Brief: ChatGPT reads tasks through the self-hosted SuperSync /mcp

Written 2026-11-17 by a direct Claude Code session (freelance_bot cwd) for a
new Clippy session in this repo. Reader: that session. It is an input record,
not a design: the design is the run's investigate-design phase.

## Goal (outcome)

ChatGPT, connected as a custom MCP connector to the operator's self-hosted
SuperSync server (`https://sync.161.97.176.247.sslip.io/mcp`), can answer
"what are my tasks today / upcoming" from the operator's real task list,
while it keeps adding tasks as it does now.

Observable done-state, proven locally: with a local SuperSync (the repo's
`e2e:supersync` harness), a web client syncs tasks, and an authenticated MCP
`tools/call list_tasks` against that server returns the open tasks the client
shows for today; a caller without read access is refused; switching read
access off removes the stored read data.

## Settled by the operator (do not reopen)

1. ChatGPT reads through the hosted SuperSync `/mcp` (custom connector). No
   desktop app, no bridge to the Electron local MCP.
2. Sync encryption stays ON. It is mandatory in SuperSync
   (`packages/sync-providers/src/super-sync/super-sync.ts:162-164`,
   `isEncryptionMandatory = true`, GHSA-9v8x-68pf-p5x7) and the operator
   accepted leaving it. A separate plaintext read model of open tasks,
   stored on the operator's own server, is acceptable: the operator does not
   mind the server seeing task titles and dates.
3. Freshness "as of the app's last sync" is acceptable.
4. Task notes are NOT included.
5. The server runs an image built from this fork instead of the official
   `ghcr.io/super-productivity/supersync:v20.0.0`.
6. Use upstream's planned names where they exist (`tasks:read`,
   `list_tasks`, `get_task`) so a future upstream read feature merges
   mechanically.
7. Route: a Clippy run (design not settled). Recommended session model:
   fable (lean profile, auto-battle); `clippy.config/models`:
   `impl: opus`, `verify: opus` (operator may change at bootstrap).

## Background (with provenance)

Opened by the writing session (commands run 2026-11-17):

- Hosted /mcp lists one tool: `capture-mcp.routes.ts:52`
  `listTools: () => [CREATE_TASK_TOOL]` (packages/super-sync-server/src/capture/).
- Server replay refuses encrypted ops: `sync/op-replay.ts:161` throws
  `EncryptedOpsNotSupportedError`.
- Upstream left remote read out of scope:
  `docs/plans/2026-10-11-agent-task-capture.md` "## Out of scope" →
  "Reading tasks remotely, editing, …".
- Live server (Contabo, read via the approved launcher): one SuperSync user,
  email verified; `operations` 10/10 `is_payload_encrypted = true`; one
  `capture_grants` row `kind=oauth, client_name=ChatGPT,
client_id=https://chatgpt.com/oauth/client.json`. Deployed from
  `/root/supersync/docker-compose.yml` (official v20.0.0 image, own small
  limits: app 256m, postgres 192m, `connection_limit=5`,
  `CAPTURE_CONNECTOR_ENABLED=true`, `ALLOWED_EMAILS` one address), behind the
  shared Caddy at `/opt/public-tier/deploy/Caddyfile`.
- The operator uses the WEB app, this fork's build of branch
  `upstream-v20.0.0` @ `01ef235b57`, served at
  `https://sp.161.97.176.247.sslip.io` (cookie-gated). Any app-side change
  ships by rebuilding that (`npm run buildFrontend:prodWeb`).
- E2E on this Mac: run with `--workers=1` (7 workers overloaded the dev
  server: every test hit `page.goto` 30 s timeouts; 1 worker → 17/17
  passed). Install Playwright browsers with `PLAYWRIGHT_BROWSERS_PATH` set to
  your own scratchpad (`~/Library` is guarded). Run `nvm use` (22.23.3)
  before npm.
- The pre-push hook runs lint + full `npm test`; one upstream spec
  (`task-view-customizer.service.spec.ts`) failed under full-suite load once
  and passed alone and on retry.

From a Fable read-only assessment (2026-11-17), opened by it, not re-opened
by the writer — re-open what you rely on:

- `tasks:capture` is fixed at `capture-oauth.routes.ts:36,140,158,175-176,
251-254`, `capture-oauth-token.ts:63`, and the 401 challenge
  `capture-mcp.routes.ts:76`.
- `CaptureGrant` (`prisma/schema.prisma:193-214`) has no scope column.
- The Electron local MCP already has read tools and a summary shape worth
  matching: `electron/mcp/mcp-tools.ts:428-435` (`list_tasks` with
  `tagId: "TODAY"`, `get_task`, …), fields at `mcp-tool-kit.ts:154-167`,
  scopes in `electron/shared-with-frontend/assistant-access.model.ts`.
- App after-sync hook: `src/app/features/tasks/agent-capture/
agent-capture.service.ts:73` ("falling edge of every sync that left the
  app IN_SYNC"). Whether it runs in the web build: inferred, unverified.
- Upstream's own read design (unbuilt, desktop-only relay):
  `docs/plans/2026-10-26-assistant-connector-directories.md` §6.5 (M5).
  Nearest upstream items: #11246, #11729, PR #11772.
- Its estimate for this shape: 12–16 files, ~900 production + ~800 test
  lines, 3–5 agent-days plus ~0.5 day for the image pipeline (inferred).

## Open design questions (for investigate-design)

- Which tasks the read model holds (open only? today + overdue + next N
  days? subtasks?), its size cap, and its field set.
- Where "today" is computed: in the app via `DateService` and
  `startOfNextDayDiffMs` (AGENTS.md sync rule 4), or on the server.
- Permission model. Per-grant `tasks:read` scope (migration, consent text,
  reconnect) versus an account-level "assistants may read" switch that
  covers existing grants. ChatGPT's behaviour on a new scope or a changed
  tool list is UNVERIFIED; prefer a design that does not depend on it, or
  name the probe that settles it.
- Storage: new table, migration naming/order that survives future upstream
  migrations.
- Off-switch semantics: delete the read model; what happens to grants.
- Limits: payload size, publish rate, MCP read rate.
- App side: publisher (after-sync, never a bare selector effect — AGENTS.md
  sync rule 2), settings toggle, i18n (en.json only), and the now-false
  `CAPTURE_INFO` text.
- Image build and deploy procedure: where to build (Mac `linux/amd64` vs the
  4-CPU/8 GB VPS; state disk/RAM cost first), keeping
  `/root/supersync/docker-compose.yml` and `.env`, migrations on start.

## Boundaries

- Base: branch `upstream-v20.0.0` @ `01ef235b57` (what is deployed), not
  `master` (origin/master is the AOS coordinator's, still v19.2-based).
- AOS repo: this is direct work, not an AOS stage. Never edit
  `AGENTS.md`, `CLAUDE.md`, `.agents/**`, `.codex/**`, `tests/acceptance/`,
  `tests/fixtures/`, `tasks/`, `scripts/check*`, `aos-*.toml`, `docs/plan.md`.
- Fork-only code in new files where possible; upstream files get minimal
  hooks.
- Out of scope for the run: deploying to Contabo, swapping the live image,
  pushing to origin `master`, turning encryption off. The run ends at verify
  [PASSED] with the branch, the tests, and a written deploy procedure; the
  deploy is handed back to the operator.
