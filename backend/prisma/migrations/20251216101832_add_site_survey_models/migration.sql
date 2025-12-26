-- CreateTable
CREATE TABLE "site_surveys" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surveyDate" DATE NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "site_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_images" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "thumbnailPath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_annotations" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_surveys_projectId_idx" ON "site_surveys"("projectId");

-- CreateIndex
CREATE INDEX "site_surveys_surveyDate_idx" ON "site_surveys"("surveyDate");

-- CreateIndex
CREATE INDEX "site_surveys_deletedAt_idx" ON "site_surveys"("deletedAt");

-- CreateIndex
CREATE INDEX "site_surveys_name_idx" ON "site_surveys"("name");

-- CreateIndex
CREATE INDEX "survey_images_surveyId_idx" ON "survey_images"("surveyId");

-- CreateIndex
CREATE INDEX "survey_images_displayOrder_idx" ON "survey_images"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "image_annotations_imageId_key" ON "image_annotations"("imageId");

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_images" ADD CONSTRAINT "survey_images_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "site_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_annotations" ADD CONSTRAINT "image_annotations_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "survey_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "name_branchName_deletedAt" RENAME TO "trading_partners_name_branchName_deletedAt_key";
