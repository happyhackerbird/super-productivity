-- Fork: the personal tracker document, one JSON text per account, shared by the
-- tracker page and assistants. version is the optimistic-concurrency counter.
-- New, empty table only.
CREATE TABLE "tracker_documents" (
  "user_id" INTEGER PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "version" INTEGER NOT NULL,
  "data" TEXT NOT NULL,
  "updated_at" BIGINT NOT NULL
);
