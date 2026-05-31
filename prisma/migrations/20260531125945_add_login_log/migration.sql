-- CreateTable
CREATE TABLE "login_log" (
    "id" SERIAL NOT NULL,
    "user_uuid" TEXT,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_log_created_at_idx" ON "login_log"("created_at");

-- CreateIndex
CREATE INDEX "login_log_user_uuid_idx" ON "login_log"("user_uuid");

-- AddForeignKey
ALTER TABLE "login_log" ADD CONSTRAINT "login_log_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
