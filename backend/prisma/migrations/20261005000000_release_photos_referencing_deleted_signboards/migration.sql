-- 取り除かれた（論理削除済みの）工事看板を指す写真項目の看板の指定と配置を、一度だけ解除する。
-- メタの一括更新が看板の検証をトランザクションの外で行っていた間に、検証の後・書き込みの前に
-- 看板の取り除きが確定すると、こうした行が残りえた（construction-photo Task 24.1）。
-- 解除の形は看板の取り除き（ConstructionSignboardService.delete）に揃え、配置は JSON の null とする。
UPDATE "construction_photos"
SET "signboardId" = NULL, "signboardPlacement" = 'null'::jsonb
WHERE "signboardId" IN (
  SELECT "id" FROM "construction_signboards" WHERE "deletedAt" IS NOT NULL
);
