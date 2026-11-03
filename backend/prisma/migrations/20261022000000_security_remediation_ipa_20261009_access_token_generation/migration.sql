-- IPA注意喚起（2026-10-09）に基づくセキュリティ是正のうち、管理者による 2FA の再設定より前に発行されたアクセストークンの拒否（user-authentication Task 47.11）。
-- 利用者にアクセストークンの世代を加える（要件34.7）。管理者の 2FA の再設定で 1 つ進め、発行時の世代（クレーム gen）がこれより小さいアクセストークンを拒否する。
-- 既存のアクセストークンは gen を持たず 0 として扱い、既存の利用者の世代も 0 のため、移行で無効にならない（design.md「移行」の 7）。

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "access_token_generation" INTEGER NOT NULL DEFAULT 0;
