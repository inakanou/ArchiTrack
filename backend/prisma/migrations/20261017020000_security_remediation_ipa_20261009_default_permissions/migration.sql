-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、既定の権限の改め（user-authentication Task 44.4）。
-- 一般ユーザーロールの既定権限からユーザー一覧の閲覧（user:read）を外し（要件38.4）、
-- 全案件閲覧（project:read_all）と運用設定の管理（ops:manage）の権限を加える（要件39.5）。
-- システム管理者ロールは *:* で全権限を持つため、新しい権限の割り当ては要らない。

-- 1. 一般ユーザーロール（user）から user:read の割り当てを外す
DELETE FROM "role_permissions" AS rp
USING "roles" AS r, "permissions" AS p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."name" = 'user'
  AND p."resource" = 'user'
  AND p."action" = 'read';

-- 2. 全案件閲覧と運用設定の管理の権限を加える（seed が先に作っていれば何もしない）
INSERT INTO "permissions" ("id", "resource", "action", "description")
VALUES
  (gen_random_uuid()::text, 'project', 'read_all', '全案件の閲覧'),
  (gen_random_uuid()::text, 'ops', 'manage', '運用設定の管理')
ON CONFLICT ("resource", "action") DO NOTHING;
