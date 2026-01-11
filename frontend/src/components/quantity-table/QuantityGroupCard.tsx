/**
 * @fileoverview 数量グループカードコンポーネント
 *
 * Task 5.2: 数量グループコンポーネントを実装する
 *
 * Requirements:
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.3: 数量グループ内で写真選択操作を行う
 * - 4.5: 数量グループの削除操作を行う
 */

import { useState, useCallback } from 'react';
import type { QuantityGroupDetail, QuantityItemDetail } from '../../types/quantity-table.types';
import QuantityItemRow from './QuantityItemRow';
import EditableQuantityItemRow from './EditableQuantityItemRow';

// ============================================================================
// 型定義
// ============================================================================

/**
 * QuantityGroupCardコンポーネントのProps
 */
export interface QuantityGroupCardProps {
  /** グループデータ */
  group: QuantityGroupDetail;
  /** グループの表示名 */
  groupDisplayName: string;
  /** 初期展開状態 */
  initialExpanded?: boolean;
  /** 編集モード（trueの場合EditableQuantityItemRowを使用） */
  isEditable?: boolean;
  /** 項目追加コールバック */
  onAddItem?: (groupId: string) => void;
  /** グループ削除コールバック */
  onDeleteGroup?: (groupId: string) => void;
  /** 画像選択コールバック */
  onSelectImage?: (groupId: string) => void;
  /** 項目更新コールバック */
  onUpdateItem?: (itemId: string, updates: Partial<QuantityItemDetail>) => void;
  /** 項目削除コールバック */
  onDeleteItem?: (itemId: string) => void;
  /** 項目コピーコールバック */
  onCopyItem?: (itemId: string) => void;
  /** 項目移動コールバック（REQ-6.3） */
  onMoveItem?: (itemId: string, direction: 'up' | 'down') => void;
  /** 注釈ビューアを開くコールバック（REQ-4.4） */
  onOpenAnnotationViewer?: (groupId: string) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  toggleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#4b5563',
    transition: 'background-color 0.2s, transform 0.2s',
  } as React.CSSProperties,
  toggleButtonCollapsed: {
    transform: 'rotate(-90deg)',
  } as React.CSSProperties,
  thumbnailWrapper: {
    width: '80px',
    height: '60px',
    borderRadius: '6px',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  thumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  } as React.CSSProperties,
  placeholderIcon: {
    color: '#4b5563',
  } as React.CSSProperties,
  headerInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  groupName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
  } as React.CSSProperties,
  groupMeta: {
    fontSize: '12px',
    color: '#4b5563',
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  } as React.CSSProperties,
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  deleteButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '4px',
    border: '1px solid #fecaca',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  content: {
    padding: '0',
    transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
    overflow: 'hidden',
  } as React.CSSProperties,
  contentCollapsed: {
    maxHeight: '0',
    opacity: 0,
    visibility: 'hidden' as const,
    padding: '0',
  } as React.CSSProperties,
  contentExpanded: {
    maxHeight: '2000px',
    opacity: 1,
  } as React.CSSProperties,
  itemList: {
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  emptyState: {
    padding: '32px',
    textAlign: 'center' as const,
    color: '#4b5563',
    fontSize: '14px',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 展開/折りたたみアイコン
 */
function ChevronIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * プラスアイコン
 */
function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * ゴミ箱アイコン
 */
function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/**
 * 画像プレースホルダーアイコン
 */
function ImagePlaceholderIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量グループカード
 *
 * グループヘッダー（名前、サムネイル、アクションボタン）と
 * 項目一覧を表示するアコーディオンコンポーネント。
 */
export default function QuantityGroupCard({
  group,
  groupDisplayName,
  initialExpanded = true,
  isEditable = false,
  onAddItem,
  onDeleteGroup,
  onSelectImage,
  onUpdateItem,
  onDeleteItem,
  onCopyItem,
  onMoveItem,
  onOpenAnnotationViewer,
}: QuantityGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const hasAnnotations = group.surveyImage?.hasAnnotations ?? false;

  /**
   * 展開/折りたたみを切り替え
   */
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  /**
   * 項目追加ハンドラ
   */
  const handleAddItem = useCallback(() => {
    onAddItem?.(group.id);
  }, [group.id, onAddItem]);

  /**
   * グループ削除ハンドラ
   */
  const handleDeleteGroup = useCallback(() => {
    onDeleteGroup?.(group.id);
  }, [group.id, onDeleteGroup]);

  /**
   * 画像選択/変更ハンドラ
   */
  const handleImageClick = useCallback(() => {
    // 画像が既に紐付けられている場合は注釈ビューアを開く（REQ-4.4）
    if (group.surveyImage) {
      onOpenAnnotationViewer?.(group.id);
    } else {
      // 画像がない場合は選択ダイアログを開く
      onSelectImage?.(group.id);
    }
  }, [group.id, group.surveyImage, onSelectImage, onOpenAnnotationViewer]);

  const items = group.items ?? [];

  return (
    <article style={styles.card}>
      {/* ヘッダー */}
      <div style={styles.header}>
        {/* 展開/折りたたみボタン */}
        <button
          type="button"
          style={{
            ...styles.toggleButton,
            ...(isExpanded ? {} : styles.toggleButtonCollapsed),
          }}
          onClick={handleToggle}
          aria-label={isExpanded ? 'グループを折りたたむ' : 'グループを展開'}
          aria-expanded={isExpanded}
        >
          <ChevronIcon />
        </button>

        {/* サムネイル / プレースホルダー */}
        <div
          style={{ ...styles.thumbnailWrapper, position: 'relative' as const }}
          onClick={handleImageClick}
          role="button"
          tabIndex={0}
          aria-label={group.surveyImage ? '紐付け画像を表示' : '写真を選択'}
          data-testid={group.surveyImage ? undefined : `image-placeholder-${group.id}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleImageClick();
            }
          }}
        >
          {group.surveyImage ? (
            <>
              <img
                src={group.surveyImage.thumbnailUrl}
                alt={group.surveyImage.fileName}
                style={styles.thumbnail}
              />
              {/* 注釈オーバーレイ（REQ-4.4） */}
              {hasAnnotations && (
                <div
                  data-testid={`annotation-overlay-${group.id}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderRadius: '6px',
                  }}
                />
              )}
              {/* 注釈バッジ（REQ-3.3） */}
              {hasAnnotations && (
                <span
                  data-testid={`annotation-badge-${group.id}`}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    minWidth: '16px',
                    textAlign: 'center',
                  }}
                >
                  注
                </span>
              )}
            </>
          ) : (
            <div style={styles.placeholderIcon}>
              <ImagePlaceholderIcon />
            </div>
          )}
        </div>

        {/* グループ情報 */}
        <div style={styles.headerInfo}>
          <h3 style={styles.groupName}>{groupDisplayName}</h3>
          <p style={styles.groupMeta}>{group.itemCount}項目</p>
        </div>

        {/* アクションボタン */}
        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.actionButton}
            onClick={handleAddItem}
            aria-label="項目を追加"
          >
            <PlusIcon />
            項目を追加
          </button>
          <button
            type="button"
            style={styles.deleteButton}
            onClick={handleDeleteGroup}
            aria-label="グループを削除"
          >
            <TrashIcon />
            グループを削除
          </button>
        </div>
      </div>

      {/* コンテンツ（項目一覧） */}
      <div
        style={{
          ...styles.content,
          ...(isExpanded ? styles.contentExpanded : styles.contentCollapsed),
        }}
      >
        {items.length === 0 ? (
          <div style={styles.emptyState}>項目がありません</div>
        ) : (
          <div style={styles.itemList} role="table" aria-label="数量項目一覧">
            <div role="rowgroup">
              {items.map((item, index) =>
                isEditable ? (
                  <EditableQuantityItemRow
                    key={item.id}
                    item={item}
                    onUpdate={onUpdateItem}
                    onDelete={onDeleteItem}
                    onCopy={onCopyItem}
                    onMoveUp={(itemId) => onMoveItem?.(itemId, 'up')}
                    onMoveDown={(itemId) => onMoveItem?.(itemId, 'down')}
                    canMoveUp={index > 0}
                    canMoveDown={index < items.length - 1}
                  />
                ) : (
                  <QuantityItemRow
                    key={item.id}
                    item={item}
                    onUpdate={onUpdateItem}
                    onDelete={onDeleteItem}
                  />
                )
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
