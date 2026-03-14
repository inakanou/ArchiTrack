-- CreateTable
CREATE TABLE "construction_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "quantity_table_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "construction_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    "source_quantity_item_id" UUID,
    "item_name" VARCHAR(500) NOT NULL,
    "label_text" VARCHAR(200) NOT NULL DEFAULT '',
    "detail_text" VARCHAR(500) NOT NULL DEFAULT '',
    "start_date" DATE,
    "duration" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_export_target" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_construction_schedules_project_id" ON "construction_schedules"("project_id");

-- CreateIndex
CREATE INDEX "idx_construction_schedules_deleted_at" ON "construction_schedules"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_schedule_items_schedule_id" ON "schedule_items"("schedule_id");

-- CreateIndex
CREATE INDEX "idx_schedule_items_display_order" ON "schedule_items"("schedule_id", "display_order");

-- AddForeignKey
ALTER TABLE "construction_schedules" ADD CONSTRAINT "construction_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_schedules" ADD CONSTRAINT "construction_schedules_quantity_table_id_fkey" FOREIGN KEY ("quantity_table_id") REFERENCES "quantity_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "construction_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_source_quantity_item_id_fkey" FOREIGN KEY ("source_quantity_item_id") REFERENCES "quantity_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
