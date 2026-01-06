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
# - Node.jsヒープサイズを1GBに制限（デフォルトは無制限で肥大化）
# - 各コマンドのメモリ使用量を予測可能に維持
# 参考: https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes
# ============================================================================
export NODE_OPTIONS="--max-old-space-size=1024"

# メモリ解放用関数: Dockerビルドキャッシュとシステムキャッシュをクリア
release_memory() {
  local stage_name="$1"
  echo ""
  echo "🧹 メモリ解放中（$stage_name 完了後）..."

  # Dockerの未使用リソースをクリア（ビルドキャッシュ含む）
  docker system prune -f --volumes > /dev/null 2>&1 || true

  # ファイルシステムキャッシュを解放（root権限不要な範囲で）
  sync 2>/dev/null || true

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

# Frontend unit tests (staged by project for WSL memory optimization)
if [ -d "frontend" ]; then
  echo "🧪 Running frontend unit tests (staged by project for memory optimization)..."
  echo ""
  echo "   ベストプラクティス: WSL環境のメモリ制限に対応するため、"
  echo "   テストを16個のプロジェクトに分割して順次実行します。"
  echo "   各プロジェクト実行後にメモリが解放されるため、OOMクラッシュを防止できます。"
  echo ""

  # プロジェクトリスト（軽量→重い順）
  # Vitest Projects機能により、各プロジェクトは独立したプロセスで実行される
  projects=("lightweight" "api" "contexts" "hooks-auth" "hooks-ui" "hooks-site-survey" "hooks-canvas" "hooks-form-1" "hooks-form-2" "components-core" "projects" "quantity-table" "site-surveys" "trading-partners" "pages" "integration")

  project_count=1
  total_projects=${#projects[@]}

  for project in "${projects[@]}"; do
    echo "  📦 [$project_count/$total_projects] Testing project: $project..."
    npm --prefix frontend run test:$project
    if [ $? -ne 0 ]; then
      echo ""
      echo "❌ Frontend unit tests failed in project: $project. Push aborted."
      echo "   Run 'npm --prefix frontend run test:$project' to reproduce the failure."
      exit 1
    fi
    echo "     ✅ Project $project passed"
    echo ""
    project_count=$((project_count + 1))
  done

  echo "✅ All frontend unit tests passed ($total_projects projects)"
  echo ""

  # ============================================================================
  # カバレッジ収集（全プロジェクト分を一括収集）
  # ============================================================================
  # ベストプラクティス: テスト成功後にカバレッジを収集
  # - メモリ設定を3GBに調整（WSL環境の6GB総メモリに対応）
  # - 元の8GB設定はWSL環境では過剰でOOMの原因
  # ============================================================================
  echo "📊 Collecting frontend test coverage..."
  NODE_OPTIONS='--max-old-space-size=3072' npm --prefix frontend run test:coverage
  if [ $? -ne 0 ]; then
    echo "❌ Frontend coverage collection failed. Push aborted."
    echo "   Run 'NODE_OPTIONS=\"--max-old-space-size=3072\" npm --prefix frontend run test:coverage' to reproduce."
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

# バックエンドテストコンテナのヘルスチェック（最大300秒待機）
# テスト環境はポート3100を使用
# 注意: 初回起動時はnpm install（WSL2環境で3-5分）、Prisma生成、マイグレーション、シードが
#       実行されるため、十分な待機時間が必要
echo "   Waiting for test backend to be ready..."
MAX_RETRIES=60
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

CI=true npx playwright test
E2E_EXIT_CODE=$?

if [ $E2E_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ E2E tests failed. Push aborted."
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
