/**
 * @fileoverview EstimateExportDialog - 見積書出力ダイアログ
 *
 * Task 11.5: 見積書出力ダイアログの実装
 *
 * Requirements (estimate-creation):
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 * - REQ-10.2: Excel出力を選択した場合、建設工事見積書形式のExcelファイルを生成する
 * - REQ-10.8: 見積書出力が処理中の場合、出力処理中であることを表示する
 *
 * @module components/estimate/EstimateExportDialog
 */

import { useState, useCallback } from 'react';
import type { ExportFormat } from '../../api/estimates';

/**
 * 出力対象行タイプ
 */
type ExportLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

// ============================================================================
// 型定義
// ============================================================================

export interface EstimateExportDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** 見積書ID */
  estimateId: string;
  /** 見積書名（ファイル名用） */
  estimateName: string;
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
    color: '#6b7280',
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
 * 見積書出力ダイアログ
 *
 * Requirements:
 * - REQ-10.1: PDF出力
 * - REQ-10.2: Excel出力
 * - REQ-10.8: 出力処理中表示
 */
export function EstimateExportDialog({
  isOpen,
  estimateId,
  estimateName,
  onClose,
}: EstimateExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [selectedLineType, setSelectedLineType] = useState<ExportLineType>('ESTIMATE');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 出力実行（lineTypeパラメータ付き）
   */
  const handleExport = useCallback(async () => {
    if (!selectedFormat) return;

    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/estimates/${estimateId}/export?format=${selectedFormat}&lineType=${selectedLineType}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('見積書の出力に失敗しました');
      }

      const blob = await response.blob();

      // ファイル名生成
      const lineTypeLabel =
        selectedLineType === 'ESTIMATE'
          ? '見積'
          : selectedLineType === 'EXECUTION'
            ? '実行'
            : '業者';
      const extension = selectedFormat === 'pdf' ? '.pdf' : '.xlsx';
      const filename = `${estimateName}_${lineTypeLabel}${extension}`;

      // ダウンロード
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } catch {
      setError('見積書の出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  }, [estimateId, estimateName, selectedFormat, selectedLineType, onClose]);

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
          見積書出力
        </h2>

        <p style={styles.description}>出力対象と出力形式を選択してください</p>

        {/* エラー表示 */}
        {error && (
          <div role="alert" style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/* 出力対象行タイプ選択 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            出力対象
          </div>
          <div style={styles.formatOptions}>
            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineType === 'ESTIMATE' ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="radio"
                name="export-line-type"
                value="ESTIMATE"
                checked={selectedLineType === 'ESTIMATE'}
                onChange={() => setSelectedLineType('ESTIMATE')}
                style={styles.radio}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>見積</div>
                <div style={styles.formatDescription}>見積金額行を出力します</div>
              </div>
            </label>

            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineType === 'EXECUTION' ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="radio"
                name="export-line-type"
                value="EXECUTION"
                checked={selectedLineType === 'EXECUTION'}
                onChange={() => setSelectedLineType('EXECUTION')}
                style={styles.radio}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>実行</div>
                <div style={styles.formatDescription}>実行金額行を出力します</div>
              </div>
            </label>

            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineType === 'VENDOR' ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="radio"
                name="export-line-type"
                value="VENDOR"
                checked={selectedLineType === 'VENDOR'}
                onChange={() => setSelectedLineType('VENDOR')}
                style={styles.radio}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>業者</div>
                <div style={styles.formatDescription}>業者金額行を出力します</div>
              </div>
            </label>
          </div>
        </div>

        {/* 出力形式選択 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            出力形式
          </div>
          <div style={styles.formatOptions}>
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
                <div style={styles.formatDescription}>印刷用の見積書をPDFファイルで出力します</div>
              </div>
            </label>

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
          </div>
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
            disabled={!selectedFormat || isExporting}
            style={{
              ...styles.submitButton,
              ...(!selectedFormat || isExporting ? styles.submitButtonDisabled : {}),
            }}
          >
            {isExporting ? '出力中...' : '出力'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EstimateExportDialog;
