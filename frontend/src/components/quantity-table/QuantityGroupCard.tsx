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
  /** 写真の紐付け解除コールバック（Task 90.2: REQ-42.3）
   *  - 指定時、写真が紐付いているグループにのみ解除ボタンが表示される
   *  - 親の現場調査が論理削除された写真は選択候補に現れず「変更」では復旧できないため、
   *    解除が当該グループを含む数量表を保存できる状態へ戻す唯一の操作である
   */
  onUnlinkImage?: (groupId: string) => void;
  /** 項目更新コールバック */
  onUpdateItem?: (itemId: string, updates: Partial<QuantityItemDetail>) => void;
  /** 項目削除コールバック */
  onDeleteItem?: (itemId: string) => void;
  /** 項目コピーコールバック */
  onCopyItem?: (itemId: string) => void;
  /** 項目移動コールバック（REQ-6.3） */
  onMoveItem?: (itemId: string, direction: 'up' | 'down') => void;
  /** 別の数量グループへの移動を開始するコールバック（REQ-6.2, 6.4） */
  onMoveItemToGroup?: (itemId: string) => void;
  /** 一括操作の対象として選択中の項目ID一覧（REQ-6.5） */
  selectedItemIds?: string[];
  /** 一括操作の選択状態変更コールバック（REQ-6.5） */
  onItemSelectionChange?: (itemId: string, selected: boolean) => void;
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
  /** グループコピーコールバック（Task 53.2: REQ-38.1, 38.12）
   *  - 指定時、表題部の並替ボタンと削除ボタンの間にコピーボタンが表示される
   *  - クリック時、groupId を引数に呼び出される
   */
  onCopyGroup?: (groupId: string) => void;
  /** コピー処理中フラグ（Task 53.2: REQ-38.9）
   *  - true の間はコピーボタンを disabled にしスピナーを表示し、重複押下を防止する
   *  - 親コンポーネント（QuantityTableEditPage）がステートを保持する（Task 53.3 で配線）
   */
  isCopying?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    // Task 58.1 (REQ-41): 水平スクロールはカード全体ではなく数量項目テーブル部分の
    // ラッパー（itemTableWrapper）に限定する。カード全体に overflowX を掛けると
    // 画像・コメント（photoArea）もテーブルと同じスクロールコンテナに入り、右へ
    // スクロールすると一緒に左へ流れて消えてしまうため撤去した。
    // 縦方向は従来どおりクリップし、角丸クリップとレイアウトを維持する。
    overflowY: 'hidden' as const,
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
  // Task 53.2: コピーボタン（中立色 / 削除ボタンの赤系と視覚的に区別、REQ-38.1, 38.12）
  copyButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '4px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  // Task 53.2: コピー処理中の disabled スタイル（REQ-38.9）
  copyButtonDisabled: {
    cursor: 'not-allowed',
    opacity: 0.6,
  } as React.CSSProperties,
  // Task 53.2: スピナー（円弧 SVG を CSS アニメーションで回転）
  copyButtonSpinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    animation: 'quantity-group-card-spin 0.8s linear infinite',
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
    overflow: 'visible',
    // Task 58.1 (REQ-41): photoArea（固定）と itemTableWrapper（水平スクロール）を
    // 縦並びに配置するため flex column に再構成する。
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  // Task 58.1 (REQ-41): 数量項目テーブル部分のみを水平スクロール対象にするラッパー。
  // 列幅合計（QUANTITY_ITEM_GRID_COLUMNS、REQ-37 計算用フィールド含む）がビューポートを
  // 超えてもテーブルだけが水平スクロールし、画像・コメントは固定表示される。
  itemTableWrapper: {
    overflowX: 'auto' as const,
    // Task 58.2 (REQ-41.4): 垂直スクロール（REQ-25）をページ側のスクロールコンテナに
    // 委ね、テーブルラッパー内でネストした縦スクロールバーが発生しないようにする。
    // CSS 仕様上、片軸が overflow-x:'auto' で他軸が visible（既定）の場合は overflow-y が
    // 暗黙的に 'auto' へ昇格しネストした縦スクロールが生じうるため、明示的に縦方向を
    // クリップ宣言する。テーブル行に固定高さはなく内容がそのまま伸長するため、縦方向に
    // クリップされるコンテンツはなく（縦の伸長はカード高さを押し広げてページ側へ委譲）、
    // 水平スクロールのみを itemTableWrapper に限定できる。
    overflowY: 'hidden' as const,
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
 * コピーアイコン（Task 53.2: REQ-38.1）
 * 中立色（currentColor）の重なった四角形 SVG（Lucide Copy 風）
 */
function CopyIcon() {
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
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/**
 * スピナーアイコン（Task 53.2: REQ-38.9）
 * 円弧の SVG（CSS animation で回転）。クラス名による干渉を避けるため
 * 親要素側で animation を制御する。
 */
function SpinnerIcon() {
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
      aria-hidden="true"
      data-testid="copy-group-spinner"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
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
  onUnlinkImage,
  onUpdateItem,
  onDeleteItem,
  onCopyItem,
  onMoveItem,
  onMoveItemToGroup,
  selectedItemIds,
  onItemSelectionChange,
  onOpenAnnotationViewer: _onOpenAnnotationViewer,
  getSuggestions,
  onBlurAddCandidate,
  onRenameGroup,
  groupIndex,
  groupTotalCount,
  onMoveGroupUp,
  onMoveGroupDown,
  onCopyGroup,
  isCopying = false,
}: QuantityGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const hasAnnotations = group.surveyImage?.hasAnnotations ?? false;
  // 注釈の目印は「描画された注釈の有無」で判定する（site-survey Task 115.13、要件20.2）。
  // hasAnnotations は注釈レコードの存在から導出されるため、回転のみを保存した写真でも
  // 真になり、目印の判定には使えない。
  const hasDrawnAnnotations = group.surveyImage?.hasDrawnAnnotations ?? false;

  // Task 35.1: インライン編集ステート
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(groupDisplayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  /**
   * IME 変換中かどうか（変換中は幅の判定を行わない: Task 115.34、REQ-22.5）
   *
   * 記録の寿命は「一回の焦点セッション」とする（Task 115.42）。この編集欄では
   * 変換の確定（compositionend）または焦点喪失（handleNameBlur）で終了させる。
   * 焦点喪失側だけで全ての焦点セッションの開始前に初期化された状態を保証できるため、
   * 編集開始時の初期化は置かない（Task 115.44）。
   */
  const isNameComposingRef = useRef(false);
  /**
   * 幅の判定を通した直前の値（判定を経ていない値が確定されそうな場合の戻り先）
   *
   * 編集を開始した時点と変換を開始した時点で更新する。編集開始時にも更新するのは、
   * 変換を一度も行っていない編集で焦点を失った場合の戻り先を持たせるため（Task 115.40）。
   */
  const preCompositionNameRef = useRef(groupDisplayName);

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
   * グループコピーハンドラ（Task 53.2: REQ-38.1, 38.9）
   * - isCopying 中は重複押下を防止する（disabled 時は onClick が発火しないが、
   *   防御的に early return も入れる）
   */
  const handleCopyGroup = useCallback(() => {
    if (isCopying) return;
    onCopyGroup?.(group.id);
  }, [group.id, isCopying, onCopyGroup]);

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

  /**
   * 写真の紐付け解除ボタンハンドラ（Task 90.2: REQ-42.3）
   *
   * 解除はドラフトにのみ反映される（永続化は保存操作時の1回に畳まれる）。
   */
  const handleUnlinkPhoto = useCallback(() => {
    onUnlinkImage?.(group.id);
  }, [group.id, onUnlinkImage]);

  // =========================================================================
  // Task 35.1: グループ名インライン編集ハンドラ
  // =========================================================================

  /**
   * グループ名クリック -> 編集モード開始（REQ-22.1）
   */
  const handleNameClick = useCallback(() => {
    if (!isEditable || !onRenameGroup) return;
    // 変換中の記録はここでは初期化しない（Task 115.44）。編集開始時の初期化は
    // 焦点喪失時の終了（handleNameBlur）に完全に含まれる。編集欄は焦点喪失後も
    // 残りうる（空欄で確定できない場合）ため、全ての焦点セッションを覆えるのは
    // 焦点喪失側だけであり、編集開始側は一度も単独では効かない。
    // 幅の判定を通った戻り先を編集開始時の値で初期化する（Task 115.40）
    preCompositionNameRef.current = groupDisplayName;
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
  const confirmNameValue = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.trim();
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
    },
    [groupDisplayName, group.id, onRenameGroup]
  );

  const handleNameConfirm = useCallback(() => {
    confirmNameValue(editNameValue);
  }, [confirmNameValue, editNameValue]);

  /**
   * 編集キャンセル（Escapeキー）
   */
  const handleNameCancel = useCallback(() => {
    setIsEditingName(false);
    setEditNameValue(groupDisplayName);
    setNameError(null);
  }, [groupDisplayName]);

  /**
   * このキー操作が日本語入力（IME）の変換中のものかを判定する（Task 115.34、REQ-22.5）
   *
   * 変換中の Enter は「変換の確定」、Escape は「変換の取り消し」であって、
   * 名前編集の確定・取り消しではない。変換中は幅の判定を行わない（上限を超えた読みを
   * 保持する）ため、変換中の Enter をそのまま確定へ通すと上限超過の名前が確定してしまう。
   *
   * 変換中の現れ方はブラウザ・IME によって異なるため、複数の手掛かりを併用する:
   * - compositionstart/compositionend で自前に追跡した状態（isNameComposingRef）
   * - KeyboardEvent.isComposing（標準。keydown が compositionend より先に届く環境で有効）
   * - keyCode === 229（IME 変換中を示す旧来の値。compositionend が keydown より先に
   *   届く環境や isComposing を提供しない環境で唯一の手掛かりとなる）
   */
  const isNameKeyEventComposing = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = e.nativeEvent as KeyboardEvent;
    return (
      isNameComposingRef.current ||
      nativeEvent.isComposing === true ||
      e.keyCode === 229 ||
      nativeEvent.keyCode === 229
    );
  }, []);

  /**
   * キー操作ハンドラ
   */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // 変換中のキーは IME のもの。確定も取り消しも行わず IME に委ねる
      // （preventDefault もしない。ここで抑止すると変換操作そのものを妨げるため）
      if (isNameKeyEventComposing(e)) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        handleNameConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleNameCancel();
      }
    },
    [handleNameConfirm, handleNameCancel, isNameKeyEventComposing]
  );

  /**
   * 入力を受け付けてよいかを判定する。
   *
   * 上限以内なら受け付ける。上限を超える場合は原則拒否するが、
   * 現在値が既に上限を超えている（幅の検証を持たない経路で作られた既存データ等）ときに
   * 編集不能とならないよう、値が短くなる編集だけは受け付ける。
   */
  const acceptsNameWidth = useCallback((nextValue: string, baseValue: string) => {
    const nextWidth = calculateStringWidth(nextValue);
    return nextWidth <= GROUP_NAME_MAX_WIDTH || nextWidth < calculateStringWidth(baseValue);
  }, []);

  /**
   * グループ名入力変更ハンドラ（REQ-22.4, 22.5: 最大文字数制限）
   *
   * 日本語入力（IME）の変換中は判定を行わずそのまま通す。変換中の読みは確定語より
   * 長くなることがあり、この段階で拒否すると変換が中断されて上限以内の正当な名前を
   * 確定できなくなるため。判定は確定時（compositionend）に行う。
   */
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      // 変換中は幅を判定しない（compositionend で確定値を判定する）
      const nativeIsComposing = (e.nativeEvent as InputEvent).isComposing === true;
      if (isNameComposingRef.current || nativeIsComposing) {
        setEditNameValue(newValue);
        setNameError(null);
        return;
      }

      // 上限を超える入力は状態へ反映しない（＝controlled input の表示も直前の値のまま
      // 戻る）。DOM を直接書き換えないためカーソル位置も保たれる。
      if (!acceptsNameWidth(newValue, editNameValue)) {
        return;
      }

      setEditNameValue(newValue);
      setNameError(null);
    },
    [acceptsNameWidth, editNameValue]
  );

  /**
   * 変換開始ハンドラ。戻り先となる直前の確定値を控える。
   */
  const handleNameCompositionStart = useCallback(() => {
    isNameComposingRef.current = true;
    preCompositionNameRef.current = editNameValue;
  }, [editNameValue]);

  /**
   * 変換確定ハンドラ（REQ-22.5）
   *
   * 変換で確定した値の幅を評価し、上限を超える場合のみ変換開始直前の確定値へ戻す。
   */
  const handleNameCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isNameComposingRef.current = false;
      const committed = e.currentTarget.value;
      const base = preCompositionNameRef.current;
      setEditNameValue(acceptsNameWidth(committed, base) ? committed : base);
      setNameError(null);
    },
    [acceptsNameWidth]
  );

  /**
   * blurイベントで確定（Task 115.40、REQ-22.5）
   *
   * 焦点喪失の時点では、editNameValue が幅の判定を経ていない場合がある。
   * - 変換中に焦点を失った場合。変換中は幅の判定を行わないため上限超過の読みが残る
   * - 変換の確定（compositionend）と焦点喪失が同一の実行単位に入った場合。戻し処理は
   *   状態の更新であり、同じ実行単位から見える値は反映前（＝上限超過）のままになる
   *
   * このため、変換の確定と同じ判定（acceptsNameWidth と変換開始直前の値）を改めて適用し、
   * 上限を超える場合は戻り先の値で確定する。判定は compositionend と共通の実装を用いる。
   *
   * 変換中でも確定を先送りにはしない。先送りにすると、確定の通知が届かないまま焦点を
   * 失った場合に、確定されないまま残る編集が生じるため。
   *
   * あわせて変換中の記録をここで終了させる（Task 115.42）。記録の寿命は「一回の焦点
   * セッション」であり、確定の通知（compositionend）か焦点喪失の早い方で終了する。
   * 焦点喪失で消さないと、空欄のため確定できず編集欄が残った場合に記録が固着し、
   * その編集欄では以後の確定・取り消しも幅の判定も働かなくなる。
   *
   * この編集欄では焦点喪失側が唯一の終了点である（Task 115.44）。編集開始時にも
   * 初期化していたが、編集欄は焦点喪失後も残りうる（空欄で確定できない場合）ため
   * 編集開始側では覆えない焦点セッションがあり、逆に焦点喪失側は全ての焦点セッションを
   * 覆う。変換中は確定も取り消しも抑止されるため、焦点喪失以外に編集欄を閉じる経路も無い。
   */
  const handleNameBlur = useCallback(() => {
    const base = preCompositionNameRef.current;
    const valueToConfirm = acceptsNameWidth(editNameValue, base) ? editNameValue : base;
    isNameComposingRef.current = false;
    preCompositionNameRef.current = valueToConfirm;
    // 編集欄が開いたまま残る場合（空白でエラーになる場合）に備えて表示も戻す
    setEditNameValue(valueToConfirm);
    confirmNameValue(valueToConfirm);
  }, [acceptsNameWidth, confirmNameValue, editNameValue]);

  const items = group.items ?? [];

  return (
    <article style={styles.card} data-testid="quantity-group-card">
      {/* Task 53.2: コピー中スピナー用 keyframes（CSS-in-JS では @keyframes が表現できないため
          inline <style> として一度だけ宣言する。複数カード描画でも同じ名前なら重複は無害） */}
      <style>{`@keyframes quantity-group-card-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
                onCompositionStart={handleNameCompositionStart}
                onCompositionEnd={handleNameCompositionEnd}
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
          {/* グループコピーボタン（Task 53.2: REQ-38.1, 38.9, 38.12）
              並替ボタンと削除ボタンの間に配置し、中立色で視覚的に削除と区別する */}
          {isEditable && onCopyGroup && (
            <button
              type="button"
              style={{
                ...styles.copyButton,
                ...(isCopying ? styles.copyButtonDisabled : {}),
              }}
              onClick={handleCopyGroup}
              disabled={isCopying}
              aria-label="グループをコピー"
              aria-busy={isCopying || undefined}
            >
              {isCopying ? (
                <span style={styles.copyButtonSpinner}>
                  <SpinnerIcon />
                </span>
              ) : (
                <CopyIcon />
              )}
              {isCopying ? 'コピー中...' : 'グループをコピー'}
            </button>
          )}
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
                    thumbnailUrl: group.surveyImage.thumbnailUrl,
                    annotatedThumbnailUrl: group.surveyImage.annotatedThumbnailUrl,
                    originalUrl: group.surveyImage.originalUrl,
                    // 未読込でも表示領域を確保できるよう実寸を渡す（Requirement 49.8）。
                    // 実寸を伴わないサマリでは undefined のままとし、共有部品側の
                    // 縮退（領域確保を行わず即時取得）に委ねる。
                    width: group.surveyImage.width,
                    height: group.surveyImage.height,
                  }}
                  alt={group.surveyImage.fileName}
                  style={styles.thumbnail}
                  hasAnnotations={hasAnnotations}
                  // 表題部の縮小表示。原寸画像ではなくサムネイルを使い、
                  // サーバー生成の注釈付きサムネイルがあれば注釈取得APIも省略する
                  preferThumbnail
                />
                {/* 注釈バッジ（REQ-3.3） */}
                {hasDrawnAnnotations && (
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
              {/* 写真の紐付け解除ボタン（Task 90.2: REQ-42.3）。
                  親の現場調査が論理削除された写真は選択候補に現れないため、
                  「変更」では 410 で止まる数量表を保存できる状態へ戻せない。 */}
              {onUnlinkImage && (
                <button
                  type="button"
                  style={styles.photoChangeButton}
                  onClick={handleUnlinkPhoto}
                  aria-label="写真の紐付けを解除"
                >
                  写真の紐付けを解除
                </button>
              )}
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

        {/* Task 58.1 (REQ-41): 数量項目テーブルのみを水平スクロール対象にするラッパー。
            画像・コメント（photoArea）はこのラッパー外に配置され固定表示される。 */}
        <div style={styles.itemTableWrapper} data-testid={`item-table-scroll-${group.id}`}>
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
                      onMoveToGroup={onMoveItemToGroup}
                      isSelected={selectedItemIds?.includes(item.id) ?? false}
                      onSelectionChange={onItemSelectionChange}
                      canMoveUp={index > 0}
                      canMoveDown={index < items.length - 1}
                      getSuggestions={getSuggestions || defaultGetSuggestions}
                      onBlurAddCandidate={onBlurAddCandidate || defaultOnBlurAddCandidate}
                      showFieldLabels={false}
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
