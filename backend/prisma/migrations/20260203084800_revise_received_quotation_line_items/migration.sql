-- Task 20.1: ReceivedQuotationLineItemテーブルを新規作成
-- Task 20.2: ReceivedQuotationモデルの改訂マイグレーション
--
-- Migration Strategy:
-- Phase 1: ReceivedQuotationLineItemテーブル新規作成
-- Phase 2: 既存データ移行（contentType='TEXT'のtextContentを明細行に変換）
-- Phase 3: contentType列・textContent列・Enum削除

-- ============================================================
-- Phase 1: スキーマ追加 - ReceivedQuotationLineItemテーブル新規作成
-- ============================================================

-- CreateTable
CREATE TABLE "received_quotation_line_items" (
    "id" TEXT NOT NULL,
    "receivedQuotationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(15, 4),
    "unitPrice" DECIMAL(15, 2),
    "amount" DECIMAL(15, 2),
    "remarks" TEXT,

    CONSTRAINT "received_quotation_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "received_quotation_line_items_receivedQuotationId_idx" ON "received_quotation_line_items"("receivedQuotationId");

-- CreateIndex
CREATE INDEX "received_quotation_line_items_sortOrder_idx" ON "received_quotation_line_items"("sortOrder");

-- AddForeignKey (CASCADE DELETE: 親の受領見積書削除時に明細行も削除)
ALTER TABLE "received_quotation_line_items" ADD CONSTRAINT "received_quotation_line_items_receivedQuotationId_fkey" FOREIGN KEY ("receivedQuotationId") REFERENCES "received_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Phase 2: データ移行 - contentType='TEXT'のtextContentを明細行に変換
-- ============================================================

-- contentType='TEXT'かつtextContentが存在するレコードを明細行に変換
-- 1行目（sortOrder=0）にtextContent全文を名称として挿入
INSERT INTO "received_quotation_line_items" ("id", "receivedQuotationId", "sortOrder", "name")
SELECT
    gen_random_uuid(),
    rq."id",
    0,
    rq."textContent"
FROM "received_quotations" rq
WHERE rq."contentType" = 'TEXT'
  AND rq."textContent" IS NOT NULL
  AND rq."textContent" != ''
  AND rq."deletedAt" IS NULL;

-- ============================================================
-- Phase 3: スキーマクリーンアップ - contentType列・textContent列・Enum削除
-- ============================================================

-- AlterTable: contentType列を削除
ALTER TABLE "received_quotations" DROP COLUMN "contentType";

-- AlterTable: textContent列を削除
ALTER TABLE "received_quotations" DROP COLUMN "textContent";

-- DropEnum: ReceivedQuotationContentType Enumを削除
DROP TYPE "ReceivedQuotationContentType";
