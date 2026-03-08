/**
 * @fileoverview EstimateExportDialog - 見積書出力ダイアログ
 *
 * Task 42.1: EstimateExportDialogをラジオボタンからチェックボックスに変更
 *
 * Requirements (estimate-creation):
 * - REQ-32.1: 出力対象として「見積」「実行」「業者」をチェックボックスで複数選択可能とする
 * - REQ-32.2: チェックされた行タイプの列のみを出力対象とする
 * - REQ-32.3: 出力ファイル名にチェックされた行タイプのラベルを含める
 * - REQ-32.4: lineTypesクエリパラメータ（カンマ区切り）を受け付ける
 * - REQ-32.5: デフォルト値として「見積」のみをONとする
 * - REQ-32.6: いずれのチェックボックスもチェックされていない場合、出力ボタンを無効化する
 * - REQ-32.8: 出力形式のデフォルトをExcel（.xlsx）とする
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 * - REQ-10.2: Excel出力を選択した場合、建設工事見積書形式のExcelファイルを生成する
 * - REQ-10.8: 見積書出力が処理中の場合、出力処理中であることを表示する
 * - REQ-10.14: 出力形式のデフォルトをExcel（.xlsx）とする
 *
 * @module components/estimate/EstimateExportDialog
 */

import { useState, useCallback } from 'react';
import type { ExportFormat } from '../../api/estimates';

/**
 * 出力対象行タイプ
 */
type ExportLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/**
 * 行タイプの選択状態
 */
interface SelectedLineTypes {
  estimate: boolean;
  execution: boolean;
  vendor: boolean;
}

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
// 定数定義
// ============================================================================

/** 行タイプラベルマップ */
const LINE_TYPE_LABELS: Record<ExportLineType, string> = {
  ESTIMATE: '見積',
  EXECUTION: '実行',
  VENDOR: '業者',
};

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
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  } as React.CSSProperties,
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
// ヘルパー関数
// ============================================================================

/**
 * 選択された行タイプをExportLineType配列に変換する
 */
function getSelectedLineTypeArray(selected: SelectedLineTypes): ExportLineType[] {
  const result: ExportLineType[] = [];
  if (selected.estimate) result.push('ESTIMATE');
  if (selected.execution) result.push('EXECUTION');
  if (selected.vendor) result.push('VENDOR');
  return result;
}

/**
 * 選択された行タイプのラベルをアンダースコア区切りで結合する（REQ-32.3）
 */
function getLineTypeFileNameSuffix(selected: SelectedLineTypes): string {
  const labels: string[] = [];
  if (selected.estimate) labels.push(LINE_TYPE_LABELS.ESTIMATE);
  if (selected.execution) labels.push(LINE_TYPE_LABELS.EXECUTION);
  if (selected.vendor) labels.push(LINE_TYPE_LABELS.VENDOR);
  return labels.join('_');
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積書出力ダイアログ
 *
 * Requirements:
 * - REQ-32.1: チェックボックスで複数選択
 * - REQ-32.5: デフォルト値は「見積」のみON
 * - REQ-32.6: チェックボックス全OFFで出力ボタン無効化
 * - REQ-32.8, REQ-10.14: デフォルト出力形式はExcel
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
  // REQ-32.8, REQ-10.14: デフォルト出力形式をExcelに変更
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('xlsx');
  // REQ-38.1: デフォルト値は「見積」と「実行」がON（REQ-32.5を上書き）
  const [selectedLineTypes, setSelectedLineTypes] = useState<SelectedLineTypes>({
    estimate: true,
    execution: true,
    vendor: false,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** いずれかのチェックボックスが選択されているか（REQ-32.6） */
  const hasSelectedLineType =
    selectedLineTypes.estimate || selectedLineTypes.execution || selectedLineTypes.vendor;

  /**
   * チェックボックスのトグル処理
   */
  const handleLineTypeToggle = useCallback((lineTypeKey: keyof SelectedLineTypes) => {
    setSelectedLineTypes((prev) => ({
      ...prev,
      [lineTypeKey]: !prev[lineTypeKey],
    }));
  }, []);

  /**
   * 出力実行（lineTypesパラメータ付き、REQ-32.4）
   */
  const handleExport = useCallback(async () => {
    if (!selectedFormat || !hasSelectedLineType) return;

    setIsExporting(true);
    setError(null);

    try {
      // REQ-32.4: lineTypesクエリパラメータ（カンマ区切り）
      const lineTypesParam = getSelectedLineTypeArray(selectedLineTypes).join(',');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const url = `${baseUrl}/api/estimates/${estimateId}/export?format=${selectedFormat}&lineTypes=${lineTypesParam}`;

      // fetchでAPIリクエストを実行しレスポンスを検証
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (!response.ok) {
        throw new Error('見積書の出力に失敗しました');
      }

      // レスポンスからBlobを取得してダウンロード
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // REQ-32.3: ファイル名に選択された行タイプラベルを含める
      const lineTypeSuffix = getLineTypeFileNameSuffix(selectedLineTypes);
      const ext = selectedFormat === 'pdf' ? 'pdf' : 'xlsx';
      const fileName = `${estimateName}_${lineTypeSuffix}.${ext}`;

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
      onClose();
    } catch {
      setError('見積書の出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  }, [estimateId, estimateName, selectedFormat, selectedLineTypes, hasSelectedLineType, onClose]);

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

        {/* 出力対象行タイプ選択（REQ-32.1: チェックボックス） */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            出力対象
          </div>
          <div style={styles.formatOptions}>
            {/* 見積 */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineTypes.estimate ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="checkbox"
                value="ESTIMATE"
                checked={selectedLineTypes.estimate}
                onChange={() => handleLineTypeToggle('estimate')}
                style={styles.checkbox}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>見積</div>
                <div style={styles.formatDescription}>見積金額行を出力します</div>
              </div>
            </label>

            {/* 実行 */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineTypes.execution ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="checkbox"
                value="EXECUTION"
                checked={selectedLineTypes.execution}
                onChange={() => handleLineTypeToggle('execution')}
                style={styles.checkbox}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>実行</div>
                <div style={styles.formatDescription}>実行金額行を出力します</div>
              </div>
            </label>

            {/* 業者 */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineTypes.vendor ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="checkbox"
                value="VENDOR"
                checked={selectedLineTypes.vendor}
                onChange={() => handleLineTypeToggle('vendor')}
                style={styles.checkbox}
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
            disabled={!hasSelectedLineType || isExporting}
            style={{
              ...styles.submitButton,
              ...(!hasSelectedLineType || isExporting ? styles.submitButtonDisabled : {}),
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
