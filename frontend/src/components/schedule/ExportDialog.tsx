/**
 * @fileoverview ExportDialog - 工程表出力ダイアログ
 *
 * Task 13: フロントエンド出力ダイアログの実装
 *
 * Requirements (construction-schedule):
 * - REQ-7.1: Excel出力ボタン押下時にExcel形式（.xlsx）のファイルをダウンロード
 * - REQ-8.1: PDF出力ボタン押下時にPDF形式のファイルをダウンロード
 *
 * @module components/schedule/ExportDialog
 */

import { useState, useCallback } from 'react';
import type { ExportFormat } from '../../api/schedules';

// ============================================================================
// 型定義
// ============================================================================

export interface ExportDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** 工程表ID */
  scheduleId: string;
  /** 工程表名（ファイル名用） */
  scheduleName: string;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '95%',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '24px',
  } as React.CSSProperties,
  description: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '20px',
  } as React.CSSProperties,
  formatOptions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '24px',
  } as React.CSSProperties,
  formatOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background-color 0.2s',
  } as React.CSSProperties,
  formatOptionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  radio: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  } as React.CSSProperties,
  formatInfo: {
    flex: 1,
  } as React.CSSProperties,
  formatName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  formatDescription: {
    fontSize: '12px',
    color: '#636e7b',
    marginTop: '2px',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
    color: '#1e40af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工程表出力ダイアログ
 *
 * Excel/PDF形式を選択して工程表をエクスポートするダイアログ。
 * ボタン押下時にエクスポートAPIを呼び出し、ファイルをダウンロードする。
 * 出力中はローディング表示を行う。
 *
 * Requirements:
 * - REQ-7.1: Excel出力
 * - REQ-8.1: PDF出力
 */
export function ExportDialog({ isOpen, scheduleId, scheduleName, onClose }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 出力実行
   * エクスポートAPIを呼び出し、レスポンスのBlobをファイルとしてダウンロードする
   */
  const handleExport = useCallback(async () => {
    if (!selectedFormat) return;

    setIsExporting(true);
    setError(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const url = `${baseUrl}/api/schedules/${scheduleId}/export?format=${selectedFormat}`;

      // fetchでAPIリクエストを実行しレスポンスを検証
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error('工程表の出力に失敗しました');
      }

      // レスポンスからBlobを取得してダウンロード
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const ext = selectedFormat === 'pdf' ? 'pdf' : 'xlsx';
      const fileName = `${scheduleName}.${ext}`;

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
      onClose();
    } catch {
      setError('工程表の出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  }, [scheduleId, scheduleName, selectedFormat, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div style={styles.dialog}>
        <h2 id="export-dialog-title" style={styles.title}>
          工程表出力
        </h2>

        <p style={styles.description}>出力形式を選択してください</p>

        {/* エラー表示 */}
        {error && (
          <div role="alert" style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/* 出力形式選択 */}
        <div style={styles.formatOptions}>
          {/* Excel */}
          <label
            style={{
              ...styles.formatOption,
              ...(selectedFormat === 'xlsx' ? styles.formatOptionSelected : {}),
            }}
          >
            <input
              type="radio"
              name="export-format"
              value="xlsx"
              checked={selectedFormat === 'xlsx'}
              onChange={() => setSelectedFormat('xlsx')}
              style={styles.radio}
              disabled={isExporting}
            />
            <div style={styles.formatInfo}>
              <div style={styles.formatName}>Excel形式</div>
              <div style={styles.formatDescription}>
                編集可能なExcelファイル（.xlsx）で出力します
              </div>
            </div>
          </label>

          {/* PDF */}
          <label
            style={{
              ...styles.formatOption,
              ...(selectedFormat === 'pdf' ? styles.formatOptionSelected : {}),
            }}
          >
            <input
              type="radio"
              name="export-format"
              value="pdf"
              checked={selectedFormat === 'pdf'}
              onChange={() => setSelectedFormat('pdf')}
              style={styles.radio}
              disabled={isExporting}
            />
            <div style={styles.formatInfo}>
              <div style={styles.formatName}>PDF形式</div>
              <div style={styles.formatDescription}>印刷用の工程表をPDFファイルで出力します</div>
            </div>
          </label>
        </div>

        {/* ボタン */}
        <div style={styles.buttonGroup}>
          <button
            type="button"
            onClick={onClose}
            style={styles.cancelButton}
            disabled={isExporting}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            style={{
              ...styles.submitButton,
              ...(isExporting ? styles.submitButtonDisabled : {}),
            }}
          >
            {isExporting ? '出力中...' : '出力'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportDialog;
