/**
 * @fileoverview 帳票（PDF）出力サービスの動的読み込み
 *
 * `EstimatePdfExportService` は日本語フォント資産（約2.25MB）へ静的に到達するため、
 * 初期表示のチャンクへ畳み込まれないよう**動的 import の境界**をここに置く。
 * 画面側（出力ダイアログ）は本モジュールだけを静的 import し、
 * 実際に出力を実行する時点で初めてサービスとフォント資産を読み込む。
 *
 * **このファイルは動的 import 以外でサービスに触れてはならない。**
 * `import type` はビルド時に消えるため境界を壊さないが、値の静的 import を1本でも
 * 足すとフォント資産が初期ロードに載る（`loadEstimatePdfExportService.test.ts` が
 * 静的 import グラフで機械的に検査する）。
 *
 * Design: design.md `##### EstimatePdfExportService`
 * 「**動的 import で読み込む**。フォント資産（2.25MB）を含むため初期ロードから切り離す」
 *
 * @module services/export/loadEstimatePdfExportService
 */

import type { EstimatePdfExportService } from './EstimatePdfExportService';

/**
 * 帳票出力サービスを読み込む
 *
 * @returns 出力サービスの実体
 */
export async function loadEstimatePdfExportService(): Promise<EstimatePdfExportService> {
  const module = await import('./EstimatePdfExportService');
  return module.estimatePdfExportService;
}
