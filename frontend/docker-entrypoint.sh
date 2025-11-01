#!/bin/sh
set -e

echo "Checking dependencies..."

if [ ! -d "node_modules/.bin" ]; then
  echo "node_modules is empty, installing dependencies..."
  npm install
else
  # アーキテクチャ固有のモジュールのみチェック
  ARCH=$(uname -m)
  if [ "$ARCH" = "aarch64" ]; then
    ARCH="arm64"
  fi

  if [ ! -d "node_modules/@rollup/rollup-linux-${ARCH}-gnu" ]; then
    echo "Architecture-specific module missing, reinstalling @rollup modules..."
    rm -rf node_modules/@rollup node_modules/.vite
    npm install
  else
    echo "Dependencies are up to date"
  fi
fi

exec "$@"
