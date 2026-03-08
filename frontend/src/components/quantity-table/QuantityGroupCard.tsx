/**
 * @fileoverview 数量グループカードコンポーネント
 *
 * Task 5.2: 数量グループコンポーネントを実装する
 * Task 33.1: 数量グループカードに注釈付き写真表示と写真関連ダイアログを統合する
 *
 * Requirements:
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 * - 3.4: グループ折りたたみ時に写真も非表示
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.3: 数量グループ内で写真選択操作を行う
 * - 4.5: 数量グループの削除操作を行う
 * - 19.1: 写真変更ダイアログ表示
 * - 20.1: 写真プレビューダイアログ表示
 * - 21.2: コメントを写真の右側に表示
 * - 21.5: 折りたたみ時にコメント非表示
 * - 22.1: グループ名クリック時に編集モードに遷移
 * - 22.2: 編集確定時に即座に反映
 * - 22.3: 空白名前でのエラーメッセージ表示
 * - 22.4: グループ名の最大文字数（全角25文字/半角50文字）
 * - 22.5: 最大文字数超過入力防止
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { calculateStringWidth } from '../../utils/field-validation';
import type { QuantityGroupDetail, QuantityItemDetail } from '../../types/quantity-table.types';
import type { AutocompleteFieldName } from '../../hooks/useAutocompleteCandidateStore';
import QuantityItemRow from './QuantityItemRow';
import EditableQuantityItemRow from './EditableQuantityItemRow';
import QuantityGroupTitleRow from './QuantityGroupTitleRow';
import SortOrderButtons from './SortOrderButtons';
import { AnnotatedImageThumbnail } from '../site-surveys/AnnotatedImageThumbnail';
import PhotoCommentDisplay from './PhotoCommentDisplay';
import PhotoPreviewDialog from './PhotoPreviewDialog';

// デフォルトのオートコンプリート関数（isEditable=false時のフォールバック）
const defaultGetSuggestions = () => [] as string[];
const defaultOnBlurAddCandidate = () => {};

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
  /** オートコンプリート候補取得関数（Task 18.1: isEditable時に必須） */
  getSuggestions?: (field: AutocompleteFieldName, inputText: string) => string[];
  /** オートコンプリートblur時候補追加関数（Task 18.1: isEditable時に必須） */
  onBlurAddCandidate?: (field: AutocompleteFieldName, value: string) => void;
  /** グループ名変更コールバック（Task 35.1: REQ-22.1, 22.2） */
  onRenameGroup?: (groupId: string, newName: string) => void;
  /** グループのインデックス（並び順ボタン用、Task 37.1） */
  groupIndex?: number;
  /** グループの総数（並び順ボタン用、Task 37.1） */
  groupTotalCount?: number;
  /** グループを上に移動するコールバック（Task 37.1） */
  onMoveGroupUp?: (groupId: string) => void;
  /** グループを下に移動するコールバック（Task 37.1） */
  onMoveGroupDown?: (groupId: string) => void;
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
    width: '640px',
    height: '480px',
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
  thumbnailWrapperSmall: {
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
    overflowX: 'auto',
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
  addItemButtonWrapper: {
    padding: '16px',
    borderTop: '1px solid #e5e7eb',
  } as React.CSSProperties,
  addItemButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    border: '1px dashed #d1d5db',
    backgroundColor: '#f9fafb',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
  } as React.CSSProperties,
  // Phase 9: 写真エリアとコメント表示のレイアウト
  photoArea: {
    display: 'flex',
    gap: '12px',
    margin: '16px',
    alignItems: 'flex-start',
  } as React.CSSProperties,
  photoChangeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 500,
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '4px',
  } as React.CSSProperties,
  // Task 35.1: グループ名インライン編集用スタイル
  groupNameEditable: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
    cursor: 'pointer',
  } as React.CSSProperties,
  groupNameInput: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
    padding: '2px 6px',
    border: '1px solid #2563eb',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    width: '100%',
    maxWidth: '300px',
    outline: 'none',
  } as React.CSSProperties,
  groupNameError: {
    fontSize: '11px',
    color: '#dc2626',
    margin: '2px 0 0 0',
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
/** グループ名の最大文字幅（全角25文字/半角50文字） */
const GROUP_NAME_MAX_WIDTH = 50;

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
  onOpenAnnotationViewer: _onOpenAnnotationViewer,
  getSuggestions,
  onBlurAddCandidate,
  onRenameGroup,
  groupIndex,
  groupTotalCount,
  onMoveGroupUp,
  onMoveGroupDown,
}: QuantityGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const hasAnnotations = group.surveyImage?.hasAnnotations ?? false;

  // Task 35.1: インライン編集ステート
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(groupDisplayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

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
   * 画像クリックハンドラ（REQ-20.1: 写真プレビューダイアログを開く）
   */
  const handleImageClick = useCallback(() => {
    if (group.surveyImage) {
      // 画像が紐付けられている場合はプレビューダイアログを開く
      setIsPreviewOpen(true);
    } else {
      // 画像がない場合は選択ダイアログを開く
      onSelectImage?.(group.id);
    }
  }, [group.id, group.surveyImage, onSelectImage]);

  /**
   * 写真プレビューダイアログを閉じる
   */
  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  /**
   * 写真変更ボタンハンドラ（REQ-19.1: 写真変更ダイアログを開く）
   */
  const handleChangePhoto = useCallback(() => {
    onSelectImage?.(group.id);
  }, [group.id, onSelectImage]);

  // =========================================================================
  // Task 35.1: グループ名インライン編集ハンドラ
  // =========================================================================

  /**
   * グループ名クリック -> 編集モード開始（REQ-22.1）
   */
  const handleNameClick = useCallback(() => {
    if (!isEditable || !onRenameGroup) return;
    setEditNameValue(groupDisplayName);
    setNameError(null);
    setIsEditingName(true);
  }, [isEditable, onRenameGroup, groupDisplayName]);

  /**
   * 編集モード開始時にinputにフォーカスを当てる
   */
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  /**
   * グループ名の変更を確定する（REQ-22.2）
   */
  const handleNameConfirm = useCallback(() => {
    const trimmed = editNameValue.trim();
    // 空白チェック（REQ-22.3）
    if (!trimmed) {
      setNameError('グループ名を入力してください');
      return;
    }
    // 変更なしの場合はAPIを呼ばない
    if (trimmed === groupDisplayName) {
      setIsEditingName(false);
      setNameError(null);
      return;
    }
    onRenameGroup?.(group.id, trimmed);
    setIsEditingName(false);
    setNameError(null);
  }, [editNameValue, groupDisplayName, group.id, onRenameGroup]);

  /**
   * 編集キャンセル（Escapeキー）
   */
  const handleNameCancel = useCallback(() => {
    setIsEditingName(false);
    setEditNameValue(groupDisplayName);
    setNameError(null);
  }, [groupDisplayName]);

  /**
   * キー操作ハンドラ
   */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNameConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleNameCancel();
      }
    },
    [handleNameConfirm, handleNameCancel]
  );

  /**
   * グループ名入力変更ハンドラ（REQ-22.4, 22.5: 最大文字数制限）
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const width = calculateStringWidth(newValue);
    // 最大文字数を超えない場合のみ更新（REQ-22.5）
    if (width <= GROUP_NAME_MAX_WIDTH) {
      setEditNameValue(newValue);
      setNameError(null);
    }
  }, []);

  /**
   * blurイベントで確定
   */
  const handleNameBlur = useCallback(() => {
    handleNameConfirm();
  }, [handleNameConfirm]);

  const items = group.items ?? [];

  return (
    <article style={styles.card} data-testid="quantity-group-card">
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

        {/* グループ情報 */}
        <div style={styles.headerInfo}>
          {isEditingName ? (
            <div>
              <input
                ref={nameInputRef}
                type="text"
                value={editNameValue}
                onChange={handleNameChange}
                onKeyDown={handleNameKeyDown}
                onBlur={handleNameBlur}
                style={styles.groupNameInput}
                aria-label="グループ名を編集"
              />
              {nameError && <p style={styles.groupNameError}>{nameError}</p>}
            </div>
          ) : (
            <h3
              style={isEditable && onRenameGroup ? styles.groupNameEditable : styles.groupName}
              onClick={handleNameClick}
              role={isEditable && onRenameGroup ? 'button' : undefined}
              tabIndex={isEditable && onRenameGroup ? 0 : undefined}
              onKeyDown={
                isEditable && onRenameGroup
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNameClick();
                      }
                    }
                  : undefined
              }
            >
              {groupDisplayName}
            </h3>
          )}
          <p style={styles.groupMeta}>{group.itemCount}項目</p>
        </div>

        {/* 並び順変更ボタン（Task 37.1: REQ-23.3, 23.4） */}
        {isEditable &&
          onMoveGroupUp &&
          onMoveGroupDown &&
          groupIndex !== undefined &&
          groupTotalCount !== undefined && (
            <SortOrderButtons
              currentIndex={groupIndex}
              totalCount={groupTotalCount}
              onMoveUp={() => onMoveGroupUp(group.id)}
              onMoveDown={() => onMoveGroupDown(group.id)}
            />
          )}

        {/* アクションボタン */}
        <div style={styles.headerActions}>
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

      {/* コンテンツ（画像・項目一覧） REQ-3.4: グループ折りたたみ時に画像も非表示 */}
      <div
        style={{
          ...styles.content,
          ...(isExpanded ? styles.contentExpanded : styles.contentCollapsed),
        }}
      >
        {/* 関連画像 / プレースホルダー + コメント表示（REQ-3.3, 21.2, 21.5） */}
        {group.surveyImage ? (
          <div style={styles.photoArea}>
            <div style={{ display: 'flex', flexDirection: 'column' as const }}>
              <div
                style={{
                  ...styles.thumbnailWrapper,
                  position: 'relative' as const,
                }}
                onClick={handleImageClick}
                role="button"
                tabIndex={0}
                aria-label="紐付け画像を表示"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleImageClick();
                  }
                }}
              >
                <AnnotatedImageThumbnail
                  image={{
                    id: group.surveyImage.id,
                    originalUrl: group.surveyImage.originalUrl,
                  }}
                  alt={group.surveyImage.fileName}
                  style={styles.thumbnail}
                />
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
              </div>
              {/* 写真変更ボタン（REQ-19.1） */}
              <button
                type="button"
                style={styles.photoChangeButton}
                onClick={handleChangePhoto}
                aria-label="写真を変更"
              >
                写真を変更
              </button>
            </div>
            {/* 写真コメント表示（REQ-21.2） */}
            <PhotoCommentDisplay comment={group.surveyImage.comment ?? null} />
          </div>
        ) : (
          <div
            style={{
              ...styles.thumbnailWrapperSmall,
              position: 'relative' as const,
              margin: '16px',
            }}
            onClick={handleImageClick}
            role="button"
            tabIndex={0}
            aria-label="写真を選択"
            data-testid={`image-placeholder-${group.id}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleImageClick();
              }
            }}
          >
            <div style={styles.placeholderIcon}>
              <ImagePlaceholderIcon />
            </div>
          </div>
        )}

        {/* 写真プレビューダイアログ（REQ-20.1, 20.2, 20.3） */}
        {group.surveyImage && (
          <PhotoPreviewDialog
            isOpen={isPreviewOpen}
            onClose={handleClosePreview}
            image={group.surveyImage}
          />
        )}

        {items.length === 0 ? (
          <div style={styles.emptyState}>項目がありません</div>
        ) : (
          <div style={styles.itemList} role="table" aria-label="数量項目一覧">
            {/* REQ-18.1: メインタイトル行をグループ先頭にのみ表示 */}
            <QuantityGroupTitleRow isEditable={isEditable} />
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
                    getSuggestions={getSuggestions || defaultGetSuggestions}
                    onBlurAddCandidate={onBlurAddCandidate || defaultOnBlurAddCandidate}
                    showFieldLabels={false}
                    itemIndex={index}
                    itemTotalCount={items.length}
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

        {/* 項目追加ボタン（グループコンテンツ内の最終行） */}
        <div style={styles.addItemButtonWrapper}>
          <button
            type="button"
            style={styles.addItemButton}
            onClick={handleAddItem}
            aria-label="項目を追加"
          >
            <PlusIcon />
            項目を追加
          </button>
        </div>
      </div>
    </article>
  );
}
