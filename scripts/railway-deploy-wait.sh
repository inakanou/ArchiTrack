#!/usr/bin/env bash
# ============================================================================
# Railway へデプロイし、新しいデプロイが起動し終わる（SUCCESS）まで待つ
# ============================================================================
# `railway up --detach` はアップロードとデプロイの開始だけで戻るため、新しい版のビルドの失敗や
# 起動の失敗（クラッシュの繰り返し）に気づけず、古い版に当たったヘルスチェックが通ってしまう。
# このスクリプトはデプロイを開始した後、新しく作られたデプロイを ID で追い、状態が
# SUCCESS（Railway のヘルスチェックの合格）になれば 0、失敗・置き換え・時間切れなら 1 で終わる。
#
# 使い方: scripts/railway-deploy-wait.sh <サービス> <環境>
#   RAILWAY_TOKEN              Railway のトークン（railway の CLI が読む）
#   DEPLOY_WAIT_INTERVAL       状態を確かめる間隔の秒（既定 15）
#   DEPLOY_WAIT_MAX_ATTEMPTS   状態を確かめる回数の上限（既定 120 = 既定の間隔で 30 分）
#   RAILWAY_BIN                railway の CLI（既定 railway。自己検査が偽物に差し替える）
#
# 終了コード: 0 = 新しいデプロイが SUCCESS、1 = 失敗・置き換え・時間切れ、2 = 引数の誤り
# 自己検査: scripts/railway-deploy-wait.selftest.sh
# ============================================================================
set -uo pipefail

if [ $# -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
  echo "使い方: $0 <サービス> <環境>" >&2
  exit 2
fi

SERVICE="$1"
ENVIRONMENT="$2"
RAILWAY_BIN="${RAILWAY_BIN:-railway}"
INTERVAL="${DEPLOY_WAIT_INTERVAL:-15}"
MAX_ATTEMPTS="${DEPLOY_WAIT_MAX_ATTEMPTS:-120}"

# 最新のデプロイの「ID 状態」を出す（一覧を読めなければ空）
latest_deployment() {
  local json
  json=$("$RAILWAY_BIN" deployment list --service "$SERVICE" --environment "$ENVIRONMENT" --json --limit 5 2>/dev/null) || return 1
  echo "$json" | jq -r 'if type == "array" and length > 0 then (sort_by(.createdAt) | last | "\(.id) \(.status)") else "" end' 2>/dev/null
}

# 指定の ID のデプロイの状態を出す（一覧に無ければ空）
deployment_status() {
  local json
  json=$("$RAILWAY_BIN" deployment list --service "$SERVICE" --environment "$ENVIRONMENT" --json --limit 20 2>/dev/null) || return 1
  echo "$json" | jq -r --arg id "$1" 'if type == "array" then (map(select(.id == $id)) | first | .status // "") else "" end' 2>/dev/null
}

# デプロイの前の最新の ID（これと違う ID が今回のデプロイ）
PREVIOUS_ID=""
if previous=$(latest_deployment); then
  PREVIOUS_ID="${previous%% *}"
fi
echo "デプロイの前の最新のデプロイ: ${PREVIOUS_ID:-（なし）}"

if ! "$RAILWAY_BIN" up --service "$SERVICE" --environment "$ENVIRONMENT" --detach; then
  echo "✗ railway up が失敗しました" >&2
  exit 1
fi

DEPLOYMENT_ID=""
LAST_STATUS=""
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if [ -z "$DEPLOYMENT_ID" ]; then
    if current=$(latest_deployment) && [ -n "$current" ] && [ "${current%% *}" != "$PREVIOUS_ID" ]; then
      DEPLOYMENT_ID="${current%% *}"
      STATUS="${current#* }"
      echo "今回のデプロイ: $DEPLOYMENT_ID"
    else
      echo "[$attempt/$MAX_ATTEMPTS] 新しいデプロイの登録を待っています..."
      sleep "$INTERVAL"
      continue
    fi
  elif ! STATUS=$(deployment_status "$DEPLOYMENT_ID"); then
    echo "[$attempt/$MAX_ATTEMPTS] デプロイの一覧を読めませんでした。もう一度確かめます"
    sleep "$INTERVAL"
    continue
  fi

  if [ "$STATUS" != "$LAST_STATUS" ]; then
    echo "[$attempt/$MAX_ATTEMPTS] 状態: ${STATUS:-（一覧に無い）}"
    LAST_STATUS="$STATUS"
  fi

  case "$STATUS" in
    SUCCESS)
      echo "✓ 新しいデプロイが起動し終わりました（$DEPLOYMENT_ID）"
      exit 0
      ;;
    FAILED | CRASHED)
      echo "✗ 新しいデプロイが失敗しました（$DEPLOYMENT_ID: $STATUS）。Railway のデプロイのログを確かめてください" >&2
      exit 1
      ;;
    REMOVED | REMOVING | SKIPPED | "")
      echo "✗ 新しいデプロイが起動する前に取り除かれました（$DEPLOYMENT_ID: ${STATUS:-一覧に無い}）。別のデプロイに置き換えられた可能性があります" >&2
      exit 1
      ;;
    *)
      sleep "$INTERVAL"
      ;;
  esac
done

echo "✗ 時間切れ: 新しいデプロイが起動し終わりませんでした（${DEPLOYMENT_ID:-未登録}: ${LAST_STATUS:-不明}）" >&2
exit 1
