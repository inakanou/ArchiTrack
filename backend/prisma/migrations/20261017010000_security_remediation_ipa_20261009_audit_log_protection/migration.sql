-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、監査ログの実行者の写しと改変の禁止（user-authentication Task 44.2）。
-- 実行者の利用者を消しても監査ログが残るよう外部キーを外して写しを持たせ（要件40.7）、
-- 更新を常に拒否し、削除をアーカイブの許可の設定がある取引の中に限る（要件40.8）。

-- 1. 実行者への外部キーを外す（利用者の削除で監査ログが連鎖して消えないようにする）
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actorId_fkey";

-- 2. 実行者を空にできる形にし、実行者のメールアドレスと表示名の写しの列を加える
ALTER TABLE "audit_logs" ALTER COLUMN "actorId" DROP NOT NULL;

ALTER TABLE "audit_logs" ADD COLUMN     "actor_display_name" TEXT,
ADD COLUMN     "actor_email" TEXT;

-- 3. 既存の行の写しを利用者から埋める（トリガーを作る前に行う）
UPDATE "audit_logs" AS a
SET "actor_email" = u."email",
    "actor_display_name" = u."displayName"
FROM "users" AS u
WHERE u."id" = a."actorId"
  AND a."actor_email" IS NULL;

-- 4. 改変の禁止: UPDATE は常に拒否し、DELETE はアーカイブの許可の設定
--    （SET LOCAL 相当の set_config('architrack.audit_archive', 'on', true)）がある取引の中でだけ許す。
--    TRUNCATE は行のトリガーを発火しないため対象外（試験の後始末が使う）
CREATE FUNCTION "audit_logs_immutable_guard"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs rows are immutable: UPDATE is not allowed';
  END IF;
  IF current_setting('architrack.audit_archive', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'audit_logs rows are immutable: DELETE is allowed only under architrack.audit_archive';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "audit_logs_immutable"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "audit_logs_immutable_guard"();
