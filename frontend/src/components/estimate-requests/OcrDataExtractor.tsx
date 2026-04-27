/**
 * @fileoverview OCR/データパース処理と結果表示コンポーネント
 *
 * Task 25.1: OcrDataExtractorコンポーネントの実装
 * Task 40.1: pdfjs-distベースのPDFテキスト抽出処理を追加
 * Task 40.2: テキストPDF/スキャンPDF判定とハイブリッド処理フローを実装
 * Task 40.3: スキャンPDFフォールバック（Canvas→画像→Tesseract OCR）を実装
 *
 * Requirements:
 * - 13.5: PDF/画像ファイルに対してOCR処理を自動的に開始する
 * - 13.6: ExcelファイルにはSheetJS（xlsx）によるデータパース（直接データ読み取り）を実行する
 * - 13.7: 処理中インジケーター（プログレスバー）を表示する
 * - 13.8: 抽出結果をテキストデータとして表示する
 * - 13.9: 抽出テキストを選択・コピー可能な状態で表示する
 * - 13.14: OCR/パース処理失敗時にエラーメッセージを表示し手動入力を促す
 * - 17.1: pdfjs-distのgetTextContent() APIを使用してPDFからテキストを抽出する
 * - 17.2: PDFの全ページを対象にテキスト抽出を行う
 * - 17.3: テキストPDFの場合はpdfjs-dist抽出テキストをそのまま使用する
 * - 17.4: スキャンPDFの場合はCanvas→Tesseract OCRフォールバックを実行する
 * - 17.8: PDFテキスト抽出のタイムアウトを30秒とする
 *
 * Design:
 * - React.lazy()による動的インポートで遅延ロード（バンドルサイズ影響回避）
 * - PDFはpdfjs-distハイブリッドアプローチ（テキストPDF: 直接抽出、スキャンPDF: Canvas→Tesseract OCR）
 * - 画像ファイルは従来通りTesseract.jsによるOCR処理
 * - OCR処理のタイムアウト（30秒）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import * as XLSX from 'xlsx';
import type { LineItemFormData } from './LineItemEditor';
import { extractPdfHybrid, renderPdfPagesToBase64 } from './pdf-text-extractor';
import { formatQuantity, formatUnitPrice, calculateFormattedAmount } from './number-format';
import {
  extractWithClaudeVision,
  ClaudeVisionApiError,
  isClaudeVisionApiError,
} from '../../api/claude-vision';
import type { ClaudeVisionImageInput, ClaudeVisionLineItem } from '../../api/claude-vision';

// ============================================================================
// 型定義
// ============================================================================

/**
 * OcrDataExtractorコンポーネントのProps
 *
 * design.md OcrDataExtractorProps定義に準拠
 */
export interface OcrDataExtractorProps {
  /** 処理対象ファイル（新規アップロード時） */
  file: File | null;
  /** 処理対象ファイルのURL（編集時の既存ファイル） */
  fileUrl?: string | null;
  /** 既存ファイルのMIMEタイプ（fileUrl使用時に必須） */
  fileMimeType?: string | null;
  /** 一括取り込み時のコールバック */
  onImportLineItems: (items: LineItemFormData[]) => void;
  /** 自動開始フラグ（デフォルト: true） */
  autoStart?: boolean;
}

/**
 * 処理状態
 */
type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'error';

/**
 * ファイル種別
 */
type FileCategory = 'pdf' | 'image' | 'excel' | 'unknown';

// ============================================================================
// 定数
// ============================================================================

/**
 * OCR処理タイムアウト（ミリ秒）
 */
const OCR_TIMEOUT_MS = 30000;

/**
 * ヘッダー検出用キーワード
 */
const HEADER_KEYWORDS = {
  customCategory: ['任意分類', 'カテゴリ', '分類'],
  workType: ['工種'],
  name: ['名称', '品名', '品目', '摘要', '項目'],
  specification: ['規格', '仕様', 'スペック', '寸法', '形状'],
  unit: ['単位'],
  quantity: ['数量', '数', '個数', '本数'],
  unitPrice: ['単価', '価格'],
  amount: ['金額', '合計', '計'],
  remarks: ['備考', '摘要', '注記', 'メモ'],
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ファイルMIMEタイプからファイル種別を判定する
 */
function detectFileCategory(mimeType: string): FileCategory {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return 'excel';
  }
  return 'unknown';
}

/**
 * 一意IDカウンター
 */
let idCounter = 0;

/**
 * 一意IDを生成する
 */
function generateId(): string {
  idCounter += 1;
  return `ocr-item-${Date.now()}-${idCounter}`;
}

/**
 * ヘッダー行のキーワードマッチングにより列マッピングを検出する
 *
 * @param headerRow - ヘッダー候補行
 * @returns 列マッピング（列インデックス -> フィールド名）またはnull
 */
function detectColumnMapping(
  headerRow: Array<string | number | null>
): Record<number, keyof typeof HEADER_KEYWORDS> | null {
  const mapping: Record<number, keyof typeof HEADER_KEYWORDS> = {};
  let matchCount = 0;

  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    const cellValue = String(headerRow[colIdx] ?? '').trim();
    if (!cellValue) continue;

    for (const [fieldName, keywords] of Object.entries(HEADER_KEYWORDS)) {
      if (keywords.some((kw) => cellValue.includes(kw))) {
        mapping[colIdx] = fieldName as keyof typeof HEADER_KEYWORDS;
        matchCount++;
        break;
      }
    }
  }

  // 最低2つのキーワードがマッチした場合にヘッダー行と判定
  return matchCount >= 2 ? mapping : null;
}

/**
 * Excelデータの行配列から構造化データに変換する
 *
 * @param rows - Excel行データ（2次元配列）
 * @returns 変換された明細行データ
 */
function convertExcelToLineItems(rows: Array<Array<string | number | null>>): LineItemFormData[] {
  if (rows.length === 0) return [];

  // ヘッダー行を検出
  let dataStartIndex = 0;
  let columnMapping: Record<number, keyof typeof HEADER_KEYWORDS> | null = null;

  // 最初の5行以内でヘッダーを探す
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    const mapping = detectColumnMapping(row);
    if (mapping) {
      columnMapping = mapping;
      dataStartIndex = i + 1;
      break;
    }
  }

  const dataRows = rows.slice(dataStartIndex);
  const lineItems: LineItemFormData[] = [];

  for (const row of dataRows) {
    // 空行をスキップ
    if (
      !row ||
      row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')
    ) {
      continue;
    }

    const item: LineItemFormData = {
      id: generateId(),
      customCategory: '',
      workType: '',
      name: '',
      specification: '',
      unit: '',
      quantity: '',
      unitPrice: '',
      amount: null,
      remarks: '',
      // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
      sortOrder: 0,
    };

    if (columnMapping) {
      // ヘッダーマッピングに基づいて値を設定
      for (const [colIdxStr, fieldName] of Object.entries(columnMapping)) {
        const colIdx = parseInt(colIdxStr, 10);
        const cellValue = row[colIdx];
        if (cellValue === null || cellValue === undefined) continue;

        const strValue = String(cellValue).trim();
        switch (fieldName) {
          case 'customCategory':
            item.customCategory = strValue;
            break;
          case 'workType':
            item.workType = strValue;
            break;
          case 'name':
            item.name = strValue;
            break;
          case 'specification':
            item.specification = strValue;
            break;
          case 'unit':
            item.unit = strValue;
            break;
          case 'quantity':
            item.quantity = strValue;
            break;
          case 'unitPrice':
            item.unitPrice = strValue;
            break;
          case 'remarks':
            item.remarks = strValue;
            break;
          // amountは自動計算のため入力しない
        }
      }
    } else {
      // ヘッダーなし：位置ベースで推定（名称、規格、単位、数量、単価の順と仮定）
      if (row.length >= 1) item.name = String(row[0] ?? '').trim();
      if (row.length >= 2) item.specification = String(row[1] ?? '').trim();
      if (row.length >= 3) item.unit = String(row[2] ?? '').trim();
      if (row.length >= 4) item.quantity = String(row[3] ?? '').trim();
      if (row.length >= 5) item.unitPrice = String(row[4] ?? '').trim();
      if (row.length >= 6) {
        // 6番目の列は金額（スキップ）、7番目が備考
        if (row.length >= 7) item.remarks = String(row[6] ?? '').trim();
      }
    }

    // 名称が空でない行のみ追加
    if (item.name) {
      // 金額を自動計算
      const q = parseFloat(item.quantity);
      const p = parseFloat(item.unitPrice);
      if (!isNaN(q) && !isNaN(p)) {
        item.amount = Math.round(q * p);
      }
      lineItems.push(item);
    }
  }

  return lineItems;
}

// ============================================================================
// Task 45: OCRテキスト→構造化データ変換ロジック改善
// Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
// ============================================================================

/**
 * ゴミ行フィルタ
 *
 * 以下の条件に該当する行を除外する:
 * - 漢字・ひらがな・カタカナ・英数字のいずれも含まない行（20.1）
 * - 空白を除いた文字数が2文字以下の行（20.2）
 *
 * Task 45.1, Requirements 20.1, 20.2
 *
 * @param lines - フィルタ対象の行配列
 * @returns フィルタ後の行配列
 */
export function filterGarbageLines(lines: string[]): string[] {
  // 漢字・ひらがな・カタカナ・英数字のいずれかを含むパターン
  const hasValidChars = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FFa-zA-Z0-9]/;

  return lines.filter((line) => {
    // 20.1: 漢字・ひらがな・カタカナ・英数字のいずれも含まない行を除外
    if (!hasValidChars.test(line)) return false;

    // 20.2: 空白を除いた文字数が2文字以下の行を除外
    const trimmedLength = line.replace(/\s/g, '').length;
    if (trimmedLength <= 2) return false;

    return true;
  });
}

/**
 * 集計行除外フィルタ
 *
 * 以下のキーワードを含む行を除外する:
 * 合計、小計、直接工事費、諸経費、一般管理費、値引き、消費税
 *
 * Task 45.2, Requirement 20.3
 *
 * @param lines - フィルタ対象の行配列
 * @returns フィルタ後の行配列
 */
export function filterSummaryLines(lines: string[]): string[] {
  const summaryKeywords = [
    '合計',
    '小計',
    '直接工事費',
    '諸経費',
    '一般管理費',
    '値引き',
    '消費税',
  ];

  return lines.filter((line) => {
    return !summaryKeywords.some((keyword) => line.includes(keyword));
  });
}

/**
 * カンマ区切り数値の正規化
 *
 * カンマ区切り数値パターン（例: 1,234,567）のカンマを除去して数値として認識可能にする。
 *
 * Task 45.3, Requirement 20.4
 *
 * @param text - 正規化対象のテキスト
 * @returns カンマ除去後のテキスト
 */
export function normalizeCommaNumbers(text: string): string {
  // カンマ区切り数値パターン（\d{1,3}(,\d{3})+）のカンマを除去
  return text.replace(/(\d{1,3}(,\d{3})+)/g, (match) => match.replace(/,/g, ''));
}

/**
 * OCRテキストから構造化データに変換する
 *
 * パターンマッチングにより名称・規格・単位・数量・単価を推定
 * Task 45: ゴミ行フィルタ、集計行除外、カンマ区切り数値正規化を追加
 *
 * @param text - OCR抽出テキスト
 * @returns 変換された明細行データ
 */
export function convertOcrTextToLineItems(text: string): LineItemFormData[] {
  let lines = text.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return [];

  // Task 45.1: ゴミ行フィルタ（20.1, 20.2）- 行分割直後に適用（20.5）
  lines = filterGarbageLines(lines);

  // Task 45.2: 集計行除外（20.3）
  lines = filterSummaryLines(lines);

  // Task 45.3: カンマ区切り数値の正規化（20.4）
  lines = lines.map((line) => normalizeCommaNumbers(line));

  if (lines.length === 0) return [];

  // タブ区切りまたは複数スペース区切りで列分割を試みる
  const parsedRows: Array<string[]> = [];
  for (const line of lines) {
    // タブ区切りを優先
    if (line.includes('\t')) {
      parsedRows.push(line.split('\t').map((s) => s.trim()));
    } else {
      // 2つ以上のスペースで区切る
      parsedRows.push(line.split(/\s{2,}/).map((s) => s.trim()));
    }
  }

  // ヘッダー行を検出してExcelと同じロジックで変換
  const genericRows = parsedRows.map((row) =>
    row.map((cell) => (cell === '' ? null : cell))
  ) as Array<Array<string | number | null>>;

  const items = convertExcelToLineItems(genericRows);

  // ヘッダー検出+変換で結果が得られない場合、単純な行ベース変換を試みる
  if (items.length === 0 && parsedRows.length > 0) {
    const fallbackItems: LineItemFormData[] = [];
    for (const row of parsedRows) {
      // 数値を含む行をデータ行とみなす
      const hasNumbers = row.some((cell) => /\d+/.test(cell));
      if (!hasNumbers) continue;

      const item: LineItemFormData = {
        id: generateId(),
        customCategory: '',
        workType: '',
        name: '',
        specification: '',
        unit: '',
        quantity: '',
        unitPrice: '',
        amount: null,
        remarks: '',
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
      };

      // 数値でないトークンを名称として、数値トークンを数量・単価として推定
      const textTokens: string[] = [];
      const numberTokens: string[] = [];

      for (const cell of row) {
        if (/^\d[\d,.]*$/.test(cell.trim())) {
          numberTokens.push(cell.trim());
        } else {
          textTokens.push(cell.trim());
        }
      }

      if (textTokens.length > 0 && textTokens[0]) item.name = textTokens[0];
      if (textTokens.length > 1 && textTokens[1]) item.specification = textTokens[1];
      if (textTokens.length > 2 && textTokens[2]) item.unit = textTokens[2];

      if (numberTokens.length >= 2 && numberTokens[0] && numberTokens[1]) {
        item.quantity = numberTokens[0];
        item.unitPrice = numberTokens[1];
      } else if (numberTokens.length === 1 && numberTokens[0]) {
        item.quantity = numberTokens[0];
      }

      // 金額計算
      const q = parseFloat(item.quantity);
      const p = parseFloat(item.unitPrice);
      if (!isNaN(q) && !isNaN(p)) {
        item.amount = Math.round(q * p);
      }

      if (item.name) {
        fallbackItems.push(item);
      }
    }
    return fallbackItems;
  }

  return items;
}

/**
 * Excel行データをテキスト表示用に変換する
 */
function excelRowsToText(rows: Array<Array<string | number | null>>): string {
  return rows
    .map((row) =>
      row.map((cell) => (cell !== null && cell !== undefined ? String(cell) : '')).join('\t')
    )
    .join('\n');
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
  },
  progressContainer: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '12px',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '13px',
    color: '#6b7280',
  },
  extractedTextContainer: {
    padding: '12px 16px',
    maxHeight: '200px',
    overflow: 'auto',
  },
  extractedText: {
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#374151',
    lineHeight: '1.6',
    userSelect: 'text' as const,
    WebkitUserSelect: 'text' as const,
    cursor: 'text',
  },
  importSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  importButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  importButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  importInfo: {
    fontSize: '12px',
    color: '#6b7280',
  },
  successMessage: {
    padding: '12px 16px',
    backgroundColor: '#f0fdf4',
    borderTop: '1px solid #bbf7d0',
    fontSize: '13px',
    color: '#166534',
  },
  errorContainer: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
  },
  errorMessage: {
    fontSize: '13px',
    color: '#ef4444',
    textAlign: 'center' as const,
  },
  manualInputHint: {
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'center' as const,
  },
  claudeVisionInfoBanner: {
    padding: '8px 16px',
    backgroundColor: '#eff6ff', // bg-blue-50
    borderTop: '1px solid #bfdbfe', // border-blue-200
    fontSize: '13px',
    color: '#1e40af', // text-blue-800
  },
  fallbackWarningBanner: {
    padding: '8px 16px',
    backgroundColor: '#fefce8', // bg-yellow-50
    borderTop: '1px solid #fde68a', // border-yellow-200
    fontSize: '13px',
    color: '#92400e', // text-yellow-800
  },
  bothFailedErrorBanner: {
    padding: '8px 16px',
    backgroundColor: '#fef2f2', // bg-red-50
    borderTop: '1px solid #fecaca', // border-red-200
    fontSize: '13px',
    color: '#991b1b', // text-red-800
  },
  actionButtonContainer: {
    padding: '16px',
    display: 'flex',
    justifyContent: 'center',
  },
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  retryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: '#f59e0b',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * OCR/データパース処理と結果表示コンポーネント
 *
 * ファイルタイプに応じてOCR処理（PDF/画像）またはデータパース（Excel）を実行し、
 * 抽出結果の表示と明細行への一括取り込みを提供する。
 *
 * @example
 * ```tsx
 * <OcrDataExtractor
 *   file={selectedFile}
 *   onImportLineItems={handleImportLineItems}
 * />
 * ```
 */
export function OcrDataExtractor({
  file,
  fileUrl,
  fileMimeType,
  onImportLineItems,
  autoStart = true,
}: OcrDataExtractorProps) {
  // --------------------------------------------------------------------------
  // 状態管理
  // --------------------------------------------------------------------------

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [parsedLineItems, setParsedLineItems] = useState<LineItemFormData[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importCompleted, setImportCompleted] = useState(false);

  // Claude Vision対応の追加状態
  const [usedClaudeVision, setUsedClaudeVision] = useState(false);
  const [fallbackActivated, setFallbackActivated] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  // ワーカーとタイムアウト管理用のref
  const workerRef = useRef<{
    recognize: (image: File) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

  // 手動トリガーモードで使用するファイルオブジェクトの保持
  const fetchedFileRef = useRef<File | null>(null);

  // --------------------------------------------------------------------------
  // クリーンアップ
  // --------------------------------------------------------------------------

  const cleanup = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (workerRef.current) {
      try {
        await workerRef.current.terminate();
      } catch {
        // ワーカー終了エラーは無視
      }
      workerRef.current = null;
    }
  }, []);

  // --------------------------------------------------------------------------
  // Claude Vision結果をLineItemFormData[]に変換するヘルパー（24.8）
  // --------------------------------------------------------------------------

  const convertClaudeVisionToLineItems = useCallback(
    (lineItems: ClaudeVisionLineItem[]): LineItemFormData[] => {
      return lineItems.map((item, index) => {
        const quantityStr = item.quantity != null ? String(item.quantity) : '';
        // 単価がnullかつ金額が存在する場合、金額を単価として採用する
        const effectiveUnitPrice = item.unitPrice != null ? item.unitPrice : item.amount;
        const unitPriceStr = effectiveUnitPrice != null ? String(effectiveUnitPrice) : '';

        // 数値フォーマット適用（18.1-18.6）
        const formattedQuantity = formatQuantity(quantityStr);
        const formattedUnitPrice = formatUnitPrice(unitPriceStr);
        const formattedAmount = calculateFormattedAmount(formattedQuantity, formattedUnitPrice);

        return {
          id: generateId(),
          customCategory: item.customCategory ?? '',
          workType: item.workType ?? '',
          name: item.name,
          specification: item.specification ?? '',
          unit: item.unit ?? '',
          quantity: formattedQuantity,
          unitPrice: formattedUnitPrice,
          amount: formattedAmount,
          remarks: item.remarks ?? '',
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: index,
        };
      });
    },
    []
  );

  // --------------------------------------------------------------------------
  // Claude Vision抽出の共通処理（PDF/画像共用）
  // --------------------------------------------------------------------------

  const processClaudeVision = useCallback(
    async (images: ClaudeVisionImageInput[]): Promise<boolean> => {
      try {
        const result = await extractWithClaudeVision(images);
        const items = convertClaudeVisionToLineItems(result.lineItems);

        // 結果をJSON形式で整形表示
        setExtractedText(JSON.stringify(result.lineItems, null, 2));
        setParsedLineItems(items);
        setUsedClaudeVision(true);
        setProgress(100);
        setStatus('completed');
        return true;
      } catch (error) {
        // shouldFallbackがtrueの場合（全エラー共通）
        if (isClaudeVisionApiError(error) && (error as ClaudeVisionApiError).shouldFallback) {
          setFallbackActivated(true);
          setFallbackReason((error as ClaudeVisionApiError).message);
          return false;
        }
        // その他のエラーもフォールバック
        setFallbackActivated(true);
        setFallbackReason(error instanceof Error ? error.message : '不明なエラー');
        return false;
      }
    },
    [convertClaudeVisionToLineItems]
  );

  // --------------------------------------------------------------------------
  // 画像ファイルをBase64に変換するヘルパー（54.3）
  // --------------------------------------------------------------------------

  const readImageFileAsBase64 = useCallback(
    async (imageFile: File): Promise<ClaudeVisionImageInput[]> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // data:image/jpeg;base64, プレフィックスを除去
          const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, '');
          const mediaType = imageFile.type as ClaudeVisionImageInput['mediaType'];
          resolve([{ base64Data, mediaType }]);
        };
        reader.onerror = () => reject(new Error('画像ファイルの読み込みに失敗しました'));
        reader.readAsDataURL(imageFile);
      });
    },
    []
  );

  // --------------------------------------------------------------------------
  // PDFテキスト抽出（pdfjs-distハイブリッドアプローチ）
  // Requirements: 17.1, 17.2, 17.3, 17.4, 17.8
  // --------------------------------------------------------------------------

  const processPdfHybrid = useCallback(
    async (targetFile: File) => {
      setStatus('processing');
      setProgress(10);
      setExtractedText(null);
      setParsedLineItems(null);
      setErrorMessage(null);
      setImportCompleted(false);
      setUsedClaudeVision(false);
      setFallbackActivated(false);
      setFallbackReason(null);
      abortedRef.current = false;

      // ---- Claude Vision抽出を優先的に試行（24.2）----
      try {
        const images = await renderPdfPagesToBase64(targetFile);
        setProgress(30);

        const success = await processClaudeVision(images);
        if (success) return; // Claude Vision成功 → 終了
        // processClaudeVisionがfalseの場合 → フォールバック
      } catch {
        // renderPdfPagesToBase64のエラーもフォールバックに進む
        setFallbackActivated(true);
        setFallbackReason('PDFページのBase64変換に失敗しました');
      }

      // ---- Tesseract.jsフォールバック（25.1-25.6）----
      try {
        // タイムアウト設定（30秒）
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutRef.current = setTimeout(() => {
            abortedRef.current = true;
            reject(new Error('PDFテキスト抽出がタイムアウトしました（30秒超過）'));
          }, OCR_TIMEOUT_MS);
        });

        // pdfjs-distハイブリッドアプローチ（タイムアウト付き）
        const result = await Promise.race([
          extractPdfHybrid(targetFile, (progressValue, _message) => {
            if (!abortedRef.current) {
              setProgress(progressValue);
            }
          }),
          timeoutPromise,
        ]);

        if (abortedRef.current) {
          await cleanup();
          return;
        }

        // タイムアウトタイマークリア
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        setProgress(90);

        const text = result.text;
        setExtractedText(text);

        // テキストから構造化データへ変換
        const items = convertOcrTextToLineItems(text);
        setParsedLineItems(items);

        setProgress(100);
        setStatus('completed');
      } catch (err) {
        if (abortedRef.current && !(err instanceof Error && err.message.includes('タイムアウト'))) {
          await cleanup();
          return;
        }
        // 両方失敗（25.7）
        setErrorMessage('OCR処理に失敗しました。手動入力してください');
        setStatus('error');
      }
    },
    [cleanup, processClaudeVision]
  );

  // --------------------------------------------------------------------------
  // OCR処理（画像ファイル専用 - 従来のTesseract.js直接実行）
  // --------------------------------------------------------------------------

  const processOcr = useCallback(
    async (targetFile: File) => {
      setStatus('processing');
      setProgress(10);
      setExtractedText(null);
      setParsedLineItems(null);
      setErrorMessage(null);
      setImportCompleted(false);
      setUsedClaudeVision(false);
      setFallbackActivated(false);
      setFallbackReason(null);
      abortedRef.current = false;

      // ---- Claude Vision抽出を優先的に試行（24.2, 54.3）----
      try {
        const images = await readImageFileAsBase64(targetFile);
        setProgress(30);

        const success = await processClaudeVision(images);
        if (success) return; // Claude Vision成功 → 終了
      } catch {
        // FileReader変換エラーもフォールバックに進む
        setFallbackActivated(true);
        setFallbackReason('画像ファイルのBase64変換に失敗しました');
      }

      // ---- Tesseract.jsフォールバック（25.1-25.6）----
      try {
        // ワーカー初期化（プリフェッチ）
        setProgress(20);
        const worker = await createWorker('jpn');
        workerRef.current = worker as unknown as typeof workerRef.current;

        if (abortedRef.current) {
          // 中断された場合はワーカーを終了してメモリを解放
          await cleanup();
          return;
        }

        // タイムアウト設定（30秒）
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutRef.current = setTimeout(() => {
            abortedRef.current = true;
            reject(new Error('OCR処理がタイムアウトしました（30秒超過）'));
          }, OCR_TIMEOUT_MS);
        });

        setProgress(40);

        // OCR処理実行（タイムアウト付き）
        const result = await Promise.race([worker.recognize(targetFile), timeoutPromise]);

        if (abortedRef.current) {
          // 中断された場合はワーカーを終了してメモリを解放
          await cleanup();
          return;
        }

        // タイムアウトタイマークリア
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        setProgress(80);

        const text = result.data.text;
        setExtractedText(text);

        // テキストから構造化データへ変換
        const items = convertOcrTextToLineItems(text);
        setParsedLineItems(items);

        setProgress(100);
        setStatus('completed');

        // 処理完了後にワーカーを終了してメモリを解放
        await cleanup();
      } catch (err) {
        if (abortedRef.current && !(err instanceof Error && err.message.includes('タイムアウト'))) {
          // 中断された場合はワーカーを終了してメモリを解放
          await cleanup();
          return;
        }
        // 両方失敗（25.7）
        setErrorMessage('OCR処理に失敗しました。手動入力してください');
        setStatus('error');

        // エラー時もワーカーを終了してメモリを解放
        await cleanup();
      }
    },
    [cleanup, processClaudeVision, readImageFileAsBase64]
  );

  // --------------------------------------------------------------------------
  // Excelデータパース処理
  // --------------------------------------------------------------------------

  const processExcel = useCallback(async (targetFile: File) => {
    setStatus('processing');
    setProgress(10);
    setExtractedText(null);
    setParsedLineItems(null);
    setErrorMessage(null);
    setImportCompleted(false);

    try {
      setProgress(30);

      // FileReaderでArrayBufferとして読み込み
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result instanceof ArrayBuffer) {
            resolve(e.target.result);
          } else {
            reject(new Error('ファイルの読み込みに失敗しました'));
          }
        };
        reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsArrayBuffer(targetFile);
      });

      setProgress(60);

      // SheetJSでパース
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('シートが見つかりません');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      if (!worksheet) {
        throw new Error('ワークシートが見つかりません');
      }

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as Array<Array<string | number | null>>;

      setProgress(80);

      // テキスト表示用に変換
      const text = excelRowsToText(rows);
      setExtractedText(text);

      // 構造化データへ変換
      const items = convertExcelToLineItems(rows);
      setParsedLineItems(items);

      setProgress(100);
      setStatus('completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Excelデータの解析に失敗しました';
      setErrorMessage(message);
      setStatus('error');
    }
  }, []);

  // --------------------------------------------------------------------------
  // ファイルURLからFileオブジェクトを取得するヘルパー
  // --------------------------------------------------------------------------

  const fetchFileFromUrl = useCallback(async (): Promise<File | null> => {
    if (fetchedFileRef.current) return fetchedFileRef.current;
    if (!fileUrl || !fileMimeType) return null;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('ファイルの取得に失敗しました');
    }
    const blob = await response.blob();
    const fetchedFile = new File([blob], 'existing-file', { type: fileMimeType });
    fetchedFileRef.current = fetchedFile;
    return fetchedFile;
  }, [fileUrl, fileMimeType]);

  // --------------------------------------------------------------------------
  // 手動トリガー実行ハンドラ
  // --------------------------------------------------------------------------

  const handleManualExecute = useCallback(async () => {
    try {
      // fileプロパティが提供されている場合はそれを使用（新規アップロード時のリトライ）
      let targetFile: File | null = file;

      if (!targetFile) {
        // fileUrlからファイルを取得
        targetFile = await fetchFileFromUrl();
      }

      if (!targetFile) return;

      const category = detectFileCategory(targetFile.type);
      if (category === 'pdf') {
        await processPdfHybrid(targetFile);
      } else if (category === 'image') {
        await processOcr(targetFile);
      } else if (category === 'excel') {
        await processExcel(targetFile);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ファイルの取得に失敗しました';
      setErrorMessage(message);
      setStatus('error');
    }
  }, [file, fetchFileFromUrl, processPdfHybrid, processOcr, processExcel]);

  // --------------------------------------------------------------------------
  // リトライハンドラ
  // --------------------------------------------------------------------------

  const handleRetry = useCallback(async () => {
    await handleManualExecute();
  }, [handleManualExecute]);

  // --------------------------------------------------------------------------
  // ファイル変更時の処理開始
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!file) {
      // autoStart=false（手動トリガーモード）でfileUrlが存在する場合はidleで待機
      if (!autoStart && fileUrl) {
        return;
      }
      setStatus('idle');
      setProgress(0);
      setExtractedText(null);
      setParsedLineItems(null);
      setErrorMessage(null);
      setImportCompleted(false);
      return;
    }

    // autoStart=false の場合は自動実行しない
    if (!autoStart) {
      return;
    }

    const category = detectFileCategory(file.type);

    if (category === 'pdf') {
      processPdfHybrid(file);
    } else if (category === 'image') {
      processOcr(file);
    } else if (category === 'excel') {
      processExcel(file);
    }

    return () => {
      abortedRef.current = true;
      cleanup();
    };
  }, [file, autoStart, fileUrl, processPdfHybrid, processOcr, processExcel, cleanup]);

  // --------------------------------------------------------------------------
  // 一括取り込みハンドラ
  // --------------------------------------------------------------------------

  const handleImport = useCallback(() => {
    if (parsedLineItems && parsedLineItems.length > 0) {
      // 18.10: 一括取り込み時に数値フォーマットを適用
      const formattedItems = parsedLineItems.map((item) => {
        const formattedQuantity = formatQuantity(item.quantity);
        const formattedUnitPrice = formatUnitPrice(item.unitPrice);
        const formattedAmount = calculateFormattedAmount(formattedQuantity, formattedUnitPrice);
        return {
          ...item,
          quantity: formattedQuantity,
          unitPrice: formattedUnitPrice,
          amount: formattedAmount,
        };
      });
      onImportLineItems(formattedItems);
      setImportCompleted(true);
    }
  }, [parsedLineItems, onImportLineItems]);

  // --------------------------------------------------------------------------
  // レンダリング
  // --------------------------------------------------------------------------

  // ファイルもfileUrlも無い場合は何も表示しない
  if (!file && !fileUrl) {
    return null;
  }

  // ファイル種別の判定（fileがある場合はfile.type、ない場合はfileMimeTypeを使用）
  const effectiveMimeType = file ? file.type : (fileMimeType ?? '');
  const fileCategory = detectFileCategory(effectiveMimeType);
  const headerTitle = fileCategory === 'excel' ? 'データ抽出（Excelパース）' : 'データ抽出（OCR）';

  // 手動トリガーモード: idleかつautoStart=falseの場合にアクションボタンを表示
  const showManualTriggerButton = !autoStart && status === 'idle';

  // リトライボタン: エラー時に表示
  const showRetryButton = status === 'error';

  // 処理中フラグ
  const isProcessing = status === 'processing';

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>{headerTitle}</span>
      </div>

      {/* 手動トリガーボタン（autoStart=false時） */}
      {showManualTriggerButton && (
        <div style={styles.actionButtonContainer}>
          <button
            type="button"
            onClick={handleManualExecute}
            disabled={isProcessing}
            style={{
              ...styles.actionButton,
              ...(isProcessing ? styles.buttonDisabled : {}),
            }}
          >
            {fileCategory === 'excel' ? 'データパース実行' : 'OCR実行'}
          </button>
        </div>
      )}

      {/* 処理中インジケーター */}
      {status === 'processing' && (
        <div style={styles.progressContainer} data-testid="ocr-progress-indicator">
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progress}%`,
              }}
            />
          </div>
          <span style={styles.progressText}>
            {fileCategory === 'excel'
              ? 'Excelデータを解析中...'
              : !fallbackActivated && progress <= 30
                ? 'Claude Vision APIで解析中...'
                : fileCategory === 'pdf'
                  ? progress < 50
                    ? 'PDFテキスト抽出中...'
                    : progress < 90
                      ? 'PDF処理中...'
                      : 'テキスト解析中...'
                  : progress < 50
                    ? 'OCR準備中...'
                    : 'OCR処理中...'}
          </span>
        </div>
      )}

      {/* Claude Vision成功バナー（24.5） */}
      {status === 'completed' && usedClaudeVision && !fallbackActivated && (
        <div style={styles.claudeVisionInfoBanner} data-testid="claude-vision-info-banner">
          Claude Vision APIで抽出しました
        </div>
      )}

      {/* Tesseract.jsフォールバック警告バナー（25.4） */}
      {fallbackActivated && (status === 'processing' || status === 'completed') && (
        <div style={styles.fallbackWarningBanner} data-testid="fallback-warning-banner">
          Claude Vision APIが利用できないため、従来のOCR処理で実行しています
          {fallbackReason && `（理由: ${fallbackReason}）`}
        </div>
      )}

      {/* 抽出結果テキスト表示 */}
      {status === 'completed' && extractedText && (
        <div style={styles.extractedTextContainer}>
          <pre style={styles.extractedText} data-testid="ocr-extracted-text">
            {extractedText}
          </pre>
        </div>
      )}

      {/* 一括取り込みセクション */}
      {status === 'completed' && parsedLineItems && parsedLineItems.length > 0 && (
        <div style={styles.importSection}>
          <span style={styles.importInfo}>{parsedLineItems.length}件のデータが検出されました</span>
          <button
            type="button"
            onClick={handleImport}
            disabled={importCompleted}
            style={{
              ...styles.importButton,
              ...(importCompleted ? styles.importButtonDisabled : {}),
            }}
            data-testid="ocr-import-button"
          >
            {importCompleted ? '取り込み済み' : '一括取り込み'}
          </button>
        </div>
      )}

      {/* 取り込み完了メッセージ（13.13） */}
      {importCompleted && (
        <div style={styles.successMessage} data-testid="ocr-import-success">
          データを明細行に取り込みました。内容を確認し、必要に応じて修正してください。
        </div>
      )}

      {/* エラー表示（13.14） + リトライボタン（16.5, 16.6） */}
      {status === 'error' && (
        <div style={styles.errorContainer} data-testid="ocr-error-message">
          <span style={styles.errorMessage}>{errorMessage ?? 'データの抽出に失敗しました'}</span>
          <span style={styles.manualInputHint}>手動で明細行にデータを入力してください。</span>
          {showRetryButton && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isProcessing}
              style={{
                ...styles.retryButton,
                ...(isProcessing ? styles.buttonDisabled : {}),
              }}
            >
              OCRリトライ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default OcrDataExtractor;
