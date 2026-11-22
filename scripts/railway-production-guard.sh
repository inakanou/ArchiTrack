#!/usr/bin/env bash
# ============================================================================
# production へ配備する前に、Railway の必須の設定が適用済みであることを確かめる
# ============================================================================
# Railway は railway.toml を 2026-12-01 で読まなくなり、設定は .railway/railway.ts を
# railway config apply で適用して初めて Railway に保存される。main へのマージでは適用されない。
# 適用を忘れて配備すると健全性確認なしで動き、起動できない版でも配備が成功になりうるため、
# 設定がそろっていなければ配備の前に止める。読めないときも止める。
#
# ビルド方式は確かめない。DOCKERFILE を適用しても保存値が RAILPACK のままになるためである。
#
# 使い方: scripts/railway-production-guard.sh <backend のサービス ID> <frontend のサービス ID>
#   RAILWAY_TOKEN  Railway のトークン（railway の CLI が読む）
#   RAILWAY_BIN    railway の CLI（既定 railway。自己検査が偽物に差し替える）
#
# 応答には環境変数が含まれうるので、応答の内容を出力しない。
# 終了コード: 0 = 設定がそろっている、1 = 不足・不一致・読み取りの失敗、2 = 引数の誤り
# 自己検査: scripts/railway-production-guard.selftest.sh
# ============================================================================
set -uo pipefail

if [ $# -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
  echo "使い方: $0 <backend のサービス ID> <frontend のサービス ID>" >&2
  exit 2
fi

BACKEND="$1"
FRONTEND="$2"
RAILWAY_BIN="${RAILWAY_BIN:-railway}"

stop() {
  echo "✗ $1" >&2
  echo "  production の設定を確かめ、適用してから配備し直してください:" >&2
  echo "    railway config plan --environment production" >&2
  echo "    railway config apply --environment production" >&2
  exit 1
}

if ! CONFIG=$("$RAILWAY_BIN" environment config --environment production --json 2>/dev/null); then
  stop "Railway の production の設定を読めませんでした"
fi

if ! printf '%s' "$CONFIG" | jq -e 'type == "object"' >/dev/null 2>&1; then
  stop "Railway の production の設定を解釈できませんでした"
fi

check() {
  local label="$1" filter="$2" id="$3"
  if ! printf '%s' "$CONFIG" | jq -e --arg id "$id" "$filter" >/dev/null 2>&1; then
    stop "$label"
  fi
}

check "backend のサービスが production の設定にありません" '.services[$id] != null' "$BACKEND"
check "frontend のサービスが production の設定にありません" '.services[$id] != null' "$FRONTEND"
check "backend の健全性確認のパスが /health ではありません" \
  '.services[$id].deploy.healthcheckPath == "/health"' "$BACKEND"
check "backend の健全性確認の時間が 300 秒ではありません" \
  '.services[$id].deploy.healthcheckTimeout == 300' "$BACKEND"
check "backend の再起動回数が 3 回ではありません" \
  '.services[$id].deploy.restartPolicyMaxRetries == 3' "$BACKEND"
check "frontend の再起動回数が 3 回ではありません" \
  '.services[$id].deploy.restartPolicyMaxRetries == 3' "$FRONTEND"

echo "✓ production の Railway の必須の設定は適用済みです"
