/**
 * @fileoverview PDFインラインプレビューの「成立」を成功のみで判定する補助
 *
 * ## 背景（Task 115.158）
 *
 * 見積依頼のPDFプレビューを扱うE2Eは、プレビューの成立を次の3つの形で判定していた。
 *
 * - 形AB（`pdf-text-extraction-e2e.spec.ts`）
 *   `page.locator('.react-pdf__Document, .react-pdf__Page')`
 *   `  .or(page.locator('[data-testid="preview-skeleton"]')).first()`
 * - 形C（`structured-data-ocr-e2e.spec.ts`）
 *   `page.locator('.react-pdf__Document, [data-testid="preview-skeleton"]')`
 *   `  .or(page.getByText(/PDFの読み込み/i)).first()`
 * - 形D（`ocr-retry-e2e.spec.ts`）
 *   `page.locator('.react-pdf__Document')`
 *
 * ## `.or(...).first()` は「どれかの枝が満たされれば成立」ではない
 *
 * `A.or(B).first()` は双方の候補を合わせた集合から **DOM順の先頭の要素をひとつだけ**選び、
 * その一つが可視かどうかを問う形である。先頭の要素が可視にならなければ、
 * 後ろの枝には**到達しない**。「枝を足せば成立しやすくなる」という読みは誤りであり、
 * 枝を足しても先頭が入れ替わらなければ判定は一切変わらない。
 *
 * この画面で先頭に来るのは常に読み込み中の骨組みである。
 * `FileInlinePreview.tsx` の `PdfPreview` は `{isLoading && <PreviewSkeleton />}` を
 * `<Document>` より**前**に置いており、`isLoading` は `Document` の `onLoadSuccess`
 * （`handleLoadSuccess`）でしか false にならない。読み込みに失敗すると骨組みは残り続ける。
 * その骨組みは幅指定を持たず `pdfContainer`（`display: flex`）の flex アイテムとして
 * 内容幅に縮み、内容は `skeletonPulse` の `width: 60%` だけで、
 * 親の幅が未定であるため **幅0** に解決する。
 * 幅0の要素は Playwright の可視条件（空でない矩形）を満たさない。
 *
 * したがって形AB・形Cは **読み込み失敗の終状態では待機切れの赤**になっていた。
 * 形Cの `/PDFの読み込み/` の枝は失敗表示「PDFの読み込みに失敗しました」に一致するが、
 * `.first()` が骨組みを掴むため**その枝には到達せず**、
 * 失敗を成立として受理してはいなかった（下の実測を参照）。
 *
 * ## 実際に閉じた穴は次の2つである
 *
 * 1. **読み込み失敗の終状態を受理する**（形D）。
 *    `react-pdf` の `Document` / `Page` は読み込み中でも失敗時でも外枠を描画する。
 *    `react-pdf/src/Document.tsx` の `renderContent()` は loading / error のいずれの状態でも
 *    `<div className="react-pdf__Document">` の**内側**に `Message` を描くだけであり、
 *    `Page.tsx` も同様である。したがって `.react-pdf__Document` の可視は
 *    読み込みの成否について何も述べていない。
 *    実測では壊れたPDFの読み込み失敗の終状態で **21ミリ秒で緑**になった。
 * 2. **`Document` の解決後・ページの描画完了前の競合窓**（形AB・形C・形Dに共通）。
 *    外枠が可視になってからページの canvas が可視になるまでには間がある
 *    （CPUを8倍抑制した実測で 0.7〜1.4 秒）。
 *    この窓に当たった実行は**ページが描画されていないのに緑**になる。
 *
 * ## 何を成立とするか
 *
 * `.react-pdf__Page__canvas`（`react-pdf/src/Page/Canvas.tsx` の
 * `` `${_className}__canvas` ``）の**可視**を成立とする。
 * この要素は `Page` がページオブジェクトを解決してはじめて DOM に現れ、
 * 読み込み中（`Message type="loading"`）にも失敗時（`Message type="error"`）にも現れない。
 *
 * ただし canvas の可視は「画素が描かれた」ことの証明**ではない**。
 * `Canvas.tsx` は `<canvas>` を先に返し、描画は effect で行う。
 * effect は描画の開始前に `canvas.style.visibility = 'hidden'` を立て、
 * `page.render()` が解決した時点で戻すため、描画中の canvas は可視ではない。
 * 一方 **DOM に挿入された直後・effect が走る前**の一瞬だけは、
 * canvas は既定寸法 300x150 の `visibility: visible` であり、
 * 未描画のまま可視条件を満たす（実測で観測した。下記の再現手順を参照）。
 * つまりこの判定が主張するのは「ページオブジェクトが解決し、
 * 描画が始まった（多くの場合は解決した）」までである。
 * それでも上の穴1・穴2はいずれも canvas が DOM に無い状態であるため、
 * 本判定は旧判定より厳密に強い。
 *
 * ## 失敗を待機切れまで引きずらないこと
 *
 * 成功だけを待つと、読み込みに失敗した場合は待機切れまで無為に待つことになる。
 * そこで待機の**対象**にだけ失敗表示を含め、待機が解けた後に
 * 「失敗表示が無いこと」と「描画が成立していること」を**別々に主張**する。
 * 選言はあくまで待機を早く解くためのものであり、
 * どちらの枝も単独では成立の根拠にしていない。
 *
 * ## 再現手順と実測値（2026-08-25 / ローカルtest環境 5174+3100 / Chromium）
 *
 * 壊れたPDFは `%PDF-1.4` のヘッダに乱数本文を続けた 5,552 バイトのファイルで作る
 * （`printf '%PDF-1.4\n' > broken.pdf; head -c 4096 /dev/urandom | base64 >> broken.pdf`）。
 * これを受領見積書登録フォームの `input[type="file"]` に与えると
 * `pdf.js` が構造不正で落ち、読み込み失敗の終状態に入る。
 *
 * 読み込み失敗の終状態（アップロードの3秒後に計測）:
 * - DOM順は `preview-skeleton` → `.react-pdf__Document`
 * - `preview-skeleton` は 0x368（`visibility: visible` だが幅0）。内側の脈動も 0x20
 * - `.react-pdf__Document` は 226x368 で可視、`.react-pdf__Page__canvas` は 0 件
 * - 「PDFの読み込みに失敗しました」は 1 件で可視
 * - 形C・形ABの `.first()` が実際に掴む要素はいずれも
 *   `DIV[data-testid="preview-skeleton"]`（矩形 0x368）
 * - 判定: 形C = 赤(12.5秒 / 15.0秒)、形AB = 赤(15.0秒 / 12.5秒)、
 *   形D = **緑(27ミリ秒 / 21ミリ秒)**、本補助 = 赤(10.1秒 / 7.5秒。
 *   待機切れではなく「PDFプレビューが『PDFの読み込みに失敗しました』を表示した」で落ちる)
 *   ※ 2 回の実測値を「/」で併記した
 *
 * 競合窓（正常な2ページPDF、CDP `Emulation.setCPUThrottlingRate` で CPU を 8 倍抑制）:
 * - t=382ms  外枠 0x368（不可視）／canvas 0 件／骨組み 2 件（いずれも幅0）
 * - t=752ms  外枠 113x368 で**可視**／canvas 0 件 → **外枠は緑・描画は未成立**
 * - t=1440ms canvas 1166x1650 が可視 → ここではじめて描画が成立
 * - 別の実行では t=1746ms に canvas が挿入済みだが `visibility: hidden`（描画タスク実行中）、
 *   t=2118ms で可視になった
 *
 * canvas 挿入直後の状態（`MutationObserver` で挿入時に同期計測、CPU 8 倍抑制）:
 * - `at=1244ms` / `at=1450ms` のいずれも 300x150・`visibility: visible`
 *   （`Canvas.tsx` の effect が寸法と `visibility: hidden` を立てる前の状態）
 *
 * @module e2e/helpers/pdf-preview
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getTimeout } from './wait-helpers';

/**
 * `react-pdf` がページオブジェクトを解決したときにだけ現れる要素
 *
 * 読み込み中（`Message type="loading"`）にも失敗時（`Message type="error"`）にも現れない。
 * ただし「画素が描かれた」ことまでは意味しない。`Canvas.tsx` は `<canvas>` を先に返し、
 * 描画は effect で行う（effect は描画中 `visibility: hidden` を立て、
 * `page.render()` の解決で戻す）。挿入直後・effect 実行前の一瞬は
 * 既定寸法 300x150 の `visibility: visible` である（実測。冒頭の再現手順を参照）。
 */
export const PDF_PAGE_CANVAS_SELECTOR = '.react-pdf__Page__canvas';

/**
 * 読み込み中に表示される骨組み
 *
 * `FileInlinePreview.tsx` の `PreviewSkeleton`。成立の根拠にはしない。
 * この画面では幅0（実測 0x368）に潰れるため、可視性を問う判定では**決して真にならない**。
 * 旧判定が `.or(...).first()` の枝に置いていたのはこの要素であり、
 * DOM順で先頭に来るため後続の枝を覆い隠していた。
 */
export const PDF_PREVIEW_SKELETON_SELECTOR = '[data-testid="preview-skeleton"]';

/**
 * PDFの読み込みに失敗したときの表示（`FileInlinePreview.tsx` の `<Document error={…}>`）
 */
export const PDF_PREVIEW_ERROR_TEXT = 'PDFの読み込みに失敗しました';

/**
 * PDFインラインプレビューが**描画に成功した**ことを主張する。
 *
 * 読み込み中（骨組み・`react-pdf` の loading 表示）と
 * 失敗（「PDFの読み込みに失敗しました」）のいずれも成立として受理しない。
 * 失敗表示が出た場合は待機切れを待たずにその場で失敗する。
 *
 * @param page Playwright のページ
 * @param options.timeout 描画の成立を待つ上限（既定 15 秒、CI では倍）
 * @returns 描画が成立した最初のページの canvas
 */
export async function expectPdfPreviewRendered(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  const timeout = options?.timeout ?? getTimeout(15000);

  const renderedPage = page.locator(PDF_PAGE_CANVAS_SELECTOR).first();
  const loadFailure = page.getByText(PDF_PREVIEW_ERROR_TEXT);

  // 待機の対象にだけ失敗表示を含める。ここで解けたことは成立を意味しない。
  await expect(renderedPage.or(loadFailure).first()).toBeVisible({ timeout });

  // 失敗の表示が出ていれば、待機切れを待たずにここで落とす。
  await expect(loadFailure, 'PDFプレビューが「PDFの読み込みに失敗しました」を表示した').toHaveCount(
    0
  );

  // 成立の主張。読み込み中の骨組みや `react-pdf` の外枠では満たされない。
  await expect(
    renderedPage,
    'PDFプレビューのページが描画されなかった（読み込み中のまま終わった可能性がある）'
  ).toBeVisible();

  // 読み込み中の表示が残っていないこと。「読み込み中のまま成立」を明示的に否定する。
  await expect(
    page.locator(PDF_PREVIEW_SKELETON_SELECTOR),
    'PDFプレビューの読み込み中表示（骨組み）が残っている'
  ).toHaveCount(0);

  return renderedPage;
}
