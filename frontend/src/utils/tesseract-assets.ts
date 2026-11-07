/**
 * Tesseract.js の worker・コア・日本語の言語データの取得先（是正計画 D14）
 *
 * 画面と同じオリジンから配信する（vite.config.ts の tesseractAssetsPlugin が配信物へ出力する）。
 * 既定の cdn.jsdelivr.net を使わないため、CSP に外部の取得先の許可が要らない。
 * 版は package.json の tesseract.js・tesseract.js-core と一致させる（tesseract-assets.test.ts が確かめる）。
 */

/** tesseract.js の版（worker の版） */
export const TESSERACT_JS_VERSION = '7.0.0';
/** tesseract.js-core の版 */
export const TESSERACT_CORE_VERSION = '7.0.0';

const ASSET_BASE = `${import.meta.env.BASE_URL}tesseract`;

/** createWorker の第 3 引数へ渡す取得先 */
export const TESSERACT_WORKER_OPTIONS = {
  workerPath: `${ASSET_BASE}/tesseract.js@${TESSERACT_JS_VERSION}/worker.min.js`,
  // ディレクトリを渡すと、端末の SIMD の対応に応じて LSTM のコアの 1 つが読まれる
  corePath: `${ASSET_BASE}/tesseract.js-core@${TESSERACT_CORE_VERSION}`,
  // 既定の OCR（LSTM のみ）が読む言語データ（4.0.0_best_int）
  langPath: `${ASSET_BASE}/@tesseract.js-data/jpn/4.0.0_best_int`,
} as const;
