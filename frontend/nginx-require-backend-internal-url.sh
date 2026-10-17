#!/bin/sh
# API の中継先（BACKEND_INTERNAL_URL）の起動前の検査
#
# nginx の公式イメージの entrypoint が設定の生成（20-envsubst-on-templates.sh）より前に
# 実行する。中継先が無い・形が違うときは非 0 で終わり、コンテナの起動を止める
# （中継先の無い nginx を黙って起動しない。user-authentication design.md「画面配信」）。
#
# 受け付ける形は scheme://host[:port]（パス・クエリを持たない）。nginx.conf は変数で
# proxy_pass するため、パスを含む値は要求の URI を置き換えてしまう。
set -eu

url="${BACKEND_INTERNAL_URL:-}"

fail() {
    echo "$0: BACKEND_INTERNAL_URL $1 (例: http://backend:3000)" >&2
    exit 1
}

[ -n "$url" ] || fail "が設定されていません。API の中継先を scheme://host[:port] で指定してください"

case "$url" in
    http://*|https://*) ;;
    *) fail "は http:// か https:// で始めてください: '$url'" ;;
esac

authority="${url#*://}"
case "$authority" in
    ''|*/*|*'?'*|*'#'*|*' '*) fail "は scheme://host[:port] の形にしてください（パスやクエリを付けない）: '$url'" ;;
esac

echo "$0: API の中継先: $url"
