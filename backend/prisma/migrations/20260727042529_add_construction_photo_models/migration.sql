-- CreateTable
CREATE TABLE "construction_photo_albums" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "construction_photo_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_photos" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "thumbnailPath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "comment" TEXT,
    "includeInReport" BOOLEAN NOT NULL DEFAULT false,
    "signboardId" TEXT,
    "signboardPlacement" JSONB,
    "sourceSurveyImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_signboards" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workName" TEXT NOT NULL,
    "workLocation" TEXT NOT NULL,
    "freeItems" JSONB NOT NULL DEFAULT '[]',
    "footerText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "construction_signboards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "construction_photo_albums_projectId_idx" ON "construction_photo_albums"("projectId");

-- CreateIndex
CREATE INDEX "construction_photo_albums_deletedAt_idx" ON "construction_photo_albums"("deletedAt");

-- CreateIndex
CREATE INDEX "construction_photo_albums_name_idx" ON "construction_photo_albums"("name");

-- CreateIndex
CREATE INDEX "construction_photos_albumId_idx" ON "construction_photos"("albumId");

-- CreateIndex
CREATE INDEX "construction_photos_displayOrder_idx" ON "construction_photos"("displayOrder");

-- CreateIndex
CREATE INDEX "construction_photos_includeInReport_idx" ON "construction_photos"("includeInReport");

-- CreateIndex
CREATE INDEX "construction_photos_signboardId_idx" ON "construction_photos"("signboardId");

-- CreateIndex
CREATE INDEX "construction_signboards_projectId_idx" ON "construction_signboards"("projectId");

-- CreateIndex
CREATE INDEX "construction_signboards_deletedAt_idx" ON "construction_signboards"("deletedAt");

-- AddForeignKey
ALTER TABLE "construction_photo_albums" ADD CONSTRAINT "construction_photo_albums_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_photos" ADD CONSTRAINT "construction_photos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "construction_photo_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_photos" ADD CONSTRAINT "construction_photos_signboardId_fkey" FOREIGN KEY ("signboardId") REFERENCES "construction_signboards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_signboards" ADD CONSTRAINT "construction_signboards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "progress_record_items_progressRecordId_executionBudgetItemId_ke" RENAME TO "progress_record_items_progressRecordId_executionBudgetItemI_key";
