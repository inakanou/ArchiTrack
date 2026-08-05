/**
 * @fileoverview 数量表（PDF）出力サービスの動的読み込み
 *
 * `QuantityTablePdfExportService` は `PdfFontService` を経て日本語フォント資産
 * （base64 で約3MB）へ静的に到達する。数量表編集画面は `routes.tsx` から静的に
 * 参照されるため、画面が値として静的 import するとフォント資産が初期表示の
 * チャンクへ畳み込まれる。
 *
 * そこで `loadEstimatePdfExportService` と同じく**動的 import の境界**をここに置く。
 *
 * **このファイルは動的 import 以外でサービスに触れてはならない。**
 * `import type` はビルド時に消えるため境界を壊さないが、値の静的 import を1本でも
 * 足すとフォント資産が初期ロードに載る
 * （`__tests__/fontAssetIsolation.test.ts` が静的 import グラフで機械的に検査する）。
 *
 * @module services/export/loadQuantityTablePdfExportService
 */

/**
 * 数量表のPDF出力サービスを読み込む
 *
 * @returns `QuantityTablePdfExportService` モジュールの名前空間
 */
export async function loadQuantityTablePdfExportService(): Promise<
  typeof import('./QuantityTablePdfExportService')
> {
  return import('./QuantityTablePdfExportService');
}
