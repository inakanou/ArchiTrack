-- AlterTable
ALTER TABLE "survey_images" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "includeInReport" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "survey_images_includeInReport_idx" ON "survey_images"("includeInReport");
