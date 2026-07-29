/**
 * @fileoverview 工事写真 写真項目管理パネル
 *
 * Task 6.3: 詳細画面：写真項目管理＋3系統アップロード
 *
 * site-survey の PhotoManagementPanel をクローンし、工事写真項目
 * （ConstructionPhotoWithUrls）向けに適合させたパネル。
 *   - コメント編集（500msデバウンス＋フォーカス離脱flush、最大2000文字, R7.1, R7.2）
 *   - 印刷対象チェック（未保存状態で保持, R7.5）
 *   - 並び替え（ドラッグ / 上へ・下へ移動、未保存状態, R7.3, R7.4）
 *   - 手動保存ヘッダ（未保存インジケータ＋保存ボタン, R7.6）
 *   - サムネイル優先表示（thumbnailUrl, R11.3）
 *   - 保存済みの表示順序で描画（R7.8）
 *   - 看板指定の識別表示（R9.6 プレースホルダ。看板配置エディタ自体は Task 6.4）
 *   - エクスポート対象の選択チェック（`selectedPhotoIds`/`onToggleSelect` 指定時のみ表示。
 *     選択は閲覧操作でありreadOnlyでも操作可能, R15.6, R15.7）
 *
 * 変更はローカル未保存状態として親へ通知し、確定（メタバッチ＋順序の最大2リクエスト）は
 * 呼び出し元（ConstructionPhotoDetailPage）が担う。エクスポート対象の選択集合も
 * 呼び出し元（ConstructionPhotoDetailPage）が保持する。
 *
 * Task 12.6 追加: モバイルスタイル分岐（site-survey の PhotoManagementPanel Task 100.1 と
 * 同一パターン）。`useMediaQuery(MEDIA_QUERIES.isMobile)` でモバイル幅を判定し、
 *   - 写真＋メタデータ行を縦積み(column)化、写真列の固定320pxを解除（可変幅100%）(R19.2)
 *   - コメント入力欄フォントを16px以上にしフォーカス時自動ズームを抑止 (R19.5)
 *   - 操作系コントロール（印刷対象/エクスポート対象チェック・並替ボタン・削除ボタン・
 *     ドラッグハンドル）のタップ領域を44px以上に拡大 (R19.3)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 9.6, 11.3, 15.6, 15.7,
 *   19.2, 19.3, 19.5
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConstructionPhotoWithUrls,
  PhotoOrderItem,
  SignboardPlacement,
} from '../../types/construction-photo.types';
import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';

// ============================================================================
// 型定義
// ============================================================================

/** 写真項目メタデータの変更（コメント / 印刷対象 / 看板配置） */
export interface PhotoMetadataChange {
  comment?: string | null;
  includeInReport?: boolean;
  /** 関連付ける工事看板ID（null で解除, R9.1, R9.2） */
  signboardId?: string | null;
  /** 看板配置ジオメトリ（null でクリア, R9.5） */
  signboardPlacement?: SignboardPlacement | null;
}

export interface PhotoItemPanelProps {
  /** 写真項目一覧（署名付きサムネURL同梱） */
  photos: ConstructionPhotoWithUrls[];
  /** メタデータ（コメント/印刷対象）変更時のハンドラ（未保存状態を親で保持） */
  onPhotoMetadataChange: (photoId: string, metadata: PhotoMetadataChange) => void;
  /** 写真クリック時のハンドラ（ビューア/配置エディタ導線など） */
  onPhotoClick?: (photo: ConstructionPhotoWithUrls) => void;
  /** 順序変更時のハンドラ（ローカル状態のみ更新、保存は onSave） */
  onOrderChange?: (newOrders: PhotoOrderItem[]) => void;
  /** ローディング状態 */
  isLoading?: boolean;
  /** 読み取り専用モード */
  readOnly?: boolean;
  /** 表示順序番号を表示するか */
  showOrderNumbers?: boolean;
  /** 保存ボタンクリック時のハンドラ */
  onSave?: () => void;
  /** 未保存の変更があるか */
  isDirty?: boolean;
  /** 保存中かどうか */
  isSaving?: boolean;
  /** 写真項目削除時のハンドラ */
  onDelete?: (photoId: string) => Promise<void>;
  /** 上下移動ボタンを表示するか */
  showOrderButtons?: boolean;
  /** 「看板を配置」導線のハンドラ（対象写真項目を渡す, R9.1） */
  onAssignSignboard?: (photo: ConstructionPhotoWithUrls) => void;
  /**
   * エクスポート対象として選択済みの写真項目ID集合。
   * `onToggleSelect` と併せて指定された場合のみ選択チェックUIを表示する（R15.6）。
   */
  selectedPhotoIds?: Set<string>;
  /**
   * エクスポート対象の選択チェックのトグルハンドラ。
   * 選択は閲覧側の操作であり `readOnly` でも操作可能（R15.6, R15.7）。
   */
  onToggleSelect?: (photoId: string) => void;
}

// ============================================================================
// 定数
// ============================================================================

const MAX_COMMENT_LENGTH = 2000;
const DEBOUNCE_DELAY = 500;

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
    padding: '16px',
  } as React.CSSProperties,
  headerContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  dirtyIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#fef3c7',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#92400e',
  } as React.CSSProperties,
  saveButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
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
  panelItemDragging: {
    border: '2px dashed #6b7280',
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  panelItemDragOver: {
    border: '2px solid #10b981',
    backgroundColor: '#ecfdf5',
  } as React.CSSProperties,
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    cursor: 'grab',
    color: '#6b7280',
    borderRadius: '4px',
    flexShrink: 0,
  } as React.CSSProperties,
  orderButtonsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flexShrink: 0,
  } as React.CSSProperties,
  orderButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#6b7280',
    cursor: 'pointer',
  } as React.CSSProperties,
  orderButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#d1d5db',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  imageSection: {
    position: 'relative' as const,
    flexShrink: 0,
    width: '320px',
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
  imagePlaceholder: {
    width: '100%',
    height: '200px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // WCAG 2 AA: 背景 #f3f4f6 に対し gray-400(#9ca3af) は約2:1で不足のため
    // gray-600(#4b5563, 約6.9:1) を採用しコントラスト比4.5:1以上を満たす
    color: '#4b5563',
    fontSize: '13px',
  } as React.CSSProperties,
  orderNumber: {
    position: 'absolute' as const,
    top: '8px',
    left: '8px',
    minWidth: '32px',
    height: '32px',
    padding: '0 8px',
    borderRadius: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    zIndex: 1,
  } as React.CSSProperties,
  signboardBadge: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: '#065f46',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    zIndex: 1,
  } as React.CSSProperties,
  metadataSection: {
    flex: 1,
    minWidth: 0,
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
  actionRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  assignSignboardButton: {
    alignSelf: 'flex-start',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#065f46',
    border: '1px solid #065f46',
  } as React.CSSProperties,
  deleteButton: {
    alignSelf: 'flex-start',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #dc2626',
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
  skeleton: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
  } as React.CSSProperties,
  // 削除確認ダイアログ
  deleteDialog: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  deleteDialogOverlay: {
    position: 'absolute' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  } as React.CSSProperties,
  deleteDialogContent: {
    position: 'relative' as const,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  } as React.CSSProperties,
  deleteDialogTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '12px',
  } as React.CSSProperties,
  deleteDialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '20px',
  } as React.CSSProperties,
  deleteDialogButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  confirmDeleteButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  // ==========================================================================
  // モバイル表示最適化スタイル（Requirement 19 / Task 12.6）
  // site-survey PhotoManagementPanel（Task 100.1）と同一パターンで既存の
  // spread 合成に isMobile 分岐として合成する
  // ==========================================================================
  /** R19.2: 写真＋メタデータ行を縦積み(column)化 */
  panelItemMobile: {
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  /** R19.2: 写真列の固定320pxを解除し可変幅（100%）にする */
  imageSectionMobile: {
    width: '100%',
  } as React.CSSProperties,
  /** R19.5: コメント入力欄フォントを16px以上にしフォーカス時自動ズームを抑止 */
  textareaMobile: {
    fontSize: '16px',
  } as React.CSSProperties,
  /** R19.3: 操作系コントロールのタップ領域を44px以上に拡大 */
  checkboxMobile: {
    minWidth: '44px',
    minHeight: '44px',
  } as React.CSSProperties,
  orderButtonMobile: {
    minWidth: '44px',
    minHeight: '44px',
  } as React.CSSProperties,
  deleteButtonMobile: {
    minWidth: '44px',
    minHeight: '44px',
  } as React.CSSProperties,
  dragHandleMobile: {
    minWidth: '44px',
    minHeight: '44px',
  } as React.CSSProperties,
};

// ============================================================================
// 内部コンポーネント: 写真項目
// ============================================================================

interface PhotoItemProps {
  photo: ConstructionPhotoWithUrls;
  index: number;
  totalPhotos: number;
  showOrderNumber: boolean;
  readOnly: boolean;
  /** モバイル幅かどうか（Requirement 19 / Task 12.6） */
  isMobile: boolean;
  onMetadataChange: (photoId: string, metadata: PhotoMetadataChange) => void;
  onPhotoClick?: (photo: ConstructionPhotoWithUrls) => void;
  enableDrag: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, photoId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnter: (e: React.DragEvent<HTMLElement>, photoId: string) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>, targetId: string) => void;
  onDragEnd: () => void;
  onDeleteClick?: (photoId: string) => void;
  onMoveUp?: (photoId: string) => void;
  onMoveDown?: (photoId: string) => void;
  onAssignSignboard?: (photo: ConstructionPhotoWithUrls) => void;
  /** エクスポート対象の選択チェック状態（`onToggleSelect` 指定時のみ意味を持つ, R15.6） */
  isSelected: boolean;
  /** エクスポート対象の選択チェックのトグルハンドラ（未指定時は選択UIを表示しない） */
  onToggleSelect?: (photoId: string) => void;
}

function PhotoItem({
  photo,
  index,
  totalPhotos,
  showOrderNumber,
  readOnly,
  isMobile,
  onMetadataChange,
  onPhotoClick,
  enableDrag,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onDeleteClick,
  onMoveUp,
  onMoveDown,
  onAssignSignboard,
  isSelected,
  onToggleSelect,
}: PhotoItemProps) {
  const [comment, setComment] = useState(photo.comment ?? '');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [prevComment, setPrevComment] = useState(photo.comment);
  const [lastSavedComment, setLastSavedComment] = useState(photo.comment ?? '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 親から渡る photo.comment が変わったらローカル状態を同期（レンダリング中同期）
  if (photo.comment !== prevComment) {
    setPrevComment(photo.comment);
    const next = photo.comment ?? '';
    setComment(next);
    setLastSavedComment(next);
  }

  const checkboxId = `include-in-report-${photo.id}`;
  const exportSelectId = `export-select-${photo.id}`;
  const textareaId = `comment-${photo.id}`;
  const fileNameId = `filename-${photo.id}`;

  const handleToggleSelectChange = useCallback(() => {
    onToggleSelect?.(photo.id);
  }, [photo.id, onToggleSelect]);

  const validateComment = useCallback((value: string): boolean => {
    if (value.length > MAX_COMMENT_LENGTH) {
      setCommentError(`2000文字以内で入力してください（現在: ${value.length}文字）`);
      return false;
    }
    setCommentError(null);
    return true;
  }, []);

  const handleCommentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setComment(value);
      validateComment(value);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (value !== lastSavedComment && value.length <= MAX_COMMENT_LENGTH) {
        debounceTimerRef.current = setTimeout(() => {
          onMetadataChange(photo.id, { comment: value || null });
          setLastSavedComment(value);
        }, DEBOUNCE_DELAY);
      }
    },
    [photo.id, lastSavedComment, onMetadataChange, validateComment]
  );

  const handleCommentBlur = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (comment !== lastSavedComment && comment.length <= MAX_COMMENT_LENGTH) {
      onMetadataChange(photo.id, { comment: comment || null });
      setLastSavedComment(comment);
    }
  }, [comment, photo.id, lastSavedComment, onMetadataChange]);

  const handleIncludeInReportChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onMetadataChange(photo.id, { includeInReport: e.target.checked });
    },
    [photo.id, onMetadataChange]
  );

  const handleImageClick = useCallback(() => {
    onPhotoClick?.(photo);
  }, [photo, onPhotoClick]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const panelItemStyle: React.CSSProperties = {
    ...styles.panelItem,
    ...(isMobile ? styles.panelItemMobile : {}),
    ...(isDragging ? styles.panelItemDragging : {}),
    ...(isDragOver ? styles.panelItemDragOver : {}),
  };

  return (
    <article
      style={panelItemStyle}
      data-testid="construction-photo-item"
      data-photo-id={photo.id}
      aria-labelledby={fileNameId}
      onDragOver={enableDrag ? onDragOver : undefined}
      onDragEnter={enableDrag ? (e) => onDragEnter(e, photo.id) : undefined}
      onDragLeave={enableDrag ? onDragLeave : undefined}
      onDrop={enableDrag ? (e) => onDrop(e, photo.id) : undefined}
    >
      {/* ドラッグハンドル */}
      {enableDrag && (
        <div
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(e) => onDragStart(e, photo.id)}
          onDragEnd={onDragEnd}
          style={{
            ...styles.dragHandle,
            ...(isMobile ? styles.dragHandleMobile : {}),
          }}
          data-testid="construction-photo-drag-handle"
          aria-label="ドラッグして順序を変更"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3 4h2v2H3V4zm4 0h2v2H7V4zm4 0h2v2h-2V4zM3 7h2v2H3V7zm4 0h2v2H7V7zm4 0h2v2h-2V7zM3 10h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2z" />
          </svg>
        </div>
      )}

      {/* 上下移動ボタン */}
      {(onMoveUp || onMoveDown) && !readOnly && (
        <div style={styles.orderButtonsContainer} data-testid="order-buttons">
          <button
            type="button"
            onClick={() => onMoveUp?.(photo.id)}
            disabled={index === 0}
            style={{
              ...styles.orderButton,
              ...(isMobile ? styles.orderButtonMobile : {}),
              ...(index === 0 ? styles.orderButtonDisabled : {}),
            }}
            aria-label="上へ移動"
            title="上へ移動"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMoveDown?.(photo.id)}
            disabled={index === totalPhotos - 1}
            style={{
              ...styles.orderButton,
              ...(isMobile ? styles.orderButtonMobile : {}),
              ...(index === totalPhotos - 1 ? styles.orderButtonDisabled : {}),
            }}
            aria-label="下へ移動"
            title="下へ移動"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* 画像セクション（サムネ優先, R11.3） */}
      <div
        style={{
          ...styles.imageSection,
          ...(isMobile ? styles.imageSectionMobile : {}),
        }}
      >
        {showOrderNumber && (
          <div style={styles.orderNumber} data-testid="construction-photo-order-number">
            {index + 1}
          </div>
        )}
        {/* 看板指定の識別表示（R9.6 プレースホルダ） */}
        {photo.signboardId && (
          <span style={styles.signboardBadge} data-testid="signboard-indicator">
            看板あり
          </span>
        )}
        <button
          type="button"
          style={styles.imageButton}
          onClick={handleImageClick}
          data-testid="construction-photo-image-button"
          aria-label={`画像を拡大表示: ${photo.fileName}`}
        >
          {photo.thumbnailUrl ? (
            <img
              src={photo.thumbnailUrl}
              alt={photo.fileName}
              style={styles.image}
              loading="lazy"
            />
          ) : (
            <div style={styles.imagePlaceholder} role="img" aria-label={photo.fileName}>
              サムネイル生成中
            </div>
          )}
        </button>
      </div>

      {/* メタデータセクション */}
      <div style={styles.metadataSection}>
        <h3 id={fileNameId} style={styles.fileName}>
          {photo.fileName}
        </h3>

        {/* エクスポート対象の選択チェック（onToggleSelect指定時のみ表示, R15.6, R15.7）
            選択は閲覧側の操作のため readOnly でも操作可能とする */}
        {onToggleSelect && (
          <div style={styles.checkboxContainer}>
            <input
              type="checkbox"
              id={exportSelectId}
              checked={isSelected}
              onChange={handleToggleSelectChange}
              style={{
                ...styles.checkbox,
                ...(isMobile ? styles.checkboxMobile : {}),
              }}
              aria-label="エクスポート対象に含める"
              data-testid={`export-select-checkbox-${photo.id}`}
            />
            <label htmlFor={exportSelectId} style={styles.checkboxLabel}>
              エクスポート対象に含める
            </label>
          </div>
        )}

        {/* 印刷対象フラグ（R7.5） */}
        <div style={styles.checkboxContainer}>
          <input
            type="checkbox"
            id={checkboxId}
            checked={photo.includeInReport ?? false}
            onChange={handleIncludeInReportChange}
            disabled={readOnly}
            style={{
              ...styles.checkbox,
              ...(isMobile ? styles.checkboxMobile : {}),
            }}
            aria-label="印刷対象に含める"
          />
          <label htmlFor={checkboxId} style={styles.checkboxLabel}>
            印刷対象に含める
          </label>
        </div>

        {/* コメント入力（R7.1, R7.2） */}
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
              ...(isMobile ? styles.textareaMobile : {}),
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

        {/* アクション（看板配置 / 削除） */}
        {!readOnly && (onAssignSignboard || onDeleteClick) && (
          <div style={styles.actionRow}>
            {/* 看板を配置（R9.1, R9.5） */}
            {onAssignSignboard && (
              <button
                type="button"
                onClick={() => onAssignSignboard(photo)}
                style={styles.assignSignboardButton}
                aria-label={`看板を配置: ${photo.fileName}`}
              >
                {photo.signboardId ? '看板を変更' : '看板を配置'}
              </button>
            )}

            {/* 削除ボタン（R7.7） */}
            {onDeleteClick && (
              <button
                type="button"
                onClick={() => onDeleteClick(photo.id)}
                style={{
                  ...styles.deleteButton,
                  ...(isMobile ? styles.deleteButtonMobile : {}),
                }}
                aria-label={`写真項目を削除: ${photo.fileName}`}
              >
                削除
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工事写真 写真項目管理パネル
 */
export function PhotoItemPanel({
  photos,
  onPhotoMetadataChange,
  onPhotoClick,
  onOrderChange,
  isLoading = false,
  readOnly = false,
  showOrderNumbers = false,
  onSave,
  isDirty = false,
  isSaving = false,
  onDelete,
  showOrderButtons = true,
  onAssignSignboard,
  selectedPhotoIds,
  onToggleSelect,
}: PhotoItemPanelProps) {
  // モバイル幅判定（Requirement 19 / Task 12.6）
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // 保存済みの表示順序で描画（R7.8）
  const sortedPhotos = useMemo(
    () => [...photos].sort((a, b) => a.displayOrder - b.displayOrder),
    [photos]
  );

  const enableDrag = !!onOrderChange && !readOnly;

  const computeReorder = useCallback(
    (sourceId: string, targetIndex: number): PhotoOrderItem[] | null => {
      const sourceIndex = sortedPhotos.findIndex((p) => p.id === sourceId);
      if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= sortedPhotos.length) {
        return null;
      }
      const next = [...sortedPhotos];
      const [removed] = next.splice(sourceIndex, 1);
      if (!removed) return null;
      next.splice(targetIndex, 0, removed);
      return next.map((p, i) => ({ id: p.id, order: i + 1 }));
    },
    [sortedPhotos]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, photoId: string) => {
      if (!enableDrag) return;
      e.dataTransfer.setData('text/plain', photoId);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(photoId);
    },
    [enableDrag]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLElement>, photoId: string) => {
      e.preventDefault();
      if (draggingId && draggingId !== photoId) {
        setDragOverId(photoId);
      }
    },
    [draggingId]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain');
      setDraggingId(null);
      setDragOverId(null);
      if (!sourceId || sourceId === targetId) return;
      const targetIndex = sortedPhotos.findIndex((p) => p.id === targetId);
      const newOrders = computeReorder(sourceId, targetIndex);
      if (newOrders && onOrderChange) {
        onOrderChange(newOrders);
      }
    },
    [sortedPhotos, computeReorder, onOrderChange]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleMoveUp = useCallback(
    (photoId: string) => {
      const currentIndex = sortedPhotos.findIndex((p) => p.id === photoId);
      const newOrders = computeReorder(photoId, currentIndex - 1);
      if (newOrders && onOrderChange) {
        onOrderChange(newOrders);
      }
    },
    [sortedPhotos, computeReorder, onOrderChange]
  );

  const handleMoveDown = useCallback(
    (photoId: string) => {
      const currentIndex = sortedPhotos.findIndex((p) => p.id === photoId);
      const newOrders = computeReorder(photoId, currentIndex + 1);
      if (newOrders && onOrderChange) {
        onOrderChange(newOrders);
      }
    },
    [sortedPhotos, computeReorder, onOrderChange]
  );

  const handleDeleteClick = useCallback((photoId: string) => {
    setDeleteTargetId(photoId);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTargetId(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetId || !onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteTargetId);
      setDeleteTargetId(null);
    } catch {
      // エラーは呼び出し元で処理
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetId, onDelete]);

  const deleteTargetPhoto = deleteTargetId ? photos.find((p) => p.id === deleteTargetId) : null;

  // ローディング（スケルトン）
  if (isLoading && photos.length === 0) {
    return (
      <section
        style={styles.container}
        role="region"
        aria-label="写真項目管理パネル"
        aria-busy="true"
      >
        <div style={styles.panelList}>
          {[0, 1, 2].map((i) => (
            <div
              key={`skeleton-${i}`}
              style={styles.skeleton}
              data-testid="construction-photo-skeleton"
            />
          ))}
        </div>
      </section>
    );
  }

  // 空状態
  if (photos.length === 0) {
    return (
      <section style={styles.container} role="region" aria-label="写真項目管理パネル">
        <div style={styles.emptyState}>
          <p>写真項目がありません</p>
        </div>
      </section>
    );
  }

  const showSaveButton = !!onSave && !readOnly;

  return (
    <section style={styles.container} role="region" aria-label="写真項目管理パネル">
      {/* 手動保存ヘッダ（R7.6） */}
      {showSaveButton && (
        <div style={styles.headerContainer}>
          <div>
            {isDirty && (
              <div style={styles.dirtyIndicator} data-testid="dirty-indicator">
                <span>未保存の変更があります</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || isSaving}
            style={{
              ...styles.saveButton,
              ...(!isDirty || isSaving ? styles.saveButtonDisabled : {}),
            }}
            aria-busy={isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      )}

      <div style={styles.panelList}>
        {sortedPhotos.map((photo, index) => (
          <PhotoItem
            key={photo.id}
            photo={photo}
            index={index}
            totalPhotos={sortedPhotos.length}
            showOrderNumber={showOrderNumbers}
            readOnly={readOnly}
            isMobile={isMobile}
            onMetadataChange={onPhotoMetadataChange}
            onPhotoClick={onPhotoClick}
            enableDrag={enableDrag}
            isDragging={draggingId === photo.id}
            isDragOver={dragOverId === photo.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onDeleteClick={onDelete ? handleDeleteClick : undefined}
            onMoveUp={showOrderButtons && onOrderChange ? handleMoveUp : undefined}
            onMoveDown={showOrderButtons && onOrderChange ? handleMoveDown : undefined}
            onAssignSignboard={onAssignSignboard}
            isSelected={selectedPhotoIds?.has(photo.id) ?? false}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>

      {/* 削除確認ダイアログ（R7.7） */}
      {deleteTargetId && (
        <div
          style={styles.deleteDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cp-delete-dialog-title"
        >
          <div style={styles.deleteDialogOverlay} onClick={handleDeleteCancel} aria-hidden="true" />
          <div style={styles.deleteDialogContent}>
            <h2 id="cp-delete-dialog-title" style={styles.deleteDialogTitle}>
              写真項目を削除
            </h2>
            <p style={styles.deleteDialogMessage}>
              「{deleteTargetPhoto?.fileName}
              」を削除しますか？関連する看板配置データも削除されます。
            </p>
            <div style={styles.deleteDialogButtons}>
              <button
                type="button"
                onClick={handleDeleteCancel}
                style={styles.cancelButton}
                disabled={isDeleting}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                style={styles.confirmDeleteButton}
                disabled={isDeleting}
              >
                {isDeleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default PhotoItemPanel;
