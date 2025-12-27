#!/bin/bash
# ============================================================================
# Pre-commit Hook - Quality Checks for Staged Files
# ============================================================================
# このスクリプトは .husky/pre-commit から呼び出されます
# コミット前にlint、type check、および変更ファイルのカバレッジチェックを実行します
#
# カバレッジチェック:
#   - 変更されたソースファイルに対応するテストを実行
#   - 80%未満のカバレッジがあればコミットを中断
#   - pre-pushと同じ閾値を適用
# ============================================================================

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only)

# Check for draft migrations (should not be committed)
if echo "$STAGED_FILES" | grep -q 'backend/prisma/migrations/draft/'; then
  echo "❌ Error: Draft migrations detected in staged files!"
  echo ""
  echo "Draft migrations should not be committed to Git."
  echo "Staged draft migrations:"
  echo "$STAGED_FILES" | grep 'backend/prisma/migrations/draft/'
  echo ""
  echo "To fix this:"
  echo "  1. Unstage the draft: git reset HEAD backend/prisma/migrations/draft/"
  echo "  2. Finalize the draft: npm --prefix backend run db:draft:finalize"
  echo "  3. Commit the finalized migration: git add backend/prisma/migrations/<timestamp>_<name>"
  echo ""
  echo "See: backend/docs/DATABASE_MIGRATION_WORKFLOW.md"
  exit 1
fi

# Backend: TypeScript/JavaScript files
if echo "$STAGED_FILES" | grep -q '^backend/.*\.\(js\|ts\)$'; then
  echo "🔍 Running lint-staged on backend..."
  npx --prefix backend lint-staged

  echo "🔎 Running TypeScript type check on backend..."
  npm --prefix backend run type-check
  if [ $? -ne 0 ]; then
    echo "❌ Backend type check failed. Commit aborted."
    exit 1
  fi

  # Phase 3: Validate ES Module imports with node (production environment simulation)
  echo "🔍 Validating ES Module imports (production simulation)..."
  npm --prefix backend run build > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    node --check backend/dist/src/index.js
    if [ $? -ne 0 ]; then
      echo "❌ ES Module validation failed. Missing .js extensions in imports?"
      echo "💡 Hint: Run 'npm --prefix backend run validate:esm' to see details"
      exit 1
    fi
    echo "✅ ES Module imports are valid"
  else
    echo "⚠️  Build failed, skipping ES Module validation"
  fi
fi

# Frontend: TypeScript/JavaScript/JSX/TSX files
if echo "$STAGED_FILES" | grep -q '^frontend/.*\.\(js\|jsx\|ts\|tsx\)$'; then
  echo "🔍 Running lint-staged on frontend..."
  npx --prefix frontend lint-staged

  echo "🔎 Running TypeScript type check on frontend..."
  npm --prefix frontend run type-check
  if [ $? -ne 0 ]; then
    echo "❌ Frontend type check failed. Commit aborted."
    exit 1
  fi
fi

# E2E and Root scripts: TypeScript/JavaScript files
if echo "$STAGED_FILES" | grep -q '^\(e2e/.*\|playwright\.config\|scripts/.*\)\.\(js\|ts\)$'; then
  echo "🔍 Running lint-staged on E2E tests..."
  npx lint-staged

  echo "🔎 Running TypeScript type check on E2E..."
  npm run type-check
  if [ $? -ne 0 ]; then
    echo "❌ E2E type check failed. Commit aborted."
    exit 1
  fi
fi

# ============================================================================
# カバレッジチェック（変更ファイルのみ）
# ============================================================================
# ベストプラクティス: pre-pushと同じ閾値（80%）を適用
# - 変更されたソースファイルのカバレッジを測定
# - 80%未満のファイルがあればコミットを中断
# - テストファイルと除外パターンはスキップ
# ============================================================================

# Backend: カバレッジチェック
if echo "$STAGED_FILES" | grep -q '^backend/src/.*\.ts$'; then
  # テストファイルと除外パターンを除外した上でソースファイルがあるかチェック
  BACKEND_SOURCE_FILES=$(echo "$STAGED_FILES" | grep '^backend/src/.*\.ts$' | grep -v '\.test\.ts$' | grep -v '\.spec\.ts$' | grep -v '__tests__' | grep -v '\.d\.ts$' | grep -v '/types/' | grep -v '/routes/' | grep -v '/storage/' | grep -v '/generated/' | grep -v 'app\.ts$' | grep -v 'index\.ts$' | grep -v 'db\.ts$' | grep -v 'redis\.ts$' | grep -v 'generate-swagger\.ts$' | grep -v 'seed-helpers')

  if [ -n "$BACKEND_SOURCE_FILES" ]; then
    echo ""
    echo "📊 Running backend coverage check for staged files..."
    echo "   対象ファイル:"
    echo "$BACKEND_SOURCE_FILES" | while read -r f; do echo "     - $f"; done

    # テストを実行してカバレッジを生成
    echo ""
    echo "🧪 Running backend unit tests with coverage..."
    npm --prefix backend run test:unit:coverage
    if [ $? -ne 0 ]; then
      echo "❌ Backend tests failed. Commit aborted."
      exit 1
    fi

    # ステージされたファイルのカバレッジをチェック
    node scripts/check-staged-coverage.cjs --project=backend
    if [ $? -ne 0 ]; then
      echo "❌ Backend coverage check failed. Commit aborted."
      echo ""
      echo "対応方法:"
      echo "  1. 変更したファイルに対応するテストを追加してください"
      echo "  2. カバレッジを80%以上に改善してください"
      echo "  3. 詳細は上記のレポートを確認してください"
      exit 1
    fi
  fi
fi

# Frontend: カバレッジチェック
if echo "$STAGED_FILES" | grep -q '^frontend/src/.*\.\(ts\|tsx\)$'; then
  # テストファイルと除外パターンを除外した上でソースファイルがあるかチェック
  FRONTEND_SOURCE_FILES=$(echo "$STAGED_FILES" | grep '^frontend/src/.*\.\(ts\|tsx\)$' | grep -v '\.test\.\(ts\|tsx\)$' | grep -v '\.spec\.\(ts\|tsx\)$' | grep -v '__tests__' | grep -v '\.d\.ts$' | grep -v '\.css$' | grep -v 'index\.ts$' | grep -v 'AnnotationEditor\.tsx$')

  if [ -n "$FRONTEND_SOURCE_FILES" ]; then
    echo ""
    echo "📊 Running frontend coverage check for staged files..."
    echo "   対象ファイル:"
    echo "$FRONTEND_SOURCE_FILES" | while read -r f; do echo "     - $f"; done

    # テストを実行してカバレッジを生成
    echo ""
    echo "🧪 Running frontend unit tests with coverage..."
    npm --prefix frontend run test:coverage
    if [ $? -ne 0 ]; then
      echo "❌ Frontend tests failed. Commit aborted."
      exit 1
    fi

    # ステージされたファイルのカバレッジをチェック
    node scripts/check-staged-coverage.cjs --project=frontend
    if [ $? -ne 0 ]; then
      echo "❌ Frontend coverage check failed. Commit aborted."
      echo ""
      echo "対応方法:"
      echo "  1. 変更したファイルに対応するテストを追加してください"
      echo "  2. カバレッジを80%以上に改善してください"
      echo "  3. 詳細は上記のレポートを確認してください"
      exit 1
    fi
  fi
fi

echo "✅ All checks passed!"
