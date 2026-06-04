/**
 * @fileoverview 数量表編集画面
 *
 * Task 5.1: 数量表編集画面のレイアウトを実装する
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 */

import { useState, useEffect, useCallback, useReducer, useMemo, useRef } from 'react';
import { useParams, Link, useBlocker } from 'react-router-dom';
import {
  getQuantityTableDetail,
  createQuantityItem,
  saveQuantityTableDraft,
} from '../api/quantity-tables';
import { ApiError } from '../api/client';
import { getSiteSurveys, getSiteSurvey } from '../api/site-surveys';
import { getAnnotation } from '../api/survey-annotations';
import { Canvas as FabricCanvas, FabricImage, util } from 'fabric';
import type {
  QuantityTableDetail,
  QuantityGroupDetail,
  QuantityItemDetail,
  SurveyImageSummary,
} from '../types/quantity-table.types';
import type { SurveyImageInfo } from '../types/site-survey.types';
import {
  quantityTableEditReducer,
  initialQuantityTableEditState,
  buildSaveQuantityTableDraftInput,
  type DraftGroup,
  type DraftItem,
} from './quantityTableEditReducer';
import { Breadcrumb } from '../components/common';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import QuantityGroupCard from '../components/quantity-table/QuantityGroupCard';
import UnsavedChangesBadge from '../components/quantity-table/UnsavedChangesBadge';
import { AnnotatedImageThumbnail } from '../components/site-surveys/AnnotatedImageThumbnail';
import { useAutocompleteCandidateStore } from '../hooks/useAutocompleteCandidateStore';
import { generateQuantityTablePdf } from '../services/export/QuantityTablePdfExportService';
import { downloadPdf } from '../services/export/PdfExportService';
import { ImportDialog } from '../components/quantity-table-import/ImportDialog';
import type { ImportQuantityItem } from '../types/quantity-import.types';
import SurveySelectDialog, {
  type SiteSurveySummary,
} from '../components/quantity-table/SurveySelectDialog';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    gap: '16px',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    flex: 1,
  } as React.CSSProperties,
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  titleInput: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
    padding: '4px 8px',
    border: '1px solid transparent',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    width: '100%',
    maxWidth: '500px',
    transition: 'border-color 0.2s, background-color 0.2s',
  } as React.CSSProperties,
  titleInputFocused: {
    border: '1px solid #2563eb',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexShrink: 0,
  } as React.CSSProperties,
  addGroupButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  saveButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  groupList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '64px 24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  emptyIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 16px',
    color: '#9ca3af',
  } as React.CSSProperties,
  emptyText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '16px',
  } as React.CSSProperties,
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  retryButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 操作エラー表示スタイル（インライン）
  operationErrorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  operationErrorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
    flex: 1,
  } as React.CSSProperties,
  operationErrorDismiss: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#991b1b',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    marginLeft: '12px',
  } as React.CSSProperties,
  // 確認ダイアログスタイル
  dialogOverlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '12px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 写真選択ダイアログスタイル（REQ-4.3）
  photoDialogContent: {
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
  photoDialogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    // REQ-39: 行高を固定（150px）し、各アイテムにも同じ definite height を与えることで
    // 行トラックとアイテム高さを一致させ重なりを解消する。
    // aspect-ratio による高さは列幅（1fr で 150px 超に伸びる）に追従して行トラックを
    // 超過するうえ、auto 行トラックは aspect-ratio 由来の高さを最小値（150px）でしか
    // 解決しないため重なりが残る（実機 E2E で確認）。definite height で確定させる。
    gridAutoRows: '150px',
    gap: '12px',
    overflowY: 'auto' as const,
    flex: 1,
    padding: '4px',
  } as React.CSSProperties,
  photoItem: {
    // REQ-39: 行トラック（gridAutoRows:150px）と一致する definite height を与え、
    // aspect-ratio 由来の不定高による行超過・重なりを防ぐ。
    height: '150px',
    minHeight: '150px',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.2s, transform 0.2s',
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
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '4px',
    lineHeight: 1,
  } as React.CSSProperties,
  emptyPhotos: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
  } as React.CSSProperties,
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  pdfExportButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * プラスアイコン
 */
function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
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
 * 空状態アイコン（テーブル）
 */
function EmptyTableIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 9v12M15 9v12" />
    </svg>
  );
}

/**
 * 空状態表示
 */
function EmptyState({ onAddGroup }: { onAddGroup: () => void }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <EmptyTableIcon />
      </div>
      <p style={styles.emptyText}>グループがありません</p>
      <button type="button" style={styles.addGroupButton} onClick={onAddGroup}>
        <PlusIcon />
        グループを追加
      </button>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量表編集画面
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 */
export default function QuantityTableEditPage() {
  const { id } = useParams<{ id: string }>();

  // ==========================================================================
  // Task 61.1: 編集ドラフトを単一の useReducer で一元管理する（REQ-42.1〜42.3, 42.6）
  // すべての編集操作（グループ/項目の追加・削除・コピー・並び替え・名称・写真紐づけ・
  // フィールド編集）は dispatch でドラフトのみを更新し、保存操作まで永続化APIを
  // 呼び出さない（REQ-42.6）。初期ロードや候補取得などの参照系GETは従来どおり
  // オンデマンドで実行する（REQ-42.10）。
  // ==========================================================================
  const [editState, dispatch] = useReducer(
    quantityTableEditReducer,
    initialQuantityTableEditState
  );
  const draft = editState.draft;

  // ==========================================================================
  // Task 62.1: 未保存変更時の離脱ガード（REQ-43.1〜43.6）
  // editState.isDirty が true の間のみガードする（REQ-43.5/43.6）。
  // - アプリ内ナビゲーション: useBlocker(isDirty) でブロックし、blocked のとき
  //   既存の UnsavedChangesDialog を表示。離脱→ proceed()、とどまる→ reset()
  //   （REQ-43.1/43.3/43.4）。
  // - タブクローズ/リロード: 既存 useUnsavedChanges の beforeunload ハンドラを
  //   enabled: isDirty で有効化し標準確認を表示する（REQ-43.2）。
  // 既存 CompanyInfoPage / ItemizedStatementDetailPage / SiteSurveyDetailPage の
  // 確立済みパターンに準拠（design.md L166, L2129-2140）。
  // ==========================================================================
  const isDirty = editState.isDirty;

  // タブクローズ/リロード時の beforeunload 標準確認（REQ-43.2）
  useUnsavedChanges({ enabled: isDirty });

  // アプリ内ナビゲーションのブロック（REQ-43.1）
  const blocker = useBlocker(isDirty);

  // 数量表メタ情報（projectId / project / updatedAt 等、編集対象外の参照情報）と
  // 写真サマリ（surveyImage）の供給元として、最後にロード/保存したサーバースナップショットを保持する。
  const [snapshot, setSnapshot] = useState<QuantityTableDetail | null>(null);

  // セッション中に紐づけた写真のサマリ（スナップショットに存在しない新規紐づけ写真の
  // サムネイル・コメントを描画へ供給する。REQ-4.3 表示反映用）。surveyImageId -> サマリ。
  const [linkedPhotoSummaries, setLinkedPhotoSummaries] = useState<
    Record<string, SurveyImageSummary>
  >({});

  // オートコンプリート候補ストア（Task 17.2: Req 7.1）
  const { getSuggestions, addCandidateOnBlur } = useAutocompleteCandidateStore({
    projectId: snapshot?.projectId || '',
  });

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null); // 読み込みエラー（全画面表示）
  const [operationError, setOperationError] = useState<string | null>(null); // 操作エラー（インライン表示）
  // 削除確認ダイアログ用state（REQ-4.5）。対象行キー（id または tempId）を保持する。
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // 数量表名編集用state（REQ-2.5）
  const [editingName, setEditingName] = useState<string>('');
  const [isNameFocused, setIsNameFocused] = useState(false);
  // Escキャンセル時に直後の blur によるドラフト反映を抑止するフラグ（REQ-2.5）
  const suppressNameCommitRef = useRef(false);
  // 写真選択ダイアログ用state（REQ-4.3）
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [selectedGroupIdForPhoto, setSelectedGroupIdForPhoto] = useState<string | null>(null);
  const [availablePhotos, setAvailablePhotos] = useState<SurveyImageInfo[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  // 注釈ビューアモーダル用state（REQ-4.4）
  const [annotationViewerGroupId, setAnnotationViewerGroupId] = useState<string | null>(null);
  // PDF出力用state（REQ-26.1, 26.9）
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  // インポートダイアログ用state（REQ-27.1）
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  // 現場調査選択ダイアログ用state（Task 57.3: REQ-40.1, 40.2, 40.11, 40.13）
  const [isSurveySelectDialogOpen, setIsSurveySelectDialogOpen] = useState(false);
  const [surveyOptions, setSurveyOptions] = useState<SiteSurveySummary[]>([]);
  const [isCreatingFromSurvey, setIsCreatingFromSurvey] = useState(false);

  /**
   * 数量表詳細を取得（参照系GET。REQ-42.10）。
   * 取得結果でスナップショットを更新し、ドラフトを `load` で再シードする。
   */
  const fetchQuantityTableDetail = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setLoadError(null);
    setOperationError(null); // 操作エラーもクリア

    try {
      const result = await getQuantityTableDetail(id);
      // result が null/undefined の場合は「見つかりません」表示へ（ドラフトは未シードのまま）
      if (!result) {
        setSnapshot(null);
        return;
      }
      setSnapshot(result);
      setLinkedPhotoSummaries({});
      dispatch({ type: 'load', detail: result });
    } catch {
      setLoadError('読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchQuantityTableDetail();
  }, [fetchQuantityTableDetail]);

  // 数量表名を編集用stateに初期化（REQ-2.5）。ドラフト名の変更に追従する。
  useEffect(() => {
    if (draft) {
      setEditingName(draft.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 名前の変更のみに依存
  }, [draft?.name]);

  /**
   * 数量表名変更ハンドラ（REQ-2.5）
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  }, []);

  /**
   * 数量表名確定ハンドラ（REQ-2.5, REQ-42.2）
   * フォーカスを外したときにドラフトへ反映する（永続化APIは呼ばない）。
   */
  const handleNameBlur = useCallback(() => {
    setIsNameFocused(false);

    // Escキャンセル直後の blur はドラフト反映をスキップする（編集破棄）
    if (suppressNameCommitRef.current) {
      suppressNameCommitRef.current = false;
      if (draft) setEditingName(draft.name);
      return;
    }

    if (!draft) return;

    // 変更がない場合は何もしない
    if (editingName === draft.name) return;

    // 空の場合は元に戻す
    if (!editingName.trim()) {
      setEditingName(draft.name);
      return;
    }

    // ドラフトのみ更新（REQ-42.2: クライアント編集状態にのみ反映）
    dispatch({ type: 'renameTable', name: editingName.trim() });
  }, [draft, editingName]);

  /**
   * 数量表名フォーカスハンドラ（REQ-2.5）
   */
  const handleNameFocus = useCallback(() => {
    setIsNameFocused(true);
  }, []);

  /**
   * 数量表名キーダウンハンドラ（REQ-2.5）
   * Enterで確定、Escでキャンセル
   */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur(); // blurでhandleNameBlurが呼ばれる
      } else if (e.key === 'Escape') {
        // 編集破棄: 直後の blur によるドラフト反映を抑止する
        suppressNameCommitRef.current = true;
        if (draft) {
          setEditingName(draft.name);
        }
        e.currentTarget.blur();
      }
    },
    [draft]
  );

  /**
   * グループ追加ハンドラ（REQ-4.1, REQ-42.1）
   * ドラフトに空グループを追加する（永続化APIは呼ばない）。
   */
  const handleAddGroup = useCallback(() => {
    setOperationError(null);
    dispatch({ type: 'addGroup' });
  }, []);

  /**
   * グループ名取得（名前がない場合はデフォルト表示）
   */
  const getGroupDisplayName = (group: QuantityGroupDetail, index: number): string => {
    return group.name || `グループ ${index + 1}`;
  };

  /**
   * グループ削除確認ダイアログを開く
   *
   * Requirements: 4.5
   */
  const handleDeleteGroup = useCallback((groupKey: string) => {
    setGroupToDelete(groupKey);
  }, []);

  /**
   * 削除をキャンセル
   */
  const handleCancelDelete = useCallback(() => {
    setGroupToDelete(null);
  }, []);

  /**
   * グループ削除を実行（REQ-4.5, REQ-42.1）
   * ドラフトから対象グループを削除する（永続化APIは呼ばない）。
   */
  const handleConfirmDeleteGroup = useCallback(() => {
    if (!groupToDelete) return;
    setOperationError(null);
    dispatch({ type: 'removeGroup', groupKey: groupToDelete });
    setGroupToDelete(null);
  }, [groupToDelete]);

  /**
   * グループコピーハンドラ
   *
   * Task 61.2: 数量グループコピーをクライアントサイドドラフト化する
   * Requirements: 42.4, 38.13
   *
   * - コピーはサーバー POST（copyQuantityGroup）ではなく reducer の `copyGroup`
   *   アクションによるクライアントサイドのドラフト複製として行う（REQ-42.4）。
   * - reducer 側で複製先を元グループの直下へ挿入し、後続グループの displayOrder を
   *   シフトし、名前は「{元名}のコピー」（バックエンドと同一の幅切り詰め）として
   *   配下項目を新規 tempId で複製する。surveyImageId は参照のみ引き継ぐ（REQ-38.13）。
   * - 純粋なクライアント操作のため API 呼び出し・再取得・エラー処理は不要。
   *   永続化は保存操作（Task 61.4）で行う。
   * - 複製先グループ名は即座にインライン編集可能（REQ-22, rename ハンドラ対応済み）。
   *
   * @param groupKey - 対象グループの識別子（既存は id、新規は tempId）
   */
  const handleCopyGroup = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'copyGroup', groupKey });
  }, []);

  /**
   * 写真選択ダイアログを開く
   *
   * Requirements: 4.3
   */
  const handleSelectImage = useCallback(
    async (groupId: string) => {
      if (!snapshot) return;

      setSelectedGroupIdForPhoto(groupId);
      setIsPhotoDialogOpen(true);
      setIsLoadingPhotos(true);
      setAvailablePhotos([]);

      try {
        // プロジェクト内の現場調査を取得
        const surveysResult = await getSiteSurveys(snapshot.projectId, { limit: 100 });
        const allPhotos: SurveyImageInfo[] = [];

        // バッチサイズ（レートリミット回避のため一度に処理する件数を制限）
        const BATCH_SIZE = 5;
        const surveys = surveysResult.data;

        // 各現場調査の詳細をバッチ処理で取得して画像を集める
        // N+1クエリ問題を軽減するためPromise.allで並列処理し、
        // レートリミット回避のためバッチサイズで分割
        for (let i = 0; i < surveys.length; i += BATCH_SIZE) {
          const batch = surveys.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.allSettled(
            batch.map((survey) => getSiteSurvey(survey.id))
          );

          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              const surveyDetail = result.value;
              if (surveyDetail.images && surveyDetail.images.length > 0) {
                allPhotos.push(...surveyDetail.images);
              }
            }
            // rejected（エラー）の場合は無視して続行
          }
        }

        setAvailablePhotos(allPhotos);
      } catch {
        setOperationError('写真の読み込みに失敗しました');
      } finally {
        setIsLoadingPhotos(false);
      }
    },
    [snapshot]
  );

  /**
   * 写真選択ダイアログを閉じる
   *
   * Requirements: 4.3
   */
  const handleClosePhotoDialog = useCallback(() => {
    setIsPhotoDialogOpen(false);
    setSelectedGroupIdForPhoto(null);
    setAvailablePhotos([]);
  }, []);

  /**
   * 写真を選択して適用（REQ-4.3, REQ-42.3）
   * ドラフトのグループへ surveyImageId を反映する（永続化APIは呼ばない）。
   * 描画用に選択写真のサマリ（サムネイル・コメント等）をセッションマップへ保持する。
   */
  const handlePhotoSelect = useCallback(
    (imageId: string) => {
      if (!selectedGroupIdForPhoto) return;
      setOperationError(null);

      // 選択した写真情報を取得し、描画用サマリとして保持
      const selectedPhoto = availablePhotos.find((p) => p.id === imageId);
      if (selectedPhoto) {
        setLinkedPhotoSummaries((prev) => ({
          ...prev,
          [imageId]: {
            id: selectedPhoto.id,
            thumbnailUrl: selectedPhoto.thumbnailUrl || selectedPhoto.originalUrl || '',
            originalUrl: selectedPhoto.originalUrl || '',
            fileName: selectedPhoto.fileName,
            hasAnnotations: selectedPhoto.hasAnnotations,
            comment: selectedPhoto.comment ?? null,
          },
        }));
      }

      // ドラフトのみ更新（REQ-42.3: クライアント編集状態にのみ反映）
      dispatch({
        type: 'linkGroupImage',
        groupKey: selectedGroupIdForPhoto,
        surveyImageId: imageId,
      });

      handleClosePhotoDialog();
    },
    [selectedGroupIdForPhoto, availablePhotos, handleClosePhotoDialog]
  );

  /**
   * 注釈ビューアを開く
   *
   * Requirements: 4.4
   */
  const handleOpenAnnotationViewer = useCallback((groupId: string) => {
    setAnnotationViewerGroupId(groupId);
  }, []);

  /**
   * 注釈ビューアを閉じる
   *
   * Requirements: 4.4
   */
  const handleCloseAnnotationViewer = useCallback(() => {
    setAnnotationViewerGroupId(null);
  }, []);

  /**
   * 項目が属するグループのキー（id または tempId）を解決する。
   * 項目編集系の各ハンドラは項目キーのみを受け取るため、ドラフトから親グループを引く。
   */
  const findGroupKeyByItemKey = useCallback(
    (itemKey: string): string | null => {
      if (!draft) return null;
      for (const group of draft.groups) {
        const groupKey = group.id ?? group.tempId ?? '';
        if (group.items.some((item) => (item.id ?? item.tempId ?? '') === itemKey)) {
          return groupKey;
        }
      }
      return null;
    },
    [draft]
  );

  /**
   * 項目追加ハンドラ（REQ-5.1, REQ-42.1）
   * ドラフトの対象グループへ空項目を追加する（永続化APIは呼ばない）。
   */
  const handleAddItem = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'addItem', groupKey });
  }, []);

  /**
   * 項目更新ハンドラ（REQ-5.2, REQ-42.1）
   * ドラフトの項目フィールドを更新する（永続化APIは呼ばない）。
   * 数値フィールド（quantity/adjustmentFactor/roundingUnit）は文字列入力として保持する。
   */
  const handleUpdateItem = useCallback(
    (itemKey: string, updates: Partial<QuantityItemDetail>) => {
      setOperationError(null);

      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;

      // QuantityItemDetail（数値型）→ DraftItem（文字列型）へ変換する
      const draftUpdates: Partial<DraftItem> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'quantity' || key === 'adjustmentFactor' || key === 'roundingUnit') {
          draftUpdates[key as 'quantity' | 'adjustmentFactor' | 'roundingUnit'] = String(value);
        } else {
          // それ以外のフィールドはそのまま反映（型は DraftItem と互換）
          (draftUpdates as Record<string, unknown>)[key] = value;
        }
      }

      dispatch({ type: 'updateItemField', groupKey, itemKey, updates: draftUpdates });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 項目削除ハンドラ（REQ-5.3, REQ-42.1）
   * ドラフトから項目を削除する（永続化APIは呼ばない）。
   */
  const handleDeleteItem = useCallback(
    (itemKey: string) => {
      setOperationError(null);
      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;
      dispatch({ type: 'removeItem', groupKey, itemKey });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 項目コピーハンドラ（REQ-5.4, REQ-42.1）
   * ドラフト内で項目を複製する（永続化APIは呼ばない）。
   */
  const handleCopyItem = useCallback(
    (itemKey: string) => {
      setOperationError(null);
      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;
      dispatch({ type: 'copyItem', groupKey, itemKey });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 項目移動ハンドラ（REQ-6.3, REQ-24.3, REQ-24.4, REQ-42.1）
   * ドラフト内で項目を上下移動する（永続化APIは呼ばない）。
   */
  const handleMoveItem = useCallback(
    (itemKey: string, direction: 'up' | 'down') => {
      setOperationError(null);
      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;
      dispatch({ type: 'reorderItem', groupKey, itemKey, direction });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * グループ名変更ハンドラ（REQ-22.1, REQ-22.2, REQ-42.2）
   * ドラフトのグループ名を更新する（永続化APIは呼ばない）。
   */
  const handleRenameGroup = useCallback((groupKey: string, newName: string) => {
    setOperationError(null);
    dispatch({ type: 'renameGroup', groupKey, name: newName });
  }, []);

  /**
   * グループを上に移動するハンドラ（REQ-23.3, REQ-23.7, REQ-42.1）
   * ドラフト内でグループを上へ移動する（永続化APIは呼ばない）。
   */
  const handleMoveGroupUp = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'reorderGroup', groupKey, direction: 'up' });
  }, []);

  /**
   * グループを下に移動するハンドラ（REQ-23.4, REQ-23.7, REQ-42.1）
   * ドラフト内でグループを下へ移動する（永続化APIは呼ばない）。
   */
  const handleMoveGroupDown = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'reorderGroup', groupKey, direction: 'down' });
  }, []);

  // ==========================================================================
  // 描画モデル（renderTable）
  // ドラフト（編集の単一の真実）を、子コンポーネント（QuantityGroupCard /
  // EditableQuantityItemRow）が期待する QuantityTableDetail 形状へ変換する。
  // 各行の id には reducer のキー（既存は id、新規は tempId）を割り当て、
  // 子からのコールバックがそのままドラフト操作のキーとして使えるようにする。
  // surveyImage サマリはスナップショット＋セッション中の紐づけ写真から解決する。
  // ==========================================================================
  const renderTable = useMemo<QuantityTableDetail | null>(() => {
    if (!draft || !snapshot) return null;

    // スナップショット側の surveyImage サマリを surveyImageId で索引化
    const snapshotImages: Record<string, SurveyImageSummary> = {};
    for (const g of snapshot.groups) {
      if (g.surveyImageId && g.surveyImage) {
        snapshotImages[g.surveyImageId] = g.surveyImage;
      }
    }

    const draftItemToDetail = (item: DraftItem, groupKey: string): QuantityItemDetail => ({
      // reducer キーを id として供給（既存は id、新規は tempId）
      id: item.id ?? item.tempId ?? '',
      quantityGroupId: groupKey,
      majorCategory: item.majorCategory ?? '',
      middleCategory: item.middleCategory,
      minorCategory: item.minorCategory,
      customCategory: item.customCategory,
      workType: item.workType,
      name: item.name,
      specification: item.specification,
      unit: item.unit,
      calculationMethod: item.calculationMethod,
      calculationParams: item.calculationParams,
      adjustmentFactor: Number(item.adjustmentFactor),
      roundingUnit: Number(item.roundingUnit),
      quantity: Number(item.quantity),
      remarks: item.remarks,
      displayOrder: item.displayOrder,
      createdAt: '',
      updatedAt: '',
    });

    const draftGroupToDetail = (group: DraftGroup): QuantityGroupDetail => {
      const groupKey = group.id ?? group.tempId ?? '';
      const summary =
        group.surveyImageId !== null
          ? (linkedPhotoSummaries[group.surveyImageId] ??
            snapshotImages[group.surveyImageId] ??
            null)
          : null;
      return {
        id: groupKey,
        quantityTableId: draft.id,
        name: group.name,
        surveyImageId: group.surveyImageId,
        surveyImage: summary,
        displayOrder: group.displayOrder,
        itemCount: group.items.length,
        items: group.items.map((item) => draftItemToDetail(item, groupKey)),
        createdAt: '',
        updatedAt: '',
      };
    };

    const groups = draft.groups.map(draftGroupToDetail);
    const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0);

    return {
      ...snapshot,
      id: draft.id,
      name: draft.name,
      groupCount: groups.length,
      itemCount,
      groups,
    };
  }, [draft, snapshot, linkedPhotoSummaries]);

  /**
   * PDF出力ハンドラ
   *
   * Requirements: 26.1, 26.9, 26.10
   *
   * 数量表データをQuantityTablePdfInput形式に変換し、PDFを生成・ダウンロードする。
   */
  const handlePdfExport = useCallback(async () => {
    if (isPdfGenerating || !renderTable) return; // 重複操作防止（REQ-26.9）

    setIsPdfGenerating(true);
    setOperationError(null);

    try {
      const groups = renderTable.groups ?? [];

      // 画像を注釈付きでdata URLに変換するヘルパー（REQ-26.5）
      const renderAnnotatedImageToDataUrl = async (
        imageId: string,
        imageUrl: string
      ): Promise<string | null> => {
        try {
          // 画像をロード
          const htmlImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = imageUrl;
          });

          // 注釈データを取得
          let annotationData = null;
          try {
            annotationData = await getAnnotation(imageId);
          } catch {
            // 注釈取得失敗時は元画像を使用
          }

          // 注釈がない場合は元画像をdata URLに変換
          if (
            !annotationData ||
            !annotationData.data?.objects ||
            annotationData.data.objects.length === 0
          ) {
            const canvas = document.createElement('canvas');
            canvas.width = htmlImage.width;
            canvas.height = htmlImage.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(htmlImage, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.85);
          }

          // 注釈がある場合はFabric.jsでレンダリング
          const canvas = document.createElement('canvas');
          canvas.width = htmlImage.width;
          canvas.height = htmlImage.height;
          const fabricCanvas = new FabricCanvas(canvas, {
            width: htmlImage.width,
            height: htmlImage.height,
            renderOnAddRemove: false,
          });

          // 背景画像を設定
          const fabricImage = new FabricImage(htmlImage, {
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
          });
          fabricCanvas.backgroundImage = fabricImage;

          // 注釈オブジェクトを復元
          const enlivenedObjects = await util.enlivenObjects(annotationData.data.objects);
          const savedW = annotationData.data.canvasWidth;
          const savedH = annotationData.data.canvasHeight;
          const scaleX = savedW && savedW > 0 ? htmlImage.width / savedW : 1;
          const scaleY = savedH && savedH > 0 ? htmlImage.height / savedH : 1;

          enlivenedObjects.forEach((obj) => {
            if (obj && typeof obj === 'object' && 'set' in obj) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fabricObj = obj as any;
              if (scaleX !== 1 || scaleY !== 1) {
                fabricObj.set({
                  left: (fabricObj.left ?? 0) * scaleX,
                  top: (fabricObj.top ?? 0) * scaleY,
                  scaleX: (fabricObj.scaleX ?? 1) * scaleX,
                  scaleY: (fabricObj.scaleY ?? 1) * scaleY,
                });
                if (fabricObj.strokeWidth) {
                  fabricObj.set({ strokeWidth: fabricObj.strokeWidth * ((scaleX + scaleY) / 2) });
                }
              }
              fabricCanvas.add(fabricObj);
            }
          });

          fabricCanvas.renderAll();
          const dataUrl = fabricCanvas.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: 1 });
          fabricCanvas.dispose();
          return dataUrl;
        } catch {
          return null;
        }
      };

      // 数量表データをPDF入力形式に変換（注釈付き画像をレンダリング）
      const pdfGroups = await Promise.all(
        groups.map(async (group, index) => {
          let photoDataUrl: string | null = null;
          if (group.surveyImage) {
            const imageUrl = group.surveyImage.originalUrl;
            photoDataUrl = await renderAnnotatedImageToDataUrl(group.surveyImage.id, imageUrl);
          }

          return {
            name: getGroupDisplayName(group, index),
            displayOrder: group.displayOrder,
            photoDataUrl,
            photoComment: group.surveyImage?.comment || null,
            items: (group.items ?? []).map((item) => ({
              majorCategory: item.majorCategory || '',
              middleCategory: item.middleCategory || '',
              minorCategory: item.minorCategory || '',
              customCategory: item.customCategory || '',
              workType: item.workType || '',
              name: item.name || '',
              specification: item.specification || '',
              calculationMethod:
                item.calculationMethod === 'STANDARD'
                  ? '標準'
                  : item.calculationMethod === 'AREA_VOLUME'
                    ? '面積・体積'
                    : 'ピッチ',
              quantity: String(item.quantity),
              unit: item.unit || '',
              remarks: item.remarks || '',
            })),
          };
        })
      );

      // PDF生成
      const now = new Date();
      const createdDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
      const blob = await generateQuantityTablePdf({
        quantityTableName: renderTable.name,
        projectName: renderTable.project.name,
        createdDate,
        groups: pdfGroups,
      });

      // ダウンロード
      downloadPdf(blob, `${renderTable.name}.pdf`);
    } catch {
      // REQ-26.10: エラーメッセージ表示
      setOperationError('PDF生成中にエラーが発生しました。再度お試しください。');
    } finally {
      setIsPdfGenerating(false);
    }
  }, [isPdfGenerating, renderTable]);

  /**
   * インポートハンドラ
   *
   * Requirements: 27.1, 31.3, 31.8
   *
   * ImportDialogから受け取った数量項目をグループに一括追加する。
   */
  const handleImport = useCallback(
    async (groupId: string, items: ImportQuantityItem[]) => {
      setOperationError(null);

      try {
        const targetGroup = (renderTable?.groups ?? []).find((g) => g.id === groupId);
        const currentItems = targetGroup?.items ?? [];
        const maxDisplayOrder = currentItems.reduce(
          (max, item) => Math.max(max, item.displayOrder),
          -1
        );

        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          await createQuantityItem(groupId, {
            majorCategory: item.majorCategory,
            middleCategory: item.middleCategory || null,
            minorCategory: item.minorCategory || null,
            customCategory: item.customCategory || null,
            workType: item.workType,
            name: item.name,
            specification: item.specification || null,
            unit: item.unit,
            quantity: item.quantity,
            calculationMethod: item.calculationMethod,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: item.roundingUnit,
            remarks: item.remarks || null,
            displayOrder: maxDisplayOrder + 1 + i,
          });
        }

        // 取り込み結果でドラフトを再シードする（インポートは REQ-42.4 / Task 61.3 で
        // クライアント側ドラフト反映へ移行予定。現時点では既存API+再取得を維持する）
        await fetchQuantityTableDetail();
      } catch {
        setOperationError('インポートに失敗しました');
        throw new Error('インポートに失敗しました');
      }
    },
    [renderTable, fetchQuantityTableDetail]
  );

  /**
   * 「現場調査から一括追加」ボタン押下ハンドラ
   *
   * Task 57.3
   * Requirements: 40.1, 40.2
   *
   * 当該プロジェクトの現場調査一覧を取得し、`imageCount` を `photoCount` に
   * マッピングして現場調査選択ダイアログを開く。
   */
  const handleOpenSurveySelect = useCallback(async () => {
    if (!snapshot || isCreatingFromSurvey) return;

    setOperationError(null);
    setIsSurveySelectDialogOpen(true);
    setSurveyOptions([]);

    try {
      const result = await getSiteSurveys(snapshot.projectId, { limit: 100 });
      const options: SiteSurveySummary[] = result.data.map((survey) => ({
        id: survey.id,
        name: survey.name,
        photoCount: survey.imageCount,
      }));
      setSurveyOptions(options);
    } catch {
      setOperationError('現場調査一覧の読み込みに失敗しました');
      setIsSurveySelectDialogOpen(false);
    }
  }, [snapshot, isCreatingFromSurvey]);

  /**
   * 現場調査選択ダイアログを閉じる
   *
   * Task 57.3
   */
  const handleCloseSurveySelect = useCallback(() => {
    // 生成中はロック（重複実行防止のため閉じない）
    if (isCreatingFromSurvey) return;
    setIsSurveySelectDialogOpen(false);
    setSurveyOptions([]);
  }, [isCreatingFromSurvey]);

  /**
   * 現場調査からの一括生成を確定するハンドラ（クライアントサイドドラフト生成）
   *
   * Task 61.3
   * Requirements: 42.4, 40.3, 40.4, 40.5, 40.7, 40.9, 40.13
   *
   * REQ-42 適用後の動作:
   * - 対象現場調査の写真一覧を参照系GET（getSiteSurvey）で取得する（REQ-42.10 の制約対象外）。
   * - 写真枚数分の数量グループをクライアントサイドのドラフトへ生成する。
   *   採番・連番命名「{現場調査名} {連番}」・写真順 surveyImageId 紐づけ・項目0件・末尾追加は
   *   reducer の `generateGroupsFromSurvey` が担当する（REQ-40.3/40.4/40.5/40.7/40.9）。
   * - 永続化を目的とするサーバーAPI（POST /from-survey）および詳細再取得は本フローで呼ばない（REQ-42.4）。
   * - 写真の表示順は `displayOrder` 昇順を正とし、その順序で surveyImageId を渡す。
   * - 紐づけ写真のコメント・サムネイルを既存の表示経路（renderTable の linkedPhotoSummaries 経由、
   *   REQ-21/35、REQ-40.8）に乗せるため、写真サマリを linkedPhotoSummaries へ登録する。
   * - 実行中インジケーター表示・重複実行防止（REQ-40.11、isCreatingFromSurvey）。
   * - 写真0枚の場合は「写真が存在しません」メッセージを表示しグループを生成しない（REQ-40.10）。
   * - 成功時は生成グループ数を含む完了メッセージを表示する（REQ-40.13）。
   * - 失敗時はエラーメッセージを表示し、不完全な生成データを残さない（REQ-40.12）。
   */
  const handleConfirmCreateFromSurvey = useCallback(
    async (siteSurveyId: string) => {
      if (!id || isCreatingFromSurvey) return;

      setIsCreatingFromSurvey(true);
      setOperationError(null);

      try {
        // 参照系GETで対象現場調査の写真一覧を取得する（REQ-42.10、永続化を伴わない）
        const surveyDetail = await getSiteSurvey(siteSurveyId);
        // 写真順は displayOrder 昇順を正とする（REQ-40.4）
        const orderedImages = [...surveyDetail.images].sort(
          (a, b) => a.displayOrder - b.displayOrder
        );

        if (orderedImages.length === 0) {
          // 写真0枚: グループは生成しない（REQ-40.10）
          setOperationError('写真が存在しません');
          return;
        }

        // 紐づけ写真のサマリ（サムネイル・コメント等）を既存表示経路へ供給する（REQ-40.8）
        setLinkedPhotoSummaries((prev) => {
          const next = { ...prev };
          for (const img of orderedImages) {
            next[img.id] = {
              id: img.id,
              thumbnailUrl: img.thumbnailUrl || img.originalUrl || '',
              originalUrl: img.originalUrl || '',
              fileName: img.fileName,
              hasAnnotations: !!img.annotatedThumbnailUrl,
              annotatedThumbnailUrl: img.annotatedThumbnailUrl ?? null,
              comment: img.comment ?? null,
            };
          }
          return next;
        });

        // クライアントサイドのドラフトへ写真枚数分のグループを生成する（REQ-42.4）
        const surveyImageIds = orderedImages.map((img) => img.id);
        dispatch({
          type: 'generateGroupsFromSurvey',
          surveyName: surveyDetail.name,
          surveyImageIds,
        });

        setIsSurveySelectDialogOpen(false);
        setSurveyOptions([]);

        setSaveMessage(`${surveyImageIds.length}件のグループを生成しました`);
        setTimeout(() => setSaveMessage(null), 3000);
      } catch {
        // 写真一覧取得失敗等。ドラフトは未変更のままで不完全データを残さない（REQ-40.12）
        setOperationError('現場調査からの一括生成に失敗しました');
      } finally {
        setIsCreatingFromSurvey(false);
      }
    },
    [id, isCreatingFromSurvey]
  );

  /**
   * 保存ハンドラ
   *
   * Task 61.4: 保存ハンドラを saveDraft へ移行し保存後同期・失敗時保持を実装する
   * Requirements: 42.5, 42.7, 42.8, 42.9, 11.1, 11.2
   *
   * - クライアント検証（必須・丸め設定）後、編集ドラフトの全状態を
   *   {@link buildSaveQuantityTableDraftInput} でフル状態同期保存ペイロードへ構築し、
   *   {@link saveQuantityTableDraft}（PUT /:id/save）を1回だけ呼び出す（REQ-42.5）。
   *   楽観ロック用 expectedUpdatedAt はサーバースナップショットの updatedAt を渡す。
   * - 成功時: レスポンスの最新 QuantityTableDetail でスナップショット（参照情報・写真サマリ供給元）と
   *   ドラフト（reducer saveSync → isDirty=false）を同期し、「保存しました」を表示する（REQ-42.8）。
   *   saveDraft レスポンスで同期するため保存後の再取得（GET）は行わない。
   * - 失敗時: 409 は競合専用メッセージ、それ以外（400/500等）は一般エラーメッセージを表示し、
   *   ドラフト（未保存の変更）を保持したまま再保存可能とする（REQ-42.9）。
   * - 自動保存は持たず、永続化は本保存操作時にのみ実行する（REQ-42.7）。
   */
  const handleSave = useCallback(async () => {
    const draftToSave = editState.draft;
    if (!draftToSave || !snapshot || !id) return;

    // REQ-11.2: 整合性チェック（ドラフトの最終状態を検証する）
    const validationErrors: string[] = [];
    for (const group of draftToSave.groups) {
      const groupLabel = group.name ?? '';
      for (const item of group.items) {
        // 項目名が空の場合はエラー
        if (!item.name || item.name.trim() === '') {
          validationErrors.push(`グループ「${groupLabel}」に項目名が空の項目があります`);
        }
        // 丸め設定が0以下の場合はエラー
        if (Number(item.roundingUnit) <= 0) {
          validationErrors.push(
            `グループ「${groupLabel}」の項目「${item.name || '(名称未設定)'}」の丸め設定が無効です`
          );
        }
      }
    }

    // エラーがある場合は保存を中断
    if (validationErrors.length > 0) {
      setOperationError('保存できません: ' + validationErrors[0]);
      return;
    }

    // フル状態同期保存（REQ-42.5）。1回の PUT で全状態を確定する。
    setSaveMessage('保存中...');
    setOperationError(null);

    try {
      // ドラフトの全状態をペイロードへ構築（displayOrder は配列順、新規行は tempId 保持）
      const input = buildSaveQuantityTableDraftInput(draftToSave, snapshot.updatedAt);

      // 1回のAPIリクエストでフル状態を保存し、採番済みの最新詳細を取得する
      const savedDetail = await saveQuantityTableDraft(id, input);

      // REQ-42.8: サーバー最新データでスナップショット/ドラフトを同期し isDirty=false
      setSnapshot(savedDetail);
      setLinkedPhotoSummaries({});
      dispatch({ type: 'saveSync', detail: savedDetail });

      setSaveMessage('保存しました');
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
    } catch (error) {
      // REQ-42.9: 失敗時はエラー表示し、ドラフト（未保存変更）を保持して再保存可能とする
      if (error instanceof ApiError && error.statusCode === 409) {
        // 楽観ロック競合（409）は競合専用メッセージを表示する
        setOperationError(
          '他のユーザーによって更新されました。ページを再読み込みして最新データを確認してください。'
        );
      } else {
        setOperationError('保存に失敗しました。再度お試しください。');
      }
      setSaveMessage(null);
    }
  }, [id, editState.draft, snapshot]);

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} />
          <p>読み込み中...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </main>
    );
  }

  // 読み込みエラー表示（全画面）
  if (loadError) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{loadError}</p>
          <button type="button" onClick={fetchQuantityTableDetail} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // データがない場合
  if (!renderTable) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>数量表が見つかりません</p>
        </div>
      </main>
    );
  }

  const groups = renderTable.groups ?? [];

  return (
    <main role="main" style={styles.container} data-testid="quantity-table-edit-area">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: renderTable.project.name, path: `/projects/${renderTable.projectId}` },
            { label: '数量表一覧', path: `/projects/${renderTable.projectId}/quantity-tables` },
            { label: renderTable.name },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link
            to={`/projects/${renderTable.projectId}/quantity-tables`}
            style={styles.backLink}
            aria-label="数量表一覧に戻る"
          >
            ← 数量表一覧に戻る
          </Link>
          <h1 style={{ margin: 0 }}>
            <input
              type="text"
              value={editingName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onFocus={handleNameFocus}
              onKeyDown={handleNameKeyDown}
              style={{
                ...styles.titleInput,
                ...(isNameFocused ? styles.titleInputFocused : {}),
              }}
              aria-label="数量表名"
            />
          </h1>
          <p style={styles.subtitle}>
            {renderTable.groupCount}グループ / {renderTable.itemCount}項目
          </p>
        </div>
        <div style={styles.headerActions}>
          {/* Task 62.2: 未保存変更インジケーター（REQ-44）。isDirty の間のみ保存ボタン付近に表示 */}
          <UnsavedChangesBadge isUnsaved={isDirty} />
          {saveMessage && (
            <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: 500 }}>
              {saveMessage}
            </span>
          )}
          <button
            type="button"
            style={{
              ...styles.pdfExportButton,
              backgroundColor: '#0891b2',
            }}
            onClick={() => setIsImportDialogOpen(true)}
            aria-label="インポート"
          >
            インポート
          </button>
          <button
            type="button"
            style={{
              ...styles.pdfExportButton,
              opacity: isPdfGenerating ? 0.7 : 1,
              cursor: isPdfGenerating ? 'wait' : 'pointer',
            }}
            onClick={handlePdfExport}
            disabled={isPdfGenerating}
            aria-label="PDF出力"
          >
            {isPdfGenerating ? 'PDF生成中...' : 'PDF出力'}
          </button>
          <button type="button" style={styles.saveButton} onClick={handleSave} aria-label="保存">
            保存
          </button>
          <button
            type="button"
            style={styles.addGroupButton}
            onClick={handleAddGroup}
          >
            <PlusIcon />
            グループを追加
          </button>
          {/* 現場調査から一括追加ボタン (Task 57.3: REQ-40.1) */}
          <button
            type="button"
            style={{
              ...styles.addGroupButton,
              backgroundColor: '#0d9488',
              opacity: isCreatingFromSurvey ? 0.7 : 1,
              cursor: isCreatingFromSurvey ? 'wait' : 'pointer',
            }}
            onClick={handleOpenSurveySelect}
            disabled={isCreatingFromSurvey}
            aria-busy={isCreatingFromSurvey}
            data-testid="bulk-create-from-survey-button"
          >
            <PlusIcon />
            現場調査から一括追加
          </button>
        </div>
      </div>

      {/* 操作エラー表示（インライン） */}
      {operationError && (
        <div role="alert" style={styles.operationErrorContainer}>
          <p style={styles.operationErrorText}>{operationError}</p>
          <button
            type="button"
            style={styles.operationErrorDismiss}
            onClick={() => setOperationError(null)}
            aria-label="エラーを閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* グループ一覧 */}
      {groups.length === 0 ? (
        <EmptyState onAddGroup={handleAddGroup} />
      ) : (
        <div style={styles.groupList} data-testid="quantity-group-section">
          {groups.map((group, index) => (
            <div key={group.id} data-testid="quantity-group">
              <QuantityGroupCard
                group={group}
                groupDisplayName={getGroupDisplayName(group, index)}
                isEditable
                onAddItem={handleAddItem}
                onDeleteGroup={handleDeleteGroup}
                onSelectImage={handleSelectImage}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onCopyItem={handleCopyItem}
                onMoveItem={handleMoveItem}
                onOpenAnnotationViewer={handleOpenAnnotationViewer}
                getSuggestions={getSuggestions}
                onBlurAddCandidate={addCandidateOnBlur}
                onRenameGroup={handleRenameGroup}
                groupIndex={index}
                groupTotalCount={groups.length}
                onMoveGroupUp={handleMoveGroupUp}
                onMoveGroupDown={handleMoveGroupDown}
                onCopyGroup={handleCopyGroup}
              />
            </div>
          ))}
        </div>
      )}

      {/* 削除確認ダイアログ (REQ-4.5) */}
      {groupToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          style={styles.dialogOverlay}
          onClick={handleCancelDelete}
        >
          <div style={styles.dialogContent} onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-dialog-title" style={styles.dialogTitle}>
              グループを削除しますか？
            </h2>
            <p style={styles.dialogMessage}>
              このグループとその中のすべての項目が削除されます。この操作は元に戻せません。
            </p>
            <div style={styles.dialogActions}>
              <button type="button" style={styles.cancelButton} onClick={handleCancelDelete}>
                キャンセル
              </button>
              <button
                type="button"
                style={styles.deleteButton}
                onClick={handleConfirmDeleteGroup}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 写真選択ダイアログ (REQ-4.3) */}
      {isPhotoDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-dialog-title"
          style={styles.dialogOverlay}
          onClick={handleClosePhotoDialog}
        >
          <div style={styles.photoDialogContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.photoDialogHeader}>
              <h2 id="photo-dialog-title" style={styles.dialogTitle}>
                写真を選択
              </h2>
              <button
                type="button"
                style={styles.closeButton}
                onClick={handleClosePhotoDialog}
                aria-label="ダイアログを閉じる"
              >
                ×
              </button>
            </div>
            {isLoadingPhotos ? (
              <div style={styles.emptyPhotos}>
                <p>写真を読み込み中...</p>
              </div>
            ) : availablePhotos.length === 0 ? (
              <div style={styles.emptyPhotos}>
                <p>利用可能な写真がありません</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>
                  現場調査で写真をアップロードしてください
                </p>
              </div>
            ) : (
              <div style={styles.photoGrid} data-testid="photo-list">
                {availablePhotos.map((photo) => {
                  const hasPhotoAnnotations =
                    photo.hasAnnotations || (photo.annotations?.length ?? 0) > 0;
                  return (
                    <div
                      key={photo.id}
                      style={{ ...styles.photoItem, position: 'relative' as const }}
                      onClick={() => handlePhotoSelect(photo.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${photo.fileName}を選択`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePhotoSelect(photo.id);
                        }
                      }}
                    >
                      <img
                        src={photo.thumbnailUrl || photo.originalUrl || ''}
                        alt={photo.fileName}
                        style={styles.photoImage}
                        data-testid={`photo-item-${photo.id}`}
                      />
                      {/* 注釈バッジ (REQ-3.3) */}
                      {hasPhotoAnnotations && (
                        <span
                          data-testid={`photo-annotation-badge-${photo.id}`}
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
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 注釈ビューアモーダル (REQ-4.4) */}
      {annotationViewerGroupId &&
        (() => {
          const viewerGroup = groups.find((g) => g.id === annotationViewerGroupId);
          if (!viewerGroup?.surveyImage) return null;
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="annotation-viewer-title"
              style={styles.dialogOverlay}
              onClick={handleCloseAnnotationViewer}
              data-testid="annotation-viewer-modal"
            >
              <div
                style={{
                  ...styles.photoDialogContent,
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={styles.photoDialogHeader}>
                  <h2 id="annotation-viewer-title" style={styles.dialogTitle}>
                    {getGroupDisplayName(viewerGroup, groups.indexOf(viewerGroup))} - 紐付け画像
                  </h2>
                  <button
                    type="button"
                    style={styles.closeButton}
                    onClick={handleCloseAnnotationViewer}
                    aria-label="ダイアログを閉じる"
                  >
                    ×
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    overflow: 'auto',
                    padding: '16px',
                  }}
                >
                  <AnnotatedImageThumbnail
                    image={{
                      id: viewerGroup.surveyImage.id,
                      originalUrl: viewerGroup.surveyImage.originalUrl,
                    }}
                    alt={viewerGroup.surveyImage.fileName}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      objectFit: 'contain',
                    }}
                    loading="eager"
                  />
                </div>
                <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <button
                    type="button"
                    style={styles.actionButton}
                    onClick={() => {
                      handleCloseAnnotationViewer();
                      handleSelectImage(annotationViewerGroupId);
                    }}
                  >
                    別の写真を選択
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* インポートダイアログ (REQ-27.1) */}
      <ImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImport={handleImport}
        groups={groups}
      />

      {/* 現場調査選択ダイアログ (Task 57.3: REQ-40.1, 40.2, 40.11, 40.13) */}
      <SurveySelectDialog
        isOpen={isSurveySelectDialogOpen}
        siteSurveys={surveyOptions}
        isCreating={isCreatingFromSurvey}
        onConfirm={handleConfirmCreateFromSurvey}
        onClose={handleCloseSurveySelect}
      />

      {/* 未保存変更時の離脱確認ダイアログ (Task 62.1: REQ-43.1, 43.3, 43.4) */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onLeave={() => blocker.proceed?.()}
        onStay={() => blocker.reset?.()}
      />
    </main>
  );
}
