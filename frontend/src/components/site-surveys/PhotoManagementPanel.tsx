/**
 * @fileoverview 写真一覧管理パネルコンポーネント
 *
 * Task 27.4: 写真一覧管理パネルコンポーネントを実装する
 * Task 27.5: ドラッグアンドドロップによる写真順序変更を実装する
 *
 * Requirements:
 * - 10.1: 報告書出力対象写真の選択
 * - 10.5: ドラッグアンドドロップによる写真順序変更
 * - 10.6: 順序変更完了時のデータベース保存
 * - 10.7: 保存された表示順序で写真一覧を表示
 *
 * 機能:
 * - 写真ごとに報告書出力フラグ（チェックボックス）を表示
 * - 中解像度画像（800x600px程度）でサムネイルではない実際の写真を表示
 * - コメント入力用テキストエリアを各写真に配置
 * - 保存された表示順序で写真一覧を表示
 * - ドラッグアンドドロップによる写真順序変更
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type {
  SurveyImageInfo,
  UpdateImageMetadataInput,
  ImageOrderItem,
} from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * PhotoManagementPanel コンポーネントの Props
 */
export interface PhotoManagementPanelProps {
  /** 画像一覧 */
  images: SurveyImageInfo[];
  /** 画像メタデータ変更時のハンドラ */
  onImageMetadataChange: (imageId: string, metadata: UpdateImageMetadataInput) => void;
  /** 画像クリック時のハンドラ */
  onImageClick?: (image: SurveyImageInfo) => void;
  /** 順序変更時のハンドラ（Task 27.5） */
  onOrderChange?: (newOrders: ImageOrderItem[]) => void;
  /** ローディング状態 */
  isLoading?: boolean;
  /** 読み取り専用モード */
  readOnly?: boolean;
  /** 表示順序番号を表示するか */
  showOrderNumbers?: boolean;
}

// ============================================================================
// 定数
// ============================================================================

/** コメント最大文字数 */
const MAX_COMMENT_LENGTH = 2000;

/** デバウンス待機時間（ミリ秒） */
const DEBOUNCE_DELAY = 500;

/** 自動スクロールのしきい値（ピクセル） */
const AUTO_SCROLL_THRESHOLD = 100;

/** 自動スクロールの速度（ピクセル/フレーム） */
const AUTO_SCROLL_SPEED = 15;

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
    padding: '16px',
  } as React.CSSProperties,
  panelList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  panelItem: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  imageSection: {
    position: 'relative' as const,
    flexShrink: 0,
    width: '320px',
    cursor: 'pointer',
  } as React.CSSProperties,
  imageButton: {
    display: 'block',
    width: '100%',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    borderRadius: '8px',
    overflow: 'hidden',
  } as React.CSSProperties,
  image: {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: '8px',
  } as React.CSSProperties,
  orderNumber: {
    position: 'absolute' as const,
    top: '8px',
    left: '8px',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    zIndex: 1,
  } as React.CSSProperties,
  metadataSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  fileName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    margin: 0,
  } as React.CSSProperties,
  checkboxContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  } as React.CSSProperties,
  checkboxLabel: {
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  textareaContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  textareaLabel: {
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: 500,
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    minHeight: '80px',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  } as React.CSSProperties,
  textareaError: {
    borderColor: '#ef4444',
  } as React.CSSProperties,
  errorText: {
    fontSize: '12px',
    color: '#ef4444',
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
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  } as React.CSSProperties,
  skeletonImage: {
    width: '320px',
    height: '240px',
    backgroundColor: '#e5e7eb',
    borderRadius: '8px',
  } as React.CSSProperties,
  skeletonContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  skeletonLine: {
    height: '20px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
  } as React.CSSProperties,
  skeletonTextarea: {
    flex: 1,
    minHeight: '80px',
    backgroundColor: '#e5e7eb',
    borderRadius: '6px',
  } as React.CSSProperties,
  // ドラッグアンドドロップ用スタイル（Task 27.5）
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    cursor: 'grab',
    color: '#9ca3af',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  } as React.CSSProperties,
  dragHandleHover: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  } as React.CSSProperties,
  panelItemDragging: {
    opacity: 0.5,
    border: '2px dashed #6b7280',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  panelItemDragOver: {
    border: '2px solid #10b981',
    backgroundColor: '#ecfdf5',
  } as React.CSSProperties,
};

// ============================================================================
// 内部コンポーネント
// ============================================================================

interface PhotoItemProps {
  image: SurveyImageInfo;
  index: number;
  showOrderNumber: boolean;
  readOnly: boolean;
  onMetadataChange: (imageId: string, metadata: UpdateImageMetadataInput) => void;
  onImageClick?: (image: SurveyImageInfo) => void;
  // ドラッグアンドドロップ用props（Task 27.5）
  enableDrag: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, imageId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnter: (e: React.DragEvent<HTMLElement>, imageId: string) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>, targetId: string) => void;
  onDragEnd: () => void;
}

function PhotoItem({
  image,
  index,
  showOrderNumber,
  readOnly,
  onMetadataChange,
  onImageClick,
  enableDrag,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}: PhotoItemProps) {
  const [comment, setComment] = useState(image.comment ?? '');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [prevImageComment, setPrevImageComment] = useState(image.comment);
  const [lastSavedComment, setLastSavedComment] = useState(image.comment ?? '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 画像データが更新されたら状態を同期（レンダリング中の同期パターン）
  if (image.comment !== prevImageComment) {
    setPrevImageComment(image.comment);
    const newComment = image.comment ?? '';
    setComment(newComment);
    setLastSavedComment(newComment);
  }

  // 画像のURLを取得（中解像度画像 > オリジナル画像の順でフォールバック）
  const imageUrl = image.mediumUrl ?? image.originalUrl ?? image.originalPath;

  // チェックボックスID（アクセシビリティ用）
  const checkboxId = `include-in-report-${image.id}`;
  const textareaId = `comment-${image.id}`;
  const fileNameId = `filename-${image.id}`;

  // コメントのバリデーション
  const validateComment = useCallback((value: string): boolean => {
    if (value.length > MAX_COMMENT_LENGTH) {
      setCommentError(`2000文字以内で入力してください（現在: ${value.length}文字）`);
      return false;
    }
    setCommentError(null);
    return true;
  }, []);

  // コメント変更ハンドラ（デバウンス付き）
  const handleCommentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setComment(value);
      validateComment(value);

      // 既存のタイマーをクリア
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // 新しいデバウンスタイマーを設定
      if (value !== lastSavedComment && value.length <= MAX_COMMENT_LENGTH) {
        debounceTimerRef.current = setTimeout(() => {
          onMetadataChange(image.id, { comment: value || null });
          setLastSavedComment(value);
        }, DEBOUNCE_DELAY);
      }
    },
    [image.id, lastSavedComment, onMetadataChange, validateComment]
  );

  // フォーカスが外れた時にも保存
  const handleCommentBlur = useCallback(() => {
    // タイマーをクリアして即座に保存
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (comment !== lastSavedComment && comment.length <= MAX_COMMENT_LENGTH) {
      onMetadataChange(image.id, { comment: comment || null });
      setLastSavedComment(comment);
    }
  }, [comment, image.id, lastSavedComment, onMetadataChange]);

  // チェックボックス変更ハンドラ
  const handleIncludeInReportChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onMetadataChange(image.id, { includeInReport: e.target.checked });
    },
    [image.id, onMetadataChange]
  );

  // 画像クリックハンドラ
  const handleImageClick = useCallback(() => {
    if (onImageClick) {
      onImageClick(image);
    }
  }, [image, onImageClick]);

  // キーボード操作ハンドラ
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onImageClick) {
          onImageClick(image);
        }
      }
    },
    [image, onImageClick]
  );

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // パネルアイテムのスタイル計算
  const panelItemStyle: React.CSSProperties = {
    ...styles.panelItem,
    ...(isDragging ? styles.panelItemDragging : {}),
    ...(isDragOver ? styles.panelItemDragOver : {}),
  };

  return (
    <article
      style={panelItemStyle}
      data-testid="photo-panel-item"
      data-image-id={image.id}
      data-dragging={isDragging ? 'true' : undefined}
      data-drag-over={isDragOver ? 'true' : undefined}
      aria-labelledby={fileNameId}
      onDragOver={enableDrag ? onDragOver : undefined}
      onDragEnter={enableDrag ? (e) => onDragEnter(e, image.id) : undefined}
      onDragLeave={enableDrag ? onDragLeave : undefined}
      onDrop={enableDrag ? (e) => onDrop(e, image.id) : undefined}
    >
      {/* ドラッグハンドル（Task 27.5） */}
      {enableDrag && (
        <div
          draggable
          onDragStart={(e) => onDragStart(e, image.id)}
          onDragEnd={onDragEnd}
          style={styles.dragHandle}
          data-testid="photo-drag-handle"
          aria-label="ドラッグして順序を変更"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3 4h2v2H3V4zm4 0h2v2H7V4zm4 0h2v2h-2V4zM3 7h2v2H3V7zm4 0h2v2H7V7zm4 0h2v2h-2V7zM3 10h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2z" />
          </svg>
        </div>
      )}

      {/* 画像セクション */}
      <div style={styles.imageSection}>
        {showOrderNumber && (
          <div style={styles.orderNumber} data-testid="photo-order-number">
            {index + 1}
          </div>
        )}
        <button
          type="button"
          style={styles.imageButton}
          onClick={handleImageClick}
          onKeyDown={handleKeyDown}
          data-testid="photo-image-button"
          aria-label={`画像を拡大表示: ${image.fileName}`}
        >
          <img src={imageUrl} alt={image.fileName} style={styles.image} loading="lazy" />
        </button>
      </div>

      {/* メタデータセクション */}
      <div style={styles.metadataSection}>
        {/* ファイル名 */}
        <h3 id={fileNameId} style={styles.fileName}>
          {image.fileName}
        </h3>

        {/* 報告書出力フラグ */}
        <div style={styles.checkboxContainer}>
          <input
            type="checkbox"
            id={checkboxId}
            checked={image.includeInReport ?? false}
            onChange={handleIncludeInReportChange}
            disabled={readOnly}
            style={styles.checkbox}
            aria-label="報告書に含める"
          />
          <label htmlFor={checkboxId} style={styles.checkboxLabel}>
            報告書に含める
          </label>
        </div>

        {/* コメント入力 */}
        <div style={styles.textareaContainer}>
          <label htmlFor={textareaId} style={styles.textareaLabel}>
            コメント
          </label>
          <textarea
            id={textareaId}
            value={comment}
            onChange={handleCommentChange}
            onBlur={handleCommentBlur}
            placeholder="コメントを入力..."
            style={{
              ...styles.textarea,
              ...(commentError ? styles.textareaError : {}),
            }}
            readOnly={readOnly}
            aria-label="コメント"
            aria-invalid={!!commentError}
            aria-describedby={commentError ? `${textareaId}-error` : undefined}
          />
          {commentError && (
            <span id={`${textareaId}-error`} style={styles.errorText} role="alert">
              {commentError}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 写真一覧管理パネルコンポーネント
 *
 * 写真のコメント入力と報告書出力フラグの設定を行うパネルです。
 * 表示順序（displayOrder）でソートされた写真一覧を表示し、
 * 各写真に対してメタデータを編集できます。
 *
 * @example
 * ```tsx
 * <PhotoManagementPanel
 *   images={surveyImages}
 *   onImageMetadataChange={(imageId, metadata) => updateMetadata(imageId, metadata)}
 *   onImageClick={(image) => openViewer(image)}
 * />
 * ```
 */
export function PhotoManagementPanel({
  images,
  onImageMetadataChange,
  onImageClick,
  onOrderChange,
  isLoading = false,
  readOnly = false,
  showOrderNumbers = false,
}: PhotoManagementPanelProps) {
  // ドラッグ状態の管理（Task 27.5）
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // 自動スクロール用の参照
  const autoScrollAnimationRef = useRef<number | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ドラッグ中の自動スクロール処理
  useEffect(() => {
    if (!draggingId) {
      // ドラッグ終了時にアニメーションをクリア
      if (autoScrollAnimationRef.current) {
        cancelAnimationFrame(autoScrollAnimationRef.current);
        autoScrollAnimationRef.current = null;
      }
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const autoScroll = () => {
      const { y } = mousePositionRef.current;
      const viewportHeight = window.innerHeight;

      // 画面上部に近い場合は上にスクロール
      if (y < AUTO_SCROLL_THRESHOLD) {
        const speed = Math.max(1, AUTO_SCROLL_SPEED * (1 - y / AUTO_SCROLL_THRESHOLD));
        window.scrollBy(0, -speed);
      }
      // 画面下部に近い場合は下にスクロール
      else if (y > viewportHeight - AUTO_SCROLL_THRESHOLD) {
        const speed = Math.max(
          1,
          AUTO_SCROLL_SPEED * (1 - (viewportHeight - y) / AUTO_SCROLL_THRESHOLD)
        );
        window.scrollBy(0, speed);
      }

      // 次のフレームで再実行
      autoScrollAnimationRef.current = requestAnimationFrame(autoScroll);
    };

    // イベントリスナーを追加
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('dragover', handleMouseMove as EventListener);

    // 自動スクロールを開始
    autoScrollAnimationRef.current = requestAnimationFrame(autoScroll);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('dragover', handleMouseMove as EventListener);
      if (autoScrollAnimationRef.current) {
        cancelAnimationFrame(autoScrollAnimationRef.current);
        autoScrollAnimationRef.current = null;
      }
    };
  }, [draggingId]);

  // displayOrder順にソートした画像リスト
  const sortedImages = useMemo(
    () => [...images].sort((a, b) => a.displayOrder - b.displayOrder),
    [images]
  );

  // ドラッグ有効かどうか（Task 27.5）
  const enableDrag = !!onOrderChange && !readOnly;

  // ドラッグ開始ハンドラ（Task 27.5）
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, imageId: string) => {
      if (!enableDrag) return;
      e.dataTransfer.setData('text/plain', imageId);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(imageId);
    },
    [enableDrag]
  );

  // ドラッグオーバーハンドラ（Task 27.5）
  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  // ドラッグエンターハンドラ（Task 27.5）
  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLElement>, imageId: string) => {
      e.preventDefault();
      if (draggingId && draggingId !== imageId) {
        setDragOverId(imageId);
      }
    },
    [draggingId]
  );

  // ドラッグリーブハンドラ（Task 27.5）
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    // 子要素への移動の場合はdragOverIdをリセットしない
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDragOverId(null);
  }, []);

  // ドロップハンドラ（Task 27.5）
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>, targetId: string) => {
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

      if (onOrderChange) {
        onOrderChange(newOrders);
      }
      setDraggingId(null);
      setDragOverId(null);
    },
    [sortedImages, onOrderChange]
  );

  // ドラッグ終了ハンドラ（Task 27.5）
  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  // ローディング中でデータがない場合のスケルトン表示
  if (isLoading && images.length === 0) {
    return (
      <section style={styles.container} role="region" aria-label="写真管理パネル" aria-busy="true">
        <div style={styles.panelList}>
          {[...Array(3)].map((_, index) => (
            <div key={`skeleton-${index}`} style={styles.skeleton} data-testid="photo-skeleton">
              <div style={styles.skeletonImage} />
              <div style={styles.skeletonContent}>
                <div style={{ ...styles.skeletonLine, width: '40%' }} />
                <div style={{ ...styles.skeletonLine, width: '30%' }} />
                <div style={styles.skeletonTextarea} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // 空状態
  if (images.length === 0) {
    return (
      <section style={styles.container} role="region" aria-label="写真管理パネル">
        <div style={styles.emptyState}>
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
      </section>
    );
  }

  return (
    <section style={styles.container} role="region" aria-label="写真管理パネル">
      <div style={styles.panelList}>
        {sortedImages.map((image, index) => (
          <PhotoItem
            key={image.id}
            image={image}
            index={index}
            showOrderNumber={showOrderNumbers}
            readOnly={readOnly}
            onMetadataChange={onImageMetadataChange}
            onImageClick={onImageClick}
            // ドラッグアンドドロップ用props（Task 27.5）
            enableDrag={enableDrag}
            isDragging={draggingId === image.id}
            isDragOver={dragOverId === image.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </section>
  );
}

// デフォルトエクスポート
export default PhotoManagementPanel;
