#!/usr/bin/env bash
# ============================================================================
# scripts/railway-deploy-wait.sh の自己検査
# ============================================================================
# 偽の railway の CLI（RAILWAY_BIN）でデプロイの一覧の応答を順に返し、待ち方の判定を確かめる。
# - 新しいデプロイが SUCCESS になれば 0
# - 新しいデプロイが FAILED・CRASHED・REMOVED になれば 1（古いデプロイの SUCCESS で合格にしない）
# - 新しいデプロイが現れない・起動し終わらないまま上限に達すれば 1
# - 一覧の一時的な読み出しの失敗は待ち続ける
# - railway up の失敗は 1、引数の誤りは 2
# ============================================================================
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/railway-deploy-wait.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 偽の railway: `up` は FAKE_UP_EXIT で終わる。`deployment list` は応答のファイルを 1 行ずつ返し、
# 最後の行の後は最後の行を返し続ける。行が FAIL なら読み出しの失敗（終了コード 1）にする
cat >"$WORK/railway" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  up)
    echo "$*" >>"$FAKE_DIR/up-calls"
    exit "${FAKE_UP_EXIT:-0}"
    ;;
  deployment)
    n=$(($(cat "$FAKE_DIR/count" 2>/dev/null || echo 0) + 1))
    echo "$n" >"$FAKE_DIR/count"
    total=$(wc -l <"$FAKE_DIR/responses")
    [ "$n" -gt "$total" ] && n=$total
    line=$(sed -n "${n}p" "$FAKE_DIR/responses")
    [ "$line" = "FAIL" ] && exit 1
    echo "$line"
    ;;
esac
FAKE
chmod +x "$WORK/railway"

OLD='{"id":"old","status":"SUCCESS","createdAt":"2026-01-01T00:00:00Z"}'
new() { echo "[{\"id\":\"new\",\"status\":\"$1\",\"createdAt\":\"2026-01-02T00:00:00Z\"},$OLD]"; }

FAILURES=0
CASE_DIR=""

# 応答（1 行 1 回分）を受け取り、スクリプトを実行して終了コードを返す
run_case() {
  CASE_DIR="$WORK/case-$RANDOM$RANDOM"
  mkdir -p "$CASE_DIR"
  printf '%s\n' "$@" >"$CASE_DIR/responses"
  FAKE_DIR="$CASE_DIR" RAILWAY_BIN="$WORK/railway" DEPLOY_WAIT_INTERVAL=0 \
    DEPLOY_WAIT_MAX_ATTEMPTS="${MAX_ATTEMPTS:-5}" FAKE_UP_EXIT="${UP_EXIT:-0}" \
    bash "$SCRIPT" svc staging >"$CASE_DIR/out" 2>&1
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

echo "railway-deploy-wait.sh の自己検査"

run_case "[$OLD]" "$(new BUILDING)" "$(new DEPLOYING)" "$(new SUCCESS)"
expect "新しいデプロイが SUCCESS になれば 0" 0 $?
if ! grep -q -- "--service svc --environment staging --detach" "$CASE_DIR/up-calls" 2>/dev/null; then
  echo "  ✗ railway up にサービス・環境・--detach を渡す"
  FAILURES=$((FAILURES + 1))
else
  echo "  ✓ railway up にサービス・環境・--detach を渡す"
fi

run_case "[$OLD]" "$(new BUILDING)" "$(new FAILED)"
expect "新しいデプロイが FAILED なら 1" 1 $?

run_case "[$OLD]" "$(new DEPLOYING)" "$(new CRASHED)"
expect "新しいデプロイが CRASHED なら 1" 1 $?

run_case "[$OLD]" "$(new BUILDING)" "$(new REMOVED)"
expect "新しいデプロイが起動前に REMOVED なら 1" 1 $?

run_case "[$OLD]" "[$OLD]"
expect "新しいデプロイが現れず古いデプロイが SUCCESS のままなら 1（時間切れ）" 1 $?

MAX_ATTEMPTS=3 run_case "[$OLD]" "$(new BUILDING)"
expect "起動し終わらないまま上限に達すれば 1" 1 $?

run_case "[$OLD]" "$(new BUILDING)" "FAIL" "$(new SUCCESS)"
expect "一覧の一時的な読み出しの失敗の後に SUCCESS なら 0" 0 $?

run_case "[]" "$(new SUCCESS)"
expect "前のデプロイが無いサービスでも新しいデプロイの SUCCESS で 0" 0 $?

UP_EXIT=1 run_case "[$OLD]" "$(new SUCCESS)"
expect "railway up が失敗すれば 1" 1 $?

CASE_DIR="$WORK/case-usage"
mkdir -p "$CASE_DIR"
bash "$SCRIPT" svc >"$CASE_DIR/out" 2>&1
expect "引数が足りなければ 2" 2 $?

if [ "$FAILURES" -gt 0 ]; then
  echo "✗ 自己検査に $FAILURES 件失敗しました"
  exit 1
fi
echo "✓ 自己検査はすべて通りました"
