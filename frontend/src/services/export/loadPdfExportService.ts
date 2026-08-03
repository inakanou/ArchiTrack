/**
 * @fileoverview 現場調査報告書（PDF）出力サービスの動的読み込み
 *
 * `PdfExportService` は `PdfReportService` → `PdfFontService` を経て
 * 日本語フォント資産（base64 で約3MB）へ静的に到達する。画面から値として
 * 静的 import すると、その画面がルート表に静的登録されている以上、
 * フォント資産が初期表示のチャンクへ畳み込まれる。
 *
 * そこで `loadEstimatePdfExportService` と同じく**動的 import の境界**をここに置き、
 * 画面側は本モジュールだけを静的 import する。実際に出力を実行する時点で
 * 初めてサービスとフォント資産を読み込む。
 *
 * **このファイルは動的 import 以外でサービスに触れてはならない。**
 * `import type` はビルド時に消えるため境界を壊さないが、値の静的 import を1本でも
 * 足すとフォント資産が初期ロードに載る
 * （`__tests__/fontAssetIsolation.test.ts` が静的 import グラフで機械的に検査する）。
 *
 * Design: design.md `##### EstimatePdfExportService`
 * 「**動的 import で読み込む**。フォント資産（2.25MB）を含むため初期ロードから切り離す」
 *
 * @module services/export/loadPdfExportService
 */

/**
 * 現場調査報告書のPDF出力サービスを読み込む
 *
 * @returns `PdfExportService` モジュールの名前空間（`exportAndDownloadPdf` / `downloadPdf` 等）
 */
export async function loadPdfExportService(): Promise<typeof import('./PdfExportService')> {
  return import('./PdfExportService');
}
