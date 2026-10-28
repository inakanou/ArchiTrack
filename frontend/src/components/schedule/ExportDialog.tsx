/**
 * @fileoverview ExportDialog - 工程表出力ダイアログ
 *
 * Task 13: フロントエンド出力ダイアログの実装
 *
 * Requirements (construction-schedule):
 * - REQ-7.1: Excel出力ボタン押下時にExcel形式（.xlsx）のファイルをダウンロード
 * - REQ-8.1: PDF出力ボタン押下時にPDF形式のファイルをダウンロード
 * - REQ-7.6 / REQ-8.6: 出力失敗時にエラーメッセージを表示し、再試行ボタンで直前の形式の出力をやり直す（Task 18.1）
 * - REQ-13.7: 出力の記録の失敗の応答（500・`code: 'EXPORT_RECORD_FAILED'`）でダウンロードを始めず、
 *   出力を記録できなかった旨を表示する（Task 22.2）。記録はサーバーが生成の前に行うため、
 *   ブラウザからは記録を要求しない（`runRecordedExport` で包むと二重の記録になる）
 *
 * @module components/schedule/ExportDialog
 */

import { useState, useCallback } from 'react';
import type { ExportFormat } from '../../api/schedules';
import { apiClient } from '../../api/client';
import { EXPORT_RECORD_FAILED_MESSAGE } from '../../api/export-audit';

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

/**
 * 出力の記録の失敗を表すサーバーの識別子（construction-schedule の Requirement 13.7）
 *
 * サーバーで生成する工程表の出力は、記録が失敗するとファイルを返さず 500 とこの識別子を返す。
 */
const EXPORT_RECORD_FAILED_CODE = 'EXPORT_RECORD_FAILED';

/** 出力の失敗の汎用の文言（Requirement 7.6・8.6） */
const EXPORT_FAILED_MESSAGE = '工程表の出力に失敗しました';

/** 失敗の応答の本文の `code` を読む。本文が JSON でなければ null */
async function errorCodeOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
      return body.code;
    }
  } catch {
    // 本文が JSON でない失敗は汎用の文言で扱う
  }
  return null;
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
  retryButton: {
    marginTop: '8px',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#991b1b',
    border: '1px solid #fca5a5',
    cursor: 'pointer',
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
 * - REQ-7.6 / REQ-8.6: 出力失敗時の再試行
 *
 * 出力の記録の失敗の表示（construction-schedule の Requirement 13 の受入基準7）は、ファイル冒頭の注記のとおり
 */
export function ExportDialog({ isOpen, scheduleId, scheduleName, onClose }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 直前に失敗した出力の形式（再試行で同じ形式をやり直すために保持する） */
  const [failedFormat, setFailedFormat] = useState<ExportFormat | null>(null);

  /**
   * 出力実行
   * エクスポートAPIを呼び出し、レスポンスのBlobをファイルとしてダウンロードする
   */
  const runExport = useCallback(
    async (format: ExportFormat) => {
      setIsExporting(true);
      setError(null);
      setFailedFormat(null);

      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const url = `${baseUrl}/api/schedules/${scheduleId}/export?format=${format}`;

        // fetchでAPIリクエストを実行しレスポンスを検証
        // アクセストークンは ApiClient のメモリから得る（永続ストレージに置かない。要件33.10）
        const accessToken = apiClient.getAccessToken();
        const response = await fetch(url, {
          method: 'GET',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });

        if (!response.ok) {
          // 出力の記録の失敗ではファイルが返らない。ダウンロードを始めず、その旨を表示する（13.7）
          if ((await errorCodeOf(response)) === EXPORT_RECORD_FAILED_CODE) {
            setError(EXPORT_RECORD_FAILED_MESSAGE);
            setFailedFormat(format);
            return;
          }
          throw new Error(EXPORT_FAILED_MESSAGE);
        }

        // レスポンスからBlobを取得してダウンロード
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const ext = format === 'pdf' ? 'pdf' : 'xlsx';
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
        setError(EXPORT_FAILED_MESSAGE);
        setFailedFormat(format);
      } finally {
        setIsExporting(false);
      }
    },
    [scheduleId, scheduleName, onClose]
  );

  /** 選択中の形式で出力する */
  const handleExport = useCallback(() => runExport(selectedFormat), [runExport, selectedFormat]);

  /** 直前に失敗した形式で出力をやり直す（REQ-7.6, REQ-8.6） */
  const handleRetry = useCallback(() => {
    if (failedFormat) void runExport(failedFormat);
  }, [runExport, failedFormat]);

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
            {failedFormat && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isExporting}
                style={styles.retryButton}
              >
                再試行
              </button>
            )}
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
