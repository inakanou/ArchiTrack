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

# マイグレーション自動実行
# 開発環境: 常にマイグレーション実行
# 本番環境: MIGRATE_ON_DEPLOY=true の場合のみ実行
if [ "$NODE_ENV" = "development" ]; then
  echo "Running database migrations (development)..."
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

exec "$@"
