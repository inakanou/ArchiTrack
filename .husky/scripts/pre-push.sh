#!/bin/bash
# ============================================================================
# エラーハンドリング設定
# ============================================================================
# -o pipefail: パイプラインのいずれかのコマンドが失敗したら全体を失敗とする
# これにより、teeコマンドでログ記録してもexit codeが正しく伝播する
# 注意: pipefailはbash固有の機能のため、shebangは#!/bin/bashを使用
set -o pipefail

# ============================================================================
# Git操作タイプの検出（ブランチ削除のスキップ）
# ============================================================================
# Git公式仕様: pre-pushフックは標準入力から以下の形式でref情報を受け取る
# <local ref> <local sha1> <remote ref> <remote sha1>
#
# ブランチ削除の特徴:
# - local_shaが40桁のゼロ (0000000000000000000000000000000000000000)
#
# ベストプラクティス:
# - ブランチ削除はGitリファレンスの削除のみ（コード変更なし）
# - 品質チェック（テスト、ビルド等）は不要
# - 30分以上の不要な待機を回避し、開発者体験を向上
#
# 参考: https://git-scm.com/docs/githooks#_pre_push
# ============================================================================

echo "🔍 Detecting Git operation type..."

# stdinからref情報を読み取る
while read local_ref local_sha remote_ref remote_sha; do
    # ブランチ/タグ削除の検出（local_shaが40桁のゼロ）
    if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
        echo "🗑️  Detected deletion operation: $remote_ref"
        echo "   Skipping pre-push quality checks (no code changes)"
        echo ""
        echo "✅ Branch deletion approved - no checks required"
        exit 0
    fi

    # 新規ブランチ作成の検出（remote_shaが40桁のゼロ）
    if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
        echo "🆕 Detected new branch creation: $local_ref → $remote_ref"
        echo "   Running full quality checks..."
        echo ""
        break
    fi

    # 既存ブランチへの更新
    echo "📝 Detected branch update: $local_ref → $remote_ref"
    echo "   Running full quality checks..."
    echo ""
    break
done

# stdinが空の場合（force pushや特殊なケース）も通常のチェックを実行
# この場合は安全側に倒してチェックを実行する

# ============================================================================
# クリーンアップシステム設定（ログ + テストアーティファクト）
# ============================================================================
# ベストプラクティス: テスト実行前に古いアーティファクトを削除してディスク容量を管理
# 保持ポリシー: 30日間（一貫性のため全て同じ期間）
# ============================================================================

echo "🧹 Cleaning up old test artifacts and logs..."

# ディレクトリの作成
mkdir -p .logs
mkdir -p playwright-report
mkdir -p test-results

# ============================================================================
# 1. ログファイルのクリーンアップとローテーション
# ============================================================================

# 30日以上前のログを削除
find .logs -name "pre-push-*.log" -type f -mtime +30 -delete 2>/dev/null || true
find .logs -name "pre-push-*.log.gz" -type f -mtime +30 -delete 2>/dev/null || true

# 7日以上前の未圧縮ログをgzip圧縮（ディスク使用量削減）
find .logs -name "pre-push-*.log" -type f -mtime +7 ! -name "pre-push-latest.log" -exec gzip {} \; 2>/dev/null || true

# ============================================================================
# 2. Playwright HTMLレポートのクリーンアップ
# ============================================================================

# 30日以上前のHTMLレポートディレクトリを削除
# パターン: playwright-report/YYYY-MM-DD_HH-MM-SS-sssZ/
find playwright-report -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true

# ============================================================================
# 3. テスト結果（スクリーンショット、ビデオ、トレース）のクリーンアップ
# ============================================================================

# 30日以上前のテスト結果ディレクトリを削除
# パターン: test-results/YYYY-MM-DD_HH-MM-SS-sssZ/
find test-results -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true

echo "✅ Cleanup completed"
echo ""

# ============================================================================
# ログファイルの設定
# ============================================================================

# タイムスタンプ付きログファイル名
TIMESTAMP=$(date +"%Y-%m-%d-%H-%M-%S")
LOG_FILE=".logs/pre-push-${TIMESTAMP}.log"
LATEST_LOG=".logs/pre-push-latest.log"

# 最新ログへのシンボリックリンク作成
ln -sf "pre-push-${TIMESTAMP}.log" "${LATEST_LOG}"

# ============================================================================
# すべてのチェック処理を波括弧で囲んで、最後にログに出力
# sh互換の方法（プロセス置換を使わない）
# ============================================================================
{

echo "============================================================================"
echo "📝 ログファイル: ${LOG_FILE}"
echo "📝 最新ログ: ${LATEST_LOG}"
echo "============================================================================"
echo ""

echo "🔍 Checking environment variable consistency..."
echo ""

# docker-compose.ymlで使用されている環境変数が.env.exampleに記載されているかチェック
if [ -f "docker-compose.yml" ] && [ -f "backend/.env.example" ]; then
  # docker-compose.ymlから環境変数を抽出
  compose_vars=$(grep -oP '\$\{[A-Z_]+\}' docker-compose.yml 2>/dev/null | sed 's/\${\(.*\)}/\1/' | sort -u)

  if [ -n "$compose_vars" ]; then
    missing_in_example=()
    for var in $compose_vars; do
      # .env.exampleに記載されているかチェック
      if ! grep -q "^#.*$var\|^$var=" backend/.env.example 2>/dev/null; then
        missing_in_example+=("$var")
      fi
    done

    if [ ${#missing_in_example[@]} -gt 0 ]; then
      echo "⚠️  Warning: The following environment variables are used in docker-compose.yml"
      echo "   but not documented in backend/.env.example:"
      for var in "${missing_in_example[@]}"; do
        echo "   - $var"
      done
      echo ""
      echo "This is a WARNING, not an error. Push will continue."
      echo "Consider updating backend/.env.example for better documentation."
      echo ""
    else
      echo "✅ Environment variable consistency check passed"
      echo ""
    fi
  fi
else
  echo "⏭️  Skipping environment variable check (docker-compose.yml or backend/.env.example not found)"
  echo ""
fi

echo "🔍 Running format checks before push..."

# Backend format check
if [ -d "backend" ]; then
  echo "🔍 Checking backend formatting..."
  npm --prefix backend run format:check
  if [ $? -ne 0 ]; then
    echo "❌ Backend format check failed. Push aborted."
    echo "   Run 'npm --prefix backend run format' to fix formatting issues."
    exit 1
  fi
fi

# Frontend format check
if [ -d "frontend" ]; then
  echo "🔍 Checking frontend formatting..."
  npm --prefix frontend run format:check
  if [ $? -ne 0 ]; then
    echo "❌ Frontend format check failed. Push aborted."
    echo "   Run 'npm --prefix frontend run format' to fix formatting issues."
    exit 1
  fi
fi

# E2E format check
echo "🔍 Checking E2E formatting..."
npm run format:check
if [ $? -ne 0 ]; then
  echo "❌ E2E format check failed. Push aborted."
  echo "   Run 'npm run format' to fix formatting issues."
  exit 1
fi

echo "🔎 Running type checks before push..."

# Backend type check
if [ -d "backend" ]; then
  echo "🔍 Checking backend types..."
  npm --prefix backend run type-check
  if [ $? -ne 0 ]; then
    echo "❌ Backend type check failed. Push aborted."
    exit 1
  fi
fi

# Frontend type check
if [ -d "frontend" ]; then
  echo "🔍 Checking frontend types..."
  npm --prefix frontend run type-check
  if [ $? -ne 0 ]; then
    echo "❌ Frontend type check failed. Push aborted."
    exit 1
  fi
fi

# E2E type check
echo "🔍 Checking E2E types..."
npm run type-check
if [ $? -ne 0 ]; then
  echo "❌ E2E type check failed. Push aborted."
  exit 1
fi

echo "🔍 Running full lint checks before push..."

# Backend lint
if [ -d "backend" ]; then
  echo "🔍 Linting backend..."
  npm --prefix backend run lint
  if [ $? -ne 0 ]; then
    echo "❌ Backend lint failed. Push aborted."
    exit 1
  fi
fi

# Frontend lint
if [ -d "frontend" ]; then
  echo "🔍 Linting frontend..."
  npm --prefix frontend run lint
  if [ $? -ne 0 ]; then
    echo "❌ Frontend lint failed. Push aborted."
    exit 1
  fi
fi

# E2E lint
echo "🔍 Linting E2E tests..."
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ E2E lint failed. Push aborted."
  exit 1
fi

echo "🔨 Building projects before push..."

# Backend build
if [ -d "backend" ]; then
  echo "🔨 Building backend..."
  npm --prefix backend run build
  if [ $? -ne 0 ]; then
    echo "❌ Backend build failed. Push aborted."
    exit 1
  fi
fi

# Frontend build
if [ -d "frontend" ]; then
  echo "🔨 Building frontend..."
  npm --prefix frontend run build
  if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed. Push aborted."
    exit 1
  fi
fi

echo "🔒 Running security scan before push..."

# Backend security scan
if [ -d "backend" ]; then
  echo "🔍 Scanning backend dependencies for vulnerabilities..."
  npm --prefix backend audit --audit-level=moderate
  BACKEND_AUDIT_EXIT=$?
  if [ $BACKEND_AUDIT_EXIT -ne 0 ]; then
    echo "⚠️  Backend security vulnerabilities detected (moderate or higher)."
    echo "   This is a WARNING - push will continue, but please address these issues."
    echo "   Run 'npm --prefix backend audit' to see details."
    echo "   Run 'npm --prefix backend audit fix' to attempt automatic fixes."
    echo ""
  else
    echo "✅ Backend security scan passed."
  fi
fi

# Frontend security scan
if [ -d "frontend" ]; then
  echo "🔍 Scanning frontend dependencies for vulnerabilities..."
  npm --prefix frontend audit --audit-level=moderate
  FRONTEND_AUDIT_EXIT=$?
  if [ $FRONTEND_AUDIT_EXIT -ne 0 ]; then
    echo "⚠️  Frontend security vulnerabilities detected (moderate or higher)."
    echo "   This is a WARNING - push will continue, but please address these issues."
    echo "   Run 'npm --prefix frontend audit' to see details."
    echo "   Run 'npm --prefix frontend audit fix' to attempt automatic fixes."
    echo ""
  else
    echo "✅ Frontend security scan passed."
  fi
fi

# Backend unit tests with coverage
if [ -d "backend" ]; then
  echo "🧪 Running backend unit tests with coverage..."
  npm --prefix backend run test:unit:coverage
  if [ $? -ne 0 ]; then
    echo "❌ Backend unit tests or coverage check failed. Push aborted."
    echo "   Coverage thresholds: statements 80%, branches 80%, functions 80%, lines 80%"
    echo "   Run 'npm --prefix backend run test:unit:coverage' to check coverage locally."
    exit 1
  fi
fi

# Frontend unit tests with coverage
if [ -d "frontend" ]; then
  echo "🧪 Running frontend unit tests with coverage..."
  npm --prefix frontend run test:coverage
  if [ $? -ne 0 ]; then
    echo "❌ Frontend unit tests or coverage check failed. Push aborted."
    echo "   Run 'npm --prefix frontend run test:coverage' to check coverage locally."
    exit 1
  fi
fi

# Storybook tests (Interaction + Accessibility)
if [ -d "frontend" ] && git diff --cached --name-only | grep -q "^frontend/"; then
  echo "📖 Running Storybook tests..."
  npm --prefix frontend run test-storybook:ci
  if [ $? -ne 0 ]; then
    echo "❌ Storybook tests failed. Push aborted."
    echo "   Run 'npm --prefix frontend run test-storybook:ci' to check locally."
    exit 1
  fi
fi

# 環境変数検証（統合テスト用）
echo "🔍 Validating required environment variables for integration tests..."

# 統合テストで必要な環境変数のチェック
missing_vars=()

# .envファイルの存在確認
if [ ! -f ".env" ]; then
  echo "⚠️  Warning: .env file not found in project root."
  echo "   Integration tests may fail without required environment variables."
  echo ""
fi

# Docker Composeで使用される環境変数をチェック
# これらは.envファイルまたは環境変数として設定される必要がある
if [ -f ".env" ]; then
  # .envファイルから環境変数を読み込む（exportはしない、チェックのみ）
  if ! grep -q "^JWT_PUBLIC_KEY=" .env 2>/dev/null; then
    missing_vars+=("JWT_PUBLIC_KEY")
  fi

  if ! grep -q "^JWT_PRIVATE_KEY=" .env 2>/dev/null; then
    missing_vars+=("JWT_PRIVATE_KEY")
  fi

  if ! grep -q "^TWO_FACTOR_ENCRYPTION_KEY=" .env 2>/dev/null; then
    missing_vars+=("TWO_FACTOR_ENCRYPTION_KEY")
  fi

  if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "❌ Missing required environment variables in .env file:"
    for var in "${missing_vars[@]}"; do
      echo "   - $var"
    done
    echo ""
    echo "To generate these values:"
    echo "  - JWT keys: npm --prefix backend run generate-keys"
    echo "  - 2FA key: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    echo ""
    echo "Add these to your .env file in the project root."
    exit 1
  fi

  echo "✅ All required environment variables are configured in .env"
  echo ""
fi

# Docker環境の自動構築
echo "🐳 Setting up Docker environment for tests..."
echo ""
echo "   DB使い分け:"
echo "     - architrack_dev:  開発者の手動打鍵用（データ保護）"
echo "     - architrack_test: 全自動テスト用（統合 + E2E）"
echo ""

# Docker環境のチェックと起動
if ! docker ps | grep -q architrack-postgres; then
  echo "   Docker containers not running. Starting Docker Compose..."
  docker compose up -d postgres redis mailhog
  if [ $? -ne 0 ]; then
    echo "❌ Failed to start Docker containers. Push aborted."
    exit 1
  fi

  # データベースが起動するまで待機
  echo "   Waiting for database to be ready..."
  sleep 10

  # ヘルスチェック（最大30秒待機）
  MAX_RETRIES=6
  RETRY_COUNT=0
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec architrack-postgres pg_isready -U postgres > /dev/null 2>&1; then
      echo "   ✅ Database is ready"
      break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
      echo "❌ Database failed to start within timeout. Push aborted."
      exit 1
    fi
    echo "   Waiting for database... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
  done
else
  echo "   ✅ Docker containers already running"
fi

# テストデータベースの存在確認と作成
echo "   Checking test database (architrack_test)..."
DB_EXISTS=$(docker exec architrack-postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='architrack_test'" 2>/dev/null || echo "")
if [ "$DB_EXISTS" != "1" ]; then
  echo "   Creating test database: architrack_test"
  docker exec architrack-postgres psql -U postgres -c "CREATE DATABASE architrack_test;" > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "❌ Failed to create test database. Push aborted."
    exit 1
  fi
  echo "   ✅ Test database created"
else
  echo "   ✅ Test database already exists"
fi

# テストデータベースへのマイグレーション実行
echo "   Running Prisma migrations on test database..."
DATABASE_URL="postgresql://postgres:dev@localhost:5432/architrack_test" npx prisma migrate deploy --schema=backend/prisma/schema.prisma > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ Failed to run migrations on test database. Push aborted."
  exit 1
fi
echo "   ✅ Migrations applied to test database"

# バックエンドをテストモードで再起動（E2Eテスト用）
# NODE_ENV=test: 2FAテストで固定TOTPコード "123456" を受け入れる
# DATABASE_URL: テストDB（architrack_test）を使用
echo "   Restarting backend with test database and test mode..."
docker compose stop backend > /dev/null 2>&1
# コンテナを削除して環境変数を確実に反映させる
docker compose rm -f backend > /dev/null 2>&1
export NODE_ENV=test
export DATABASE_URL=postgresql://postgres:dev@postgres:5432/architrack_test
docker compose up -d backend
if [ $? -ne 0 ]; then
  echo "❌ Failed to start backend container. Push aborted."
  exit 1
fi

# バックエンドが起動するまで待機
echo "   Waiting for backend to be ready..."
MAX_RETRIES=12
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "   ✅ Backend is ready"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Backend failed to start within timeout. Push aborted."
    exit 1
  fi
  echo "   Waiting for backend... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 5
done

# フロントエンドを起動（E2Eテスト用）
echo "   Starting frontend..."
docker compose up -d frontend
if [ $? -ne 0 ]; then
  echo "❌ Failed to start frontend container. Push aborted."
  exit 1
fi

# フロントエンドが起動するまで待機
echo "   Waiting for frontend to be ready..."
MAX_RETRIES=18
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "   ✅ Frontend is ready"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Frontend failed to start within timeout. Push aborted."
    exit 1
  fi
  echo "   Waiting for frontend... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 5
done

echo "   ✅ All Docker services are ready for testing"

# Backend integration tests
if [ -d "backend" ]; then
  echo "🔗 Running backend integration tests..."

  # インテグレーションテストはDockerコンテナ内で実行
  # ローカル環境でのPrisma Query Engine問題を回避
  # NODE_ENV=test を設定してレート制限をスキップ
  # DATABASE_URL を architrack_test に設定（開発データ保護のため）
  docker exec -e NODE_ENV=test -e DATABASE_URL=postgresql://postgres:dev@postgres:5432/architrack_test architrack-backend npm run test:integration
  if [ $? -ne 0 ]; then
    echo "❌ Backend integration tests failed. Push aborted."
    exit 1
  fi
fi

# E2E tests
echo "🧪 Running E2E tests..."

# E2Eテストを同期実行（Shift-Left原則: 品質ゲートとして機能）
# タイムアウト設定: 30分（1800秒）でハングアップを防止
#   ベストプラクティス: タイムアウト = 通常実行時間の2-3倍
#   37テスト × retry=2 → 最大111回実行、通常15-20分完了見込み
#   --kill-after=10: TERMシグナル送信後、10秒以内に終了しなければKILLシグナルを送信
#   --foreground: プロセスグループ全体にシグナルを送信（子プロセスも確実に停止）
# CI=true: HTML Reportサーバーを起動せず、レポートのみ生成（ベストプラクティス）
echo "   Note: E2E tests will run synchronously to ensure quality before push."
echo "   HTML report will be generated but server will not start."
echo "   Timeout: 30 minutes (with forced kill after grace period)"
echo "   Progress: Playwright list reporter shows test execution in real-time"

# timeoutコマンドで確実にプロセスグループ全体を停止
CI=true timeout --foreground --kill-after=10 1800 npm run test:e2e
E2E_EXIT_CODE=$?

if [ $E2E_EXIT_CODE -eq 124 ]; then
  echo "❌ E2E tests timed out after 30 minutes. Push aborted."
  echo "   This usually indicates a hanging test or infinite loop."
  exit 1
elif [ $E2E_EXIT_CODE -eq 137 ]; then
  echo "❌ E2E tests were forcibly killed (SIGKILL). Push aborted."
  echo "   Tests did not respond to termination signal within grace period."
  exit 1
elif [ $E2E_EXIT_CODE -ne 0 ]; then
  echo "❌ E2E tests failed with exit code: $E2E_EXIT_CODE. Push aborted."
  exit 1
fi

echo "✅ All checks passed!"

} 2>&1 | tee "${LOG_FILE}"
