#!/bin/sh

# Alpine環境用のネイティブモジュールを確実にインストール
echo "Rebuilding native modules for Alpine..."
npm install --force --no-save @rollup/rollup-linux-x64-musl 2>/dev/null || true
npm rebuild

echo "Starting Vite dev server..."
exec npm run dev
