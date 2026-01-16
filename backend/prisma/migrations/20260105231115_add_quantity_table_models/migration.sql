-- CreateEnum
CREATE TYPE "CalculationMethod" AS ENUM ('STANDARD', 'AREA_VOLUME', 'PITCH');

-- CreateTable
CREATE TABLE "quantity_tables" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quantity_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quantity_groups" (
    "id" TEXT NOT NULL,
    "quantityTableId" TEXT NOT NULL,
    "surveyImageId" TEXT,
    "name" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quantity_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quantity_items" (
    "id" TEXT NOT NULL,
    "quantityGroupId" TEXT NOT NULL,
    "majorCategory" TEXT NOT NULL,
    "middleCategory" TEXT,
    "minorCategory" TEXT,
    "customCategory" TEXT,
    "workType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT,
    "unit" TEXT NOT NULL,
    "calculationMethod" "CalculationMethod" NOT NULL DEFAULT 'STANDARD',
    "calculationParams" JSONB,
    "adjustmentFactor" DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
    "roundingUnit" DECIMAL(10,4) NOT NULL DEFAULT 0.0100,
    "quantity" DECIMAL(15,4) NOT NULL,
    "remarks" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quantity_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quantity_tables_projectId_idx" ON "quantity_tables"("projectId");

-- CreateIndex
CREATE INDEX "quantity_tables_deletedAt_idx" ON "quantity_tables"("deletedAt");

-- CreateIndex
CREATE INDEX "quantity_groups_quantityTableId_displayOrder_idx" ON "quantity_groups"("quantityTableId", "displayOrder");

-- CreateIndex
CREATE INDEX "quantity_items_quantityGroupId_displayOrder_idx" ON "quantity_items"("quantityGroupId", "displayOrder");

-- AddForeignKey
ALTER TABLE "quantity_tables" ADD CONSTRAINT "quantity_tables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_groups" ADD CONSTRAINT "quantity_groups_quantityTableId_fkey" FOREIGN KEY ("quantityTableId") REFERENCES "quantity_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_groups" ADD CONSTRAINT "quantity_groups_surveyImageId_fkey" FOREIGN KEY ("surveyImageId") REFERENCES "survey_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_items" ADD CONSTRAINT "quantity_items_quantityGroupId_fkey" FOREIGN KEY ("quantityGroupId") REFERENCES "quantity_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
