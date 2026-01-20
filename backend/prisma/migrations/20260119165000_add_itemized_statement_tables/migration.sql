-- CreateTable
CREATE TABLE "itemized_statements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceQuantityTableId" TEXT NOT NULL,
    "sourceQuantityTableName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "itemized_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itemized_statement_items" (
    "id" TEXT NOT NULL,
    "itemizedStatementId" TEXT NOT NULL,
    "customCategory" TEXT,
    "workType" TEXT,
    "name" TEXT,
    "specification" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "itemized_statement_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: projectIdでのフィルタリング用
CREATE INDEX "itemized_statements_projectId_idx" ON "itemized_statements"("projectId");

-- CreateIndex: 論理削除フィルタリング用
CREATE INDEX "itemized_statements_deletedAt_idx" ON "itemized_statements"("deletedAt");

-- CreateIndex: 作成日時でのソート用
CREATE INDEX "itemized_statements_createdAt_idx" ON "itemized_statements"("createdAt");

-- CreateIndex: 内訳書項目の内訳書IDでの検索用
CREATE INDEX "itemized_statement_items_itemizedStatementId_idx" ON "itemized_statement_items"("itemizedStatementId");

-- CreateIndex: 内訳書項目の内訳書ID + 表示順序での検索・ソート用
CREATE INDEX "itemized_statement_items_itemizedStatementId_displayOrder_idx" ON "itemized_statement_items"("itemizedStatementId", "displayOrder");

-- CreateIndex: 同一プロジェクト内での内訳書名重複を防ぐ部分一意制約（論理削除されていないレコードのみ）
-- PostgreSQLの部分インデックスを使用して実装
CREATE UNIQUE INDEX "itemized_statements_projectId_name_unique_not_deleted" ON "itemized_statements"("projectId", "name") WHERE "deletedAt" IS NULL;

-- AddForeignKey: プロジェクトへの外部キー（カスケード削除）
ALTER TABLE "itemized_statements" ADD CONSTRAINT "itemized_statements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: 内訳書への外部キー（カスケード削除）
ALTER TABLE "itemized_statement_items" ADD CONSTRAINT "itemized_statement_items_itemizedStatementId_fkey" FOREIGN KEY ("itemizedStatementId") REFERENCES "itemized_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
