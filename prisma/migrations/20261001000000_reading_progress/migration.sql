CREATE TABLE "reading_progress" (
  "user_uuid" TEXT NOT NULL,
  "manga_uuid" TEXT NOT NULL,
  "page_index" INTEGER NOT NULL CHECK ("page_index" >= 0),
  "mode" TEXT NOT NULL CHECK ("mode" IN ('paged', 'scroll')),
  "state" TEXT NOT NULL CHECK ("state" IN ('reading', 'completed')),
  "hidden_from_recent" BOOLEAN NOT NULL DEFAULT false,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "operation_id" TEXT NOT NULL,
  PRIMARY KEY ("user_uuid", "manga_uuid"),
  FOREIGN KEY ("user_uuid") REFERENCES "user"("uuid") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("manga_uuid") REFERENCES "manga"("uuid") ON DELETE CASCADE ON UPDATE CASCADE
);
