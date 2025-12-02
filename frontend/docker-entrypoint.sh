#!/bin/sh
set -e

echo "Checking dependencies..."

if [ ! -d "node_modules/.bin" ]; then
  echo "node_modules is empty, installing dependencies..."
  npm install --legacy-peer-deps
else
  # アーキテクチャ固有のモジュールのみチェック
  ARCH=$(uname -m)
  if [ "$ARCH" = "aarch64" ]; then
    ARCH="arm64"
  fi

  if [ ! -d "node_modules/@rollup/rollup-linux-${ARCH}-gnu" ]; then
    echo "Architecture-specific module missing, reinstalling @rollup modules..."
    # パーミッションエラーを回避するため、削除に失敗しても続行
    if rm -rf node_modules/@rollup node_modules/.vite 2>/dev/null; then
      npm install --legacy-peer-deps
    else
      echo "Warning: Cannot remove existing modules (permission denied)."
      echo "Attempting npm install without removing..."
      npm install --legacy-peer-deps || echo "npm install failed, continuing with existing modules"
    fi
  else
    echo "Dependencies are up to date"
  fi
fi

exec "$@"
