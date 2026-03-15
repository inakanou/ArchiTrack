-- CreateTable
CREATE TABLE "construction_schedules" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantityTableId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "construction_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_items" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceQuantityItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "labelText" TEXT NOT NULL DEFAULT '',
    "detailText" TEXT NOT NULL DEFAULT '',
    "startDate" DATE,
    "duration" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isExportTarget" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "construction_schedules_projectId_idx" ON "construction_schedules"("projectId");

-- CreateIndex
CREATE INDEX "construction_schedules_deletedAt_idx" ON "construction_schedules"("deletedAt");

-- CreateIndex
CREATE INDEX "schedule_items_scheduleId_idx" ON "schedule_items"("scheduleId");

-- CreateIndex
CREATE INDEX "schedule_items_scheduleId_displayOrder_idx" ON "schedule_items"("scheduleId", "displayOrder");

-- AddForeignKey
ALTER TABLE "construction_schedules" ADD CONSTRAINT "construction_schedules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_schedules" ADD CONSTRAINT "construction_schedules_quantityTableId_fkey" FOREIGN KEY ("quantityTableId") REFERENCES "quantity_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "construction_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_sourceQuantityItemId_fkey" FOREIGN KEY ("sourceQuantityItemId") REFERENCES "quantity_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
