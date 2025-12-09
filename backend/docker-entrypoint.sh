#!/bin/sh
set -e

# Extract database host and port from DATABASE_URL for wait-for-it.sh
# DATABASE_URL format: postgresql://user:password@host:port/database?schema=public
extract_db_host_port() {
  if [ -n "$DATABASE_URL" ]; then
    # Extract host:port using sed
    DB_HOST_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^/]*\)\/.*/\1/p')
    echo "$DB_HOST_PORT"
  fi
}

# Wait for database to be ready (production only)
wait_for_database() {
  DB_HOST_PORT=$(extract_db_host_port)
  if [ -n "$DB_HOST_PORT" ]; then
    echo "Waiting for database at $DB_HOST_PORT..."
    /usr/local/bin/wait-for-it.sh "$DB_HOST_PORT" -t 60
    echo "Database is ready!"
  else
    echo "Warning: Could not extract database host from DATABASE_URL"
  fi
}

echo "Checking dependencies..."

# package.jsonのハッシュを計算
CURRENT_HASH=$(sha256sum package.json package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1)
STORED_HASH=""

if [ -f "node_modules/.package-hash" ]; then
  STORED_HASH=$(cat node_modules/.package-hash)
fi

needs_install=false

if [ ! -d "node_modules/.bin" ]; then
  echo "node_modules is empty, installing dependencies..."
  needs_install=true
elif [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo "package.json or package-lock.json has changed, updating dependencies..."
  needs_install=true
else
  echo "Dependencies are up to date"
fi

if [ "$needs_install" = true ]; then
  npm ci
  # ハッシュを保存
  echo "$CURRENT_HASH" > node_modules/.package-hash
  echo "Dependencies installed successfully"
fi

echo "Generating Prisma Client..."
npm run prisma:generate

# JWT鍵の生成（存在しない場合）
if [ -z "$JWT_PUBLIC_KEY" ] || [ -z "$JWT_PRIVATE_KEY" ]; then
  echo "JWT keys not found, generating new keys..."

  # 鍵生成スクリプトを実行して一時ファイルに出力
  npx tsx scripts/generate-eddsa-keys.ts --env-format > /tmp/jwt-keys.env

  # 環境変数として読み込み
  export $(cat /tmp/jwt-keys.env | grep -v '^#' | xargs)

  # 一時ファイルを削除
  rm /tmp/jwt-keys.env

  echo "JWT keys generated successfully"
else
  echo "JWT keys found in environment"
fi

# マイグレーション自動実行
# 開発・テスト環境: 常にマイグレーション実行
# 本番環境: MIGRATE_ON_DEPLOY=true の場合のみ実行
if [ "$NODE_ENV" = "development" ] || [ "$NODE_ENV" = "test" ]; then
  echo "Running database migrations ($NODE_ENV)..."
  npm run prisma:migrate:deploy
  echo "Migrations completed successfully"
elif [ "$MIGRATE_ON_DEPLOY" = "true" ] && [ "$NODE_ENV" = "production" ]; then
  # Wait for database to be available before running migrations
  wait_for_database
  echo "Running database migrations (production)..."
  npm run prisma:migrate:deploy
  echo "Migrations completed successfully"
elif [ "$NODE_ENV" = "production" ]; then
  echo "Skipping migrations (MIGRATE_ON_DEPLOY is not set to true)"
  echo "To enable automatic migrations, set MIGRATE_ON_DEPLOY=true"
fi

# データベースシーディング（ロール・権限・初期管理者アカウント）
# 開発・テスト環境: 常に実行（TypeScriptソースから）
# 本番環境: RUN_SEED=true で明示的にopt-in（ビルド済みJavaScriptから）
if [ "$NODE_ENV" = "development" ] || [ "$NODE_ENV" = "test" ]; then
  echo "Running database seed..."
  npx tsx prisma/seed.ts
  echo "Seed completed successfully"
elif [ "$NODE_ENV" = "production" ] && [ "$RUN_SEED" = "true" ]; then
  echo "Running database seed (production - explicit opt-in)..."
  # 本番環境ではビルド済みのseed.jsを実行（dist/内のモジュール解決のため）
  # seed失敗を許容（既にデータが存在する場合など）
  if node dist/prisma/seed.js; then
    echo "Seed completed successfully"
  else
    echo "⚠️  Seed failed in production, but continuing startup..."
    echo "This is expected if roles/permissions/admin already exist."
  fi
fi

exec "$@"
