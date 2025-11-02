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

# 本番環境でマイグレーションを自動実行
# MIGRATE_ON_DEPLOY=true を環境変数で設定すると有効化
if [ "$MIGRATE_ON_DEPLOY" = "true" ] && [ "$NODE_ENV" = "production" ]; then
  echo "Running database migrations..."
  npm run prisma:migrate:deploy
  echo "Migrations completed successfully"
elif [ "$NODE_ENV" = "production" ]; then
  echo "Skipping migrations (MIGRATE_ON_DEPLOY is not set to true)"
  echo "To enable automatic migrations, set MIGRATE_ON_DEPLOY=true"
fi

exec "$@"
