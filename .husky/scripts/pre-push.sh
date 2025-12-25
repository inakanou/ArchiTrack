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

# Docker テスト環境の自動構築
# ============================================================================
# 環境分離設計:
#   - architrack-dev (開発環境): ポート 3000/5173/5432/6379 - 手動打鍵用
#   - architrack-test (テスト環境): ポート 3100/5174/5433/6380 - 自動テスト用
#
# テスト環境は開発環境と完全に分離されており、同時実行が可能
# tmpfsを使用してテストデータは揮発性（テスト終了後に自動削除）
# ============================================================================
echo "🐳 Setting up Docker test environment..."
echo ""
echo "   環境分離:"
echo "     - architrack-dev  (3000/5173/5432/6379): 開発者の手動打鍵用（データ保護）"
echo "     - architrack-test (3100/5174/5433/6380): 全自動テスト用（統合 + E2E）"
echo ""

# テスト環境の起動（開発環境とは独立）
echo "   Starting test environment containers..."
# Note: `head -20`を使用すると、出力が20行を超えた時点でSIGPIPEが発生し、
# docker composeが異常終了コード141を返すため、tailを使用して最後の20行を表示
docker_output=$(npm run test:docker 2>&1)
docker_exit_code=$?
echo "$docker_output" | tail -20
if [ $docker_exit_code -ne 0 ]; then
  echo "❌ Failed to start test Docker containers. Push aborted."
  exit 1
fi

# PostgreSQLテストコンテナのヘルスチェック（最大60秒待機）
echo "   Waiting for test database to be ready..."
MAX_RETRIES=12
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker exec architrack-postgres-test pg_isready -U postgres > /dev/null 2>&1; then
    echo "   ✅ Test database is ready"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Test database failed to start within timeout. Push aborted."
    npm run test:docker:down > /dev/null 2>&1
    exit 1
  fi
  echo "   Waiting for test database... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 5
done

# テストデータベースへのマイグレーション実行
# テスト環境はポート5433を使用
echo "   Running Prisma migrations on test database..."
DATABASE_URL="postgresql://postgres:test@localhost:5433/architrack_test" npm --prefix backend run prisma:migrate:deploy > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ Failed to run migrations on test database. Push aborted."
  npm run test:docker:down > /dev/null 2>&1
  exit 1
fi
echo "   ✅ Migrations applied to test database"

# バックエンドテストコンテナのヘルスチェック（最大180秒待機）
# テスト環境はポート3100を使用
# 注意: 初回起動時はnpm install（約60秒）、Prisma生成、マイグレーション、シードが
#       実行されるため、十分な待機時間が必要
echo "   Waiting for test backend to be ready..."
MAX_RETRIES=36
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "   ✅ Test backend is ready"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Test backend failed to start within timeout. Push aborted."
    npm run test:docker:down > /dev/null 2>&1
    exit 1
  fi
  echo "   Waiting for test backend... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 5
done

# フロントエンドテストコンテナのヘルスチェック（最大90秒待機）
# テスト環境はポート5174を使用
echo "   Waiting for test frontend to be ready..."
MAX_RETRIES=18
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:5174 > /dev/null 2>&1; then
    echo "   ✅ Test frontend is ready"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Test frontend failed to start within timeout. Push aborted."
    npm run test:docker:down > /dev/null 2>&1
    exit 1
  fi
  echo "   Waiting for test frontend... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 5
done

echo "   ✅ All test Docker services are ready"

# Backend integration tests
if [ -d "backend" ]; then
  echo "🔗 Running backend integration tests..."

  # インテグレーションテストはテスト用Dockerコンテナ内で実行
  # テスト環境コンテナ名: architrack-backend-test
  # NODE_ENV=test を設定してレート制限をスキップ
  # DATABASE_URL は docker-compose.test.yml で architrack_test に設定済み
  docker exec -e NODE_ENV=test architrack-backend-test npm run test:integration
  if [ $? -ne 0 ]; then
    echo "❌ Backend integration tests failed. Push aborted."
    npm run test:docker:down > /dev/null 2>&1
    exit 1
  fi
fi

# ============================================================================
# 要件カバレッジチェック（E2Eテスト実行の前提条件）
# ============================================================================
# ベストプラクティス: E2Eテスト実行前に要件カバレッジを検証
# - E2E対象の受入基準が100%カバーされていることを確認
# - 除外リスト（e2e/requirement-exclusions.json）の要件は代替検証方法で対応
# - カバレッジ不足の場合、E2Eテストを実行せずに早期失敗
# ============================================================================

echo "📋 Checking requirement coverage (prerequisite for E2E tests)..."
echo "   This ensures all E2E-applicable acceptance criteria are covered."
npm run check:req-coverage
if [ $? -ne 0 ]; then
  echo "❌ Requirement coverage check failed. Push aborted."
  echo ""
  echo "   E2Eテストは実行されません（前提条件未達）"
  echo ""
  echo "対応方法:"
  echo "  1. 未カバー受入基準に対応するE2Eテストを作成してください"
  echo "  2. テストに @REQ-N.M タグを追加してください"
  echo "  3. E2E対象外の場合は e2e/requirement-exclusions.json に追加してください"
  echo ""
  echo "詳細確認: npm run check:req-coverage:verbose"
  exit 1
fi

echo "✅ Requirement coverage check passed"
echo ""

# ============================================================================
# コンテナ再起動（E2Eテスト前のメモリリフレッシュ）
# ============================================================================
# ベストプラクティス: 長時間実行後のメモリ累積をリセット
# - 統合テストまでの実行でメモリが累積している可能性
# - コンテナを再起動してメモリ状態をクリーンに
# - autohealに頼らず、予防的にリフレッシュ
# ============================================================================

echo "🔄 Refreshing Docker containers before E2E tests..."
echo "   This ensures clean memory state after integration tests."

# Backend と Frontend のみ再起動（DB/Redis/Mailhog はステートレスなので不要）
docker restart architrack-backend-test architrack-frontend-test > /dev/null 2>&1

# 再起動後のヘルスチェック（バックエンド）
echo "   Waiting for backend to be ready after restart..."
MAX_RETRIES=12
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "   ✅ Backend is ready"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Backend failed to restart. Push aborted."
    npm run test:docker:down > /dev/null 2>&1
    exit 1
  fi
  sleep 5
done

# 再起動後のヘルスチェック（フロントエンド）
echo "   Waiting for frontend to be ready after restart..."
MAX_RETRIES=12
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:5174 > /dev/null 2>&1; then
    echo "   ✅ Frontend is ready"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Frontend failed to restart. Push aborted."
    npm run test:docker:down > /dev/null 2>&1
    exit 1
  fi
  sleep 5
done

echo "   ✅ Containers refreshed successfully"
echo ""

# E2E tests with Sharding
# ============================================================================
# ベストプラクティス: テストシャーディングによるメモリ負荷軽減
# - Playwright公式推奨: 長時間スイートを複数シャードに分割
# - 各シャード間でコンテナを再起動してメモリをリフレッシュ
# - WSL2環境でのOOMクラッシュを防止
# 参考: https://playwright.dev/docs/test-sharding
# ============================================================================
echo "🧪 Running E2E tests with sharding (3 shards for memory optimization)..."
echo ""
echo "   シャーディング戦略:"
echo "     - 3シャードに分割してメモリ累積を防止"
echo "     - 各シャード間でコンテナをリフレッシュ"
echo "     - 各シャードのタイムアウト: 15分"
echo ""

TOTAL_SHARDS=3
E2E_FAILED=0

for SHARD in $(seq 1 $TOTAL_SHARDS); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔄 Shard $SHARD/$TOTAL_SHARDS を実行中..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 各シャードのタイムアウト: 15分（900秒）
  CI=true timeout --foreground --kill-after=10 900 npx playwright test --shard=$SHARD/$TOTAL_SHARDS
  SHARD_EXIT_CODE=$?

  if [ $SHARD_EXIT_CODE -eq 124 ]; then
    echo "❌ Shard $SHARD timed out after 15 minutes."
    E2E_FAILED=1
    break
  elif [ $SHARD_EXIT_CODE -eq 137 ]; then
    echo "❌ Shard $SHARD was forcibly killed (SIGKILL)."
    E2E_FAILED=1
    break
  elif [ $SHARD_EXIT_CODE -ne 0 ]; then
    echo "❌ Shard $SHARD failed with exit code: $SHARD_EXIT_CODE"
    E2E_FAILED=1
    break
  fi

  echo "✅ Shard $SHARD/$TOTAL_SHARDS 完了"

  # 最後のシャード以外はコンテナをリフレッシュ
  if [ $SHARD -lt $TOTAL_SHARDS ]; then
    echo ""
    echo "🔄 メモリリフレッシュのためコンテナを再起動..."
    docker restart architrack-backend-test architrack-frontend-test > /dev/null 2>&1

    # バックエンドのヘルスチェック
    RETRY_COUNT=0
    MAX_RETRIES=12
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
      if curl -s http://localhost:3100/health > /dev/null 2>&1; then
        break
      fi
      RETRY_COUNT=$((RETRY_COUNT + 1))
      sleep 5
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
      echo "❌ Backend failed to restart between shards."
      E2E_FAILED=1
      break
    fi

    # フロントエンドのヘルスチェック
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
      if curl -s http://localhost:5174 > /dev/null 2>&1; then
        break
      fi
      RETRY_COUNT=$((RETRY_COUNT + 1))
      sleep 5
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
      echo "❌ Frontend failed to restart between shards."
      E2E_FAILED=1
      break
    fi

    echo "   ✅ コンテナ再起動完了"
    echo ""
  fi
done

if [ $E2E_FAILED -ne 0 ]; then
  echo ""
  echo "❌ E2E tests failed. Push aborted."
  npm run test:docker:down > /dev/null 2>&1
  exit 1
fi

echo ""
echo "✅ All $TOTAL_SHARDS shards completed successfully"

# テスト環境のクリーンアップ（成功時）
# tmpfsを使用しているため、データは自動的に破棄される
echo "🧹 Cleaning up test environment..."
npm run test:docker:down > /dev/null 2>&1
echo "   ✅ Test containers stopped and removed"

echo "✅ All checks passed!"

} 2>&1 | tee "${LOG_FILE}"
