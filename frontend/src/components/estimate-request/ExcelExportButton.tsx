/**
 * @fileoverview Excelエクスポートボタンコンポーネント
 *
 * Task 5.7: ExcelExportButtonコンポーネントを実装する
 *
 * Requirements:
 * - 5.4: 「Excelでエクスポート」ボタンをクリックすると選択項目をExcel形式でダウンロード
 * - 5.5: 項目が選択されていない場合ボタンを無効化
 */

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { ItemWithSelectionInfo } from '../../types/estimate-request.types';

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
  /** 無効状態 */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
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
    backgroundColor: '#059669',
    color: '#ffffff',
  } as React.CSSProperties,
  buttonDisabled: {
    backgroundColor: '#6b7280', // gray-500 (WCAG AA contrast ratio)
    cursor: 'not-allowed',
  } as React.CSSProperties,
  buttonExporting: {
    backgroundColor: '#10b981',
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
    カテゴリ: item.customCategory ?? '',
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
  disabled = false,
}: ExcelExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const isDisabled = disabled || selectedItems.length === 0;

  const handleExport = useCallback(async () => {
    if (isDisabled || isExporting) return;

    setIsExporting(true);

    try {
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
    } catch (error) {
      console.error('Excel export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [selectedItems, estimateRequestName, isDisabled, isExporting]);

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
  );
}

export default ExcelExportButton;
