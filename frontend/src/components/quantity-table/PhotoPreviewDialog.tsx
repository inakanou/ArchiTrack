/**
 * @fileoverview 写真プレビューダイアログコンポーネント
 *
 * Task 32.1: 写真プレビューダイアログコンポーネントを実装する
 *
 * 数量グループに紐づけられた写真を拡大プレビューするモーダルダイアログ。
 * 注釈付き写真（注釈エディタで編集済みの画像）を拡大表示する。
 *
 * Task 73.3: 拡大表示で原本画像を用いる
 *
 * Requirements: 20.1, 20.2, 20.3
 * Requirements (quantity-table-generation): 49.7
 */

import { useCallback, useEffect } from 'react';
import { AnnotatedImageThumbnail } from '../site-surveys/AnnotatedImageThumbnail';
import type { SurveyImageSummary } from '../../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

export interface PhotoPreviewDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** プレビュー対象の画像情報 */
  image: SurveyImageSummary;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    position: 'relative' as const,
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  image: {
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain' as const,
    borderRadius: '4px',
  } as React.CSSProperties,
  closeButton: {
    position: 'absolute' as const,
    top: '-40px',
    right: '0',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    border: 'none',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 写真プレビューダイアログ
 */
export default function PhotoPreviewDialog({ isOpen, onClose, image }: PhotoPreviewDialogProps) {
  // Escキーでダイアログを閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDialogClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  return (
    <div data-testid="photo-preview-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="写真プレビュー"
        style={styles.dialog}
        onClick={handleDialogClick}
      >
        <button
          type="button"
          style={styles.closeButton}
          onClick={onClose}
          aria-label="ダイアログを閉じる"
        >
          ×
        </button>
        {/*
          REQ-20.2, 20.3 / Requirement 49.7:
          拡大表示の表示元は原本画像とし、注釈は共有表示部品がクライアント側で合成する。
          合成済みサムネイル（`annotatedThumbnailUrl`）は縮小解像度であり拡大表示には
          足りないため渡さない。縮小表示指定（`preferThumbnail`）も与えない。
          利用者の明示操作を契機とする表示のため `loading="eager"` で即時取得とし、
          共有部品の表示領域観測（既定の `loading="lazy"`）を経由させない。
        */}
        <AnnotatedImageThumbnail
          image={{
            id: image.id,
            originalUrl: image.originalUrl,
            fileName: image.fileName,
          }}
          alt={image.fileName}
          style={styles.image}
          loading="eager"
        />
      </div>
    </div>
  );
}
