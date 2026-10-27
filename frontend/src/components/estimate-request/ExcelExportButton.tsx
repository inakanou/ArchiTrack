/**
 * @fileoverview Excelエクスポートボタンコンポーネント
 *
 * Task 5.7: ExcelExportButtonコンポーネントを実装する
 *
 * Requirements:
 * - 5.4: 「Excelでエクスポート」ボタンをクリックすると選択項目をExcel形式でダウンロード
 * - 5.5: 項目が選択されていない場合ボタンを無効化
 *
 * Task 103.2 変更: Excel の生成とダウンロードを、出力の記録（`runRecordedExport`、
 *   user-authentication の要件40.9〜40.11）の成功の後にだけ始める。記録の失敗では生成も
 *   ダウンロードも始めず「出力を記録できなかったため中止しました」を示す。記録の要求中は
 *   開始を止め、記録の要求中にボタンが破棄されたら記録の成功の後も生成しない
 *   （estimate-request の Requirement 42.8・42.9）
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { ItemWithSelectionInfo } from '../../types/estimate-request.types';
import { runRecordedExport } from '../../api/export-audit';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ExcelExportButtonコンポーネントのProps
 */
export interface ExcelExportButtonProps {
  /** 選択された項目 */
  selectedItems: ItemWithSelectionInfo[];
  /** 見積依頼名（ファイル名に使用） */
  estimateRequestName: string;
  /** 見積依頼が属するプロジェクトのID（出力の記録の対象の案件。Requirement 42.8） */
  projectId: string;
  /** 無効状態 */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  errorMessage: {
    color: '#dc2626',
    fontSize: '13px',
    margin: 0,
    alignSelf: 'center',
  } as React.CSSProperties,
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    border: 'none',
    backgroundColor: '#047857', // emerald-700 (WCAG AA contrast ratio)
    color: '#ffffff',
  } as React.CSSProperties,
  buttonDisabled: {
    backgroundColor: '#6b7280', // gray-500 (WCAG AA contrast ratio)
    cursor: 'not-allowed',
  } as React.CSSProperties,
  buttonExporting: {
    backgroundColor: '#047857', // emerald-700 (WCAG AA contrast ratio)
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * Excelアイコン
 */
function ExcelIcon() {
  return (
    <svg
      data-testid="excel-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 項目データをExcel用データに変換
 */
function convertItemsToExcelData(items: ItemWithSelectionInfo[]) {
  return items.map((item) => ({
    任意分類: item.customCategory ?? '',
    工種: item.workType ?? '',
    名称: item.name ?? '',
    規格: item.specification ?? '',
    単位: item.unit ?? '',
    数量: item.quantity,
  }));
}

/**
 * 現在の日時を含むファイル名を生成
 */
function generateFileName(baseName: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `${baseName}_${dateStr}.xlsx`;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * Excelエクスポートボタン
 *
 * 選択された項目をExcel形式でダウンロードするボタン。
 * 項目が選択されていない場合は無効化されます。
 *
 * Requirements:
 * - 5.4: クリックでExcelファイルをダウンロード
 * - 5.5: 項目未選択時は無効化
 *
 * @example
 * ```tsx
 * <ExcelExportButton
 *   selectedItems={selectedItems}
 *   estimateRequestName="見積依頼#1"
 * />
 * ```
 */
export function ExcelExportButton({
  selectedItems,
  estimateRequestName,
  projectId,
  disabled = false,
}: ExcelExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  // 出力の記録の失敗など、出力を始められなかったときのエラーメッセージ（Requirement 42.9）
  const [exportError, setExportError] = useState<string | null>(null);

  // ボタンが描かれているか（出力の記録の要求中に破棄されたら、記録の後に生成を始めない。
  // StrictMode の effect の再実行でも true に戻す）
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isDisabled = disabled || selectedItems.length === 0;

  /** Excel の生成とダウンロード（出力の記録が成功した後にだけ呼ぶ。Requirement 42.8） */
  const generateAndDownload = useCallback(() => {
    // 記録の要求中に画面が破棄されたら生成もダウンロードもしない（記録は済んでいるが出力は無い）
    if (!isMountedRef.current) {
      return;
    }

    // 項目データをExcel用に変換
    const excelData = convertItemsToExcelData(selectedItems);

    // ワークシートを作成
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // ワークブックを作成
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '見積項目');

    // Excelファイルをバイナリとして出力
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    // Blobを作成してダウンロード
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const fileName = generateFileName(estimateRequestName);

    // ネイティブのダウンロード処理
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [selectedItems, estimateRequestName]);

  const handleExport = useCallback(async () => {
    // 項目の未選択（Requirement 5.3・5.5）は記録より前に止め、記録を要求しない
    if (isDisabled || isExporting) return;

    setIsExporting(true);
    setExportError(null);

    try {
      // 生成を始める前に出力の記録を1回要求し、記録の失敗では生成しない（Requirement 42.8, 42.9）
      const result = await runRecordedExport(
        {
          kind: 'estimate_request_xlsx',
          projectId,
          targetIds: selectedItems.map((item) => item.estimateRequestItemId),
          itemCount: selectedItems.length,
        },
        async () => generateAndDownload()
      );
      if (!result.ok) {
        if (result.error.type === 'RECORD_FAILED') {
          if (isMountedRef.current) {
            setExportError(result.error.message);
          }
        } else {
          console.error('Excel export failed:', result.error.cause);
        }
      }
    } catch (error) {
      console.error('Excel export failed:', error);
    } finally {
      if (isMountedRef.current) {
        setIsExporting(false);
      }
    }
  }, [selectedItems, projectId, isDisabled, isExporting, generateAndDownload]);

  const getButtonStyle = (): React.CSSProperties => {
    const baseStyle = { ...styles.button };

    if (isDisabled) {
      return { ...baseStyle, ...styles.buttonDisabled };
    }

    if (isExporting) {
      return { ...baseStyle, ...styles.buttonExporting };
    }

    return baseStyle;
  };

  const getButtonText = (): string => {
    if (isExporting) return 'エクスポート中...';
    return 'Excelでエクスポート';
  };

  const getAriaLabel = (): string => {
    if (isExporting) return 'エクスポート中';
    if (isDisabled) return '項目を選択してください';
    return `選択された${selectedItems.length}件の項目をExcelでエクスポート`;
  };

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        disabled={isDisabled}
        style={getButtonStyle()}
        aria-label={getAriaLabel()}
      >
        <ExcelIcon />
        {getButtonText()}
      </button>
      {exportError && (
        <p role="alert" style={styles.errorMessage}>
          {exportError}
        </p>
      )}
    </>
  );
}

export default ExcelExportButton;
