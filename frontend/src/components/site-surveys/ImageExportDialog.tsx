/**
 * ImageExportDialogコンポーネント
 *
 * 個別画像のエクスポートダイアログ
 * - エクスポート形式選択UI（JPEG/PNG）
 * - 品質（解像度）選択UI（低/中/高の3段階）
 * - 注釈あり/なし選択オプション
 * - エクスポート実行ボタンとキャンセルボタン
 *
 * Task 29.1: ImageExportDialogコンポーネントを実装する
 *
 * @see requirements.md - 要件12.1, 12.2, 12.3
 */

import React, { useState, useId, useEffect, useCallback } from 'react';
import type { SurveyImageInfo } from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * エクスポート形式
 */
export type ExportFormat = 'jpeg' | 'png';

/**
 * エクスポート品質（解像度）
 */
export type ExportQuality = 'low' | 'medium' | 'high';

/**
 * エクスポートオプション
 */
export interface ExportOptions {
  /** 出力形式 */
  format: ExportFormat;
  /** 品質（解像度） */
  quality: ExportQuality;
  /** 注釈を含めるかどうか */
  includeAnnotations: boolean;
}

/**
 * ImageExportDialogコンポーネントのProps
 */
export interface ImageExportDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** エクスポート対象の画像情報 */
  imageInfo: SurveyImageInfo;
  /** エクスポート実行時のコールバック */
  onExport: (options: ExportOptions) => void;
  /** ダイアログを閉じる際のコールバック */
  onClose: () => void;
  /** エクスポート処理中フラグ */
  exporting?: boolean;
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
  },
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '480px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#111827',
  },
  content: {
    padding: '24px',
  },
  section: {
    marginBottom: '20px',
  },
  sectionLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: '#6b7280',
    marginBottom: '4px',
  },
  sectionValue: {
    fontSize: '14px',
    color: '#111827',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '20px 0',
  },
  fieldset: {
    border: 'none',
    margin: 0,
    padding: 0,
    marginBottom: '20px',
  },
  legend: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
    display: 'block',
  },
  radioGroup: {
    display: 'flex',
    gap: '16px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#374151',
  },
  radioLabelDisabled: {
    cursor: 'not-allowed',
    color: '#9ca3af',
  },
  radio: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  radioDisabled: {
    cursor: 'not-allowed',
  },
  checkboxContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  checkboxDisabled: {
    cursor: 'not-allowed',
  },
  checkboxLabel: {
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  checkboxLabelDisabled: {
    cursor: 'not-allowed',
    color: '#9ca3af',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '16px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
  },
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    color: '#374151',
  },
  cancelButtonHover: {
    backgroundColor: '#f9fafb',
  },
  cancelButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  exportButton: {
    backgroundColor: '#3b82f6',
    border: '1px solid #3b82f6',
    color: '#ffffff',
  },
  exportButtonHover: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  exportButtonDisabled: {
    backgroundColor: '#93c5fd',
    borderColor: '#93c5fd',
    cursor: 'not-allowed',
  },
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ファイルサイズをフォーマット
 */
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 画像エクスポートダイアログコンポーネント
 */
const ImageExportDialog: React.FC<ImageExportDialogProps> = ({
  open,
  imageInfo,
  onExport,
  onClose,
  exporting = false,
}) => {
  // フォーム状態
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [quality, setQuality] = useState<ExportQuality>('medium');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);

  // ホバー状態
  const [cancelHovered, setCancelHovered] = useState(false);
  const [exportHovered, setExportHovered] = useState(false);

  // アクセシビリティ用ID
  const titleId = useId();
  const formatLabelId = useId();
  const qualityLabelId = useId();
  const annotationsId = useId();

  /**
   * Escapeキーでダイアログを閉じる
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !exporting) {
        onClose();
      }
    },
    [onClose, exporting]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  }, [open, handleKeyDown]);

  /**
   * エクスポート実行ハンドラ
   */
  const handleExport = () => {
    onExport({
      format,
      quality,
      includeAnnotations,
    });
  };

  /**
   * オーバーレイクリックでダイアログを閉じる
   */
  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && !exporting) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <>
      {/* スピナーアニメーション用のstyle要素 */}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div
        style={styles.overlay}
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
          {/* ヘッダー */}
          <div style={styles.header}>
            <h2 id={titleId} style={styles.title}>
              画像エクスポート
            </h2>
          </div>

          {/* コンテンツ */}
          <div style={styles.content}>
            {/* 画像情報 */}
            <div style={styles.section}>
              <span style={styles.sectionLabel}>ファイル名</span>
              <span style={styles.sectionValue}>{imageInfo.fileName}</span>
            </div>

            <div style={styles.section}>
              <span style={styles.sectionLabel}>サイズ</span>
              <span style={styles.sectionValue}>
                {imageInfo.width} x {imageInfo.height} ({formatFileSize(imageInfo.fileSize)})
              </span>
            </div>

            <div style={styles.divider} />

            {/* エクスポート形式 */}
            <fieldset style={styles.fieldset}>
              <legend id={formatLabelId} style={styles.legend}>
                エクスポート形式
              </legend>
              <div style={styles.radioGroup} role="radiogroup" aria-labelledby={formatLabelId}>
                <label
                  style={{
                    ...styles.radioLabel,
                    ...(exporting ? styles.radioLabelDisabled : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="export-format"
                    value="jpeg"
                    checked={format === 'jpeg'}
                    onChange={() => setFormat('jpeg')}
                    disabled={exporting}
                    style={{
                      ...styles.radio,
                      ...(exporting ? styles.radioDisabled : {}),
                    }}
                    aria-label="JPEG"
                  />
                  JPEG
                </label>
                <label
                  style={{
                    ...styles.radioLabel,
                    ...(exporting ? styles.radioLabelDisabled : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="export-format"
                    value="png"
                    checked={format === 'png'}
                    onChange={() => setFormat('png')}
                    disabled={exporting}
                    style={{
                      ...styles.radio,
                      ...(exporting ? styles.radioDisabled : {}),
                    }}
                    aria-label="PNG"
                  />
                  PNG
                </label>
              </div>
            </fieldset>

            {/* 品質選択 */}
            <fieldset style={styles.fieldset}>
              <legend id={qualityLabelId} style={styles.legend}>
                品質（解像度）
              </legend>
              <div style={styles.radioGroup} role="radiogroup" aria-labelledby={qualityLabelId}>
                <label
                  style={{
                    ...styles.radioLabel,
                    ...(exporting ? styles.radioLabelDisabled : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="export-quality"
                    value="low"
                    checked={quality === 'low'}
                    onChange={() => setQuality('low')}
                    disabled={exporting}
                    style={{
                      ...styles.radio,
                      ...(exporting ? styles.radioDisabled : {}),
                    }}
                    aria-label="低"
                  />
                  低
                </label>
                <label
                  style={{
                    ...styles.radioLabel,
                    ...(exporting ? styles.radioLabelDisabled : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="export-quality"
                    value="medium"
                    checked={quality === 'medium'}
                    onChange={() => setQuality('medium')}
                    disabled={exporting}
                    style={{
                      ...styles.radio,
                      ...(exporting ? styles.radioDisabled : {}),
                    }}
                    aria-label="中"
                  />
                  中
                </label>
                <label
                  style={{
                    ...styles.radioLabel,
                    ...(exporting ? styles.radioLabelDisabled : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="export-quality"
                    value="high"
                    checked={quality === 'high'}
                    onChange={() => setQuality('high')}
                    disabled={exporting}
                    style={{
                      ...styles.radio,
                      ...(exporting ? styles.radioDisabled : {}),
                    }}
                    aria-label="高"
                  />
                  高
                </label>
              </div>
            </fieldset>

            {/* 注釈オプション */}
            <div style={styles.checkboxContainer}>
              <input
                type="checkbox"
                id={annotationsId}
                checked={includeAnnotations}
                onChange={(e) => setIncludeAnnotations(e.target.checked)}
                disabled={exporting}
                style={{
                  ...styles.checkbox,
                  ...(exporting ? styles.checkboxDisabled : {}),
                }}
                aria-label="注釈を含める"
              />
              <label
                htmlFor={annotationsId}
                style={{
                  ...styles.checkboxLabel,
                  ...(exporting ? styles.checkboxLabelDisabled : {}),
                }}
              >
                注釈を含める
              </label>
            </div>

            {/* ローディングインジケータ */}
            {exporting && (
              <div style={styles.loadingContainer}>
                <div style={styles.spinner} role="progressbar" aria-label="エクスポート中" />
              </div>
            )}
          </div>

          {/* フッター */}
          <div style={styles.footer}>
            <button
              type="button"
              onClick={onClose}
              disabled={exporting}
              style={{
                ...styles.button,
                ...styles.cancelButton,
                ...(exporting
                  ? styles.cancelButtonDisabled
                  : cancelHovered
                    ? styles.cancelButtonHover
                    : {}),
              }}
              onMouseEnter={() => setCancelHovered(true)}
              onMouseLeave={() => setCancelHovered(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              style={{
                ...styles.button,
                ...styles.exportButton,
                ...(exporting
                  ? styles.exportButtonDisabled
                  : exportHovered
                    ? styles.exportButtonHover
                    : {}),
              }}
              onMouseEnter={() => setExportHovered(true)}
              onMouseLeave={() => setExportHovered(false)}
            >
              エクスポート
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ImageExportDialog;
