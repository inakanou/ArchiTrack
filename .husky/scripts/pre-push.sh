#!/bin/bash
# ============================================================================
# エラーハンドリング設定
# ============================================================================
# -o pipefail: パイプラインのいずれかのコマンドが失敗したら全体を失敗とする
# これにより、teeコマンドでログ記録してもexit codeが正しく伝播する
# 注意: pipefailはbash固有の機能のため、shebangは#!/bin/bashを使用
set -o pipefail

# ============================================================================
# WSL2メモリ最適化設定
# ============================================================================
# ベストプラクティス: 制限されたメモリ環境（6GB WSL2）でのOOMクラッシュ防止
# - Node.jsヒープサイズを2GBに制限（デフォルトは無制限で肥大化）
# - 各コマンドのメモリ使用量を予測可能に維持
# - lintは backend→frontend と逐次実行のため、2GB上限でもピークは約2.5GBに収まり
#   6GB環境に十分な余裕がある。1GBではフロントエンドeslintがコードベース成長により
#   上限ちょうどでOOMクラッシュしていた（.logs/pre-push-latest.log 参照）。
# 参考: https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes
# ============================================================================
export NODE_OPTIONS="--max-old-space-size=2048"

# メモリ解放用関数: Dockerビルドキャッシュとシステムキャッシュをクリア
release_memory() {
  local stage_name="$1"
  echo ""
  echo "🧹 メモリ解放中（$stage_name 完了後）..."

  # Dockerの未使用リソースをクリア（ビルドキャッシュ含む）
  # 注意: --volumesを使用すると backend_test_node_modules 等の名前付きボリュームが
  # 削除され、次回Docker起動時にnpm ciがフルインストールとなり、WSL2環境で
  # ヘルスチェックタイムアウト（300秒超過）を引き起こすため、ボリュームは保持する
  docker system prune -f > /dev/null 2>&1 || true

  # 注意: syncコマンドはWSL2のFUSEファイルシステムでD state（割り込み不可スリープ）に
  # 陥り、プロセスがkill不可能になる。さらにD stateのsyncプロセスがteeパイプのfdを
  # 保持し続けるため、スクリプト全体がハングする。WSL2環境ではsyncを使用しない。

  # Node.jsのガベージコレクションを促進（次のNode.js実行時に効果）
  # 短い待機でプロセスが完全に終了するのを待つ
  sleep 1

  echo "   ✅ メモリ解放完了"
  echo ""
}

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

  # ============================================================================
  # ES Module検証（CIと同一: ci.yml build job）
  # ============================================================================
  # ベストプラクティス: ビルド成果物のimport文を検証
  # - Node.jsの--checkオプションでシンタックスエラーを検出
  # - .js拡張子の欠落などESM固有のエラーを早期発見
  # ============================================================================
  echo "🔍 Validating ES Module imports with node..."

  # エントリーポイントの検証
  node --check backend/dist/src/index.js
  if [ $? -ne 0 ]; then
    echo "❌ ES Module error in entry point: backend/dist/src/index.js"
    echo "💡 Hint: Check for missing .js extensions in imports"
    exit 1
  fi

  # 全ビルド済みJavaScriptファイルの検証
  ESM_ERROR=0
  find backend/dist -name '*.js' -type f | while read file; do
    node --check "$file" || {
      echo "❌ ES Module error in: $file"
      echo "💡 Hint: Check for missing .js extensions in imports"
      ESM_ERROR=1
      exit 1
    }
  done

  if [ $ESM_ERROR -ne 0 ]; then
    exit 1
  fi

  echo "✅ All ES modules are valid (no import errors detected)"
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

# ビルド完了後のメモリ解放（ビルドは大量のメモリを消費するため）
release_memory "ビルド"

# ============================================================================
# セキュリティ監査（ベストプラクティス準拠）
# ============================================================================
# 設計方針:
# - 本番依存のhigh以上: ブロック（許容リスト対応）
# - 開発依存のhigh以上: 警告のみ（Storybookなど本番に影響しないもの）
# - CIとローカルで同一ルールを適用
# - 許容リストは .security-audit-allowlist.json で管理
# ============================================================================
echo "🔒 Running security audit before push..."
echo ""
echo "   ポリシー:"
echo "     - 本番依存のhigh以上: ブロック（許容リスト対応）"
echo "     - 開発依存のhigh以上: 警告のみ"
echo ""

node scripts/security-audit.mjs --mode=strict
SECURITY_AUDIT_EXIT=$?

if [ $SECURITY_AUDIT_EXIT -ne 0 ]; then
  echo ""
  echo "❌ Security audit failed. Push aborted."
  echo ""
  echo "   対処方法:"
  echo "   1. npm audit fix で修正可能な場合は実行"
  echo "   2. 修正版がない場合は .security-audit-allowlist.json に追加"
  echo "   3. 詳細: node scripts/security-audit.mjs --verbose"
  exit 1
fi
echo ""

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

  # ============================================================================
  # Coverage Gap Check（CIと同一: ci.yml test-unit job）
  # ============================================================================
  # ベストプラクティス: 目標（80%）未満のファイルがあればブロック
  # - EXIT_CODE 2: 30%以下のカバレッジ → ブロック（緊急）
  # - EXIT_CODE 1: 31-79%のカバレッジ → ブロック（目標未達）
  # ============================================================================
  echo "🔍 Checking backend coverage gaps..."
  COVERAGE_EXIT=0
  npm --prefix backend run coverage:check || COVERAGE_EXIT=$?
  if [ $COVERAGE_EXIT -ne 0 ]; then
    echo ""
    echo "❌ Coverage below target (80%) - blocking push"
    echo "   Run 'npm --prefix backend run coverage:check' for details"
    echo ""
    echo "対応方法:"
    echo "  1. 該当ファイルのテストを追加してカバレッジを80%以上に改善してください"
    echo "  2. 詳細は 'npm --prefix backend run coverage:check' で確認できます"
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

  # ============================================================================
  # Coverage Gap Check（CIと同一: ci.yml test-unit job）
  # ============================================================================
  echo "🔍 Checking frontend coverage gaps..."
  COVERAGE_EXIT=0
  npm --prefix frontend run coverage:check || COVERAGE_EXIT=$?
  if [ $COVERAGE_EXIT -ne 0 ]; then
    echo ""
    echo "❌ Coverage below target (80%) - blocking push"
    echo "   Run 'npm --prefix frontend run coverage:check' for details"
    echo ""
    echo "対応方法:"
    echo "  1. 該当ファイルのテストを追加してカバレッジを80%以上に改善してください"
    echo "  2. 詳細は 'npm --prefix frontend run coverage:check' で確認できます"
    exit 1
  fi
fi

# ============================================================================
# Storybook Tests（CIと同一: ci.yml test-storybook job）
# ============================================================================
# ベストプラクティス: 常時実行（CIと同一の挙動）
# - Interaction tests: コンポーネントの操作テスト
# - Accessibility tests: アクセシビリティ検証
# ============================================================================
if [ -d "frontend" ]; then
  echo "📖 Running Storybook tests..."

  # ============================================================================
  # Playwrightブラウザのインストール（明示的インストール - ベストプラクティス）
  # ============================================================================
  # postinstallでの暗黙的インストールではなく、必要な時点で明示的にインストール
  # 既にインストール済みの場合はキャッシュから利用される
  # ============================================================================
  echo "   🎭 Ensuring Playwright browsers are installed..."
  npx --prefix frontend playwright install chromium > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "❌ Failed to install Playwright browsers. Push aborted."
    exit 1
  fi

  # ポート6006を使用しているプロセスをクリーンアップ（残留プロセス対策）
  # 前回のテストが中断された場合にhttp-serverが残留することがある
  if lsof -ti :6006 > /dev/null 2>&1; then
    echo "   ⚠️  Cleaning up stale process on port 6006..."
    kill -9 $(lsof -ti :6006) 2>/dev/null || true
    sleep 1
  fi

  npm --prefix frontend run test-storybook:ci
  if [ $? -ne 0 ]; then
    echo "❌ Storybook tests failed. Push aborted."
    echo "   Run 'npm --prefix frontend run test-storybook:ci' to check locally."
    exit 1
  fi

  # ============================================================================
  # Storybook網羅性チェック（CIと同一）
  # ============================================================================
  # ベストプラクティス: 目標（80%）未満のStorybookカバレッジでブロック
  # - コンポーネントに対応するStoriesファイルの存在をチェック
  # - UIテストの網羅性を保証
  # ============================================================================
  echo "📚 Checking Storybook coverage..."
  STORYBOOK_COV_EXIT=0
  npm --prefix frontend run storybook:coverage || STORYBOOK_COV_EXIT=$?
  if [ $STORYBOOK_COV_EXIT -ne 0 ]; then
    echo ""
    echo "❌ Storybook coverage below target (80%) - blocking push"
    echo "   Run 'npm --prefix frontend run storybook:coverage' for details"
    echo ""
    echo "対応方法:"
    echo "  1. 該当コンポーネントに対応する *.stories.tsx を作成してください"
    echo "  2. UIテストが不要な場合は除外パターンに追加を検討してください"
    exit 1
  fi
fi

# ユニットテスト完了後のメモリ解放（Docker起動前にメモリを確保）
release_memory "ユニットテスト"

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
# --build付きで起動し、ソースコード変更が確実にDockerイメージに反映されるようにする
echo "   Starting test environment containers (with build)..."
# Note: `head -20`を使用すると、出力が20行を超えた時点でSIGPIPEが発生し、
# docker composeが異常終了コード141を返すため、tailを使用して最後の20行を表示
docker_output=$(npm run test:docker:build 2>&1)
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

# バックエンドテストコンテナのヘルスチェック（最大600秒待機）
# テスト環境はポート3100を使用
# 注意: 初回起動時はnpm install（WSL2環境で3-5分）、Prisma生成、マイグレーション、シードが
#       実行されるため、十分な待機時間が必要
# WSL2環境でpackage-lock.json変更時はnpm ciに5分以上かかることがあるため余裕を持たせる
echo "   Waiting for test backend to be ready..."
MAX_RETRIES=120
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

# 統合テスト完了後のメモリ解放（E2E前にメモリを最大化）
release_memory "統合テスト"

# ============================================================================
# 要件カバレッジチェック（E2Eテスト実行の前提条件）
# ============================================================================
# ベストプラクティス: E2Eテスト実行前に要件カバレッジを検証
# - E2E対象の受入基準が100%カバーされていることを確認
# - 番号を持つ検証が本番の経路（index.html の入口 / サーバ起動 / 投入処理）から
#   到達する本番シンボルを参照していることを確認（未結線コードに番号を付ける形を塞ぐ）
# - 除外リスト（e2e/requirement-exclusions.json）は被覆ではなく分母外である。
#   二重登録・記述欠落・要件に存在しない項目は失敗、代替検証の不在は --strict で失敗
# - カバレッジ不足の場合、E2Eテストを実行せずに早期失敗
# ============================================================================

# ============================================================================
# 除外定義の形式検査（要件カバレッジ検査の前提条件）
# ============================================================================
# 除外は被覆率の分母から受入基準を外す。定義が壊れていれば被覆の主張は空洞化する。
# e2e/requirement-exclusions.json は長らく無検査のキャストだけで読まれ、$schema は
# 存在しないファイルを指していた（タスク 115.144）。スキーマを実在させて適合を確かめる。
# 検証器が壊れたまま本検査が「合格」を出すことを防ぐため、自己検査を先に走らせる。
# ============================================================================

echo "🔍 Checking requirement exclusions schema self-test..."
npm run check:req-exclusions:selftest
if [ $? -ne 0 ]; then
  echo "❌ Requirement exclusions schema self-test failed. Push aborted."
  echo ""
  echo "   除外定義の形式検査そのものが壊れています。この状態では適合の判定は信用できません。"
  echo "   固定資料: scripts/check-requirement-exclusions.selftest.ts"
  echo ""
  exit 1
fi

echo "📐 Checking requirement exclusions against schema..."
npm run check:req-exclusions
if [ $? -ne 0 ]; then
  echo "❌ Requirement exclusions schema check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. e2e/requirement-exclusions.schema.json の必須項目・書式に合わせてください"
  echo "  2. 分類を増やす場合は categories にも定義を加えてください"
  echo "  3. 除外を増減した場合は summary の集計も合わせてください"
  echo ""
  echo "詳細確認: npm run check:req-exclusions:verbose"
  exit 1
fi

echo "✅ Requirement exclusions schema check passed"
echo ""

echo "🔍 Checking requirement coverage self-test (reachability judgement)..."
npm run check:req-coverage:selftest
if [ $? -ne 0 ]; then
  echo "❌ Requirement coverage self-test failed. Push aborted."
  echo ""
  echo "   本番到達性の判定が壊れています。この状態では被覆の検査結果は信用できません。"
  echo "   固定資料: scripts/check-requirement-coverage.selftest.ts"
  echo ""
  exit 1
fi

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
  echo "  4. 番号を付けた検証が本番未参照の部品だけを見ている場合は、本番へ結線するか死コードを撤去してください"
  echo ""
  echo "詳細確認: npm run check:req-coverage:verbose"
  exit 1
fi

echo "✅ Requirement coverage check passed"
echo ""

# ============================================================================
# E2E検証無効化チェック（E2Eテスト実行の前提条件）
# ============================================================================
# 書かれてはいるが実質的に何も検証しないE2Eテスト構造の再発を検知する
# - 五つの型（条件分岐で検証本体を包む / 待機の指定を尊重しない判定 /
#   常に真になる判定 / 応答の項目の有無を条件にする / 自ら観測した結果を条件にする）
#   および補助規則（条件付きスキップ）
# - 局所変数を挟んだ形も初期化子を辿って同等に分類する
# - e2e/assertion-guard-baseline.json の既知件数を超えた場合に失敗
# - 除外（e2e-guard-allow）が増えた場合、理由の無い除外がある場合も失敗
# - 検出器の退行は検出器自身の検査でしか捕まらないため、本検査の前に自己検査を走らせる
# ============================================================================

echo "🔍 Checking for disabled E2E assertions..."
npm run check:e2e-guards:selftest
if [ $? -ne 0 ]; then
  echo "❌ E2E assertion guard detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:e2e-guards:selftest"
  exit 1
fi
npm run check:e2e-guards
if [ $? -ne 0 ]; then
  echo "❌ E2E assertion guard check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 検証を無条件にしてください（前提が満たせない場合は失敗させる）"
  echo "  2. 正当な分岐であれば該当行の直前に '// e2e-guard-allow: <理由>' を付けてください"
  echo "  3. 是正して件数が減った場合は 'npm run check:e2e-guards:update' で基準を更新してください"
  echo ""
  echo "詳細確認: npm run check:e2e-guards:verbose"
  exit 1
fi

echo "✅ E2E assertion guard check passed"
echo ""

# ============================================================================
# 設計文書への行番号参照チェック
# ============================================================================
# 設計文書を行番号で指す形の再発を、二つの母集団で検知する
# - 設計文書は追記・改訂で行数が変わるため、行番号の参照は原理的に維持できない
#   （タスク 115.71 のレビューで、参照先が全く別の内容を指す状態が判明した）
# - 節の題とシンボル名で指す形へ改めること
# - 走査対象(1): frontend/src / backend/src の本番コード（テストコードは対象外）
# - 走査対象(2): .kiro/specs/*/design.md 自身（タスク 115.211）
#   設計文書が自分自身を行番号で指す形は、上の(1)にも check:design-code-refs にも
#   掛からない死角だった。タスク 115.172 が撤去した 12 件は撤去の時点で全件失効しており
#   （ずれ幅 27〜51 行）、文書が育つ限り行番号は失効し続ける
# ============================================================================

echo "🔍 Checking design document line references (production code and design docs)..."
npm run check:design-refs:selftest
if [ $? -ne 0 ]; then
  echo "❌ Design reference detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:design-refs:selftest"
  exit 1
fi
npm run check:design-refs
if [ $? -ne 0 ]; then
  echo "❌ Design reference format check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 設計文書の該当箇所を開き、その内容を含む節の題を確認してください"
  echo "  2. 行番号ではなく『節の題』と『シンボル名』で指す形へ書き換えてください"
  echo ""
  echo "詳細確認: npm run check:design-refs:verbose"
  exit 1
fi

echo "✅ Design reference format check passed"
echo ""

# ============================================================================
# 追跡表の受入基準の網羅チェック（タスク 115.228）
# ============================================================================
# 設計文書の Requirements Traceability 表が、要件定義書の受入基準を取りこぼしていないかを見る
# - タスク 115.208 が site-survey の要件4 へ受入基準14 を新設したとき、追跡表の該当行は
#   `4.1-4.6, 4.9` のままで 4.14 を含まなかった。この漏れは既存のどの検査にも掛からなかった
#   （check:design-refs は参照の形式、check:design-path-refs はパスの実在しか見ない）
# - 判定は「機能ごとに宣言した状態から悪化していないこと」（scripts の FEATURE_POLICIES）
# - 受入基準を新設したのに追跡表へ番号を足していない場合に落ちる
# - 検出器が壊れたまま「合格」を出すことを防ぐため、本検査の前に自己検査を走らせる
# ============================================================================

echo "🔍 Checking traceability table coverage self-test..."
npm run check:trace-coverage:selftest
if [ $? -ne 0 ]; then
  echo "❌ Traceability coverage detector self-test failed. Push aborted."
  echo ""
  echo "   追跡表の網羅の検出規則そのものが壊れています。この状態では判定は信用できません。"
  echo "   固定資料: scripts/check-traceability-coverage.selftest.ts"
  echo ""
  exit 1
fi
npm run check:trace-coverage
if [ $? -ne 0 ]; then
  echo "❌ Traceability table coverage check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 受入基準を新設したなら design.md の追跡表の Requirement 列へ番号を加えてください"
  echo "     （併合行なら \`4.1-4.6, 4.9, 4.14\` のように列へ足せば行数は動きません）"
  echo "  2. 受入基準を撤廃したなら追跡表の側の番号も落としてください"
  echo "  3. 行を起こせない事情があるなら scripts/check-traceability-coverage.ts の"
  echo "     FEATURE_POLICIES へ理由と併せて宣言してください"
  echo ""
  echo "詳細確認: npm run check:trace-coverage:verbose"
  exit 1
fi

echo "✅ Traceability table coverage check passed"
echo ""

# ============================================================================
# 追跡表と部品別の自己申告の突き合わせ（タスク 115.247）
# ============================================================================
# 同じ設計文書の中で、担い手の要件が二様に書かれていないかを見る
# - タスク 115.217 のレビューが site-survey の design.md に、追跡表の行は
#   AnnotationContextMenu へ要件28 を割り当てる一方、同じ章の Component Summary の行と
#   詳細節の Requirements 欄は要件27 しか挙げていない食い違いを見つけた
# - 上の check:trace-coverage は追跡表の Requirement 列しか見ない（Components 列の中身は
#   対象外だと自身の限界に明記している）。この面を見る検査はリポジトリに無かった
# - 判定は「機能ごとに宣言した状態から悪化していないこと」（FEATURE_POLICIES）
# - 検出器が壊れたまま「合格」を出すことを防ぐため、本検査の前に自己検査を走らせる
# ============================================================================

echo "🔍 Checking design component requirement consistency self-test..."
npm run check:design-component-reqs:selftest
if [ $? -ne 0 ]; then
  echo "❌ Design component requirement detector self-test failed. Push aborted."
  echo ""
  echo "   突き合わせの検出規則そのものが壊れています。この状態では判定は信用できません。"
  echo "   固定資料: scripts/check-design-component-requirements.selftest.ts"
  echo ""
  exit 1
fi
npm run check:design-component-reqs
if [ $? -ne 0 ]; then
  echo "❌ Design component requirement consistency check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. どちらが正かを決めてください（要件定義書の条文へ当たること）"
  echo "  2. 追跡表が正なら、部品表の Req Coverage 欄と詳細節の Requirements 欄へ番号を足す"
  echo "  3. 部品別の自己申告が正なら、追跡表の Components 列から当該部品を外し、"
  echo "     再び割り当て直さないための注記を添える（タスク 115.246 の先例）"
  echo "  4. 是正できない事情があるなら scripts/check-design-component-requirements.ts の"
  echo "     FEATURE_POLICIES へ理由と併せて宣言してください"
  echo ""
  echo "詳細確認: npm run check:design-component-reqs:verbose"
  exit 1
fi

echo "✅ Design component requirement consistency check passed"
echo ""

# ============================================================================
# 本番コードへの行番号参照チェック（上のチェックの対偶）
# ============================================================================
# 設計文書が本番コードを `パス:行` で指す形の再発を検知する
# - 本番コードは改修で行数が変わるため、行番号の参照は原理的に維持できない
#   （タスク 115.149 の実測で、実体対照表 69 件のうち 16 件が失効していた）
# - パス（行番号なし）とシンボル名で指す形へ改めること
# - 走査対象は .kiro/specs/*/design.md（テストコードを指す参照は対象外）
# ============================================================================

echo "🔍 Checking production code references in design documents..."
npm run check:design-code-refs:selftest
if [ $? -ne 0 ]; then
  echo "❌ Design-to-code reference detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:design-code-refs:selftest"
  exit 1
fi
npm run check:design-code-refs
if [ $? -ne 0 ]; then
  echo "❌ Design-to-code reference format check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 設計文書の該当箇所を開き、その行番号が指していた宣言の名前を確認してください"
  echo "  2. 行番号を消し、『パス』と『シンボル名』で指す形へ書き換えてください"
  echo "     例: \`frontend/src/types/site-survey.types.ts\` の \`AnnotationData\`"
  echo ""
  echo "詳細確認: npm run check:design-code-refs:verbose"
  exit 1
fi

echo "✅ Design-to-code reference format check passed"
echo ""

# ============================================================================
# 設計文書の実在参照チェック
# ============================================================================
# 設計文書が挙げるパス・ファイル名が実在しない状態を検知する
# - check:design-code-refs は参照の「形式」だけを見るため、実在しないファイルを
#   指す参照は形式が正しければ通過する（タスク 115.173 の実測で 7 件が残っていた）
# - 設計文書は歴史記録を保存してよい文書であるため、当該ファイルの不在を述べる行が
#   同じ文書内にあれば免除する（撤去の記録と失効した参照の区別）
# - 走査対象は .kiro/specs/*/design.md のバッククォート付きパス・ファイル名
# ============================================================================

echo "🔍 Checking design document path references..."
npm run check:design-path-refs:selftest
if [ $? -ne 0 ]; then
  echo "❌ Design path reference detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:design-path-refs:selftest"
  exit 1
fi
npm run check:design-path-refs
if [ $? -ne 0 ]; then
  echo "❌ Design document path reference check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. いま在るものを指している記述なら、実在するパスへ指し直してください"
  echo "  2. 当時こうしたという記録なら、当該ファイルを名指したうえで不在を述べる行を"
  echo "     同じ設計文書に一つ置いてください（「撤去済み」「削除」「実在しない」など）"
  echo ""
  echo "詳細確認: npm run check:design-path-refs:verbose"
  exit 1
fi

echo "✅ Design document path reference check passed"
echo ""

# ============================================================================
# 設計文書の実測値の鮮度チェック
# ============================================================================
# 設計文書が引く件数が現況と一致しない状態を検知する（タスク 115.232）
# - check:design-refs は参照の形式、check:design-path-refs はパスの実在しか見ないため、
#   本書が引く「N 件」が古くなっても、どの関門にも掛からなかった
# - scripts/design-measurements.json が {file, anchor, command, expected} を宣言し、
#   リポジトリルートで各コマンドを走らせて突き合わせる
# - 宣言と現況の一致だけでなく、宣言した字面が文書の当該行に在ることも見る（双方向）
# - 実行時間は約 1.2 秒（2026-09-02 に実測。自己検査は約 2.2 秒。いずれも npm 経由で計測）
# ============================================================================

echo "🔍 Checking design document measurement freshness..."
npm run check:design-measurement-freshness:selftest
if [ $? -ne 0 ]; then
  echo "❌ Design measurement freshness detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:design-measurement-freshness:selftest"
  exit 1
fi
npm run check:design-measurement-freshness
if [ $? -ne 0 ]; then
  echo "❌ Design document measurement freshness check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 現況が動いたなら、設計文書の数値と宣言の expected を同時に測り直してください"
  echo "  2. 文書側だけが古いなら documentFigure と divergence を宣言してください"
  echo "     （DECLARED_STALE_DOCUMENT_FIGURES も同時に動かすこと）"
  echo ""
  echo "詳細確認: npm run check:design-measurement-freshness:verbose"
  exit 1
fi

echo "✅ Design document measurement freshness check passed"
echo ""

# ============================================================================
# steering の実在参照チェック
# ============================================================================
# steering が現存物として挙げるファイルが実在しない状態を検知する
# - .kiro/steering/ は毎セッション読み込まれる「現在の構成」の記述であり、
#   撤去・改名に追随していない記載は後任を存在しないファイルへ導く
#   （タスク 115.169 の実測で、撤去済み 7 件が structure.md / tech.md に残っていた）
# - 走査対象は .kiro/steering/*.md のツリーの葉と先頭逆引用符の箇条書き
# ============================================================================

echo "🔍 Checking steering file references..."
npm run check:steering-refs:selftest
if [ $? -ne 0 ]; then
  echo "❌ Steering reference detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:steering-refs:selftest"
  exit 1
fi
npm run check:steering-refs
if [ $? -ne 0 ]; then
  echo "❌ Steering file reference check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 報告されたファイル名が撤去・改名されていないか確認してください"
  echo "  2. steering の記載を落とすか、移管先のファイル名へ指し直してください"
  echo ""
  echo "詳細確認: npm run check:steering-refs:verbose"
  exit 1
fi

echo "✅ Steering file reference check passed"
echo ""

# ============================================================================
# steering が現存物として挙げる識別子が実在しない状態を検知する
# - 115.169 の検査は「ファイル名」を見るが、ファイル名を伴わない識別子
#   （部品名・関数名・拡張子なしのモジュール経路）の失効は網に掛からない
#   （タスク 115.198。実測では tech.md の2箇所が撤去済み ImageViewer を
#   現存の共有先として挙げていた）
# - 走査対象は .kiro/steering/*.md のインラインコードのうち、
#   PascalCase の裸の識別子・受け手なしの呼び出し形・拡張子なしのスラッシュ付き経路
# ============================================================================

echo "🔍 Checking steering identifier references..."
npm run check:steering-idents:selftest
if [ $? -ne 0 ]; then
  echo "❌ Steering identifier detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:steering-idents:selftest"
  exit 1
fi
npm run check:steering-idents
if [ $? -ne 0 ]; then
  echo "❌ Steering identifier reference check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 報告された識別子が撤去・改名されていないか確認してください"
  echo "  2. steering の記載を落とすか、移管先の識別子へ指し直してください"
  echo ""
  echo "詳細確認: npm run check:steering-idents:verbose"
  exit 1
fi

echo "✅ Steering identifier reference check passed"
echo ""

# ============================================================================
# steering のテスト区分の列挙が実体とずれた状態を検知する
# - 115.169 / 115.198 / 115.199 の検査はいずれも「挙げたものが実在するか」を見る。
#   「挙げていないものがある」＝過小の側はどれも見ていなかった
#   （タスク 115.200。tech.md の unit/utils/ は 8ファイル中1件しか挙げていなかった）
# - 印（<!-- steering:test-dirs <根> -->）で囲まれた列挙だけを網羅と見なし、
#   その根の直下でテストを含むディレクトリ集合と過不足なく一致することを要求する
# - あわせて、steering にテストの件数・テストファイル数を書かない規約を強制する
#   （是正前の実データは数値59個のうち38個が既に陳腐化していた）
# ============================================================================

echo "🔍 Checking steering test tree enumeration..."
npm run check:steering-test-tree:selftest
if [ $? -ne 0 ]; then
  echo "❌ Steering test tree detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:steering-test-tree:selftest"
  exit 1
fi
npm run check:steering-test-tree
if [ $? -ne 0 ]; then
  echo "❌ Steering test tree check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 網羅宣言（印で囲んだ列挙）の中身を実体へ揃えてください"
  echo "  2. 件数の指摘は数値を落とし、数える手段（npm --prefix backend run test 等）を書いてください"
  echo "  3. 網羅を主張しない列挙は印で囲まず「代表例」と明記してください"
  echo ""
  echo "詳細確認: npm run check:steering-test-tree:verbose"
  exit 1
fi

echo "✅ Steering test tree check passed"
echo ""

# ============================================================================
# steering の実体の件数が版の手掛かりを持たないまま凍る状態を検知する
# - check:steering-test-tree の件数の規約は「テスト」を含む行だけを見るため、
#   ディレクトリ注記（注釈ツール（11ファイル）等）は網の外だった（タスク 115.275）
# - 是正前の structure.md には実測日を持たない件数が30行あり、再現コマンドを書ける
#   21行のうち13行が既に食い違っていた（quantity-table/ 22→68 など。2026-09-05 実測）
# - 数値 + 実体の単位語を含む行に YYYY-MM-DD の実測日が無ければ落とす（規約 (a)）。
#   数値を落として数える手段を書けば（規約 (b)）網に掛からない
# ============================================================================

echo "🔍 Checking steering artifact counts..."
npm run check:steering-dir-counts:selftest
if [ $? -ne 0 ]; then
  echo "❌ Steering artifact count detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:steering-dir-counts:selftest"
  exit 1
fi
npm run check:steering-dir-counts
if [ $? -ne 0 ]; then
  echo "❌ Steering artifact count check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 実測日（YYYY-MM-DD）と再現コマンドを数値と同じ行へ添えてください（規約 (a)）"
  echo "  2. または数値を落とし、数える手段（git ls-files <dir> | wc -l 等）を書いてください（規約 (b)）"
  echo ""
  echo "詳細確認: npm run check:steering-dir-counts:verbose"
  exit 1
fi

echo "✅ Steering artifact count check passed"
echo ""

# ============================================================================
# steering が述べる「検証の実行方法」と実挙動の一致を検知する（タスク 115.288）
# - タスク 115.243 が変異で実証: 是正した註を偽の形へ戻しても既存の五つの関門
#   （steering-refs / -idents / -test-tree / -dir-counts / design-measurement-freshness）
#   はすべて終了コード 0 のままだった（コミット 511000a7 で再現。2026-09-05 実測）
# - 見るのは三つだけ: (i) 名指した npm スクリプトの実在、(ii)「全件」「〜だけ」の主張と
#   vitest の構成から導いた選択範囲の一致、(iii) 同じ資材を名指す起動コマンドの実行器の一致
# - 註の主張と実挙動の一致は一般には機械判定できない。残りは
#   .kiro/steering/development-discipline.md の作法が拘束する
# ============================================================================

echo "🔍 Checking steering command annotations..."
npm run check:steering-command-annotations:selftest
if [ $? -ne 0 ]; then
  echo "❌ Steering command annotation detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:steering-command-annotations:selftest"
  exit 1
fi
npm run check:steering-command-annotations
if [ $? -ne 0 ]; then
  echo "❌ Steering command annotation check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 名指した npm スクリプトが当該 package.json に実在するか確かめてください"
  echo "  2. 「全件」「〜だけ」と述べた註は、vitest の構成が実際に選ぶ範囲と揃えてください"
  echo "  3. 同じ資材の起動コマンドは文書間で実行器を揃えてください（実際に叩いて正否を決める）"
  echo ""
  echo "詳細確認: npm run check:steering-command-annotations:verbose"
  exit 1
fi

echo "✅ Steering command annotation check passed"
echo ""

# ============================================================================
# E2E画面内自前判定チェック（E2Eテスト実行の前提条件）
# ============================================================================
# 画面の中で本番の判定を自前で書き起こし、その書き起こしへ主張する構造を検知する
# - R1: 引数を取らず画面の状態へ触れないまま返した値へ主張する形
# - R2: 同じスクリプトの中で自分が書いた鍵だけを読み返した値へ主張する形
# - いずれも返り値が呼び出し側で消費される場合に限る（主張の無い呼び出しは対象外）
# - 既存の check:e2e-guards は恒真式と条件包みを見るため、この形は素通りする
# ============================================================================

echo "🔍 Checking for in-page self-judgement in E2E..."
npm run check:e2e-selfjudge:selftest
if [ $? -ne 0 ]; then
  echo "❌ In-page self-judgement detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:e2e-selfjudge:selftest"
  exit 1
fi
npm run check:e2e-selfjudge
if [ $? -ne 0 ]; then
  echo "❌ E2E in-page self-judgement check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 本番の経路を通る観測（画面の描画・本番が置いた値・APIの応答）へ主張を向けてください"
  echo "  2. 要件が未実装であることが露見した場合は、検証を失敗したまま残して起票してください"
  echo ""
  echo "詳細確認: npm run check:e2e-selfjudge:verbose"
  exit 1
fi

echo "✅ E2E in-page self-judgement check passed"
echo ""

# ============================================================================
# 反実仮想の引用チェック（記録の信頼性の前提条件）
# ============================================================================
# 「この変異を当てれば赤くなる／緑のままである」という反実仮想を、実際に変異を
# 実行せずに書くと、後任が誤診する（タスク 115.168 / 115.170 / 115.171 で三度発生）
# - コード注釈の中で、コード上の名前を名指しし、変異の語と検査の判定の語を同じ文に
#   持つ記述を「反実仮想」として取り出す
# - 同じ注釈の塊に「実行を述べる語 + 数字」が無ければ失格
# - 本検査は文面だけを見る。実行そのものは保証しない（限界は本体の注釈に明記）
# ============================================================================

echo "🔍 Checking counterfactual claims cite an executed mutation..."
npm run check:cf-evidence:selftest
if [ $? -ne 0 ]; then
  echo "❌ Counterfactual evidence detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:cf-evidence:selftest"
  exit 1
fi
npm run check:cf-evidence
if [ $? -ne 0 ]; then
  echo "❌ Counterfactual evidence check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 記述した変異を実際に当て、落ちた件数・比・日付を同じ注釈へ書いてください"
  echo "  2. 変異を実行できないなら、反実仮想そのものを書かないでください"
  echo ""
  echo "詳細確認: npm run check:cf-evidence:verbose"
  exit 1
fi

echo "✅ Counterfactual evidence check passed"
echo ""

# ============================================================================
# 死んだ環境変数チェック（設定しても何も変わらない環境変数の再発防止）
# ============================================================================
# npm スクリプトが `VAR=value` で設定する環境変数に、読む側がリポジトリのどこにも
# 無い状態を検出する（タスク 115.216 / 115.244）
# - 定義元は 3 つの package.json（ルート / backend / frontend）
# - 読み手はリポジトリ全体。コード注釈と行頭 `#` の注釈は照合前に除去する
# - `const { X } = process.env` の分割代入も読み手として数える
# - 母集団（設定される環境変数）が空なら合格にしない（第3原則）
# ============================================================================

echo "🔍 Checking npm scripts do not set unread environment variables..."
npm run check:dead-script-env:selftest
if [ $? -ne 0 ]; then
  echo "❌ Dead script env detector self-test failed. Push aborted."
  echo ""
  echo "詳細確認: npm run check:dead-script-env:selftest"
  exit 1
fi
npm run check:dead-script-env
if [ $? -ne 0 ]; then
  echo "❌ Dead script env check failed. Push aborted."
  echo ""
  echo "対応方法:"
  echo "  1. 設定した環境変数を読む側を実装するか、設定そのものを撤去してください"
  echo "  2. 読んでいるのに検出される場合は判定器の限界です。本体の注釈を確認してください"
  echo ""
  echo "詳細確認: npm run check:dead-script-env:verbose"
  exit 1
fi

echo "✅ Dead script env check passed"
echo ""

# ============================================================================
# CI環境変数整合性チェック（E2Eテスト実行の前提条件）
# ============================================================================
# ベストプラクティス: pre-pushを「正」としてCIとの整合性を検証
# - pre-pushで使用する環境変数設定がCIでも正しく設定されているか確認
# - 差異がある場合はCIの修正を促すエラーメッセージを出力
# - 整合性がない場合、E2Eテストをスキップ
# ============================================================================

echo "🔍 Checking CI environment variable consistency..."
echo "   This ensures CI configuration matches pre-push expectations."
echo ""

CI_CONFIG=".github/workflows/ci.yml"
CI_CONSISTENCY_ERROR=0

if [ ! -f "$CI_CONFIG" ]; then
  echo "❌ CI configuration file not found: $CI_CONFIG"
  echo "   E2E tests cannot proceed without CI configuration validation."
  npm run test:docker:down > /dev/null 2>&1
  exit 1
fi

# 1. CI=true が設定されているか確認
if ! grep -q "CI: true" "$CI_CONFIG"; then
  echo "❌ CI configuration error: 'CI: true' not found in test-integration job"
  echo "   pre-push expects: CI=true"
  echo "   Action: Add 'CI: true' to test-integration job environment variables in $CI_CONFIG"
  CI_CONSISTENCY_ERROR=1
fi

# 2. NODE_ENV=test が設定されているか確認
if ! grep -q "NODE_ENV: test" "$CI_CONFIG"; then
  echo "❌ CI configuration error: 'NODE_ENV: test' not found in test-integration job"
  echo "   pre-push expects: NODE_ENV=test"
  echo "   Action: Add 'NODE_ENV: test' to test-integration job environment variables in $CI_CONFIG"
  CI_CONSISTENCY_ERROR=1
fi

# 3. DISABLE_RATE_LIMIT が設定されているか確認（値はtrue/"true"のどちらでも可）
if ! grep -qE 'DISABLE_RATE_LIMIT:\s*(true|"true")' "$CI_CONFIG"; then
  echo "❌ CI configuration error: 'DISABLE_RATE_LIMIT: true' not found in test-integration job"
  echo "   pre-push expects: DISABLE_RATE_LIMIT=true"
  echo "   Action: Add 'DISABLE_RATE_LIMIT: true' to test-integration job environment variables in $CI_CONFIG"
  CI_CONSISTENCY_ERROR=1
fi

# 4. DATABASE_URL パターンの確認（architrack_testデータベースを使用）
if ! grep -q "DATABASE_URL:.*architrack_test" "$CI_CONFIG"; then
  echo "❌ CI configuration error: DATABASE_URL does not reference 'architrack_test' database"
  echo "   pre-push expects: DATABASE_URL=...architrack_test"
  echo "   Action: Ensure DATABASE_URL in $CI_CONFIG uses 'architrack_test' database"
  CI_CONSISTENCY_ERROR=1
fi

# 5. E2Eテスト用のBASE_URL/API_BASE_URLが設定されているか確認
if ! grep -q "BASE_URL:" "$CI_CONFIG"; then
  echo "⚠️  Warning: 'BASE_URL' not explicitly set in CI configuration"
  echo "   pre-push uses: http://localhost:5174 (test environment)"
  echo "   Note: CI may use different ports (5173 for standard environment)"
fi

if ! grep -q "API_BASE_URL:" "$CI_CONFIG"; then
  echo "⚠️  Warning: 'API_BASE_URL' not explicitly set in CI configuration"
  echo "   pre-push uses: http://localhost:3100 (test environment)"
  echo "   Note: CI may use different ports (3000 for standard environment)"
fi

if [ $CI_CONSISTENCY_ERROR -ne 0 ]; then
  echo ""
  echo "❌ CI environment variable consistency check failed."
  echo "   E2Eテストは実行されません（CI設定に問題があります）"
  echo ""
  echo "対応方法:"
  echo "  1. 上記のエラーメッセージに従って $CI_CONFIG を修正してください"
  echo "  2. pre-pushの設定が「正」であり、CIを合わせる必要があります"
  echo "  3. 修正後、再度pushを試みてください"
  npm run test:docker:down > /dev/null 2>&1
  exit 1
fi

echo "✅ CI environment variable consistency check passed"
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

# ============================================================================
# E2E Tests（CIと同一: ci.yml test-integration job）
# ============================================================================
# ベストプラクティス: CIと同一のシンプルな構成
# - シャーディングなし（CIと同様）
# - CI=trueフラグを設定してPlaywright環境を明示
# ============================================================================
echo "🧪 Running E2E tests..."

# Playwrightブラウザのインストール確認（キャッシュ済みの場合は即座に完了）
echo "   🎭 Ensuring Playwright browsers are installed..."
npx playwright install chromium > /dev/null 2>&1

CI=true npx playwright test
E2E_EXIT_CODE=$?

if [ $E2E_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ E2E tests failed. Push aborted."
  echo ""
  echo "   失敗には「再試行で回復した検証（flaky）」も含まれる。"
  echo "   playwright.config.ts の failOnFlakyTests により、再試行のみで緑になった実行は"
  echo "   失敗として扱う（緑であることと、一度で緑になることは別の主張である）。"
  echo "   該当があれば上の RETRY-RECOVERED FAILURES (FLAKY) にテスト名と試行結果が出る。"
  npm run test:docker:down > /dev/null 2>&1
  exit 1
fi

echo ""
echo "✅ E2E tests completed successfully"

# テスト環境のクリーンアップ（成功時）
# tmpfsを使用しているため、データは自動的に破棄される
echo "🧹 Cleaning up test environment..."
npm run test:docker:down > /dev/null 2>&1
echo "   ✅ Test containers stopped and removed"

echo "✅ All checks passed!"

} 2>&1 | tee "${LOG_FILE}"
