#!/bin/sh
# =============================================================================
# backend の検証を「全部」回す（`npm run test:all` の実体。タスク 115.245）
# =============================================================================
#
# ## なぜ逐次なのか
#
# かつて `test:all` は `vitest run && vitest run --config vitest.integration.config.ts`
# だった。この形では**既定側が落ちると統合側は一度も走らない**。steering は `test:all` を
# 「既定側と統合側を合わせた数を数える手段」として名指しているため（`.kiro/steering/tech.md`
# の実行方法、`.kiro/steering/structure.md` のテスト区分の列挙の規約、
# `.kiro/steering/product.md` の品質保証）、既定側の失敗で統合側の結果が出ない形は
# その役目を果たさない。`test:all` という名前も「全部を回す」と読める。
#
# そこで両方を必ず回し、結果を両方出す。関門としての正しさは失わない——
# **どちらかが落ちれば終了コードは非零**である。
#
# ## なぜ package.json ではなくこのファイルなのか
#
# 連結を `package.json` に直接書くと、`$?` を受ける変数が
# `npm run check:dead-script-env`（タスク 115.244）に「誰も読まない環境変数の設定」と
# 判定される。同検査は npm スクリプト中の `NAME=value` を環境変数の設定として取り出し、
# 読み手の走査から `package.json` 自身を除く（定義元は読み手として数えない）ため、
# **同じスクリプト内で読まれるシェル変数を区別できない**。判定器の是正は同検査の所管
# （タスク 115.244 の境界）であり本タスクの境界外なので、こちらが変数を持たない形をとる。
#
# ## 連結の検査
#
# `backend/src/__tests__/unit/config/test-all-script-connective.test.ts` が
# `package.json` の `test:all` をそのまま実行し、`vitest` の代役で
# 「どちらが呼ばれたか」と「終了コード」を観測して固定する。

vitest run
default_status=$?

vitest run --config vitest.integration.config.ts
integration_status=$?

# 既定側の終了コードを優先して返す（先に落ちた側の原因を見失わないため）
if [ "$default_status" -ne 0 ]; then
  exit "$default_status"
fi

exit "$integration_status"
