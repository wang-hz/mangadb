-- CreateTable
CREATE TABLE "manga" (
    "pid" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "fullname" TEXT NOT NULL,
    "display_title" TEXT NOT NULL,
    "original_title" TEXT NOT NULL,
    "publish_date" TIMESTAMP(3),
    "pages" JSONB NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manga_pkey" PRIMARY KEY ("pid")
);

-- CreateTable
CREATE TABLE "tag" (
    "pid" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag_type_uuid" TEXT NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("pid")
);

-- CreateTable
CREATE TABLE "manga_tag" (
    "pid" SERIAL NOT NULL,
    "manga_uuid" TEXT NOT NULL,
    "tag_uuid" TEXT NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manga_tag_pkey" PRIMARY KEY ("pid")
);

-- CreateTable
CREATE TABLE "tag_type" (
    "pid" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_type_pkey" PRIMARY KEY ("pid")
);

-- CreateIndex
CREATE UNIQUE INDEX "manga_uuid_key" ON "manga"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "manga_fullname_key" ON "manga"("fullname");

-- CreateIndex
CREATE INDEX "manga_update_at_original_title_idx" ON "manga"("update_at", "original_title");

-- CreateIndex
CREATE UNIQUE INDEX "tag_uuid_key" ON "tag"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "tag"("name");

-- CreateIndex
CREATE INDEX "manga_tag_tag_uuid_idx" ON "manga_tag"("tag_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "manga_tag_manga_uuid_tag_uuid_key" ON "manga_tag"("manga_uuid", "tag_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tag_type_uuid_key" ON "tag_type"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tag_type_name_key" ON "tag_type"("name");

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_tag_type_uuid_fkey" FOREIGN KEY ("tag_type_uuid") REFERENCES "tag_type"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manga_tag" ADD CONSTRAINT "manga_tag_manga_uuid_fkey" FOREIGN KEY ("manga_uuid") REFERENCES "manga"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manga_tag" ADD CONSTRAINT "manga_tag_tag_uuid_fkey" FOREIGN KEY ("tag_uuid") REFERENCES "tag"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
