#!/bin/sh
set -e

echo "Checking dependencies..."

if [ ! -d "node_modules/.bin" ]; then
  echo "node_modules is empty, installing dependencies..."
  npm ci
else
  echo "Dependencies are up to date"
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
  echo "Running database migrations (production)..."
  npm run prisma:migrate:deploy
  echo "Migrations completed successfully"
elif [ "$NODE_ENV" = "production" ]; then
  echo "Skipping migrations (MIGRATE_ON_DEPLOY is not set to true)"
  echo "To enable automatic migrations, set MIGRATE_ON_DEPLOY=true"
fi

# データベースシーディング（ロール・権限・初期管理者アカウント）
# マイグレーションが実行された場合のみseedを実行
if [ "$NODE_ENV" = "development" ] || [ "$NODE_ENV" = "test" ] || [ "$MIGRATE_ON_DEPLOY" = "true" ]; then
  echo "Running database seed..."
  npx tsx prisma/seed.ts
  echo "Seed completed successfully"
fi

exec "$@"
