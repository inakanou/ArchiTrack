/**
 * @fileoverview 統合検証の分離が「構成」として成立していることの検査（タスク 115.216）
 *
 * ## なぜ在るか
 *
 * かつて `backend/package.json` の `test:integration` / `test:integration:coverage` /
 * `test:all` は `RUN_INTEGRATION_TESTS=true` を設定していたが、**この環境変数を読む側は
 * リポジトリのどこにも無かった**。結果として `npm --prefix backend run test`
 * （= `vitest run`）は常に統合検証まで流し、実データベース
 * （既定で `localhost:5433/architrack_test`）へ黙って書き込んでいた。E2E が同じ
 * データベースを使っている最中に走らせると、E2E の実行を壊しうる。
 * 「分離されていると読める名前がついているのに分離していない」状態である。
 *
 * ## どう直したか
 *
 * 分離は**実行時の条件ではなく構成**で行う。
 *
 * - 既定の設定 `vitest.config.ts` は、統合検証の置き場所を `exclude` で静的に外す。
 * - 統合検証は `vitest.integration.config.ts` を明示した実行でのみ選ばれる。
 *
 * 環境変数による実行時の切り替えは使わない。設定しても何も変わらない環境変数は
 * 読み手に分離を誤信させるだけであり、また「前提条件で検証を自動的に無効化する構成」は
 * プロジェクトの運用原則（第3原則）が禁じている。`describe.skipIf(...)` の類は
 * 44 件超の検証を無言で消すため、選択肢に入らない。
 *
 * ## 何を固定するか
 *
 * 1. 既定の実行が統合検証を選ばないこと（構成に現れていること）。
 * 2. 統合検証の設定が統合検証だけを選ぶこと。
 * 3. **取りこぼしが無いこと**——実ファイルの上で、二つの設定の `include` / `exclude` が
 *    実在する検証ファイルの全体を過不足なく分割する。地の基準は設定の値ではなく、
 *    本検査が自前で持つ `ON_DISK_TEST_GLOB` である。
 * 4. 分離を環境変数の実行時条件へ戻していないこと。
 *
 * 「npm スクリプトが設定する環境変数に読み手がいる」という同型の再発防止は、タスク 115.244 が
 * `scripts/check-dead-script-env.ts` へ切り出し、押下前の関門と CI へ結線した
 * （`npm run check:dead-script-env`）。ここに残すと `backend/package.json` しか見られず、
 * その母集団は実測で空である（節 4 の註を参照）。
 */

import { describe, it, expect } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import defaultVitestConfig, {
  ALL_TEST_FILE_GLOB,
  INTEGRATION_TEST_FILE_GLOB,
  SHARED_TEST_EXCLUDE,
} from '../../../../vitest.config.js';
import integrationVitestConfig from '../../../../vitest.integration.config.js';

/** `backend/` の絶対パス（起動位置に依らないよう本ファイルからの相対で解決する） */
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * 実在する検証ファイルの全体を表す地の基準。
 *
 * `vitest.config.ts` の輸出（`ALL_TEST_FILE_GLOB`）を使うと、設定側を狭めたときに
 * 基準まで一緒に動いてしまい「取りこぼし」の検査が自明に通る。基準は本検査が自前で持つ。
 */
const ON_DISK_TEST_GLOB = 'src/**/*.{test,spec}.ts';

function selectedFiles(glob: string): string[] {
  return globSync(glob, { cwd: BACKEND_ROOT }).sort();
}

/** `patterns` が選ぶファイルの和（重複を除いて整列） */
function selectedByAll(patterns: readonly string[]): string[] {
  return [...new Set(patterns.flatMap((pattern) => selectedFiles(pattern)))].sort();
}

/**
 * 設定が実際に選ぶファイル。
 *
 * `exclude` のうち vitest 既定の分（`node_modules/**` など）は `src/` の外を指すため
 * 評価しない（評価すると `node_modules` を走査して著しく遅くなる）。既定に無い除外だけを
 * 当てる。「既定に無い除外は統合検証の一つだけ」という点は別の検査が固定する。
 */
function filesSelectedByConfig(include: readonly string[], exclude: readonly string[]): string[] {
  const shared = new Set<string>(SHARED_TEST_EXCLUDE);
  const additionalExcludes = exclude.filter((pattern) => !shared.has(pattern));
  const excluded = new Set(selectedByAll(additionalExcludes));

  return selectedByAll(include).filter((file) => !excluded.has(file));
}

// ============================================================================
// 1-3. 統合検証の分離
// ============================================================================

describe('統合検証の分離（vitest の設定）', () => {
  it('既定の設定は統合検証の置き場所を exclude で外す', () => {
    expect(defaultVitestConfig.test?.include).toEqual([ALL_TEST_FILE_GLOB]);
    expect(defaultVitestConfig.test?.exclude).toContain(INTEGRATION_TEST_FILE_GLOB);
  });

  it('統合検証の設定は統合検証だけを include し、自らを exclude しない', () => {
    expect(integrationVitestConfig.test?.include).toEqual([INTEGRATION_TEST_FILE_GLOB]);
    expect(integrationVitestConfig.test?.exclude).not.toContain(INTEGRATION_TEST_FILE_GLOB);
  });

  it('既定の設定が追加で外すのは統合検証だけである（過剰な exclude を許さない）', () => {
    const shared = new Set<string>(SHARED_TEST_EXCLUDE);
    const excludePatterns: string[] = [...(defaultVitestConfig.test?.exclude ?? [])];
    const additionalExcludes = excludePatterns.filter((pattern) => !shared.has(pattern));

    expect(additionalExcludes).toEqual([INTEGRATION_TEST_FILE_GLOB]);
  });

  it('実ファイルの上で、既定の選択と統合の選択が全体を過不足なく分割する', () => {
    const onDisk = selectedFiles(ON_DISK_TEST_GLOB);
    const defaultSelection = filesSelectedByConfig(
      [...(defaultVitestConfig.test?.include ?? [])],
      [...(defaultVitestConfig.test?.exclude ?? [])]
    );
    const integrationSelection = filesSelectedByConfig(
      [...(integrationVitestConfig.test?.include ?? [])],
      [...(integrationVitestConfig.test?.exclude ?? [])]
    );

    // 空集合に対して自明に成立する検査を避ける（両側とも実在することを先に固定する）
    expect(integrationSelection.length).toBeGreaterThan(0);
    expect(defaultSelection.length).toBeGreaterThan(0);

    // 交わらない（既定の実行が実データベースへ触れる検証を巻き込まない）
    const integrationSet = new Set(integrationSelection);
    expect(defaultSelection.filter((file) => integrationSet.has(file))).toEqual([]);
    // どちらからも漏れない。どちらの設定にも入らない検証ファイルを生む改変は、ここで落ちる
    // （`vitest.config.ts` の `include` を `src/__tests__/unit/config/**` へ狭めると、
    //  本ファイル 9 件のうち 2 件が落ちる。2026-08-31 に実測）。
    // 一方、`include` を `src/__tests__/unit/**` へ狭める改変は**ここでは落ちない**——
    // 実在する検証ファイルが unit/ と integration/ に尽きており取りこぼしが生じないためで、
    // 実測でも 9 件のうち 1 件（上の `include` の一致）だけが落ちた（同日実測）。
    expect([...defaultSelection, ...integrationSelection].sort()).toEqual(onDisk);
  });

  it('統合の設定の include は、統合検証の実ファイルをすべて選ぶ', () => {
    const includePatterns: string[] = [...(integrationVitestConfig.test?.include ?? [])];

    expect(selectedByAll(includePatterns)).toEqual(selectedFiles(INTEGRATION_TEST_FILE_GLOB));
  });
});

// ============================================================================
// 4. 環境変数の関門へ戻していないこと
// ============================================================================
//
// 「npm スクリプトが設定する環境変数に読み手がいる」という検査そのものは、タスク 115.244 が
// `scripts/check-dead-script-env.ts`（自己検査は `scripts/check-dead-script-env.selftest.ts`）
// へ切り出した。理由は二つある。
//
//   1. **適用範囲**: ここに置くと `backend/package.json` しか見られない。実測（2026-09-02）
//      では、環境変数を設定するスクリプトはルート `package.json` の 4 件（3 変数）だけで、
//      `backend/package.json` と `frontend/package.json` は 0 件である。つまりここに残した
//      検査の母集団は**空**であり、何も主張していなかった（AI運用7原則 第3原則）。
//   2. **判定器**: 注釈の除去・分割代入の認識は切り出し先が持つ。実装を二箇所に置くと
//      互いに食い違う（115.217 が確立した「実装側は一本化」の切り分け）。
//
// ここに残すのは、本ファイルの主題（統合検証の分離）に属する一件だけである——
// 分離を環境変数の実行時条件へ戻していないこと。
describe('統合検証の分離を環境変数の関門へ戻していない', () => {
  const backendScripts: Record<string, string> = JSON.parse(
    readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf-8')
  ).scripts;

  it('統合検証は設定ファイルの明示で選ばれる（環境変数の関門に戻していない）', () => {
    expect(backendScripts['test:integration']).toContain('--config vitest.integration.config.ts');
    expect(JSON.stringify(backendScripts)).not.toContain('RUN_INTEGRATION_TESTS');
  });
});
