#!/bin/sh
set -e

echo "Checking dependencies..."

# package.jsonのハッシュを計算
CURRENT_HASH=$(sha256sum package.json package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1)
STORED_HASH=""

if [ -f "node_modules/.package-hash" ]; then
  STORED_HASH=$(cat node_modules/.package-hash)
fi

needs_install=false

if [ ! -d "node_modules/.bin" ]; then
  echo "node_modules is empty, installing dependencies..."
  needs_install=true
elif [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo "package.json or package-lock.json has changed, updating dependencies..."
  needs_install=true
else
  # アーキテクチャ固有のモジュールのみチェック
  ARCH=$(uname -m)
  if [ "$ARCH" = "aarch64" ]; then
    ARCH="arm64"
  fi

  if [ ! -d "node_modules/@rollup/rollup-linux-${ARCH}-gnu" ]; then
    echo "Architecture-specific module missing, reinstalling @rollup modules..."
    rm -rf node_modules/@rollup node_modules/.vite
    needs_install=true
  else
    echo "Dependencies are up to date"
  fi
fi

if [ "$needs_install" = true ]; then
  npm ci
  # ハッシュを保存
  echo "$CURRENT_HASH" > node_modules/.package-hash
  echo "Dependencies installed successfully"
fi

exec "$@"
