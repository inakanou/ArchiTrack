#!/usr/bin/env bash
# ============================================================================
# scripts/railway-production-guard.sh の自己検査
# ============================================================================
# 偽の railway の CLI（RAILWAY_BIN）で production の設定の応答を返し、判定を確かめる。
# - 健全性確認と再起動の設定がそろえば 0
# - 設定が一つでも欠ける・違う、サービスが無い、設定を読めない、JSON でなければ 1
# - 引数の誤りは 2
# - 環境変数の値を出力しない
# ============================================================================
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/railway-production-guard.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cat >"$WORK/railway" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >"$FAKE_DIR/calls"
[ "${FAKE_EXIT:-0}" -eq 0 ] || exit "$FAKE_EXIT"
cat "$FAKE_DIR/response"
FAKE
chmod +x "$WORK/railway"

SECRET_VALUE="selftest-secret-value-must-not-appear"
FAILURES=0
CASE_DIR=""

config() {
  local path="$1" timeout="$2" backend_retries="$3" frontend_retries="$4"
  jq -cn --arg path "$path" --argjson timeout "$timeout" --argjson br "$backend_retries" \
    --argjson fr "$frontend_retries" --arg secret "$SECRET_VALUE" '{
      services: {
        backend: { variables: { JWT_PRIVATE_KEY: { value: $secret } },
          deploy: { healthcheckPath: (if $path == "" then null else $path end), healthcheckTimeout: $timeout, restartPolicyMaxRetries: $br } },
        frontend: { deploy: { restartPolicyMaxRetries: $fr } }
      }
    }'
}

run_case() {
  CASE_DIR="$WORK/case-$RANDOM$RANDOM"
  mkdir -p "$CASE_DIR"
  printf '%s' "$1" >"$CASE_DIR/response"
  FAKE_DIR="$CASE_DIR" FAKE_EXIT="${FAKE_EXIT_CODE:-0}" RAILWAY_BIN="$WORK/railway" \
    bash "$SCRIPT" "${BACKEND_ARG-backend}" "${FRONTEND_ARG-frontend}" >"$CASE_DIR/out" 2>&1
}

expect() {
  local name="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name（終了コード: 期待 $want、実際 $got）"
    sed 's/^/      /' "$CASE_DIR/out"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "railway-production-guard.sh の自己検査"

run_case "$(config /health 300 3 3)"
expect "健全性確認と再起動の設定がそろえば 0" 0 $?
if grep -q -- "environment config --environment production --json" "$CASE_DIR/calls" 2>/dev/null; then
  echo "  ✓ production の設定を読む"
else
  echo "  ✗ production の設定を読む"
  FAILURES=$((FAILURES + 1))
fi

run_case "$(config "" 300 3 3)"
expect "backend の健全性確認のパスが無ければ 1" 1 $?
if grep -q -- "railway config plan --environment production" "$CASE_DIR/out"; then
  echo "  ✓ 止めたときに次の操作を示す"
else
  echo "  ✗ 止めたときに次の操作を示す"
  FAILURES=$((FAILURES + 1))
fi
if grep -q -- "$SECRET_VALUE" "$CASE_DIR/out"; then
  echo "  ✗ 環境変数の値を出力しない"
  FAILURES=$((FAILURES + 1))
else
  echo "  ✓ 環境変数の値を出力しない"
fi

run_case "$(config /wrong 300 3 3)"
expect "backend の健全性確認のパスが違えば 1" 1 $?
run_case "$(config /health 60 3 3)"
expect "backend の健全性確認の時間が違えば 1" 1 $?
run_case "$(config /health 300 0 3)"
expect "backend の再起動回数が違えば 1" 1 $?
run_case "$(config /health 300 3 0)"
expect "frontend の再起動回数が違えば 1" 1 $?

BACKEND_ARG=missing run_case "$(config /health 300 3 3)"
expect "backend のサービスが無ければ 1" 1 $?
FRONTEND_ARG=missing run_case "$(config /health 300 3 3)"
expect "frontend のサービスが無ければ 1" 1 $?

run_case "not json"
expect "応答が JSON でなければ 1" 1 $?
FAKE_EXIT_CODE=1 run_case "$(config /health 300 3 3)"
expect "設定を読めなければ 1" 1 $?

BACKEND_ARG="" run_case "$(config /health 300 3 3)"
expect "引数が空なら 2" 2 $?

if [ "$FAILURES" -ne 0 ]; then
  echo "✗ 自己検査の失敗: $FAILURES 件"
  exit 1
fi
echo "✓ 自己検査はすべて成功しました"
