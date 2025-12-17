/**
 * Export Services - エクスポート関連サービスのエントリーポイント
 *
 * PDF報告書生成、画像エクスポート等のサービスを集約
 *
 * @see design.md - ExportService
 */

// PDF日本語フォントサービス
export {
  PdfFontService,
  FontLoadStatus,
  initializePdfFonts,
  isPdfFontLoaded,
  getPdfFontFamily,
  resetPdfFontService,
  PDF_FONT_FAMILY,
  PDF_FONT_NAME,
} from './PdfFontService';

// フォントデータ（必要に応じてインポート）
export { NotoSansJPBase64, FONT_INFO } from './fonts/noto-sans-jp-base64';

// PDF報告書サービス
export {
  PdfReportService,
  PDF_REPORT_LAYOUT,
  formatDateForPdf,
  calculateImageDimensions,
  generatePdfReport,
  resetPdfReportService,
} from './PdfReportService';
export type { AnnotatedImage, PdfReportOptions, ImageDimensions } from './PdfReportService';
