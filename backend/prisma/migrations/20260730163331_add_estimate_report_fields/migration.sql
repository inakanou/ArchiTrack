-- AlterTable
-- 帳票用の追加入力項目（54.1〜54.3）。いずれも未入力を許容し、既定値で既存行を無変更のまま適用できる。
-- separate_works は順序を保持する TEXT[]。5件の上限はアプリ側で検証するため DB 制約は置かない。
ALTER TABLE "estimates" ADD COLUMN     "separate_works" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "submission_date" DATE,
ADD COLUMN     "validity_period" VARCHAR(100);
