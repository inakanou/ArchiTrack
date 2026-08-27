/**
 * @fileoverview 画像インラインプレビューの「成立」を成功のみで判定する補助
 *
 * ## 背景（Task 115.175 / 115.158 と同型）
 *
 * 見積依頼の画像プレビューを扱うE2Eは、プレビューの成立を次の2つの形で判定していた。
 *
 * - 形E（`structured-data-ocr-e2e.spec.ts` の REQ-11 複合登録フロー）
 *   `page.locator('img[alt="test-image.png"], [data-testid="preview-skeleton"]').first()`
 * - 形F（同ファイルの REQ-13.3）
 *   `page.locator('img[alt="test-image.png"]')`
 *
 * ## 実測で確かめた2つの穴（PDFのときとは結論が異なる）
 *
 * 115.158 のPDFでは、合併選択子の先頭に来る骨組みが**幅0に潰れて可視にならない**ため、
 * 選言の枝は判定を緩めていなかった。画像では**そうならない**。
 * 画像の骨組みは `FileInlinePreview` の `styles.container`（`width: 100%` のブロック）
 * 直下に置かれ、`styles.skeleton` の `minHeight: 200px` がそのまま効くため、
 * 実測で **1166x200** の可視要素になる。
 *
 * 1. **読み込みが成立しない終状態を受理する**（形E）。
 *    画像では `img` と骨組みが同時に DOM に存在せず（`FileInlinePreview` の
 *    描画分岐は排他）、合併候補は常に1件である。よって `.first()` は
 *    「そのとき存在するほう」を掴む。骨組みが残る終状態では骨組みを掴み、
 *    それが可視であるため **8〜11ミリ秒で緑**になった。
 *    さらに正常系でも、骨組みは `img` の挿入直前に一瞬だけ現れる
 *    （CPUを8倍抑制した実測で 1759ms 挿入 → 1834ms 除去の **75ミリ秒**）。
 *    この窓に当たった実行は画像が何も無いのに緑になる。
 * 2. **復号に失敗した画像を受理する**（形E・形Fに共通）。
 *    `FileInlinePreview` は `<img>` の `onError` を扱わないため、
 *    画像の読み込みが失敗しても失敗表示は出ず（実測: エラー表示 0 件）、
 *    `<img>` だけが残る。Chromium はこのとき代替テキストの箱を描くので
 *    実測 **124x368** の可視要素になり、形E・形Fともに **6〜15ミリ秒で緑**になった。
 *    `naturalWidth` は 0 であり、画像は一切表示されていない。
 *
 * ## 何を成立とするか
 *
 * `<img>` の**可視**と、`naturalWidth > 0`（**復号の成立**）の両方を主張する。
 * 復号の主張は画面の中で真偽を組み立てず、`naturalWidth` の生値だけを取り出して
 * Node 側で問う（`complete` は主張しない。実測ではこの画面の `<img>` は
 * `naturalWidth` が 0 から立ち上がるのが `load` と同じ時点であり、
 * `complete` を足しても赤にできる終状態が増えないため、書けば飾りになる）。
 * どちらも他方を含意しない（飾りでないことの確認は下記の変異を参照）。
 *
 * - 可視だけでは穴2（復号失敗）を弾けない。
 * - 復号だけでは「復号したが画面に出ていない」を弾けない。
 * - 骨組みの不在は**主張しない**。`img` と骨組みは排他であり、
 *   `img` の可視が骨組みの不在を含意するため、書けば飾りになる（実測で確認した）。
 *
 * 復号前の `<img>` は幅0（実測 0x368）に解決し Playwright の可視条件を満たさないため、
 * 可視の主張は「復号が始まっていない `img`」も自然に弾く。
 *
 * ## 失敗は待機切れで赤になる
 *
 * PDFと違い画像には失敗表示が無いため、待機を早く解くための枝が書けない。
 * 読み込みが成立しない終状態では待機切れまで待って赤になる
 * （実測: 骨組みが残る終状態で 15.0 秒、復号失敗で 14.5 秒。
 * いずれも上限 15 秒の待機を使い切ってから落ちる）。
 *
 * ## 再現手順と実測値（2026-08-27 / ローカルtest環境 5174+3100 / Chromium）
 *
 * いずれも受領見積書登録フォームの `input[type="file"]` に与えて計測した。
 * DOM の変化は `MutationObserver` を投入前に仕込み、挿入・`load`・`error` の各時点で
 * 矩形と `complete` / `naturalWidth` を同期取得した。
 *
 * 正常系（`e2e/fixtures/test-image.png`）:
 * - `at=47ms` 骨組み挿入 1166x200 可視 → `at=48ms` 除去
 * - `at=48ms` `img` 挿入 0x368 / `complete=false` / `naturalWidth=0`（**幅0＝不可視**）
 * - `at=61ms` `load` で 368x368 / `naturalWidth=100`
 * - 合併候補 count=1、`.first()` が掴むのは `IMG[alt="test-image.png"]` 矩形 368x368
 * - 判定: 形E = 緑(12ms / 13ms)、形F = 緑(8ms / 6ms)、本補助 = 緑(41ms / 42ms)
 *   ※ 別々の実行の実測値を「/」で併記した
 *
 * 骨組みが残る終状態（`addInitScript` で `URL.createObjectURL` を `() => ''` に置換。
 * 戻り値が空文字なので `previewUrl` が `null` に解決し、
 * `FileInlinePreview` のフォールバックの骨組みに落ちる。
 * 痕跡として `URL.createObjectURL(new Blob())` が `""` を返すことを確認した）:
 * - 合併候補 count=1 = `DIV[data-testid="preview-skeleton"]` 矩形 1166x200 可視
 * - 判定: 形E = **緑(11ms / 8ms)**、形F = 赤(10.0秒 待機切れ)、
 *   本補助 = 赤(15.0秒。「画像プレビュー（test-image.png）が表示されなかった…」で落ちる)
 *
 * 復号失敗（PNGシグネチャ8バイト + 決定的な3,000バイトのゴミを
 * `test-image.png` / `image/png` として投入）:
 * - `at=35ms` `img` 挿入 0x368 → `at=40ms` `error` で 124x368 /
 *   `complete=true` / `naturalWidth=0`（代替テキストの箱。**可視**）
 * - エラー表示（`/プレビューを表示できません/`）は 0 件
 * - 判定: 形E = **緑(15ms / 13ms)**、形F = **緑(6ms / 7ms)**、
 *   本補助 = 赤(14.5秒。「画像プレビュー（test-image.png）が復号されなかった…」で落ちる)
 *
 * 競合窓（`e2e/fixtures/test-image-large.jpg` 2,108,682 バイトを `test-image.png` として投入。
 * CDP `Emulation.setCPUThrottlingRate` で CPU を 8 倍抑制）:
 * - `at=1759ms` 骨組み挿入 1166x200 可視 → `at=1834ms` 除去（**75ミリ秒の窓**）
 * - `at=1838ms` `img` 挿入 0x368（幅0＝不可視）
 * - `at=1897ms` rAF で 654x368 / `naturalWidth=1920`
 *
 * 各主張が飾りでないことの変異（同環境）:
 * - 正常に読み込んだ後（本補助が緑 42ms）に `img` へ `display: none` を当てると、
 *   矩形は 0x0 / `naturalWidth` は 100 のままになり、
 *   **可視の主張だけが赤(5.0秒 / 上限5秒指定)**、復号の主張は**緑(44ms)**
 *   → 可視の主張は飾りでない
 * - 復号失敗の刺激では、**可視の主張は緑(13ms)**のまま
 *   **復号の主張だけが赤(4.0秒 / 上限5秒指定)** → 復号の主張は飾りでない
 *
 * 本ファイルが挙げる要件番号は、欠陥の在り処を指すためのものであって、被覆の主張ではない。
 * 判定は呼び出し側の検証が持つため、意図して番号を持たない（Task 115.177）。
 *
 * @module e2e/helpers/image-preview
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getTimeout } from './wait-helpers';

/**
 * 画像インラインプレビューの `<img>` を指す
 *
 * `FileInlinePreview.tsx` の `ImagePreview` は `alt` にファイル名を与える。
 *
 * @param page Playwright のページ
 * @param fileName プレビュー対象のファイル名（`alt` と一致する）
 */
export function imagePreviewLocator(page: Page, fileName: string): Locator {
  return page.locator(`img[alt="${fileName}"]`);
}

/**
 * 画像インラインプレビューが**表示に成功した**ことを主張する。
 *
 * 読み込み中の骨組みも、復号に失敗した `<img>` も成立として受理しない。
 *
 * @param page Playwright のページ
 * @param fileName プレビュー対象のファイル名（`alt` と一致する）
 * @param options.timeout 表示の成立を待つ上限（既定 15 秒、CI では倍）
 * @returns 表示が成立した `<img>`
 */
export async function expectImagePreviewRendered(
  page: Page,
  fileName: string,
  options?: { timeout?: number }
): Promise<Locator> {
  const timeout = options?.timeout ?? getTimeout(15000);

  const image = imagePreviewLocator(page, fileName);

  // 成立の主張その1。読み込み中の骨組み（実測 1166x200 で可視）では満たされず、
  // 復号前の `<img>`（実測 0x368 の幅0）でも満たされない。
  await expect(
    image,
    `画像プレビュー（${fileName}）が表示されなかった（読み込み中のまま終わった可能性がある）`
  ).toBeVisible({ timeout });

  // 成立の主張その2。可視だけでは復号失敗を弾けない
  // （実測: 壊れた画像は代替テキストの箱 124x368 として可視になり `naturalWidth` は 0）。
  // 判定は画面の中では行わず、`naturalWidth` の生値だけを取り出してここで問う。
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
      timeout,
      message: `画像プレビュー（${fileName}）が復号されなかった（画像は表示されていない）`,
    })
    .toBeGreaterThan(0);

  return image;
}
