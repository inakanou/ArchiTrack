/**
 * @fileoverview 現場調査画像グリッドコンポーネント
 *
 * Task 9.2: 画像一覧グリッド表示を実装する
 *
 * Requirements:
 * - 4.9: 画像一覧を固定の表示順序で表示する
 * - 4.10: ドラッグアンドドロップによる順序変更
 *
 * 機能:
 * - サムネイルによる画像一覧
 * - 固定の表示順序
 * - ドラッグアンドドロップによる順序変更
 * - 画像クリックでビューア/エディタ起動
 */

import { useState, useCallback, useMemo } from 'react';
import type { SurveyImageInfo, ImageOrderItem } from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SurveyImageGrid コンポーネントの Props
 */
export interface SurveyImageGridProps {
  /** 画像一覧 */
  images: SurveyImageInfo[];
  /** 画像クリック時のハンドラ */
  onImageClick: (image: SurveyImageInfo) => void;
  /** 順序変更時のハンドラ */
  onOrderChange: (newOrders: ImageOrderItem[]) => void;
  /** 読み取り専用モード（ドラッグ無効） */
  readOnly?: boolean;
  /** ローディング状態 */
  isLoading?: boolean;
  /** 表示順序番号を表示するか */
  showOrderNumbers?: boolean;
  /** グリッドカラム数（デフォルト: 自動） */
  columns?: number;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  imageContainer: {
    position: 'relative' as const,
    aspectRatio: '1',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  imageContainerHover: {
    border: '2px solid #2563eb',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  imageContainerDragging: {
    opacity: 0.5,
    border: '2px dashed #6b7280',
  } as React.CSSProperties,
  imageContainerDragOver: {
    border: '2px solid #10b981',
    backgroundColor: '#ecfdf5',
  } as React.CSSProperties,
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  } as React.CSSProperties,
  imageInfo: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: '8px',
    background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.7))',
    color: '#ffffff',
    fontSize: '12px',
    opacity: 0,
    transition: 'opacity 0.2s ease',
  } as React.CSSProperties,
  imageInfoVisible: {
    opacity: 1,
  } as React.CSSProperties,
  orderNumber: {
    position: 'absolute' as const,
    top: '8px',
    left: '8px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    color: '#6b7280',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  emptyIcon: {
    width: '48px',
    height: '48px',
    marginBottom: '16px',
    opacity: 0.5,
  } as React.CSSProperties,
  skeleton: {
    aspectRatio: '1',
    borderRadius: '8px',
    backgroundColor: '#e5e7eb',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 現場調査画像グリッドコンポーネント
 *
 * 画像をサムネイルグリッドで表示し、ドラッグアンドドロップで
 * 順序変更が可能なコンポーネントです。
 *
 * @example
 * ```tsx
 * <SurveyImageGrid
 *   images={surveyImages}
 *   onImageClick={(image) => navigate(`/site-surveys/${surveyId}/images/${image.id}`)}
 *   onOrderChange={(newOrders) => updateImageOrder(surveyId, newOrders)}
 * />
 * ```
 */
export function SurveyImageGrid({
  images,
  onImageClick,
  onOrderChange,
  readOnly = false,
  isLoading = false,
  showOrderNumbers = false,
  columns,
}: SurveyImageGridProps) {
  // ドラッグ状態の管理
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // displayOrder順にソートした画像リスト
  const sortedImages = useMemo(
    () => [...images].sort((a, b) => a.displayOrder - b.displayOrder),
    [images]
  );

  // グリッドスタイルの計算
  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      ...styles.grid,
      ...(columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : {}),
    }),
    [columns]
  );

  // ドラッグ開始ハンドラ
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, imageId: string) => {
      if (readOnly) return;
      e.dataTransfer.setData('text/plain', imageId);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(imageId);
    },
    [readOnly]
  );

  // ドラッグオーバーハンドラ
  const handleDragOver = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  // ドラッグエンターハンドラ
  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, imageId: string) => {
      e.preventDefault();
      if (draggingId && draggingId !== imageId) {
        setDragOverId(imageId);
      }
    },
    [draggingId]
  );

  // ドラッグリーブハンドラ
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOverId(null);
  }, []);

  // ドロップハンドラ
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain');

      if (!sourceId || sourceId === targetId) {
        setDraggingId(null);
        setDragOverId(null);
        return;
      }

      // 新しい順序を計算
      const sourceIndex = sortedImages.findIndex((img) => img.id === sourceId);
      const targetIndex = sortedImages.findIndex((img) => img.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        setDraggingId(null);
        setDragOverId(null);
        return;
      }

      // 配列を再構築して新しい順序を計算
      const newImages = [...sortedImages];
      const [removed] = newImages.splice(sourceIndex, 1);
      if (removed) {
        newImages.splice(targetIndex, 0, removed);
      }

      // 新しいorder配列を生成
      const newOrders: ImageOrderItem[] = newImages.map((img, index) => ({
        id: img.id,
        order: index + 1,
      }));

      onOrderChange(newOrders);
      setDraggingId(null);
      setDragOverId(null);
    },
    [sortedImages, onOrderChange]
  );

  // ドラッグ終了ハンドラ
  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  // 画像クリックハンドラ
  const handleImageClick = useCallback(
    (image: SurveyImageInfo) => {
      onImageClick(image);
    },
    [onImageClick]
  );

  // キーボード操作ハンドラ
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, image: SurveyImageInfo) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onImageClick(image);
      }
    },
    [onImageClick]
  );

  // ローディング中でデータがない場合のスケルトン表示
  if (isLoading && images.length === 0) {
    return (
      <div style={styles.container}>
        <div style={gridStyle} data-testid="image-grid">
          {[...Array(6)].map((_, index) => (
            <div key={`skeleton-${index}`} style={styles.skeleton} data-testid="skeleton-loader" />
          ))}
        </div>
      </div>
    );
  }

  // 空状態
  if (images.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState} data-testid="image-grid">
          <svg style={styles.emptyIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p>画像がありません</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={gridStyle} data-testid="image-grid">
        {sortedImages.map((image, index) => {
          const isDragging = draggingId === image.id;
          const isDragOver = dragOverId === image.id;
          const isHovered = hoveredId === image.id;

          const containerStyle: React.CSSProperties = {
            ...styles.imageContainer,
            ...(isDragging ? styles.imageContainerDragging : {}),
            ...(isDragOver ? styles.imageContainerDragOver : {}),
            ...(isHovered && !isDragging ? styles.imageContainerHover : {}),
          };

          const infoStyle: React.CSSProperties = {
            ...styles.imageInfo,
            ...(isHovered ? styles.imageInfoVisible : {}),
          };

          return (
            <button
              key={image.id}
              type="button"
              style={containerStyle}
              draggable={!readOnly}
              onClick={() => handleImageClick(image)}
              onKeyDown={(e) => handleKeyDown(e, image)}
              onDragStart={(e) => handleDragStart(e, image.id)}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, image.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, image.id)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoveredId(image.id)}
              onMouseLeave={() => setHoveredId(null)}
              data-dragging={isDragging ? 'true' : undefined}
              data-drag-over={isDragOver ? 'true' : undefined}
              aria-label={`画像: ${image.fileName}`}
            >
              <img
                src={image.thumbnailUrl || image.thumbnailPath}
                alt={image.fileName}
                style={styles.image}
                loading="lazy"
              />

              {/* 順序番号 */}
              {showOrderNumbers && <div style={styles.orderNumber}>{index + 1}</div>}

              {/* ホバー時のファイル情報 */}
              <div style={infoStyle}>
                <div>{image.fileName}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// デフォルトエクスポート
export default SurveyImageGrid;
