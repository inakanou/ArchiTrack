/**
 * @fileoverview pdfjs-dist worker共通設定モジュール
 *
 * Task 40.1: pdfjs-dist workerの初期化をコンポーネント外のモジュールレベルで一元管理する
 *
 * Requirements:
 * - 17.1: pdfjs-distのgetTextContent() APIを使用してPDFからテキストを抽出する
 *
 * Design:
 * - FileInlinePreviewとOcrDataExtractorの両方がこのモジュールをimportする
 * - コンポーネントのマウント順序に依存しないworker初期化を保証する
 * - Vite環境でのPDF.jsワーカー設定（import.meta.urlパターン）
 */

import { GlobalWorkerOptions } from 'pdfjs-dist';

// Vite環境でのPDF.jsワーカー設定
// react-pdf 10.xではimport.meta.urlパターンでワーカーを設定する
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
