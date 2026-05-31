/**
 * ImageExportDialogコンポーネント
 *
 * 個別画像のエクスポートダイアログ
 * - エクスポート形式選択UI（JPEG/PNG） - ExportSettingsForm に委譲
 * - 解像度選択UI（低/中/高の3段階） - ExportSettingsForm に委譲
 * - 注釈モード選択UI（含める/含めない/元画像そのまま） - ExportSettingsForm に委譲
 * - エクスポート実行ボタンとキャンセルボタン
 * - 元画像ダウンロードボタン（後方互換性のため維持）
 *
 * Task 29.1: ImageExportDialogコンポーネントを実装する
 * Task 29.2: 元画像ダウンロード機能を実装する
 * Task 83.2: ExportSettingsForm への置換（UI を共通フォームに統一）
 *
 * 外部 Props (`onExport`/`onDownloadOriginal` 等) は変更せず、
 * 内部 state は新しい ExportSettings 型で管理し、
 * onExport 呼び出し時に旧 ExportOptions 型へ変換する。
 *
 * @see requirements.md - 要件12.1, 12.2, 12.3, 12.4, 31.4
 */

import React, { useState, useId, useEffect, useCallback } from 'react';
import type { SurveyImageInfo } from '../../types/site-survey.types';
import ExportSettingsForm, {
  type ExportSettings,
  type ExportFormat,
  type ExportResolution,
  type AnnotationMode,
} from './ExportSettingsForm';

// ============================================================================
// 型定義
// ============================================================================

/**
 * エクスポート品質（解像度）
 * 後方互換性のため `ExportResolution` の別名として保持
 */
export type ExportQuality = ExportResolution;

/**
 * エクスポート形式（再エクスポート）
 */
export type { ExportFormat };

/**
 * エクスポートオプション
 *
 * 後方互換性維持のため、onExport コールバックに渡される従来型を維持する。
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
  /** 元画像ダウンロード時のコールバック（Task 29.2） */
  onDownloadOriginal?: () => void;
  /** ダウンロード処理中フラグ（Task 29.2） */
  downloading?: boolean;
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
    backgroundColor: '#e5e7eb',
    color: '#525b6a', // WCAG 2.1 AA準拠: 5.0:1 contrast ratio on #e5e7eb
    cursor: 'not-allowed',
  },
  exportButton: {
    backgroundColor: '#1d4ed8', // WCAG 2.1 AA準拠 (6.2:1 on #fff)
    border: '1px solid #1d4ed8',
    color: '#ffffff',
  },
  exportButtonHover: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  exportButtonDisabled: {
    backgroundColor: '#6b7280', // WCAG 2.1 AA準拠 - gray for disabled
    borderColor: '#6b7280',
    cursor: 'not-allowed',
  },
  downloadOriginalButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #2563eb', // WCAG 2.1 AA準拠: 5.2:1 contrast ratio with #fff
    color: '#2563eb', // WCAG 2.1 AA準拠: 5.2:1 contrast ratio with #fff
    width: '100%',
  },
  downloadOriginalButtonHover: {
    backgroundColor: '#eff6ff',
  },
  downloadOriginalButtonDisabled: {
    backgroundColor: '#e5e7eb',
    border: '1px solid #d1d5db',
    color: '#525b6a', // WCAG 2.1 AA準拠: 5.0:1 contrast ratio on #e5e7eb
    cursor: 'not-allowed',
  },
  downloadSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #e5e7eb',
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

/**
 * 新型 ExportSettings → 旧型 ExportOptions の変換
 *
 * `annotationMode === 'original-only'` の場合は別経路で扱う（onDownloadOriginal）。
 * include / exclude のみがこの変換の対象。
 */
const toExportOptions = (settings: ExportSettings): ExportOptions => ({
  format: settings.format,
  quality: settings.resolution,
  includeAnnotations: settings.annotationMode === 'include',
});

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
  onDownloadOriginal,
  downloading = false,
}) => {
  // フォーム状態（新型 ExportSettings で一元管理）
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'jpeg',
    resolution: 'medium',
    annotationMode: 'include',
  });

  // ホバー状態
  const [cancelHovered, setCancelHovered] = useState(false);
  const [exportHovered, setExportHovered] = useState(false);
  const [downloadOriginalHovered, setDownloadOriginalHovered] = useState(false);

  // 処理中状態の統合（エクスポートまたはダウンロード中）
  const isProcessing = exporting || downloading;

  // アクセシビリティ用ID
  const titleId = useId();

  /**
   * Escapeキーでダイアログを閉じる
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) {
        onClose();
      }
    },
    [onClose, isProcessing]
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
   *
   * - annotationMode === 'original-only' の場合は onDownloadOriginal を呼び出す
   * - それ以外は onExport へ旧型 ExportOptions を渡す
   */
  const handleExport = () => {
    if (settings.annotationMode === 'original-only') {
      if (onDownloadOriginal) {
        onDownloadOriginal();
      }
      return;
    }
    onExport(toExportOptions(settings));
  };

  /**
   * オーバーレイクリックでダイアログを閉じる
   */
  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && !isProcessing) {
      onClose();
    }
  };

  /**
   * 元画像ダウンロードハンドラ（Task 29.2 後方互換）
   */
  const handleDownloadOriginal = () => {
    if (onDownloadOriginal) {
      onDownloadOriginal();
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

            {/* エクスポート設定フォーム（形式 / 解像度 / 注釈モード） */}
            <ExportSettingsForm value={settings} onChange={setSettings} disabled={isProcessing} />

            {/* 元画像ダウンロードセクション（Task 29.2 後方互換） */}
            {onDownloadOriginal && (
              <div style={styles.downloadSection}>
                <button
                  type="button"
                  onClick={handleDownloadOriginal}
                  disabled={isProcessing}
                  style={{
                    ...styles.button,
                    ...styles.downloadOriginalButton,
                    ...(isProcessing
                      ? styles.downloadOriginalButtonDisabled
                      : downloadOriginalHovered
                        ? styles.downloadOriginalButtonHover
                        : {}),
                  }}
                  onMouseEnter={() => setDownloadOriginalHovered(true)}
                  onMouseLeave={() => setDownloadOriginalHovered(false)}
                >
                  元画像をダウンロード
                </button>
              </div>
            )}

            {/* ローディングインジケータ */}
            {isProcessing && (
              <div style={styles.loadingContainer}>
                <div
                  style={styles.spinner}
                  role="progressbar"
                  aria-label={downloading ? 'ダウンロード中' : 'エクスポート中'}
                />
              </div>
            )}
          </div>

          {/* フッター */}
          <div style={styles.footer}>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              style={{
                ...styles.button,
                ...styles.cancelButton,
                ...(isProcessing
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
              disabled={isProcessing}
              style={{
                ...styles.button,
                ...styles.exportButton,
                ...(isProcessing
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
// AnnotationMode は ExportSettingsForm から再エクスポート（参照されることがあるため）
export type { AnnotationMode };
