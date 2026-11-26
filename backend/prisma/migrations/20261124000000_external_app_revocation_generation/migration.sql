-- 外部アプリの接続の失効の世代（user-authentication タスク 72.3、要件50.1〜50.4）。
-- 失効と同時に進んだ同意の接続が失効の後に残らないよう、同意の確定時に世代を比べる。
-- 既存の行は既定の 0 になる。IF NOT EXISTS で、やり直せる。
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "external_app_revocation_generation" INTEGER NOT NULL DEFAULT 0;
