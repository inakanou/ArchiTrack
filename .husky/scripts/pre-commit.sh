#!/bin/bash
# ============================================================================
# Pre-commit Hook - Quality Checks for Staged Files
# ============================================================================
# このスクリプトは .husky/pre-commit から呼び出されます
# コミット前にlint、type checkを実行します
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

echo "✅ All checks passed!"
