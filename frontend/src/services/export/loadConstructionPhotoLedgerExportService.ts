/**
 * @fileoverview 工事写真台帳（PDF）出力サービスの動的読み込み
 *
 * `ConstructionPhotoLedgerExportService` は `ConstructionPhotoLedgerService` →
 * `PdfFontService` を経て日本語フォント資産（base64 で約3MB）へ静的に到達する。
 * 工事写真詳細画面は `routes.tsx` から静的に参照されるため、画面が値として
 * 静的 import するとフォント資産が初期表示のチャンクへ畳み込まれる。
 *
 * そこで `loadEstimatePdfExportService` と同じく**動的 import の境界**をここに置く。
 *
 * **このファイルは動的 import 以外でサービスに触れてはならない。**
 * `import type` はビルド時に消えるため境界を壊さないが、値の静的 import を1本でも
 * 足すとフォント資産が初期ロードに載る
 * （`__tests__/fontAssetIsolation.test.ts` が静的 import グラフで機械的に検査する）。
 *
 * @module services/export/loadConstructionPhotoLedgerExportService
 */

/**
 * 工事写真台帳のPDF出力サービスを読み込む
 *
 * @returns `ConstructionPhotoLedgerExportService` モジュールの名前空間
 */
export async function loadConstructionPhotoLedgerExportService(): Promise<
  typeof import('./ConstructionPhotoLedgerExportService')
> {
  return import('./ConstructionPhotoLedgerExportService');
}
