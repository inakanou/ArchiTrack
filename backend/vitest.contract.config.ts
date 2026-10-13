import { defineConfig, configDefaults } from 'vitest/config';

/**
 * 外部AIの応答形式に対する契約検証（estimate-request タスク 91.1）専用の設定。
 *
 * ## なぜ設定ファイルを分けるか
 *
 * 契約検証は**実API**（Anthropic Messages API）を呼ぶ。既定の `npm test`（`vitest.config.ts`）や
 * 統合の `npm run test:integration`（`vitest.integration.config.ts`）の実行に混ざってはならない。
 * 分離は実行時の条件でなく**選択**で行う（`vitest.config.ts` の注記と同じ方針。前提条件で
 * 検証を無効化する構成は AI運用7原則 第3原則が禁じている）。
 *
 * - 契約検証のファイルは `*.contract.ts`、その自己検査は `*.selftest.ts` と名づけ、
 *   `*.{test,spec}.ts` にしない。既定・統合のどちらの `include` にも一致しないため、
 *   既定の設定に `exclude` を足す必要が無い（`vitest-suite-separation.test.ts` が
 *   「既定の設定が追加で外すのは統合検証だけ」と固定している）。
 * - この設定は `src/__tests__/contract/` の二種だけを選ぶ。
 *
 * ## 実行方法
 *
 *   npm run test:contract            # 自己検査 + 実APIの契約検証（WIF の環境変数が要る）
 *   npm run test:contract:selftest   # 自己検査だけ（実APIを呼ばない）
 *
 * 実APIの契約検証は WIF の前提が揃っていなければ skip せずに失敗する。
 * 日次の実行は `.github/workflows/` の専用ワークフロー（タスク 91.2）が担う。
 */
export const CONTRACT_TEST_FILE_GLOB = 'src/__tests__/contract/**/*.{contract,selftest}.ts';

export default defineConfig({
  test: {
    environment: 'node',
    include: [CONTRACT_TEST_FILE_GLOB],
    exclude: [...configDefaults.exclude],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['verbose'],
    // 実APIの呼び出し（本番のタイムアウト 30 秒 × SDK の再試行）を待てる長さにする
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
