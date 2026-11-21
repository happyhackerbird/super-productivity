# Tracker document and page (fork)

For the operator and any session that deploys or rolls back the fork's tracker
feature. Deployed on 2026-11-20 as image `supersync-fork:ct-20261120a`, built from
the working tree that became the `career-tracker` branch commit adding this file.
Replaced the same day by `supersync-fork:0ae7861756`, which also gives every
OAuth grant a refresh token (ChatGPT requests only `tasks:capture` and was cut
off after one hour); the override before that swap is
`docker-compose.fork.yml.ct-20261120a.bak`. Then by `supersync-fork:91c41992b0`,
which logs one line per `/mcp` request (`docker logs supersync 2>&1 | grep "MCP "`)
and reads `TRACKER_NAME` for the tool descriptions; previous override
`docker-compose.fork.yml.0ae7861756.bak`.
Current catalog release: `supersync-fork:353f4f12d2`, deployed 2026-11-21 with
the page from `/Users/lilly/code/career-tracker` commit `ef0eac1`.

## What it is

- One JSON document per account in `tracker_documents` (migration
  `20261120000000_add_tracker_documents`), changed with optimistic versions.
- Ten tracker MCP tools on `/mcp` next to the three capture tools: `tracker_get`,
  `tracker_add_task`, `tracker_update_task`, `tracker_delete_task`,
  `tracker_add_goal`, `tracker_update_goal`, `tracker_delete_goal`,
  `tracker_add_activity`, `tracker_update_activity`, `tracker_delete_activity`.
  Any capture credential of the account may use them; there is no separate switch.
- `GET`/`PUT /api/tracker` and `POST`/`DELETE /api/tracker/session` for the page.
  The session cookie holds a capture token; writes need `X-Tracker-Request: 1`.
- `/tracker/` serves a sign-in shell, or, with a valid cookie, the page from
  `TRACKER_PAGE_DIR`. The page is not in this repository.

## Reusable general list

The general list is the activity catalog shared by **Log a win** and
**Add from the list**. It is not today's tasks or the earlier/undated task
instances. `tracker_get.activities` returns definitions, including archived ones.
Catalog edits must preserve the existing picker categories: **Access ·
Relationships**, **Access · Market discovery**, **Credibility · Build & prove**,
and **Visibility · Share the work**.

| Tool                      | Arguments                                             | Effect                                                          |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| `tracker_add_activity`    | `label`, `pillar`, `xp`                               | Adds a reusable option; creates no daily task.                  |
| `tracker_update_activity` | `id`, then any of `label`, `pillar`, `xp`, `archived` | Edits the option; `archived: false` restores it.                |
| `tracker_delete_activity` | `id`                                                  | Archives the option without deleting its historical definition. |

Pillars are `credibility`, `visibility`, and `access`; XP is an integer from
0 to 250. Labels are 1–150 characters. The document accepts up to 1,000
definitions with unique IDs; `custom` and `wake` remain internal kinds.
Catalog changes do not rewrite task instances, goals, wins, or previously earned XP.
The page refreshes remote changes on focus or its normal refresh tick.
Task instances snapshot their base XP and pillar when created; later catalog
edits affect new choices, not existing task rewards. Wins retain their recorded
XP and kind even when an imported or replaced catalog omits their definition.
Pending caches from the old page merge against the fetched server catalog and
history before saving, including when the cached and server versions match.

The optional document field `activities` defaults to the existing catalog plus
`learn` (**Watched and learned from content**, 15 XP) and `network`
(**Attend an event and purposefully network**, 15 XP). The older `event` kind
keeps its historical 35 XP/two-connections meaning and stays archived.
An explicitly empty catalog stays empty. No database migration is required.

Deploy the server image and both page files together, then reload existing tabs.
Once a catalog is stored, an old page that omits it on `PUT /api/tracker`
receives HTTP 400 `reload_required`, preventing it from erasing catalog/history.
Refresh the assistant connector's tool list to discover the three new tools.

## Server layout (Contabo, `/root/supersync`)

`docker-compose.fork.yml`:

```yaml
services:
  supersync:
    image: supersync-fork:353f4f12d2
    environment:
      TRACKER_PAGE_DIR: /app/tracker-page
      TRACKER_NAME: <what the user calls the tracker> # optional
    volumes:
      - ./tracker-page:/app/tracker-page:ro
```

The page files live in `/root/supersync/tracker-page/` (`index.html`,
`tracker.js`). Replacing them needs no restart. The previous override is kept as
`docker-compose.fork.yml.e648257662.bak`, and the pre-deploy database dump as
`/root/supersync-before-tracker-20261120-015538.sql.gz`.

Build, transfer, migrate-then-swap and verification follow
[supersync-fork-image.md](supersync-fork-image.md) sections 4–7, with the image
revision being deployed. The current tool definitions return thirteen names.

## Verified at deploy (2026-11-20)

- Migrate one-off: `Applying migration 20261120000000_add_tracker_documents`,
  exit 0, `_prisma_migrations` at `39|34|5|20261120000000_add_tracker_documents`.
- Swap: healthy, `Server started … (revision ct-20261120a)`.
- Anonymous: `/tracker` 302, `/tracker/` 200 sign-in shell, `/tracker/tracker.js`,
  `/api/tracker` and `/mcp` 401.
- With a temporary capture token (revoked afterwards): `tools/list` lists the ten
  tools, `tracker_get` answers, the session cookie is `HttpOnly; SameSite=Strict;
Secure`, and the cookie serves the page and its script.

## Catalog release verification (2026-11-21)

- Local page smoke: `node dev/smoke.mjs` in the page checkout,
  **59 passed, 0 failed, 0 skipped**. The three fresh-review findings
  (legacy pending cache, clearing catalog/history, existing task rewards)
  produced four failing assertions before the fixes and all passed afterwards.
- Server: package `tsc` passed; the tracker, capture OAuth, capture read, and
  capture route specs passed **127 tests in four files**, no skips.
  The full server suite on this Mac also exposed 156 existing shell-test
  failures (`health-alert-script` 97, `migrate-deploy-script` 59: missing
  executable `timeout` / BSD `sed` incompatibility), reproduced against
  the unchanged server snapshot. These shell suites are not catalog proof.
  The repository's pre-push lint and app tests passed before publishing
  `353f4f12d2`.
- Built and loaded the `linux/amd64` image; the one-off migration reported
  **No pending migrations to apply**; Compose reached **healthy**.
- Stored both requested 15-XP definitions in the account's catalog.
  Live MCP add/edit succeeded, leaving the seven task instances, goals,
  and five wins unchanged during the catalog operations.
- The public HTTPS `/mcp` returned thirteen tools and persisted an archive
  through `tracker_delete_activity`. The authenticated page rendered both
  requested labels at 15 XP in both pickers. A catalog-omitting public REST
  write returned HTTP 400 `reload_required` without advancing the version.
  An independent Chrome run confirmed the archived test option disappeared,
  both requested options remained, and there were no page errors; its captured
  UI showed the learning option and Log win button at 15 XP.
- Removed the temporary test definition and revoked its capture grant
  (subsequent `/mcp` request: HTTP 401). Final document version 27 retains
  33 definitions; tasks, goals, and wins match the pre-deploy snapshot.
- Backups: `/root/supersync/releases/catalog-20261121/` contains
  `docker-compose.fork.yml.before`, `page-before.tar.gz`, and
  `database-before.sql.gz`. The prior image `91c41992b0` is retained.
- Two guarded attempts rolled back before any tracker document mutation:
  `docker cp` restored the probe credential as root; the app user could not
  read it, and `cap_drop: [ALL]` also prevents root from changing ownership
  inside the container. Preflighted the root-owned probe client with
  `docker exec -u 0`, then completed the cutover without changing the server
  user, file modes, or capabilities. The MCP requests still ran through the
  normally unprivileged server.

To revert only this server release, keep the new page (it preserves catalog
history and uses the existing tracker REST contract) and restore the prior image:

```sh
cd /root/supersync
cp releases/catalog-20261121/docker-compose.fork.yml.before docker-compose.fork.yml
docker compose -f docker-compose.yml -f docker-compose.fork.yml up -d supersync
```

The old server lacks the three catalog MCP tools. Do not restore the old page
after logging new activity kinds: its sanitizer drops unknown kinds from wins.
Export a tracker backup before any broader rollback.

## Category correction (2026-11-21)

Page commit `ef0eac1` restores the original categories from
`9912479:index.html` in both pickers. The two 15-XP activities and all thirteen
MCP tools remain. The category regression failed before the correction; page
smoke afterwards: **60 passed, 0 failed, 0 skipped**. Live authenticated UI
verification confirmed both picker groupings and the two new XP values.
Only `tracker.js` was replaced, without a container restart or server/API change.
The previous script is retained at
`/root/supersync/releases/categories-20261121/tracker.js.before`.

## Rollback original tracker installation

```sh
cd /root/supersync
cp docker-compose.fork.yml.e648257662.bak docker-compose.fork.yml
docker compose -f docker-compose.yml -f docker-compose.fork.yml up -d supersync
```

The older image ignores the extra table. To remove it as well, once the older
image is serving:

```sh
docker exec supersync-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP TABLE tracker_documents;" -c "DELETE FROM _prisma_migrations WHERE migration_name = '"'"'20261120000000_add_tracker_documents'"'"';"'
```

Dropping the table deletes every tracker document. Export a backup from the page
first.

## Known limits (from the 2026-11-20 review)

- OAuth access tokens issued to assistants also work on `/api/tracker`, including
  a whole-document `PUT`.
- The consent page text does not mention tracker access.
- The cookie is `SameSite=Strict`, so a link to `/tracker/` from another site
  shows the sign-in shell.
- The page's sign-out leaves its local cache in the browser.
