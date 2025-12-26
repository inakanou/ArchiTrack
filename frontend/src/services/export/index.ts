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
  PDF_REPORT_LAYOUT_V2,
  formatDateForPdf,
  calculateImageDimensions,
  truncateCommentLines,
  generatePdfReport,
  generateSurveyReport,
  resetPdfReportService,
} from './PdfReportService';
export type {
  AnnotatedImage,
  AnnotatedImageWithComment,
  PdfReportOptions,
  ImageDimensions,
} from './PdfReportService';

// PDFエクスポートサービス（Task 21.3）
export {
  PdfExportService,
  PDF_EXPORT_PHASES,
  exportPdf,
  downloadPdf,
  exportAndDownloadPdf,
  resetPdfExportService,
} from './PdfExportService';
export type { PdfExportPhase, PdfExportProgress, PdfExportOptions } from './PdfExportService';

// 注釈レンダリングサービス
export {
  AnnotationRendererService,
  renderImagesWithAnnotations,
  renderImagesForReport,
  resetAnnotationRendererService,
} from './AnnotationRendererService';
export type { RenderedImage, RenderOptions } from './AnnotationRendererService';
