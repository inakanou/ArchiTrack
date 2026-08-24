/**
 * @fileoverview OCR/データパースの「処理中インジケーター」を取りこぼさずに観測する補助
 *
 * ## なぜ必要か（site-survey タスク 115.135）
 *
 * 「処理中であることを示すインジケーターを表示する」ことを定めた受入基準
 * （estimate-request/REQ-13.7・REQ-16.3・REQ-17.7）の検証は、
 * 「インジケーター **または** 抽出結果 **または** エラー表示のいずれかが現れること」
 * という選言で書かれていた。この形は次の二点で主張になっていない。
 *
 * 1. 抽出結果とエラー表示を選言に含めているため、**OCR が失敗しても成立する**。
 * 2. インジケーター以外の枝で成立しうるため、**インジケーターを一度も検査しない**。
 *
 * 選言が置かれた理由自体は実在する。テキスト入り PDF の抽出は数百ミリ秒で終わるため、
 * Playwright の定期的な問い合わせでは処理中の一瞬を取り逃がしうる。
 * そこで本補助は `MutationObserver` を用いて **DOM の変更と同期に** 出現を記録する。
 * 記録は本番が描画した `[data-testid="ocr-progress-indicator"]` の実在だけを見ており、
 * テストが自分で書いた値を読み返してはいない。
 *
 * 同じ形は `ocr-retry-e2e.spec.ts` の REQ-16.11 で先に用いられている。
 * そちらは処理中のボタンの操作可否も同時に記録する上位互換であるため、本補助へは寄せていない。
 *
 * @module e2e/helpers/ocr-observations
 */

import type { Page } from '@playwright/test';

/** 本番が処理中に描画する進捗インジケーターの目印 */
const PROGRESS_INDICATOR_SELECTOR = '[data-testid="ocr-progress-indicator"]';

/**
 * 進捗インジケーターの出現の記録を開始する。
 *
 * OCR を起動する操作（ファイル選択・「OCR実行」ボタンの押下など）の **前** に呼ぶこと。
 * 呼び出し時点で既に表示されている場合も出現として記録する。
 *
 * @param page Playwright のページ
 */
export async function startOcrProgressIndicatorWatch(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const w = window as unknown as Record<string, unknown>;

    // 同一ページで二度目の観測を始める場合、前の観測器を止めてから置き換える
    const previous = w.__ocrProgressIndicatorObserver as MutationObserver | undefined;
    previous?.disconnect();

    w.__ocrProgressIndicatorAppeared = document.querySelector(selector) !== null;

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector) !== null) {
        w.__ocrProgressIndicatorAppeared = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    w.__ocrProgressIndicatorObserver = observer;
  }, PROGRESS_INDICATOR_SELECTOR);
}

/**
 * 進捗インジケーターが表示されるまで待つ。
 *
 * 記録は `MutationObserver` が行うため、待機中に表示されて消えた場合も取り逃がさない。
 * 期限までに一度も表示されなければ待機は失敗する（沈黙して抜ける経路は無い）。
 *
 * @param page Playwright のページ
 * @param timeoutMs 待機の上限（ミリ秒）
 */
export async function waitForOcrProgressIndicator(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__ocrProgressIndicatorAppeared === true,
    undefined,
    { timeout: timeoutMs }
  );
}

/**
 * 記録を終了し、進捗インジケーターが一度でも表示されたかを返す。
 *
 * @param page Playwright のページ
 * @returns 観測開始から本呼び出しまでの間に進捗インジケーターが表示されたか
 */
export async function hasOcrProgressIndicatorAppeared(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const observer = w.__ocrProgressIndicatorObserver as MutationObserver | undefined;
    observer?.disconnect();
    w.__ocrProgressIndicatorObserver = undefined;
    return w.__ocrProgressIndicatorAppeared === true;
  });
}
