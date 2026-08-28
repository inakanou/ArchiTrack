/**
 * @fileoverview 描画面（Fabric.js キャンバス）の観測ヘルパー
 *
 * 注釈エディタは初期化の完了時にキャンバスを `window.__fabricCanvas` として公開する。
 * E2E はこれを唯一の観測点として、描画面に載っている図形の数を読む。
 *
 * Task 115.184: 描画面が取得できないことは「観測された値」ではなく「観測の失敗」である。
 * それを負の番兵値（`-1`）として返すと、番兵値と実際の件数が同じ `number` に同居し、
 * 次の二つが区別できなくなる。
 *
 * - 描画面が不在（観測できていない）
 * - 描画面は在るが図形が零個（観測できた結果）
 *
 * 区別できない結果、`expect(after).toBe(before + 1)` という増分の主張が
 * 「不在（-1）から零（0）へ」でも成立してしまう。図形が一つも作られていないのに
 * 「一つ増えた」が通る、何も主張しない検証になる。
 *
 * 同じ検証の中で、選択中の対象の取得（`getActiveObject`）や選択の可否の取得は
 * 描画面の不在時に**投げて**いた。件数の取得だけが番兵値を返す非対称だったため、
 * **投げる形へ揃える**。投げれば呼び出し側が番兵値の番人を書き忘れる余地が消える。
 *
 * 待ち合わせは観測へ埋め込まない。描画面が用意できたことは `waitForFabricCanvas` で
 * 明示的に待ち、`getFabricObjectCount` は待たずにその場を観測する。
 *
 * ## 限界: `expect.poll` は poller が投げると再試行しない
 *
 * `expect.poll` の poller が例外を投げた場合、Playwright は**再試行せず即座に落ちる**。
 * 実装上 `invokePollMatcher` は `const value = await actual();` を try/catch の**外**で
 * 呼んでおり、捕まえているのは matcher の失敗だけだからである
 * （Playwright 1.62.0、`node_modules/playwright/lib/matchers/expect.js`）。実測でも
 * poller は一度だけ呼ばれ、timeout を待たずに失敗する。
 *
 * 番兵値を返していた頃は、poll が描画面の不在をまたいで待てていた。投げる形にした
 * 以上その猶予は無い。**`getFabricObjectCount` を `expect.poll` の中で使うときは、
 * poll の手前で `waitForFabricCanvas` により「観測できる状態」を確立しておくこと。**
 * 本番（`AnnotationEditor`）が `window.__fabricCanvas` を設定するのは `useEffect` の
 * 中であり、`annotation-editor-container` や道具帯は commit の時点で可視になるため、
 * **可視になってから描画面が載るまでの窓が構造上存在する**。道具帯や容器の可視は
 * 描画面が観測できることを意味しない。
 *
 * @module e2e/helpers/fabric-canvas
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getTimeout } from './wait-helpers';

/** 描画面が取得できなかったときに投げる例外の本文 */
export const FABRIC_CANVAS_ABSENT_MESSAGE =
  'Fabric.js キャンバス（window.__fabricCanvas）が取得できない。' +
  '描画面の図形数を観測できないため、ここで失敗させる';

/** 描画面のうち本ヘルパーが参照する範囲の最小型 */
type CountableFabricCanvas = { getObjects: () => unknown[] };

/**
 * 描画面が公開済みかを観測する
 *
 * 「まだ初期化されていない」ことも正当な観測結果であるため、こちらは投げない。
 */
export async function hasFabricCanvas(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    return Boolean((window as unknown as { __fabricCanvas?: unknown }).__fabricCanvas);
  });
}

/**
 * 描画面が公開されるまで待つ
 *
 * 固定時間ではなく、本番が描画面を `window` へ載せた事実そのものを条件に取る。
 * 件数の観測が投げる形になった以上、観測の手前で「観測できる状態」を確立しておく
 * 責務はこちらにある。
 */
export async function waitForFabricCanvas(page: Page, timeoutMs = 10000): Promise<void> {
  await expect
    .poll(() => hasFabricCanvas(page), {
      message: '注釈エディタの描画面（window.__fabricCanvas）が初期化されること',
      timeout: getTimeout(timeoutMs),
    })
    .toBe(true);
}

/**
 * 描画面に載っている図形の数を観測する
 *
 * 描画面が取得できない場合は番兵値を返さず、その場で投げる。
 */
export async function getFabricObjectCount(page: Page): Promise<number> {
  return await page.evaluate((message) => {
    const canvas = (window as unknown as { __fabricCanvas?: CountableFabricCanvas | null })
      .__fabricCanvas;
    if (!canvas) {
      throw new Error(message);
    }
    return canvas.getObjects().length;
  }, FABRIC_CANVAS_ABSENT_MESSAGE);
}
