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
 * Task 23.9 追加: 写真項目の削除が失敗したときに、失敗をその写真項目の中（操作の行の直後、削除
 *   ボタンの下）に role=alert で表示する。受入基準 7.7 は失敗時の表示を定めておらず、利用者の判断
 *   （2026-10-03）で、タスク 21.3 の「詳細画面の上部の通知の枠へ出して画面をそこへ送る」形を改めた。
 *   文言の規則は 21.3 のまま（サーバーが返した理由、無ければ既定の文言。セッション切れ（401）も
 *   区別しない）。失敗は写真項目ごとに本部品が持ち、複数の写真項目の失敗を同時に表示する。表示が
 *   消えるのは、その写真項目の削除のやり直しを始めたとき（成功すれば写真項目ごと消える）、その
 *   写真項目へ別の操作をしたとき（コメントの編集・印刷対象とエクスポート対象の切り替え・上下の
 *   移動・ドラッグの開始・「看板を配置」）、本部品が外れたとき（画面の離脱）である。削除の確認
 *   ダイアログを開いて取り消すことは操作に数えない（何も変わらないため）。他の写真項目への操作と、
 *   その結果として位置が入れ替わることも数えない（失敗した写真項目の状態は変わらないため）
 *   是正 1 巡目（2026-10-04）: 失敗して確認ダイアログが閉じた後、フォーカスをその写真項目の削除
 *   ボタンへ `focus({ preventScroll: true })` で戻す（成功したときは戻さない）。画面は通常は
 *   動かさず、表示が画面の外へ出るときだけ表示に `scrollIntoView({ block: 'nearest' })` を呼び、
 *   表示の分だけ動かす（利用者の判断（2026-10-04）「文言の分だけ動かす」）
 *
 * Task 22.3 追加: 削除の実行中は確認ダイアログを閉じない（利用者の判断（2026-10-04））。実行中は
 *   オーバーレイのクリックとキャンセルを受け付けず（Esc で閉じる処理は元から無い）、完了（成功・
 *   失敗）の後に閉じる。実行中は背後の別の写真項目の削除ボタン（キーボードで到達できる）を押しても
 *   確認の対象を変えないため、先行する削除の完了が別の写真項目の確認を閉じる経路も無い
 *
 * Task 22.2 追加: 保存の失敗（`saveFailure`）を保存ボタンの直後に role=alert で表示し、保存ボタンの
 *   `aria-describedby` で結び付ける（利用者の判断（2026-10-04）。23.9 と同じ考え方）。文言と消える
 *   契機は詳細画面が決める。表示が現れたとき、フォーカスを失っているとき（保存の実行中はボタンが
 *   無効）か保存ボタンにあるときだけ、画面の外へ出るなら `scrollIntoView({ block: 'nearest' })` で
 *   表示の分だけ動かし、保存ボタンへ `focus({ preventScroll: true })` で戻す。別の欄へ移っていれば
 *   どちらもしない
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 9.6, 11.3, 15.6, 15.7,
 *   19.2, 19.3, 19.5
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  ConstructionPhotoWithUrls,
  PhotoOrderItem,
  SignboardPlacement,
} from '../../types/construction-photo.types';
import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';
import { TAP_TARGET_MIN_PX } from '../../utils/tap-target';
import { ApiError } from '../../api/client';

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
  /**
   * 保存の失敗の文言（タスク 22.2）。指定されている間、保存ボタンの直後に role=alert で表示し、
   * 保存ボタンの `aria-describedby` で結び付ける。文言と消える契機は呼び出し元が決める（詳細画面は
   * 上部の通知の枠と同じ一つの状態から渡す）。null・未指定のときは表示しない
   */
  saveFailure?: string | null;
  /**
   * 写真項目削除時のハンドラ。
   *
   * 削除に失敗したときは reject する。本部品が失敗をその写真項目の中に表示する（タスク 23.9。
   * 文言は reject の理由から決める: `ApiError` の message、空なら既定の文言、`ApiError` でなければ
   * 既定の文言）。確認ダイアログは成功・失敗のどちらでも閉じる（表示をモーダルの背後に隠さない
   * ため。タスク 21.3）。写真項目と削除の操作手段は残るため、利用者はその場でやり直せる。
   */
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

/** 写真項目の削除が失敗し、サーバーが理由を返さなかったときの文言（タスク 21.3） */
const PHOTO_DELETE_FAILED_MESSAGE = '写真項目の削除に失敗しました';

/**
 * 写真項目の削除の失敗の理由から、表示する文言を決める（タスク 21.3 の規則。23.9 で本部品へ移した）。
 * `ApiError` の message を優先し、空なら既定の文言にする。セッション切れ（401）も区別しない。
 * `ApiError` でない例外は既定の文言にする。通信の失敗（ネットワークの断など）は共通の API クライアント
 * （`api/client.ts`）が `ApiError(0, 'Network error')` に包んで投げるため、既定の文言ではなく
 * 「Network error」が表示される（規則は 21.3 のまま変えていない）。
 */
function toPhotoDeleteFailureMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message || PHOTO_DELETE_FAILED_MESSAGE
    : PHOTO_DELETE_FAILED_MESSAGE;
}

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
  // overflowWrap:anywhere は区切りの無い長い語にも折り返し位置を与え、見出しの最小幅を縮める。
  // カメラ由来のファイル名（IMG_20261001_143052_... など）はアンダースコアが折り返し位置にならず
  // 一語として扱われ、これが無いと見出しが折り返さずに詳細画面の <main> を押し広げる
  // （タスク 20.3 の E2E で実測, R19.1）。削除確認ダイアログの本文も同じ扱いとする
  fileName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    margin: 0,
    overflowWrap: 'anywhere' as const,
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
  // 写真項目の削除の失敗の表示（タスク 23.9）。色と枠は詳細画面の通知の枠（styles.notice）に揃える。
  // overflowWrap:anywhere と minWidth:0 は、区切りの無い長い理由（英数字の一語など）にも折り返し
  // 位置を与え、写真項目と詳細画面の <main> を押し広げないためである（R19.1 と同じ扱い）
  deleteFailure: {
    margin: 0,
    padding: '8px 12px',
    minWidth: 0,
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#991b1b',
    fontSize: '14px',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  // 保存の失敗の表示（タスク 22.2）。色と枠は写真項目の削除の失敗の表示（deleteFailure）に揃える。
  // overflowWrap:anywhere と minWidth:0 は、区切りの無い長い理由にも折り返し位置を与え、パネルと
  // 詳細画面の <main> を押し広げないためである（R19.1 と同じ扱い）
  saveFailure: {
    margin: '0 0 16px',
    padding: '8px 12px',
    minWidth: 0,
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#991b1b',
    fontSize: '14px',
    overflowWrap: 'anywhere' as const,
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
    overflowWrap: 'anywhere' as const,
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
  /**
   * R19.3: 操作系コントロールのタップ領域を44px以上に拡大。同基準は寸法を課さず、44 の根拠は
   * `.kiro/steering/tech.md` の「モバイルの下限値」（requirements.md の同基準の直後の注記）。
   * 値の宣言元は `utils/tap-target`（タスク 16.3）。
   */
  checkboxMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
  } as React.CSSProperties,
  orderButtonMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
  } as React.CSSProperties,
  deleteButtonMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
  } as React.CSSProperties,
  dragHandleMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
  } as React.CSSProperties,
  /**
   * R19.3: 看板の操作ボタン（「看板を配置」／「看板を変更」）にも同じ下限を課す。是正前は 375 幅で
   * 78×28 だった。利用者の判断（2026-10-02）で同基準の対象に含めた（タスク 21.2）。
   */
  assignSignboardButtonMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
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
  /** この写真項目の削除の失敗の文言（無ければ null, タスク 23.9） */
  deleteFailure: string | null;
  /** この写真項目への操作を親へ知らせる（削除の失敗の表示を消す契機, タスク 23.9） */
  onOperate: (photoId: string) => void;
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
  deleteFailure,
  onOperate,
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
  const deleteFailureId = `delete-failure-${photo.id}`;
  const deleteFailureRef = useRef<HTMLParagraphElement | null>(null);

  /**
   * 削除の失敗の表示が現れたら、その表示だけを最小の移動で画面内へ入れる（利用者の判断
   * （2026-10-04）「文言の分だけ動かす」）。`block: 'nearest'` は、表示が既に画面内なら画面を
   * 動かさず、押したボタンが画面の下端の近くにあって表示が画面の外へ出るときだけ、その分だけ
   * 動かす。上部の通知の枠や画面の上端へは送らない。滑らかな移動は指定しない（即時に動く）。
   * 描画の後に走らせるため、この写真項目の失敗の文言を契機にする（やり直しの開始で一度 null に
   * なるため、同じ文言の再度の失敗でも走る）。親のフォーカスの復帰（`preventScroll`）はこの後に
   * 走り、画面を動かさないため、この移動を打ち消さない
   */
  useEffect(() => {
    if (!deleteFailure) return;
    const element = deleteFailureRef.current;
    // jsdom など scrollIntoView を持たない環境では何もしない
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [deleteFailure]);

  const handleToggleSelectChange = useCallback(() => {
    onOperate(photo.id);
    onToggleSelect?.(photo.id);
  }, [photo.id, onToggleSelect, onOperate]);

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
      onOperate(photo.id);
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
    [photo.id, lastSavedComment, onMetadataChange, validateComment, onOperate]
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
      onOperate(photo.id);
      onMetadataChange(photo.id, { includeInReport: e.target.checked });
    },
    [photo.id, onMetadataChange, onOperate]
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
          onDragStart={(e) => {
            onOperate(photo.id);
            onDragStart(e, photo.id);
          }}
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
            onClick={() => {
              onOperate(photo.id);
              onMoveUp?.(photo.id);
            }}
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
            onClick={() => {
              onOperate(photo.id);
              onMoveDown?.(photo.id);
            }}
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
                onClick={() => {
                  onOperate(photo.id);
                  onAssignSignboard(photo);
                }}
                style={{
                  ...styles.assignSignboardButton,
                  ...(isMobile ? styles.assignSignboardButtonMobile : {}),
                }}
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
                aria-describedby={deleteFailure ? deleteFailureId : undefined}
                data-delete-button
              >
                削除
              </button>
            )}
          </div>
        )}

        {/* 削除の失敗（タスク 23.9）。操作の行の直後（削除ボタンの下）に置き、どの写真項目の失敗かを
            位置で示す。ボタンより上に置くと、表示の出現でボタンが下へずれ、押した位置でやり直せない */}
        {deleteFailure && (
          <p ref={deleteFailureRef} id={deleteFailureId} role="alert" style={styles.deleteFailure}>
            {deleteFailure}
          </p>
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
  saveFailure = null,
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
  // 実行中かの判定は ref で行う（タスク 22.3）。同じ描画の間に続けて届くイベントでも最新の値を読む
  const isDeletingRef = useRef(false);
  // 写真項目ごとの削除の失敗の文言（写真項目ID -> 文言, タスク 23.9）。本部品が外れると（画面の
  // 離脱）失われる
  const [deleteFailures, setDeleteFailures] = useState<Readonly<Record<string, string>>>({});
  // 削除の失敗の後にフォーカスを戻す先の写真項目（タスク 23.9 の是正 1 巡目）。失敗のたびに新しい
  // オブジェクトにし、同じ写真項目の再度の失敗でも effect を走らせる
  const [focusAfterFailure, setFocusAfterFailure] = useState<{ photoId: string } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // 保存の失敗の表示（タスク 22.2）
  const saveFailureId = `save-failure-${useId()}`;
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const saveFailureRef = useRef<HTMLParagraphElement | null>(null);
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

  /** 指定の写真項目の削除の失敗の表示を消す（無ければ状態を変えない, タスク 23.9） */
  const clearDeleteFailure = useCallback((photoId: string) => {
    setDeleteFailures((prev) => {
      if (!(photoId in prev)) return prev;
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  }, []);

  // 削除の実行中は確認の対象を変えない（タスク 22.3）。ダイアログに焦点の閉じ込めが無く、キーボード
  // では背後の別の写真項目の削除ボタンへ到達できる。対象を変えると、先行する削除の完了がその確認を
  // 閉じてしまう
  const handleDeleteClick = useCallback((photoId: string) => {
    if (isDeletingRef.current) return;
    setDeleteTargetId(photoId);
  }, []);

  // 削除の実行中は閉じない（タスク 22.3、利用者の判断 2026-10-04）。オーバーレイのクリックと
  // キャンセルの両方がここを通る（キャンセルは実行中は無効でもある）。Esc で閉じる処理は元から無い。
  // 実行中は 500 系の再試行で約 7 秒続くことがあり、閉じると完了の結果が見えないまま別の確認を
  // 開けてしまう
  const handleDeleteCancel = useCallback(() => {
    if (isDeletingRef.current) return;
    setDeleteTargetId(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetId || !onDelete) return;
    const targetId = deleteTargetId;
    // やり直しを始めた時点で、その写真項目の古い失敗の表示を消す（タスク 23.9）
    clearDeleteFailure(targetId);
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      await onDelete(targetId);
    } catch (error) {
      // 失敗はその写真項目の中に表示する（タスク 23.9）。上部の通知の枠へは送らない。表示が画面の
      // 外へ出るときだけ、PhotoItem の effect が表示の分だけ動かす
      setDeleteFailures((prev) => ({ ...prev, [targetId]: toPhotoDeleteFailureMessage(error) }));
      setFocusAfterFailure({ photoId: targetId });
    } finally {
      // 成功・失敗のどちらでも閉じる。失敗時に開いたままにすると、モーダルの背後に表示が隠れる
      // （タスク 21.3。同じ画面のアルバムを取り除く確認ダイアログも失敗時に閉じる）
      isDeletingRef.current = false;
      setDeleteTargetId(null);
      setIsDeleting(false);
    }
  }, [deleteTargetId, onDelete, clearDeleteFailure]);

  /**
   * 削除が失敗して確認ダイアログが閉じた後に、フォーカスをその写真項目の削除ボタンへ戻す
   * （タスク 23.9 の是正 1 巡目）。キーボードの利用者がその場でやり直せ、ボタンの説明
   * （`aria-describedby` の失敗の表示）が読み上げられる。`preventScroll` で画面を送らない。
   * 成功したときは写真項目ごと無くなるため戻さない。
   */
  useEffect(() => {
    if (!focusAfterFailure) return;
    const articles = listRef.current?.querySelectorAll<HTMLElement>(
      '[data-testid="construction-photo-item"]'
    );
    const article = Array.from(articles ?? []).find(
      (el) => el.dataset.photoId === focusAfterFailure.photoId
    );
    const button = article?.querySelector<HTMLButtonElement>('button[data-delete-button]');
    button?.focus({ preventScroll: true });
  }, [focusAfterFailure]);

  /**
   * 保存の失敗の表示が現れたら（タスク 22.2）、写真項目の削除の失敗（タスク 23.9）と同じく、表示が
   * 画面の外へ出るときだけ表示の分だけ画面を動かし（`block: 'nearest'`。表示が画面内なら動かない）、
   * 保存ボタンへ `focus({ preventScroll: true })` で戻して `aria-describedby` の表示を読ませ、その場で
   * やり直せるようにする。どちらも、フォーカスを失っているとき（保存の実行中は保存ボタンが無効に
   * なる）と保存ボタンにあるときだけ行う。実行中に利用者が別の欄（コメントの入力欄など）へ移って
   * いれば、フォーカスを奪わず画面も動かさない（編集中の欄を画面の外へ出さない）。やり直しの開始で
   * 文言が一度 null になるため、同じ文言の再度の失敗でも走る
   */
  useEffect(() => {
    if (!saveFailure) return;
    const button = saveButtonRef.current;
    const active = document.activeElement;
    // 実行中に利用者が別の欄へ移っていれば、画面もフォーカスも動かさない
    if (!button || !(active === null || active === document.body || active === button)) return;
    const element = saveFailureRef.current;
    // jsdom など scrollIntoView を持たない環境では何もしない
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
    button.focus({ preventScroll: true });
  }, [saveFailure]);

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
            ref={saveButtonRef}
            type="button"
            onClick={onSave}
            disabled={!isDirty || isSaving}
            style={{
              ...styles.saveButton,
              ...(!isDirty || isSaving ? styles.saveButtonDisabled : {}),
            }}
            aria-busy={isSaving}
            aria-describedby={saveFailure ? saveFailureId : undefined}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      )}

      {/* 保存の失敗（タスク 22.2）。保存ボタンの直後（手動保存ヘッダの下、写真項目より前）に置き、
          押した直後の位置で見えるようにする。上部の通知の枠は詳細画面に残る */}
      {showSaveButton && saveFailure && (
        <p ref={saveFailureRef} id={saveFailureId} role="alert" style={styles.saveFailure}>
          {saveFailure}
        </p>
      )}

      <div ref={listRef} style={styles.panelList}>
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
            deleteFailure={deleteFailures[photo.id] ?? null}
            onOperate={clearDeleteFailure}
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
          <div
            style={styles.deleteDialogOverlay}
            onClick={handleDeleteCancel}
            aria-hidden="true"
            data-testid="cp-delete-dialog-overlay"
          />
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
