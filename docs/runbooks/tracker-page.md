# Tracker document and page (fork)

For the operator and any session that deploys or rolls back the fork's tracker
feature. Deployed on 2026-11-20 as image `supersync-fork:ct-20261120a`, built from
the working tree that became the `career-tracker` branch commit adding this file.
Replaced the same day by `supersync-fork:0ae7861756`, which also gives every
OAuth grant a refresh token (ChatGPT requests only `tasks:capture` and was cut
off after one hour); the override before that swap is
`docker-compose.fork.yml.ct-20261120a.bak`.

## What it is

- One JSON document per account in `tracker_documents` (migration
  `20261120000000_add_tracker_documents`), changed with optimistic versions.
- Seven MCP tools on `/mcp` next to the capture tools: `tracker_get`,
  `tracker_add_task`, `tracker_update_task`, `tracker_delete_task`,
  `tracker_add_goal`, `tracker_update_goal`, `tracker_delete_goal`. Any capture
  credential of the account may use them; there is no separate switch.
- `GET`/`PUT /api/tracker` and `POST`/`DELETE /api/tracker/session` for the page.
  The session cookie holds a capture token; writes need `X-Tracker-Request: 1`.
- `/tracker/` serves a sign-in shell, or, with a valid cookie, the page from
  `TRACKER_PAGE_DIR`. The page is not in this repository.

## Server layout (Contabo, `/root/supersync`)

`docker-compose.fork.yml`:

```yaml
services:
  supersync:
    image: supersync-fork:0ae7861756
    environment:
      TRACKER_PAGE_DIR: /app/tracker-page
    volumes:
      - ./tracker-page:/app/tracker-page:ro
```

The page files live in `/root/supersync/tracker-page/` (`index.html`,
`tracker.js`). Replacing them needs no restart. The previous override is kept as
`docker-compose.fork.yml.e648257662.bak`, and the pre-deploy database dump as
`/root/supersync-before-tracker-20261120-015538.sql.gz`.

Build, transfer, migrate-then-swap and verification follow
[supersync-fork-image.md](supersync-fork-image.md) sections 4–7, with the image
tag above. After this change `tools/list` returns ten names, not three.

## Verified at deploy (2026-11-20)

- Migrate one-off: `Applying migration 20261120000000_add_tracker_documents`,
  exit 0, `_prisma_migrations` at `39|34|5|20261120000000_add_tracker_documents`.
- Swap: healthy, `Server started … (revision ct-20261120a)`.
- Anonymous: `/tracker` 302, `/tracker/` 200 sign-in shell, `/tracker/tracker.js`,
  `/api/tracker` and `/mcp` 401.
- With a temporary capture token (revoked afterwards): `tools/list` lists the ten
  tools, `tracker_get` answers, the session cookie is `HttpOnly; SameSite=Strict;
Secure`, and the cookie serves the page and its script.

## Rollback

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
