/**
 * @fileoverview OCR/データパース処理と結果表示コンポーネント
 *
 * Task 25.1: OcrDataExtractorコンポーネントの実装
 *
 * Requirements:
 * - 13.5: PDF/画像ファイルに対してTesseract.jsによるOCR処理を自動的に開始する
 * - 13.6: ExcelファイルにはSheetJS（xlsx）によるデータパース（直接データ読み取り）を実行する
 * - 13.7: 処理中インジケーター（プログレスバー）を表示する
 * - 13.8: 抽出結果をテキストデータとして表示する
 * - 13.9: 抽出テキストを選択・コピー可能な状態で表示する
 * - 13.14: OCR/パース処理失敗時にエラーメッセージを表示し手動入力を促す
 *
 * Design:
 * - React.lazy()による動的インポートで遅延ロード（バンドルサイズ影響回避）
 * - Tesseract.jsワーカーの非同期プリフェッチとOCR準備中インジケーター表示
 * - OCR処理のタイムアウト（30秒）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import * as XLSX from 'xlsx';
import type { LineItemFormData } from './LineItemEditor';

// ============================================================================
// 型定義
// ============================================================================

/**
 * OcrDataExtractorコンポーネントのProps
 *
 * design.md OcrDataExtractorProps定義に準拠
 */
export interface OcrDataExtractorProps {
  /** 処理対象ファイル */
  file: File | null;
  /** 一括取り込み時のコールバック */
  onImportLineItems: (items: LineItemFormData[]) => void;
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
  name: ['名称', '品名', '品目', '摘要', '工種', '項目'],
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
      name: '',
      specification: '',
      unit: '',
      quantity: '',
      unitPrice: '',
      amount: null,
      remarks: '',
    };

    if (columnMapping) {
      // ヘッダーマッピングに基づいて値を設定
      for (const [colIdxStr, fieldName] of Object.entries(columnMapping)) {
        const colIdx = parseInt(colIdxStr, 10);
        const cellValue = row[colIdx];
        if (cellValue === null || cellValue === undefined) continue;

        const strValue = String(cellValue).trim();
        switch (fieldName) {
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
          // amount, amountは自動計算のため入力しない
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

/**
 * OCRテキストから構造化データに変換する
 *
 * パターンマッチングにより名称・規格・単位・数量・単価を推定
 *
 * @param text - OCR抽出テキスト
 * @returns 変換された明細行データ
 */
function convertOcrTextToLineItems(text: string): LineItemFormData[] {
  const lines = text.split('\n').filter((line) => line.trim());
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
        name: '',
        specification: '',
        unit: '',
        quantity: '',
        unitPrice: '',
        amount: null,
        remarks: '',
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
export function OcrDataExtractor({ file, onImportLineItems }: OcrDataExtractorProps) {
  // --------------------------------------------------------------------------
  // 状態管理
  // --------------------------------------------------------------------------

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [parsedLineItems, setParsedLineItems] = useState<LineItemFormData[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importCompleted, setImportCompleted] = useState(false);

  // ワーカーとタイムアウト管理用のref
  const workerRef = useRef<{
    recognize: (image: File) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

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
  // OCR処理（PDF/画像ファイル）
  // --------------------------------------------------------------------------

  const processOcr = useCallback(async (targetFile: File) => {
    setStatus('processing');
    setProgress(10);
    setExtractedText(null);
    setParsedLineItems(null);
    setErrorMessage(null);
    setImportCompleted(false);
    abortedRef.current = false;

    try {
      // ワーカー初期化（プリフェッチ）
      setProgress(20);
      const worker = await createWorker('jpn');
      workerRef.current = worker as unknown as typeof workerRef.current;

      if (abortedRef.current) return;

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

      if (abortedRef.current) return;

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
    } catch (err) {
      if (abortedRef.current && !(err instanceof Error && err.message.includes('タイムアウト'))) {
        return;
      }
      const message = err instanceof Error ? err.message : 'OCR処理に失敗しました';
      setErrorMessage(message);
      setStatus('error');
    }
  }, []);

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
  // ファイル変更時の処理開始
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!file) {
      setStatus('idle');
      setProgress(0);
      setExtractedText(null);
      setParsedLineItems(null);
      setErrorMessage(null);
      setImportCompleted(false);
      return;
    }

    const category = detectFileCategory(file.type);

    if (category === 'pdf' || category === 'image') {
      processOcr(file);
    } else if (category === 'excel') {
      processExcel(file);
    }

    return () => {
      abortedRef.current = true;
      cleanup();
    };
  }, [file, processOcr, processExcel, cleanup]);

  // --------------------------------------------------------------------------
  // 一括取り込みハンドラ
  // --------------------------------------------------------------------------

  const handleImport = useCallback(() => {
    if (parsedLineItems && parsedLineItems.length > 0) {
      onImportLineItems(parsedLineItems);
      setImportCompleted(true);
    }
  }, [parsedLineItems, onImportLineItems]);

  // --------------------------------------------------------------------------
  // レンダリング
  // --------------------------------------------------------------------------

  // ファイルがない場合は何も表示しない
  if (!file) {
    return null;
  }

  const fileCategory = detectFileCategory(file.type);
  const headerTitle = fileCategory === 'excel' ? 'データ抽出（Excelパース）' : 'データ抽出（OCR）';

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>{headerTitle}</span>
      </div>

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
              : progress < 30
                ? 'OCR準備中...'
                : 'OCR処理中...'}
          </span>
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

      {/* エラー表示（13.14） */}
      {status === 'error' && (
        <div style={styles.errorContainer} data-testid="ocr-error-message">
          <span style={styles.errorMessage}>{errorMessage ?? 'データの抽出に失敗しました'}</span>
          <span style={styles.manualInputHint}>手動で明細行にデータを入力してください。</span>
        </div>
      )}
    </div>
  );
}

export default OcrDataExtractor;
