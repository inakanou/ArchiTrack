-- 受領見積書の読取の確認の経路と、明細行の区分「端数調整」（estimate-request の Requirement 45.1・46.12、Task 123.1）
-- 受領見積書に読取の確認の経路の列（画面・台帳の取り込み・ArchiBench）を NULL 許容で足し、
-- 未確認は経路を持たない CHECK を置く。確認済みで経路が NULL の行は許す（追補の前の確認済み。46.20）。
-- 埋め戻しは行わない。既存の行の経路は NULL のままにする（46.20）。
-- 明細行の区分の enum に端数調整（ROUNDING）を足す。PostgreSQL は、同じトランザクションの中で足した
-- enum の値を使えないため、この migration の中では足した値を使わない。

-- CreateEnum
CREATE TYPE "ReceivedQuotationReadingRoute" AS ENUM ('SCREEN', 'LEDGER_IMPORT', 'ARCHIBENCH');

-- AlterEnum: 明細行の区分に端数調整を足す（45.1）
ALTER TYPE "ReceivedQuotationLineCategory" ADD VALUE 'ROUNDING';

-- AlterTable: 読取の確認の経路（46.12）
ALTER TABLE "received_quotations" ADD COLUMN     "reading_confirmation_route" "ReceivedQuotationReadingRoute";

-- 未確認は経路を持たない（46.12）
ALTER TABLE "received_quotations" ADD CONSTRAINT "received_quotations_reading_route_check" CHECK ("reading_status" = 'CONFIRMED' OR "reading_confirmation_route" IS NULL);
