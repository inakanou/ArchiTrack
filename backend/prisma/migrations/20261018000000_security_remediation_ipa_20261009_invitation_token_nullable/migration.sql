-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、使用済み・期限切れのトークンの消去（user-authentication Task 44.9）。
-- 定期処理（expired-token-cleanup）が、使用済み・取り消し・期限切れの招待のトークンだけを消して行を残せるよう、
-- 招待のトークンの列に空を許す（要件37.4）。行は状態・期限・作成者とともに残す（要件1.7・13.2・13.7）。
-- 一意の索引は残す（PostgreSQL の一意の索引は複数の NULL を許す）。トークンが NULL の招待はどのトークンとも一致しない。

ALTER TABLE "invitations" ALTER COLUMN "token" DROP NOT NULL;
