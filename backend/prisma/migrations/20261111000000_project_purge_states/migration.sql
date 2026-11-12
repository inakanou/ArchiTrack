-- 完全削除の失敗の記録（project-management の Requirement 46.10・46.11・46.14、Task 83.1）
-- 完全削除の失敗の回数と最後に試みた日時、対象から外した日時を、プロジェクトごとに 1 行持つ（design の D9）。
-- プロジェクトの完全削除で連鎖して消える。既存の行は作らない（導入の後の最初の失敗で作られる）。

-- CreateTable
CREATE TABLE "project_purge_states" (
    "project_id" TEXT NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "excluded_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_purge_states_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "project_purge_states_excluded_at_last_attempt_at_idx" ON "project_purge_states"("excluded_at", "last_attempt_at");

-- AddForeignKey
ALTER TABLE "project_purge_states" ADD CONSTRAINT "project_purge_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
