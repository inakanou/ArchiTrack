-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、リフレッシュトークンのハッシュ保存と系列による再利用の検知（user-authentication Task 45.2）。
-- refresh_tokens を、原文の列に代えて SHA-256 のハッシュ・系列 ID・置き換えの日時を持つ形に作り直す（要件33.4〜33.7）。
-- 原文からハッシュへの移行はしない。既存の行は全て消し、全利用者が再ログインする（design.md「移行」の 2）。

DELETE FROM "refresh_tokens";

-- DropIndex
DROP INDEX "refresh_tokens_token_idx";

-- DropIndex
DROP INDEX "refresh_tokens_token_key";

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "token",
ADD COLUMN     "family_id" TEXT NOT NULL,
ADD COLUMN     "replaced_at" TIMESTAMP(3),
ADD COLUMN     "token_hash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
