-- 受領見積書の台帳の項目（estimate-request の Requirement 43〜49、Task 112.1）
-- 受領見積書に案件・業者名・取引先・見積の情報・読取の確認・原本の指紋・見積の区別を、
-- 明細行に区分・条件・換算・分類キー・数量表の行のキー・参考の印と理由を足し、見積依頼を任意にする（14.1）。
-- 実行中に切り替える設定の表（system_settings。design の D8）と、外部の AI での読み取りの
-- 専用の権限（claude_vision:use。design の D7、49.6）を足す。
-- 既存の受領見積書は、見積依頼の案件と宛先の取引先で埋めてから業者名を NOT NULL にする（44.9）。
-- 既存の明細行の区分は列の既定の直接工事（DIRECT）で入る（45.13）。
-- 既存のファイルの原本の指紋は SQL で求められないため、埋め戻しのスクリプトが行う（48.8）。

-- CreateEnum
CREATE TYPE "ReceivedQuotationConstructionKind" AS ENUM ('RENOVATION', 'NEW_CONSTRUCTION');

-- CreateEnum
CREATE TYPE "ReceivedQuotationAdoption" AS ENUM ('ADOPTED', 'REJECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReceivedQuotationReadingStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ReceivedQuotationLineCategory" AS ENUM ('DIRECT', 'OVERHEAD', 'TRAVEL', 'WASTE', 'DISCOUNT', 'LEGAL_WELFARE', 'EXCLUDED');

-- AlterTable: 明細行の区分（既存の行は既定の直接工事になる。45.13）
ALTER TABLE "received_quotation_line_items" ADD COLUMN     "category" "ReceivedQuotationLineCategory" NOT NULL DEFAULT 'DIRECT';

-- AlterTable: 明細行の条件・換算・分類キー・数量表の行のキー・参考の印と理由
ALTER TABLE "received_quotation_line_items" ADD COLUMN     "classification_key" VARCHAR(50),
ADD COLUMN     "condition" VARCHAR(500),
ADD COLUMN     "conversion_basis" VARCHAR(500),
ADD COLUMN     "conversion_quantity" DECIMAL(15,4),
ADD COLUMN     "conversion_unit" VARCHAR(50),
ADD COLUMN     "conversion_unit_price" DECIMAL(15,2),
ADD COLUMN     "is_reference" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quantity_row_key" VARCHAR(1000),
ADD COLUMN     "reference_reason" VARCHAR(200);

-- AlterTable: 受領見積書の列（業者名は埋め戻しの後に NOT NULL にするため、ここでは NULL 許容で足す）
ALTER TABLE "received_quotations" ADD COLUMN     "adoption" "ReceivedQuotationAdoption" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "confirmed_amount" DECIMAL(15,0),
ADD COLUMN     "construction_kind" "ReceivedQuotationConstructionKind",
ADD COLUMN     "construction_price" DECIMAL(15,0),
ADD COLUMN     "distance_km" DECIMAL(6,1),
ADD COLUMN     "file_sha256" CHAR(64),
ADD COLUMN     "overall_conditions" VARCHAR(2000),
ADD COLUMN     "project_id" TEXT,
ADD COLUMN     "quote_discriminator" VARCHAR(100) NOT NULL DEFAULT '',
ADD COLUMN     "quote_number" VARCHAR(100),
ADD COLUMN     "reading_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "reading_confirmed_by_id" TEXT,
ADD COLUMN     "reading_status" "ReceivedQuotationReadingStatus" NOT NULL DEFAULT 'UNCONFIRMED',
ADD COLUMN     "site_location" VARCHAR(100),
ADD COLUMN     "trading_partner_id" TEXT,
ADD COLUMN     "use_type" VARCHAR(100),
ADD COLUMN     "vendor_name" VARCHAR(200),
ADD COLUMN     "work_conditions" VARCHAR(200);

-- AlterTable: 見積依頼を任意にする（14.1）
ALTER TABLE "received_quotations" ALTER COLUMN "estimateRequestId" DROP NOT NULL;

-- 埋め戻し 1: 案件を見積依頼の案件で埋める（design の D1）
UPDATE "received_quotations" AS rq
SET "project_id" = er."projectId"
FROM "estimate_requests" AS er
WHERE rq."estimateRequestId" = er."id"
  AND rq."project_id" IS NULL;

-- 埋め戻し 2: 業者名と取引先を見積依頼の宛先の取引先の名前と ID で埋める（44.9）
UPDATE "received_quotations" AS rq
SET "vendor_name" = LEFT(tp."name", 200),
    "trading_partner_id" = tp."id"
FROM "estimate_requests" AS er
JOIN "trading_partners" tp ON tp."id" = er."tradingPartnerId"
WHERE rq."estimateRequestId" = er."id"
  AND rq."vendor_name" IS NULL;

-- 業者名を必須にする（44.1、44.9）
ALTER TABLE "received_quotations" ALTER COLUMN "vendor_name" SET NOT NULL;

-- 見積依頼に紐づくものは案件を持つ（design の D1）
ALTER TABLE "received_quotations" ADD CONSTRAINT "received_quotations_estimate_request_project_check" CHECK ("estimateRequestId" IS NULL OR "project_id" IS NOT NULL);

-- CreateTable: システムの設定（design の D8。行が無いときは有効として読むため、行は作らない）
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "received_quotations_project_id_idx" ON "received_quotations"("project_id");

-- CreateIndex
CREATE INDEX "received_quotations_project_id_file_sha256_idx" ON "received_quotations"("project_id", "file_sha256");

-- AddForeignKey
ALTER TABLE "received_quotations" ADD CONSTRAINT "received_quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_quotations" ADD CONSTRAINT "received_quotations_trading_partner_id_fkey" FOREIGN KEY ("trading_partner_id") REFERENCES "trading_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_quotations" ADD CONSTRAINT "received_quotations_reading_confirmed_by_id_fkey" FOREIGN KEY ("reading_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 外部の AI での読み取りの専用の権限を足す（seed が先に作っていれば何もしない。design の D7）
INSERT INTO "permissions" ("id", "resource", "action", "description")
VALUES (gen_random_uuid()::text, 'claude_vision', 'use', '外部のAIでの読み取りの利用')
ON CONFLICT ("resource", "action") DO NOTHING;

-- 既存の環境で Vision を使えたロール（estimate_request:read を持つロール）へ付与する（49.6）。
-- システム管理者ロールは *:* で全権限を持つため、割り当ては要らない
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "assignedAt")
SELECT gen_random_uuid()::text, rp."roleId", vision."id", CURRENT_TIMESTAMP
FROM "role_permissions" AS rp
JOIN "permissions" AS p ON p."id" = rp."permissionId"
CROSS JOIN "permissions" AS vision
WHERE p."resource" = 'estimate_request'
  AND p."action" = 'read'
  AND vision."resource" = 'claude_vision'
  AND vision."action" = 'use'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
