import { defineConfig } from 'vitest/config';
import baseConfig, { INTEGRATION_TEST_FILE_GLOB, SHARED_TEST_EXCLUDE } from './vitest.config.js';

/**
 * 統合検証（実データベース・実 Redis へ接続する検証）専用の設定。
 *
 * ## なぜ設定ファイルを分けるか
 *
 * 統合検証は共有のテスト用データベース（ローカルでは `localhost:5433/architrack_test`）へ
 * 書き込む。既定の設定（`vitest.config.ts`）がこれを含んでいると、
 * `npm run test` や素の `vitest run` が、E2E の使用中のデータベースを黙って壊しうる。
 *
 * かつては `RUN_INTEGRATION_TESTS=true` という環境変数がこの分離を担っているように
 * 見えたが、**読む側がリポジトリのどこにも無く**、実際には何も分離していなかった。
 * 分離を実行時の条件へ戻すと同じ誤信を招くうえ、前提条件で検証を無効化する構成は
 * 本プロジェクトの運用原則が禁じている。そこで分離は「どちらのコマンドを叩くか」——
 * すなわち設定ファイルの選択——に置く。
 *
 * ## 実行方法
 *
 *   npm run test:integration            # = vitest run --config vitest.integration.config.ts
 *   npm run test:integration:coverage
 *   npm run test:all                    # 既定 + 統合の両方（逐次。既定側が落ちても統合側は走る）
 *
 * 事前に test compose の postgres / redis を起動しておくこと。
 */
const baseTestOptions = baseConfig.test ?? {};

export default defineConfig({
  test: {
    ...baseTestOptions,
    // 統合検証だけを選ぶ
    include: [INTEGRATION_TEST_FILE_GLOB],
    // 既定の設定が持つ「統合検証を外す」除外は、ここでは当然に外す
    exclude: [...SHARED_TEST_EXCLUDE],
  },
});
