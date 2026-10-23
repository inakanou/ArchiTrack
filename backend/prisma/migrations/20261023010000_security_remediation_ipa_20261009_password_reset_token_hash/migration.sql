-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、パスワードリセットのトークンのハッシュ保存（user-authentication Task 50.2）。
-- パスワードリセットのトークンの原文の列を、原文の SHA-256 の 16 進を持つ必須の列へ作り直す（要件37.1）。
-- 既存の行は原文から SHA-256 を計算して移すため、未使用のリセットのリンクは有効のまま残る（design.md「移行」の 3）。
-- 定期処理（Task 44.9）は使用済み・期限切れの行そのものを消すため、原文の列に空の行は無い。

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "token_hash" TEXT;

-- 原文から SHA-256（16 進の小文字）を移す。アプリの hashPasswordResetToken（UTF-8 の SHA-256 の 16 進）と同じ値になる
UPDATE "password_reset_tokens"
SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

-- AlterTable
ALTER TABLE "password_reset_tokens" ALTER COLUMN "token_hash" SET NOT NULL;

-- DropIndex
DROP INDEX "password_reset_tokens_token_idx";

-- DropIndex
DROP INDEX "password_reset_tokens_token_key";

-- AlterTable
ALTER TABLE "password_reset_tokens" DROP COLUMN "token";

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
