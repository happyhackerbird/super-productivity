# Deploying the SuperSync fork image

This runbook replaces the official `ghcr.io/super-productivity/supersync:v20.0.0`
image on the self-hosted SuperSync server with an image built from this fork, which
adds task reading for AI assistants. It is written for the operator, or for the
session that performs the deploy, and needs nothing beyond this file and the
repository.

Nothing here has been deployed. Every instruction is one of two kinds:

- **Executed here**: run on the operator's Mac on 2026-11-18 (UTC) against a
  throwaway Postgres, with the command and the decisive output lines quoted.
- **Unverified**: it can only be done on the live server, in the web app or in
  ChatGPT. The reason is given each time.

The numbers below were measured at commit `dafc55e9cc` (branch
`assistant-read-tool`). The deploy session must rebuild from the branch tip it
deploys, and use that tip's short sha wherever this file writes `<sha>`.

Server commands run as root in `/root/supersync` on the Contabo VPS. Mac commands
run in the repository root. Each section says which machine it is on.

## How the probes were run

- The Mac is arm64. The fork and official images were built and pulled for
  `linux/amd64`, the server's architecture, and ran under emulation. The throwaway
  database was `postgres:16-alpine` (PostgreSQL 16.16), run natively on arm64.
- The app containers got the settings the live server is known to use, plus what
  the server needs to boot: `NODE_ENV=production`, `PORT=1900`, `HOST=0.0.0.0`,
  `DATABASE_URL` ending `?connection_limit=5&pool_timeout=10`,
  `REQUIRE_DATABASE_POOL_LIMITS=true`, `MIGRATE_RECOVERY_RUNTIME=compose`,
  `CAPTURE_CONNECTOR_ENABLED=true`, `ALLOWED_EMAILS` with one address,
  `CORS_ORIGINS=https://app.super-productivity.com`, an HTTPS `PUBLIC_URL` and
  `WEBAUTHN_ORIGIN` with a matching `WEBAUTHN_RP_ID` on a throwaway host, and a
  throwaway `JWT_SECRET`. Every start used `RUN_MIGRATIONS_ON_STARTUP=true`, as
  the server does.
- Quoted logs have their timestamps and Prisma's update banner trimmed. `…` marks
  options left out of a quoted command; the full set is in the bullet above.
- The app containers ran **without** the server's 256m memory limit. Under amd64
  emulation the Prisma CLI is killed at 256m before it does anything; the same
  official image running natively (arm64) migrates within 256m:

  ```text
  $ docker run --rm --platform linux/amd64 --memory 256m … ghcr.io/super-productivity/supersync:v20.0.0 sh scripts/migrate-deploy.sh
  ==> Checking PostgreSQL version...
  amd64-256m-exit=137
  $ docker run --rm --platform linux/arm64 --memory 256m … ghcr.io/super-productivity/supersync:v20.0.0 sh scripts/migrate-deploy.sh
  No pending migrations to apply.
  arm64-256m-exit=0
  ```

  A first rehearsal with the 256m limit in the compose file never became healthy:
  the official container restarted 49 times in ten minutes, and each migrate was
  killed with exit 137. The live server runs the official image at 256m with
  migrations on every start, and it was healthy when read on 2026-11-17. That the
  fork's one-off migrate also fits in 256m there is unverified.

## 1. What changes on the server

- One new table, `capture_read_models`, created by the migration
  `20261117000000_add_capture_read_model`. It is a single `CREATE TABLE` for a new,
  empty table with a foreign key to `users`; no existing table is altered
  (`packages/super-sync-server/prisma/migrations/20261117000000_add_capture_read_model/migration.sql`).
- Four new routes under `/api/capture`: `GET`, `PUT` and `DELETE /read-access`, and
  `PUT /read-model` (`packages/super-sync-server/src/capture/capture-read.routes.ts`).
- Two more tools on `/mcp`: `list_tasks` and `get_task`, next to `create_task`.
- Task reading is off by default. The table stays empty until a user switches
  reading on in the app. Switching reading off, or switching capture off, deletes
  that user's row (`src/capture/capture-read.store.ts` and
  `src/capture/capture-key.store.ts`, both under `packages/super-sync-server/`).
- Nothing else changes: the live `docker-compose.yml`, `.env`, memory limits,
  `RUN_MIGRATIONS_ON_STARTUP=true` and the Postgres container stay as they are. The
  only new file on the server is `docker-compose.fork.yml` (section 6).

## 2. Pre-flight

These facts were read from the live server, read-only, on 2026-11-17. Re-run the
commands on the deploy day, on the server. If any value differs, stop and find out
why before changing anything. The re-run is unverified until done.

The running service, its image and its health:

```sh
docker compose ps --format "{{.Service}} {{.Image}} {{.Status}}"
```

```text
supersync ghcr.io/super-productivity/supersync:v20.0.0 Up 4 hours (healthy)
```

The compose file hard-codes the image (no variable), names the container and reads
`.env`:

```sh
grep -n -E "^\s*(image|container_name|env_file):" /root/supersync/docker-compose.yml
docker compose version --short
```

Read on 2026-11-17: the three keys sit at lines 13, 14 and 16, with
`image: ghcr.io/super-productivity/supersync:v20.0.0`, `container_name: supersync`
and `env_file: .env`. Docker Compose was `5.1.4`.

The app already migrates on start, and its pool is bounded. On 2026-11-17 the
resolved configuration (`docker compose config`, filtered and masked) had
`RUN_MIGRATIONS_ON_STARTUP: "true"`, `REQUIRE_DATABASE_POOL_LIMITS: "true"` and a
`DATABASE_URL` ending `?connection_limit=5&pool_timeout=10`. The exact filter used
then was not recorded. This one prints the same keys, with the password masked:

```sh
docker compose config | grep -E "RUN_MIGRATIONS_ON_STARTUP|REQUIRE_DATABASE_POOL_LIMITS|DATABASE_URL" | sed -E 's#://[^@]*@#://***@#'
```

The migration history is that of v20.0.0. The database is in the container
`supersync-postgres` (service `postgres`, image `postgres:16-alpine`):

```sh
docker exec supersync-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*), count(finished_at), count(rolled_back_at), max(migration_name) from _prisma_migrations"'
```

```text
37|32|5|20261103000000_connect_requests
```

A fresh database migrated by the official v20.0.0 image on the Mac gave the same
line (executed here, 2026-11-18). A later `max(migration_name)` means the server is
no longer on v20.0.0. Stop in that case.

Disk and images:

```sh
df -h /
docker image ls
```

On 2026-11-17 the root disk had 20 GB free, and `docker image ls` listed the
official image at 495 MB.

From the operator's brief (2026-11-17): the app is limited to 256m and Postgres to
192m. `CAPTURE_CONNECTOR_ENABLED=true` is set, `ALLOWED_EMAILS` holds one address,
and there is one SuperSync user, connected to ChatGPT through one OAuth grant.

One check was not part of the 2026-11-17 read: the `psql` and `pg_dump` commands in
this file take the user and database name from the Postgres container's own
environment. Confirm both are set:

```sh
docker exec supersync-postgres sh -c 'echo "$POSTGRES_USER/$POSTGRES_DB"'
```

Executed here against the throwaway container, it printed `supersync/supersync`. On
the server it is unverified. If either part is empty, replace the variables with the
real names in every command below.

## 3. Footprint

| What                         | Measured                                                                                          |
| :--------------------------- | :------------------------------------------------------------------------------------------------ |
| Fork image                   | 496 MB in `docker image ls` (495,603,837 bytes), executed here                                    |
| Official v20.0.0 image       | 495 MB on the Mac (495,058,932 bytes), executed here; 495 MB on the server on 2026-11-17          |
| Transfer file                | 126,840,411 bytes (`docker save … \| gzip \| wc -c`), executed here                               |
| Free disk on the server      | 20 GB on 2026-11-17                                                                               |
| Extra processes              | None. The migrate one-off exits and is removed; the fork container replaces the official one      |
| Container memory limits      | Unchanged: app 256m, Postgres 192m (from the operator's brief)                                    |
| Database writes from reading | At most one list rewrite per changed sync and device, capped at 900 KB; none while reading is off |

The official image stays on the server for the rollback, so both images take about
1 GB of disk together.

On the Mac, `docker image ls` showed the freshly built fork image as 127 MB until a
container had been started from it, and 496 MB afterwards. The image store counts
the unpacked layers only once they exist. Compare the sizes after a first run.

Basis for the write-load row: the app caps the list at 900,000 bytes
(`READ_MODEL_MAX_BYTES` in `src/app/features/tasks/agent-read/task-read-model.ts`).
It publishes at most once a minute, after a sync that ended in sync
(`MIN_RUN_INTERVAL_MS` in `task-read-publisher.service.ts`, same directory). An
unchanged list only updates `published_at`; the payload is not rewritten
(`publishReadModel` in `packages/super-sync-server/src/capture/capture-read.store.ts`).
The route body limit is 1 MiB.

## 4. Build the image on the Mac and move it to the server

Build from the repository root, at the branch tip you deploy, with a clean working
tree:

```sh
git status --porcelain   # must print nothing
SHA=$(git rev-parse --short=10 HEAD)
docker buildx build --platform linux/amd64 -f packages/super-sync-server/Dockerfile \
  --build-arg VCS_REF=$SHA -t supersync-fork:$SHA --load .
```

On this Mac `docker buildx` answers "'buildx' is not a docker command": the Homebrew
plugin is installed but not registered with the Docker CLI. The standalone binary
takes the same arguments, and that is what was run:

```text
$ docker-buildx build --progress=plain --platform linux/amd64 -f packages/super-sync-server/Dockerfile --build-arg VCS_REF=dafc55e9cc -t supersync-fork:dafc55e9cc --load .
#40 naming to docker.io/library/supersync-fork:dafc55e9cc done
rc=0 wall=232s start=2026-11-18T00:31:38Z end=2026-11-18T00:35:30Z
```

That is 3 minutes 52 seconds with no build cache, base image download included. The
builder stage runs on the build machine's own platform (`FROM --platform=$BUILDPLATFORM`),
so only the runtime stage's commands are emulated, which keeps it short. The image
carries the revision in its label and in `SUPERSYNC_REVISION`
(`packages/super-sync-server/Dockerfile`, `ENV SUPERSYNC_REVISION=$VCS_REF`). Read
from the image configuration inside the `docker save` archive (executed here):

```text
amd64 linux
{'org.opencontainers.image.revision': 'dafc55e9cc'}
['RUN_MIGRATIONS_ON_STARTUP=false', 'NODE_OPTIONS=--max-old-space-size=576', 'SUPERSYNC_REVISION=dafc55e9cc']
```

The image's own `RUN_MIGRATIONS_ON_STARTUP=false` and `NODE_OPTIONS` are the same as
in the official image. The live compose environment overrides the first, as it does
today.

Save the image to a file on the Mac:

```sh
docker save supersync-fork:$SHA | gzip > /tmp/supersync-fork-$SHA.tar.gz
gzip -t /tmp/supersync-fork-$SHA.tar.gz && ls -l /tmp/supersync-fork-$SHA.tar.gz
```

Executed here in the form `docker save supersync-fork:dafc55e9cc | gzip | wc -c`
(126,840,411 bytes), and by listing the archive: its `manifest.json` names
`supersync-fork:dafc55e9cc`, so `docker load` restores the tag. The two commands
above, writing the file and testing it, were not run as written (unverified).

Copy the file to `/tmp/` on the server by the channel the session uses for the
server (for example `scp`, or the approved launcher's `--stdin-file`). Then, on the
server:

```sh
gunzip -c /tmp/supersync-fork-<sha>.tar.gz | docker load
docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' supersync-fork:<sha>
rm /tmp/supersync-fork-<sha>.tar.gz
```

Expect `Loaded image: supersync-fork:<sha>`, then `<sha>`. Unverified: neither the
copy nor `docker load` has been run on the server.

## 5. Back up the database

On the server, before any change:

```sh
docker exec supersync-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > /root/supersync-before-fork-$(date +%Y%m%d-%H%M%S).sql.gz
gzip -t /root/supersync-before-fork-*.sql.gz && echo gzip-ok
gunzip -c /root/supersync-before-fork-*.sql.gz | grep -c "CREATE TABLE public._prisma_migrations"
```

Executed here against the throwaway container (container name aside):

```text
gzip-ok
1
```

On the server it is unverified. Keep the dump until the deploy has been judged good.
The dump is a last resort, not the rollback (section 10).

## 6. Migrate first, then swap

All commands in this section run on the server. There they are unverified. Each
one ran on the Mac with probe names; the outputs are quoted below the steps.

The live `docker-compose.yml` is not edited. A second compose file beside it names
the fork image, and every fork command passes both files. Compose reads the files
named with `-f`; with no `-f` it reads `docker-compose.yml` and, if present,
`docker-compose.override.yml`. It never reads `docker-compose.fork.yml` on its own.

On the server, create `/root/supersync/docker-compose.fork.yml` with exactly this
content:

```yaml
services:
  supersync:
    image: supersync-fork:<sha>
```

Check that the override takes effect before migrating. The command must print
`<sha>`. If it prints `4db0e11236bc784d3184a9e252930b4bd53df823`, the official
image's revision, the override did not apply: stop.

```sh
docker compose -f docker-compose.yml -f docker-compose.fork.yml run --rm --no-deps --name supersync-migrate supersync sh -c 'echo $SUPERSYNC_REVISION'
```

Migrate with the fork image as a one-off while the official container keeps
serving, then remove the one-off container in case it was left behind:

```sh
docker compose -f docker-compose.yml -f docker-compose.fork.yml run --rm --no-deps --name supersync-migrate supersync sh scripts/migrate-deploy.sh; echo "exit=$?"
docker rm -f supersync-migrate
docker exec supersync-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*), count(finished_at), count(rolled_back_at), max(migration_name) from _prisma_migrations"'
```

Expect ``Applying migration `20261117000000_add_capture_read_model` ``,
`All migrations have been successfully applied.`, `exit=0` and
`38|33|5|20261117000000_add_capture_read_model`.

**If the migrate exits with anything other than 0: do not swap, and do not restart,
stop or recreate the official container until the recovery below has run.** A
migration that failed or was interrupted leaves a record without a finish time, and
that record stops the official image's start-up migrate (executed here, below). The
running official container keeps serving, but its next restart would fail.

Recovery: remove the half-applied migration, which returns the database to the
state the official image expects. Both statements are safe to repeat.

```sh
docker rm -f supersync-migrate
docker exec supersync-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS capture_read_models;" -c "DELETE FROM _prisma_migrations WHERE migration_name = '"'"'20261117000000_add_capture_read_model'"'"';"'; echo "exit=$?"
docker exec supersync-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*), count(finished_at), count(rolled_back_at), max(migration_name) from _prisma_migrations"'
```

Expect `exit=0` and `37|32|5|20261103000000_connect_requests`, the line from the
pre-flight. The official container then restarts normally. Read the failed
migrate's output before trying again; a second attempt starts from the top of this
section. Unverified on the server. Executed on the Mac on 2026-11-18 against a
throwaway `postgres:16-alpine`, with the official v20.0.0 image (arm64 variant):
a failed record and a leftover table were inserted by hand, the official migrate
refused (exit 1), the two statements ran, and the official migrate then passed:

```text
== simulate interrupted fork migrate: failed row + leftover table
INSERT 0 1
CREATE TABLE
ERROR: 20261117000000_add_capture_read_model is not a recoverable drop-then-create CONCURRENTLY index migration (a bare CREATE is intentionally fail-loud); refusing to auto-resolve.
exit=1
== recovery SQL
DROP TABLE
DELETE 1
psql-exit=0
37|32|5|20261103000000_connect_requests
== official migrate after recovery
exit=0
== recovery SQL again
NOTICE:  table "capture_read_models" does not exist, skipping
DELETE 0
psql-exit=0
```

The failed record in the first run below was simulated the same way, by inserting
a row for the fork's migration with no finish time into the throwaway database.
The official image then answered:

```text
$ docker run --rm … ghcr.io/super-productivity/supersync:v20.0.0 sh scripts/migrate-deploy.sh
32 migrations found in prisma/migrations
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve
The `20261117000000_add_capture_read_model` migration started at 2026-11-18 00:59:48.251732 UTC failed
ERROR: 20261117000000_add_capture_read_model is not a recoverable drop-then-create CONCURRENTLY index migration (a bare CREATE is intentionally fail-loud); refusing to auto-resolve.
official-exit=1
```

The image starts its server only after that script exits 0
(`packages/super-sync-server/Dockerfile`, the `CMD` line), so a container that
migrates on start would not come up.

Only after the migrate exited 0, swap:

```sh
docker compose -f docker-compose.yml -f docker-compose.fork.yml up -d supersync
```

The fork container also runs `RUN_MIGRATIONS_ON_STARTUP=true`, as today, so it
migrates (a no-op now) before it serves. Leave `.env`, the limits and
`RUN_MIGRATIONS_ON_STARTUP` as they are.

From now on, every compose command for this stack that creates containers passes
both files. A `docker compose up -d` with the base file alone recreates the
official image; that is the rollback's first step (section 10), done without its
SQL.

### Probes executed here

First, the fork's migrate on its own. The throwaway database had been prepared by
the official v20.0.0 image, which migrated a fresh database and reached `/health`
259 seconds after start, leaving `37|32|5|20261103000000_connect_requests`. Then
the fork image ran its script as a one-off, and afterwards it started with
migrations on start:

```text
$ docker run --rm --name u4probe-fork-migrate --platform linux/amd64 … supersync-fork:dafc55e9cc sh scripts/migrate-deploy.sh
==> Checking PostgreSQL version...
33 migrations found in prisma/migrations
Applying migration `20261117000000_add_capture_read_model`
All migrations have been successfully applied.
exit=0
38|33|5|20261117000000_add_capture_read_model
20261117000000_add_capture_read_model|t|f
capture_read_models
$ docker run -d --name u4probe-fork … -e RUN_MIGRATIONS_ON_STARTUP=true supersync-fork:dafc55e9cc
{"status":"ok","db":"connected","wsConnections":0}
health after 20s
33 migrations found in prisma/migrations
No pending migrations to apply.
[INFO] Server started on http://127.0.0.1:1900 (revision dafc55e9cc)
```

### Rehearsal executed here

The whole sequence ran on the Mac on 2026-11-18. It used a compose file of the live
shape: service `supersync` with the official image hard-coded, `container_name`,
`env_file: .env`, an `environment` block with `RUN_MIGRATIONS_ON_STARTUP: 'true'`,
`REQUIRE_DATABASE_POOL_LIMITS: 'true'` and the pool-limited `DATABASE_URL`, and a
`postgres` service. The override file held only the image line. The differences
from the server: names prefixed `u4probe-`, `DOCKER_DEFAULT_PLATFORM=linux/amd64`
for emulation, and no 256m limit (see "How the probes were run"). The database had
been prepared by the official v20.0.0 image (`37|32|5|20261103000000_connect_requests`).

```text
### 0. official serving from the base file
$ docker compose -f docker-compose.yml up -d supersync
exit=0
{"status":"ok","db":"connected","wsConnections":0} (after 20s)
image=ghcr.io/super-productivity/supersync:v20.0.0
### 1. revision with override
$ docker compose -f docker-compose.yml -f docker-compose.fork.yml run --rm --no-deps --name u4probe-migrate supersync sh -c 'echo $SUPERSYNC_REVISION'
dafc55e9cc
exit=0
### 2. revision without override
$ docker compose -f docker-compose.yml run --rm --no-deps --name u4probe-migrate supersync sh -c 'echo $SUPERSYNC_REVISION'
4db0e11236bc784d3184a9e252930b4bd53df823
exit=0
### 3. migrate with override while official serves
$ docker compose -f docker-compose.yml -f docker-compose.fork.yml run --rm --no-deps --name u4probe-migrate supersync sh scripts/migrate-deploy.sh
33 migrations found in prisma/migrations
Applying migration `20261117000000_add_capture_read_model`
All migrations have been successfully applied.
exit=0
$ docker rm -f u4probe-migrate
Error response from daemon: No such container: u4probe-migrate
{"status":"ok","db":"connected","wsConnections":0} (official during/after migrate)
38|33|5|20261117000000_add_capture_read_model
### 4. swap to fork
$ docker compose -f docker-compose.yml -f docker-compose.fork.yml up -d supersync
 Container u4probe-supersync  Recreate
exit=0
{"status":"ok","db":"connected","wsConnections":0} (after 26s)
image=supersync-fork:dafc55e9cc
No pending migrations to apply.
[INFO] Server started on http://127.0.0.1:1900 (revision dafc55e9cc)
```

Steps 1 and 2 ran with the official container up and named `u4probe-supersync`, so
the one-off's own name does not clash with `container_name`. Step 2 shows that the
revision check tells the two images apart.

## 7. Verify the fork on the server

All unverified, because they need the live server. On the server:

```sh
docker compose -f docker-compose.yml -f docker-compose.fork.yml ps --format "{{.Service}} {{.Image}} {{.Status}}"
docker logs --since 10m supersync 2>&1 | grep -E "No pending migrations|Server started"
curl -s https://sync.161.97.176.247.sslip.io/health
curl -s -o /dev/null -w '%{http_code}\n' https://sync.161.97.176.247.sslip.io/api/capture/read-access
```

Expect `supersync supersync-fork:<sha> Up … (healthy)`, `(revision <sha>)` in the
start line, `{"status":"ok","db":"connected",…}`, and `401`. The last check tells
the images apart without a token: on the Mac (executed here) the fork answered an
unauthenticated `GET /api/capture/read-access` with `HTTP/1.1 401 Unauthorized`,
and the official image with `HTTP/1.1 404 Not Found`.

The tool list needs a capture token. In the web app, open the sync settings
(right-click the sync button), expand "AI assistants", then "Manual tokens for
scripts and other clients", create a token, and run:

```sh
curl -s https://sync.161.97.176.247.sslip.io/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer <token>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect three tool names: `create_task`, `list_tasks`, `get_task`. Revoke the token
afterwards under "Connected assistants" in the same block. Unverified on the live
server; the end-to-end spec `e2e/tests/sync/supersync-agent-read.spec.ts` makes the
same calls against a local server.

Reading is off for the user: `GET /api/capture/read-access` with the user's sync
access token returns `{"enabled":false,"enableId":null,"publishedAt":null}`. After
section 8, the same answer shows in the app as the button "Let AI assistants read
tasks" in the AI assistants block. Unverified on the live server.

## 8. Rebuild and redeploy the web app

The app-side half of the feature (the settings switch and the publisher) ships with
the web app at `https://sp.161.97.176.247.sslip.io`. On the Mac, at the same branch
tip:

```sh
source ~/.nvm/nvm.sh && nvm use
npm run buildFrontend:prodWeb
```

The build was not run for this runbook (unverified). Then deploy the output the way
the current web app was deployed. That procedure is not recorded in this
repository, so this step is unverified too.

Deploy the server first. The app treats a server without these routes (404) as
"reading off" and logs the unsupported publish once, so either order is safe for
users (`getAccess`, `switchOff` and the publish in
`src/app/features/tasks/agent-read/task-read-publisher.service.ts`, read here, not
run against the live server).

## 9. Connector

After the deploy, refresh the ChatGPT connector's tool list once, so ChatGPT
fetches the new `tools/list`. This happens in ChatGPT and is unverified, as is
whether and when ChatGPT picks up a changed tool list on its own.

Then run two checks in ChatGPT. Both are unverified until the operator runs them,
and **if either fails, roll back** (section 10):

1. Ask ChatGPT which tools the connector offers. Expect `list_tasks` among them.
2. Ask ChatGPT to add a test task. Expect it in the Inbox after the app's next sync.

## 10. Rollback

Swap the image back first, then run the SQL. The official image starts on a
database that still holds the fork's table and migration record. Executed here: it
found no pending migration and reached `/health` (below). So the first step restores
the official server at once and the database change can follow. The SQL then runs
while the official server keeps serving, since that server does not use the table,
and the official image restarts cleanly afterwards (executed here, below). Run the SQL promptly: the
official server cannot delete a user's shared list when they switch capture off.

On the server:

```sh
docker compose -f docker-compose.yml up -d supersync
docker compose ps --format "{{.Service}} {{.Image}} {{.Status}}"   # wait for: supersync ghcr.io/super-productivity/supersync:v20.0.0 … (healthy)
docker exec supersync-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP TABLE capture_read_models;" -c "DELETE FROM _prisma_migrations WHERE migration_name = '"'"'20261117000000_add_capture_read_model'"'"';"'; echo "exit=$?"
docker exec supersync-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*), count(finished_at), count(rolled_back_at), max(migration_name) from _prisma_migrations"'
```

Expect `DROP TABLE`, `DELETE 1`, `exit=0`, then
`37|32|5|20261103000000_connect_requests`. Unverified on the server.
`docker-compose.fork.yml` can stay; without `-f` it is not read. The web app needs
no rollback: against the official server it shows reading as off.

Executed here. The official image restarted with migrations on start against the
migrated database:

```text
32 migrations found in prisma/migrations
No pending migrations to apply.
[INFO] Server started on http://127.0.0.1:1900 (revision 4db0e11236bc784d3184a9e252930b4bd53df823)
{"status":"ok","db":"connected","wsConnections":0}   (after 20s)
```

Its log has no line about the extra migration. A search for `20261117`, `missing`
or `drift` found nothing there; the same search finds `20261117` in the fork's
migrate log.

The swap back and the SQL ran in the rehearsal of section 6, with the official
container serving during the SQL:

```text
### 5. swap back to official
$ docker compose -f docker-compose.yml up -d supersync
 Container u4probe-supersync  Recreate
exit=0
{"status":"ok","db":"connected","wsConnections":0} (after 20s)
image=ghcr.io/super-productivity/supersync:v20.0.0
No pending migrations to apply.
[INFO] Server started on http://127.0.0.1:1900 (revision 4db0e11236bc784d3184a9e252930b4bd53df823)
  HTTP/1.1 404 Not Found
### 6. rollback SQL with official serving
DROP TABLE
DELETE 1
exit=0
{"status":"ok","db":"connected","wsConnections":0}
37|32|5|20261103000000_connect_requests
```

After the SQL, a fresh start of the official image (executed here):

```text
32 migrations found in prisma/migrations
No pending migrations to apply.
[INFO] Server started on http://127.0.0.1:1900 (revision 4db0e11236bc784d3184a9e252930b4bd53df823)
{"status":"ok","db":"connected","wsConnections":0}   (after 20s)
```

## 11. Notes

- **Backups keep the shared list.** A database backup taken while task reading is on
  contains the plaintext task list, and keeps it for the backup's retention period
  after reading is switched off. `scripts/backup.sh` keeps 14 days by default; the
  cron example in `packages/super-sync-server/docs/backup-and-recovery.md` uses 3.
  Whether the live server runs that script, and with which retention, is
  unverified. The dump from section 5 predates the table and holds no list.
- **Later upstream migrations.** A migration dated before the fork's
  (`20261116000000_probe_earlier`, a throwaway `CREATE TABLE`), added to the image
  after the fork's migration had been applied, was applied by `migrate-deploy.sh`.
  Executed here; the synthetic migration is not part of the repository:

  ```text
  34 migrations found in prisma/migrations
  Applying migration `20261116000000_probe_earlier`
  All migrations have been successfully applied.
  exit=0
  39|34|5|20261117000000_add_capture_read_model
  ```

- **The image on the Mac.** The measured image `supersync-fork:dafc55e9cc` was removed
  after the measurements, as were every probe container, network, volume and image
  and the pulled official and Postgres images. Rebuild as in section 4. The BuildKit
  build cache was not pruned: it grew from 7.9 MB to about 2 GB during the
  measurements (`docker system df`), and pruning it would also clear other builds'
  cache.
