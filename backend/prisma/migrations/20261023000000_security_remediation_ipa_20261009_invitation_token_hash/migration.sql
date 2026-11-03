-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、招待のトークンのハッシュ保存（user-authentication Task 50.1）。
-- 招待のトークンの原文の列を、原文の SHA-256 の 16 進を持つ空を許す列へ作り直す（要件37.1）。
-- 既存の行は原文から SHA-256 を計算して移すため、未使用の招待のリンクは有効のまま残る（design.md「移行」の 3）。
-- 定期処理（Task 44.9）が空にした行は空のまま残す（行は状態・期限・作成者とともに残る。要件37.4）。

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "token_hash" TEXT;

-- 原文から SHA-256（16 進の小文字）を移す。アプリの hashInvitationToken（UTF-8 の SHA-256 の 16 進）と同じ値になる
UPDATE "invitations"
SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" IS NOT NULL;

-- DropIndex
DROP INDEX "invitations_token_idx";

-- DropIndex
DROP INDEX "invitations_token_key";

-- AlterTable
ALTER TABLE "invitations" DROP COLUMN "token";

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
