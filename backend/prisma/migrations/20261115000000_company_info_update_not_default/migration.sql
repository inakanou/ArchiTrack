-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、自社情報の保存の権限の既定の改め（company-info タスク10.1）。
-- 一般ユーザーロール（user）の割り当てから自社情報の保存（company_info:update）を外す（要件6.11）。
-- 権限そのものは残す。システム管理者ロールは *:* で保存でき、管理者が独自のロールに付けた割り当ては変えない。
DELETE FROM "role_permissions" AS rp
USING "roles" AS r, "permissions" AS p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."name" = 'user'
  AND p."resource" = 'company_info'
  AND p."action" = 'update';
