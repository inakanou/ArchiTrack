-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正の基盤のうち、利用者の状態と案件の索引（user-authentication Task 44.1）。
-- 列の追加と招待者の記録だけを行い、既存の列の意味は変えない。トークンの列の作り替えと監査ログの写し・トリガーは後続の移行で行う。

-- 1. 利用者の状態の列（要件32・34・36）
ALTER TABLE "users" ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "deactivation_reason" TEXT,
ADD COLUMN     "invited_by_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "two_factor_last_used_step" INTEGER,
ADD COLUMN     "two_factor_pending_secret" TEXT;

-- 既存の利用者の最終ログイン日時を移行日時（UTC）で埋める。
-- 90日の自動無効化（要件36.8）の起点を移行日にし、移行の直後に一斉に無効化されないようにする。
UPDATE "users" SET "last_login_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "last_login_at" IS NULL;

-- 2. 使用済みの招待から利用者の招待者を埋める（要件36.10）。以後は登録時に招待の作成者を写す
UPDATE "users" AS u
SET "invited_by_id" = i."inviterId"
FROM "invitations" AS i
WHERE i."userId" = u."id"
  AND i."status" = 'used'
  AND u."invited_by_id" IS NULL;

-- 3. 索引（自動無効化の対象の抽出、案件の閲覧範囲の絞り込み）
CREATE INDEX "users_is_active_last_login_at_idx" ON "users"("is_active", "last_login_at");

CREATE INDEX "projects_constructionPersonId_idx" ON "projects"("constructionPersonId");

CREATE INDEX "projects_createdById_idx" ON "projects"("createdById");

-- 4. 招待者への外部キー（招待者の利用者が削除されたら NULL にする）
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
