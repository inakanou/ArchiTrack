/**
 * @fileoverview ファイルインラインプレビューコンポーネント
 *
 * Task 24.2: FileInlinePreviewコンポーネントの実装
 *
 * Requirements:
 * - 13.1: ファイルアップロード時にインラインプレビューを表示する
 * - 13.2: PDFファイルのインラインビューア表示（最初のページのみ）
 * - 13.3: 画像ファイルのインライン画像表示
 * - 13.4: Excelファイルをテーブル形式でインライン表示（先頭100行のみ）
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import * as XLSX from 'xlsx';

// ============================================================================
// PDF.jsワーカー設定
// ============================================================================

// Vite環境でのPDF.jsワーカー設定
// react-pdf 10.xではimport.meta.urlパターンでワーカーを設定する
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ============================================================================
// 型定義
// ============================================================================

/**
 * プレビュータイプ
 */
type PreviewType = 'pdf' | 'image' | 'excel' | 'none';

/**
 * FileInlinePreviewコンポーネントのProps
 *
 * design.mdのFileInlinePreviewProps定義に準拠
 */
export interface FileInlinePreviewProps {
  /** プレビュー対象のファイル */
  file: File | null;
  /** 編集時の既存ファイルプレビューURL */
  existingPreviewUrl?: string;
  /** ファイルのMIMEタイプ（existingPreviewUrl使用時） */
  fileMimeType?: string;
}

/**
 * Excelパース結果の行データ
 */
type ExcelRow = Array<string | number | null>;

// ============================================================================
// 定数
// ============================================================================

/**
 * Excelプレビューの最大表示行数
 */
const MAX_EXCEL_ROWS = 100;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * MIMEタイプからプレビュータイプを判定する
 *
 * @param mimeType - ファイルのMIMEタイプ
 * @returns プレビュータイプ
 */
function detectPreviewType(mimeType: string): PreviewType {
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return 'excel';
  }
  return 'none';
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  skeleton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    backgroundColor: '#f3f4f6',
  },
  skeletonPulse: {
    width: '60%',
    height: '20px',
    backgroundColor: '#d1d5db',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  noPreview: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '120px',
    color: '#6b7280',
    fontSize: '14px',
  },
  imageContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: '#f9fafb',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '500px',
    objectFit: 'contain' as const,
    borderRadius: '4px',
  },
  pdfContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: '#f9fafb',
    overflow: 'auto',
  },
  excelContainer: {
    overflow: 'auto',
    maxHeight: '400px',
  },
  excelTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  excelTh: {
    padding: '6px 8px',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'left' as const,
    position: 'sticky' as const,
    top: 0,
  },
  excelTd: {
    padding: '4px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#374151',
    whiteSpace: 'nowrap' as const,
  },
  excelRowNumber: {
    padding: '4px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#9ca3af',
    fontSize: '12px',
    textAlign: 'center' as const,
    backgroundColor: '#f9fafb',
    width: '40px',
  },
  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '120px',
    color: '#ef4444',
    fontSize: '14px',
    padding: '16px',
  },
  rowLimitNotice: {
    padding: '8px 16px',
    fontSize: '12px',
    color: '#6b7280',
    backgroundColor: '#f9fafb',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center' as const,
  },
};

// ============================================================================
// スケルトンUIコンポーネント
// ============================================================================

/**
 * ロード中のスケルトンUI
 */
function PreviewSkeleton() {
  return (
    <div style={styles.skeleton} data-testid="preview-skeleton">
      <div style={styles.skeletonPulse} />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// PDFプレビューコンポーネント
// ============================================================================

/**
 * PDFファイルのインラインプレビュー（最初のページのみ）
 */
function PdfPreview({ fileUrl }: { fileUrl: string }) {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoadSuccess = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div style={styles.pdfContainer}>
      {isLoading && <PreviewSkeleton />}
      <Document
        file={fileUrl}
        onLoadSuccess={handleLoadSuccess}
        loading={<PreviewSkeleton />}
        error={<div style={styles.errorMessage}>PDFの読み込みに失敗しました</div>}
      >
        {/* Requirement 13.2: 最初のページのみ表示 */}
        <Page pageNumber={1} width={600} />
      </Document>
    </div>
  );
}

// ============================================================================
// 画像プレビューコンポーネント
// ============================================================================

/**
 * 画像ファイルのインラインプレビュー
 */
function ImagePreview({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  return (
    <div style={styles.imageContainer}>
      <img src={fileUrl} alt={fileName} style={styles.image} />
    </div>
  );
}

// ============================================================================
// Excelプレビューコンポーネント
// ============================================================================

/**
 * Excelファイルのテーブル形式プレビュー
 */
function ExcelPreview({ data, totalRows }: { data: ExcelRow[]; totalRows: number }) {
  if (data.length === 0) {
    return <div style={styles.noPreview}>データが空です</div>;
  }

  // 最初の行をヘッダーとして使用
  const headerRow = data[0];
  const dataRows = data.slice(1, MAX_EXCEL_ROWS + 1);
  const isLimited = totalRows > MAX_EXCEL_ROWS + 1; // ヘッダー行を除く

  return (
    <div style={styles.excelContainer}>
      <table style={styles.excelTable} role="table">
        <thead>
          <tr>
            <th style={styles.excelTh}>#</th>
            {headerRow?.map((cell, colIndex) => (
              <th key={colIndex} style={styles.excelTh}>
                {cell !== null && cell !== undefined ? String(cell) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td style={styles.excelRowNumber}>{rowIndex + 1}</td>
              {row.map((cell, colIndex) => (
                <td key={colIndex} style={styles.excelTd}>
                  {cell !== null && cell !== undefined ? String(cell) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isLimited && (
        <div style={styles.rowLimitNotice}>
          {totalRows - 1}行中、先頭{MAX_EXCEL_ROWS}行のみ表示しています
        </div>
      )}
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * ファイルインラインプレビューコンポーネント
 *
 * ファイルタイプ（PDF/画像/Excel）を判定し、適切なプレビュー方式を自動選択する。
 * ファイル未選択時やプレビュー不可時の代替表示、ロード中のスケルトンUIを提供する。
 *
 * @example
 * ```tsx
 * <FileInlinePreview file={selectedFile} />
 * <FileInlinePreview
 *   file={null}
 *   existingPreviewUrl="https://example.com/file.pdf"
 *   fileMimeType="application/pdf"
 * />
 * ```
 */
export function FileInlinePreview({
  file,
  existingPreviewUrl,
  fileMimeType,
}: FileInlinePreviewProps) {
  // --------------------------------------------------------------------------
  // 状態管理
  // --------------------------------------------------------------------------

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<ExcelRow[] | null>(null);
  const [totalExcelRows, setTotalExcelRows] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // プレビュータイプの判定
  // --------------------------------------------------------------------------

  const previewType = useMemo<PreviewType>(() => {
    if (file) {
      return detectPreviewType(file.type);
    }
    if (existingPreviewUrl && fileMimeType) {
      return detectPreviewType(fileMimeType);
    }
    return 'none';
  }, [file, existingPreviewUrl, fileMimeType]);

  // --------------------------------------------------------------------------
  // BlobURL管理（画像・PDFプレビュー用）
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!file) {
      setBlobUrl(null);
      return;
    }

    if (previewType === 'image' || previewType === 'pdf') {
      const url = URL.createObjectURL(file);
      setBlobUrl(url);

      // クリーンアップ：アンマウント時にBlobURLを解放する
      return () => {
        URL.revokeObjectURL(url);
      };
    }

    return undefined;
  }, [file, previewType]);

  // --------------------------------------------------------------------------
  // Excelファイルのパース処理
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!file || previewType !== 'excel') {
      setExcelData(null);
      setTotalExcelRows(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('ファイルの読み込みに失敗しました');
        }

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('シートが見つかりません');
        }

        const worksheet = workbook.Sheets[firstSheetName];
        if (!worksheet) {
          throw new Error('ワークシートが見つかりません');
        }
        // header: 1 で2次元配列として取得
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
        }) as ExcelRow[];

        setTotalExcelRows(rows.length);
        setExcelData(rows);
      } catch {
        setError('プレビューを表示できません。ファイルの読み込みに失敗しました。');
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      setError('プレビューを表示できません。ファイルの読み込みに失敗しました。');
      setIsLoading(false);
    };

    reader.readAsArrayBuffer(file);
  }, [file, previewType]);

  // --------------------------------------------------------------------------
  // プレビューURLの決定（ファイルまたは既存URL）
  // --------------------------------------------------------------------------

  const previewUrl = useMemo(() => {
    if (blobUrl) return blobUrl;
    if (existingPreviewUrl) return existingPreviewUrl;
    return null;
  }, [blobUrl, existingPreviewUrl]);

  // --------------------------------------------------------------------------
  // レンダリング
  // --------------------------------------------------------------------------

  // ファイル未選択でexistingPreviewUrlもない場合
  if (!file && !existingPreviewUrl) {
    return (
      <div style={styles.container}>
        <div style={styles.noPreview}>ファイルが選択されていません</div>
      </div>
    );
  }

  // ローディング中
  if (isLoading) {
    return (
      <div style={styles.container}>
        <PreviewSkeleton />
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorMessage}>{error}</div>
      </div>
    );
  }

  // プレビュー不可のファイルタイプ
  if (previewType === 'none') {
    return (
      <div style={styles.container}>
        <div style={styles.noPreview}>
          このファイル形式はプレビューに対応していないため、表示できません
        </div>
      </div>
    );
  }

  // PDFプレビュー
  if (previewType === 'pdf' && previewUrl) {
    return (
      <div style={styles.container}>
        <PdfPreview fileUrl={previewUrl} />
      </div>
    );
  }

  // 画像プレビュー
  if (previewType === 'image' && previewUrl) {
    const fileName = file?.name ?? 'image';
    return (
      <div style={styles.container}>
        <ImagePreview fileUrl={previewUrl} fileName={fileName} />
      </div>
    );
  }

  // Excelプレビュー
  if (previewType === 'excel' && excelData) {
    return (
      <div style={styles.container}>
        <ExcelPreview data={excelData} totalRows={totalExcelRows} />
      </div>
    );
  }

  // フォールバック：ローディング
  return (
    <div style={styles.container}>
      <PreviewSkeleton />
    </div>
  );
}

export default FileInlinePreview;
