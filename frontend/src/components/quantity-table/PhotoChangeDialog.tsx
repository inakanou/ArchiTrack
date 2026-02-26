/**
 * @fileoverview 写真変更ダイアログコンポーネント
 *
 * Task 31.1: 写真変更ダイアログコンポーネントを実装する
 *
 * 数量グループに紐づけた写真を変更する際に表示されるモーダルダイアログ。
 * 同一プロジェクトの注釈付き現場調査写真一覧を表示し、新しい写真を選択する。
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4
 */

import { useCallback } from 'react';
import type { SurveyImageSummary } from '../../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

export interface PhotoChangeDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** 表示する写真一覧 */
  images: SurveyImageSummary[];
  /** 写真読み込み中フラグ */
  isLoading: boolean;
  /** 現在選択中の写真ID（ハイライト表示用） */
  currentImageId: string | null;
  /** 写真選択時のコールバック */
  onSelect: (image: SurveyImageSummary) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '800px',
    width: '90%',
    maxHeight: '80vh',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '4px',
    lineHeight: 1,
  } as React.CSSProperties,
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px',
    overflowY: 'auto' as const,
    flex: 1,
    padding: '4px',
  } as React.CSSProperties,
  photoItem: {
    aspectRatio: '1',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.2s, transform 0.2s',
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  photoItemSelected: {
    border: '2px solid #2563eb',
    transform: 'scale(1.02)',
  } as React.CSSProperties,
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  } as React.CSSProperties,
  emptyPhotos: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 写真変更ダイアログ
 */
export default function PhotoChangeDialog({
  isOpen,
  onClose,
  images,
  isLoading,
  currentImageId,
  onSelect,
}: PhotoChangeDialogProps) {
  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDialogClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-change-dialog-title"
      style={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div style={styles.dialog} onClick={handleDialogClick}>
        <div style={styles.header}>
          <h2 id="photo-change-dialog-title" style={styles.title}>
            写真を変更
          </h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label="ダイアログを閉じる"
          >
            ×
          </button>
        </div>

        {isLoading ? (
          <div style={styles.emptyPhotos}>
            <p>写真を読み込み中...</p>
          </div>
        ) : images.length === 0 ? (
          <div style={styles.emptyPhotos}>
            <p>利用可能な写真がありません</p>
          </div>
        ) : (
          <div style={styles.photoGrid}>
            {images.map((image) => {
              const isSelected = image.id === currentImageId;
              // REQ-19.2: 注釈付きサムネイルURLが存在する場合はそれを使用、なければ通常サムネイル
              const displayUrl = image.annotatedThumbnailUrl || image.thumbnailUrl;

              return (
                <div
                  key={image.id}
                  style={{
                    ...styles.photoItem,
                    ...(isSelected ? styles.photoItemSelected : {}),
                  }}
                  data-selected={isSelected ? 'true' : 'false'}
                  role="button"
                  tabIndex={0}
                  aria-label={`${image.fileName}を選択`}
                  onClick={() => onSelect(image)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(image);
                    }
                  }}
                >
                  <img src={displayUrl} alt={image.fileName} style={styles.photoImage} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
