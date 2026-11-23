-- 外部アプリの接続と認可サーバーの保存データ（user-authentication タスク 71.1）。
-- 2 つの表と権限を、動いている環境へ入れる。既存の行は変えない。
-- IF NOT EXISTS と ON CONFLICT DO NOTHING で、やり直せる。

-- 1. 接続。範囲に read を必ず含むことは Prisma のスキーマで書けないため、CHECK 制約で守る。
-- Prisma の配列の列は NULL を許し、NULL は ANY の比較を素通りするので、NOT NULL も条件に含める
CREATE TABLE IF NOT EXISTS "external_app_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "scopes" TEXT[],
    "consented_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_app_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "external_app_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "external_app_connections_scopes_include_read" CHECK ("scopes" IS NOT NULL AND 'read' = ANY ("scopes"))
);

CREATE UNIQUE INDEX IF NOT EXISTS "external_app_connections_grant_id_key" ON "external_app_connections"("grant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "external_app_connections_user_id_client_id_key" ON "external_app_connections"("user_id", "client_id");
CREATE INDEX IF NOT EXISTS "external_app_connections_client_id_idx" ON "external_app_connections"("client_id");
CREATE INDEX IF NOT EXISTS "external_app_connections_last_used_at_idx" ON "external_app_connections"("last_used_at");
CREATE INDEX IF NOT EXISTS "external_app_connections_expires_at_idx" ON "external_app_connections"("expires_at");

-- 2. 認可サーバーの保存データ。接続より先に作られる行があるため、grant_id に外部キーは持たない
CREATE TABLE IF NOT EXISTS "oauth_store_records" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "grant_id" TEXT,
    "uid" TEXT,
    "payload" JSONB NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "oauth_store_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "oauth_store_records_grant_id_idx" ON "oauth_store_records"("grant_id");
CREATE INDEX IF NOT EXISTS "oauth_store_records_uid_idx" ON "oauth_store_records"("uid");
CREATE INDEX IF NOT EXISTS "oauth_store_records_expires_at_idx" ON "oauth_store_records"("expires_at");

-- 3. 外部アプリの接続の権限を足す（seed が先に作っていれば何もしない。要件46.2）。
-- システム管理者ロールは *:* で全権限を持つため、割り当ての行は足さない。一般ユーザーロールには与えない
INSERT INTO "permissions" ("id", "resource", "action", "description")
VALUES (gen_random_uuid()::text, 'external_app', 'connect', '外部アプリの接続')
ON CONFLICT ("resource", "action") DO NOTHING;
