-- Fork: the task list an account shares with its assistants while task reading
-- is on. A row is one enablement: devices publish only against its enable_id,
-- and switching reading or capture off deletes the row. New, empty table only.
CREATE TABLE "capture_read_models" (
  "user_id" INTEGER PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "enable_id" TEXT NOT NULL,
  "enabled_at" BIGINT NOT NULL,
  "payload" TEXT,
  "published_at" BIGINT
);
