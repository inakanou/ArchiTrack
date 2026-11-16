-- 単価台帳（unit-price-ledger タスク 1.2。design の UnitPriceLedgerPermissionMigration）。
-- pg_trgm・台帳の欄・索引・権限を、動いている環境へ入れる。既存の行は変えない。
-- IF NOT EXISTS と ON CONFLICT DO NOTHING で、やり直せる。

-- 1. 名称の近さの検索のための拡張（索引の作成より前に置く）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 受領見積書に台帳の 3 つの欄を足す（どれも任意。案件の受領見積書では空）
ALTER TABLE "received_quotations" ADD COLUMN IF NOT EXISTS "ledger_card_id" VARCHAR(200);
ALTER TABLE "received_quotations" ADD COLUMN IF NOT EXISTS "ledger_source_path" VARCHAR(1000);
ALTER TABLE "received_quotations" ADD COLUMN IF NOT EXISTS "ledger_project_name" VARCHAR(255);

-- 3. カードの ID の一意の索引（論理削除されていない行だけ。2.14）。
-- 部分索引は Prisma のスキーマで書けないため、SQL だけで作る（先例は itemized_statements の名前の一意の索引）
CREATE UNIQUE INDEX IF NOT EXISTS "received_quotations_ledger_card_id_unique_not_deleted" ON "received_quotations"("ledger_card_id") WHERE "deletedAt" IS NULL;

-- 4. 明細行の名称の GIN の 3 文字組の索引（スキーマにも書く）
CREATE INDEX IF NOT EXISTS "received_quotation_line_items_name_idx" ON "received_quotation_line_items" USING GIN ("name" gin_trgm_ops);

-- 5. 台帳の管理の権限を足す（seed が先に作っていれば何もしない。10.3）。
-- システム管理者ロールは *:* で全権限を持つため、割り当ての行は足さない。一般ユーザーロールには与えない
INSERT INTO "permissions" ("id", "resource", "action", "description")
VALUES (gen_random_uuid()::text, 'unit_price_ledger', 'manage', '単価台帳の管理')
ON CONFLICT ("resource", "action") DO NOTHING;
