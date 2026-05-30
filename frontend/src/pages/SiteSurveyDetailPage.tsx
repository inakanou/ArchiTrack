/**
 * @fileoverview 現場調査詳細ページ
 *
 * Task 10.3: 現場調査詳細から画像ビューアへの導線を実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 * Task 27.6: 現場調査詳細画面への写真一覧管理パネル統合
 * Task 87.3: 一括エクスポート起動ボタンと選択状態管理
 *
 * 現場調査の詳細情報と画像一覧を表示するページコンポーネントです。
 * 画像グリッドから画像ビューア/エディタへの遷移機能を提供します。
 *
 * Requirements:
 * - 2.3: 現場調査一覧の項目クリックで詳細画面に遷移する（遷移先）
 * - 2.4: 詳細画面の画像クリックで画像ビューア/エディタに遷移する
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
 * - 2.7: ユーザーがブレッドクラムの各項目をクリックすると対応する画面に遷移する
 * - 10.1: 報告書出力対象写真の選択
 * - 10.5: ドラッグアンドドロップによる写真順序変更
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 * - 31.1: 全件一括エクスポート起動
 * - 31.2: 選択画像エクスポート起動
 * - 31.3: 選択件数の UI 反映
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Breadcrumb } from '../components/common';
import { buildSiteSurveyDetailBreadcrumb } from '../utils/siteSurveyBreadcrumb';
import { getSiteSurvey, deleteSiteSurvey } from '../api/site-surveys';
import {
  uploadSurveyImages,
  updateSurveyImageOrder,
  updateImageMetadataBatch,
  deleteSurveyImage,
} from '../api/survey-images';
import { useSiteSurveyPermission } from '../hooks/useSiteSurveyPermission';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import SiteSurveyDetailInfo from '../components/site-surveys/SiteSurveyDetailInfo';
import { PhotoManagementPanel } from '../components/site-surveys/PhotoManagementPanel';
import {
  ImageUploader,
  type UploadProgress,
  type ValidationError,
} from '../components/site-surveys/ImageUploader';
import BulkExportDialog, {
  type BulkExportDialogMode,
  type BulkExportStartArgs,
} from '../components/site-surveys/BulkExportDialog';
import BulkExportProgressDialog, {
  type PartialFailureChoice,
} from '../components/site-surveys/BulkExportProgressDialog';
import type { BulkExportProgress, BulkExportResult } from '../services/export/bulkExportService';
import type {
  SiteSurveyDetail,
  SurveyImageInfo,
  ImageOrderItem,
  UpdateImageMetadataInput,
  BatchUpdateImageMetadataInput,
} from '../types/site-survey.types';

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
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
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
  imageSection: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
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
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '12px',
  } as React.CSSProperties,
  dialogText: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  confirmDeleteButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  // Task 87.3: 一括エクスポート起動ボタン用スタイル
  bulkExportActions: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  bulkExportButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    border: '1px solid #1d4ed8',
    transition: 'all 0.2s ease',
  } as React.CSSProperties,
  bulkExportButtonDisabled: {
    backgroundColor: '#9ca3af',
    borderColor: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 削除確認ダイアログ
 */
interface DeleteDialogProps {
  surveyName: string;
  isOpen: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmDialog({
  surveyName,
  isOpen,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={STYLES.dialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div style={STYLES.dialogContent}>
        <h2 id="delete-dialog-title" style={STYLES.dialogTitle}>
          現場調査を削除しますか？
        </h2>
        <p style={STYLES.dialogText}>「{surveyName}」を削除します。この操作は取り消せません。</p>
        <div style={STYLES.dialogActions}>
          <button
            type="button"
            onClick={onCancel}
            style={STYLES.cancelButton}
            disabled={isDeleting}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={STYLES.confirmDeleteButton}
            disabled={isDeleting}
          >
            {isDeleting ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 現場調査詳細ページ
 *
 * 現場調査の基本情報と画像一覧を表示し、各画像から
 * 画像ビューア/エディタへの遷移機能を提供します。
 */
export default function SiteSurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // 権限チェック (Requirement 12.2)
  const { canEdit, canDelete } = useSiteSurveyPermission();

  // データ状態
  const [survey, setSurvey] = useState<SiteSurveyDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 画像アップロード状態
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | undefined>(undefined);

  // 手動保存方式の状態 (Task 33.1, 33.2)
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  // 未保存の変更をトラッキングするためのMap: imageId -> { comment?, includeInReport? }
  const pendingChangesRef = useRef<Map<string, UpdateImageMetadataInput>>(new Map());
  // 未保存の順序変更をトラッキング
  const pendingOrderRef = useRef<ImageOrderItem[] | null>(null);

  // ページ離脱警告フック (Task 33.2: ページ離脱時の確認ダイアログ)
  const { isDirty, markAsChanged, markAsSaved } = useUnsavedChanges({
    message: '保存されていない変更があります。このページを離れますか？',
    enabled: canEdit,
  });

  // 一括エクスポート関連 state (Task 87.3, Requirements 31.1, 31.2, 31.3)
  // 選択中の画像 ID 集合。SurveyImageGrid と双方向同期する想定だが、
  // 本ページの実 UI は PhotoManagementPanel のため、選択 UI の組み込みは
  // 別タスクの責務とし、本タスクではページ側の state と Props 受け渡し経路を確立する。
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  // 起動中の BulkExportDialog モード（null は閉）
  const [bulkExportMode, setBulkExportMode] = useState<BulkExportDialogMode | null>(null);
  // 実行中の bulkExportService.execute promise と controller
  const [bulkExportPromise, setBulkExportPromise] = useState<Promise<BulkExportResult> | null>(
    null
  );
  const [bulkExportController, setBulkExportController] = useState<AbortController | null>(null);
  // 進捗（onProgress で更新）
  const [bulkExportProgress, setBulkExportProgress] = useState<BulkExportProgress | null>(null);

  /**
   * 現場調査詳細データを取得
   */
  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getSiteSurvey(id);
      setSurvey(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '現場調査の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込みおよび画像編集画面から戻った時の再取得
  useEffect(() => {
    fetchData();
  }, [fetchData, location.key]);

  /**
   * 画像クリックハンドラ (Requirement 2.4)
   *
   * 画像グリッドの画像をクリックした際に画像ビューア/エディタへ遷移します。
   */
  const handleImageClick = useCallback(
    (image: SurveyImageInfo) => {
      navigate(`/site-surveys/${id}/images/${image.id}`);
    },
    [navigate, id]
  );

  /**
   * 画像順序変更ハンドラ (Requirement 10.5, 10.6, 10.7)
   *
   * ドラッグアンドドロップまたは上へ移動/下へ移動ボタンで順序が変更された時に呼び出され、
   * ローカル状態のみを更新します。APIへの保存は保存ボタンで一括実行されます。
   */
  const handleOrderChange = useCallback(
    (newOrders: ImageOrderItem[]) => {
      if (!id || !survey) return;

      // ローカル状態を即座に更新（UI反映用）
      setSurvey((prev) => {
        if (!prev) return prev;
        // newOrdersに基づいてimagesのdisplayOrderを更新
        const orderMap = new Map(newOrders.map((o) => [o.id, o.order]));
        return {
          ...prev,
          images: prev.images.map((img) => ({
            ...img,
            displayOrder: orderMap.get(img.id) ?? img.displayOrder,
          })),
        };
      });

      // pendingOrderに変更を保存
      pendingOrderRef.current = newOrders;

      // 未保存フラグを設定
      markAsChanged();
    },
    [id, survey, markAsChanged]
  );

  /**
   * 画像メタデータ変更ハンドラ (Task 33.1: 手動保存方式)
   *
   * 報告書出力フラグやコメントが変更された時に、ローカル状態を更新し、
   * pendingChangesに変更を追記します。
   * APIへの保存は保存ボタンクリック時に一括で行います。
   */
  const handleImageMetadataChange = useCallback(
    (imageId: string, metadata: UpdateImageMetadataInput) => {
      // ローカル状態を即座に更新（UI反映用）
      setSurvey((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          images: prev.images.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  ...(metadata.includeInReport !== undefined && {
                    includeInReport: metadata.includeInReport,
                  }),
                  ...(metadata.comment !== undefined && { comment: metadata.comment }),
                }
              : img
          ),
        };
      });

      // pendingChangesに変更を追記
      const existingChanges = pendingChangesRef.current.get(imageId) || {};
      pendingChangesRef.current.set(imageId, {
        ...existingChanges,
        ...metadata,
      });

      // 未保存フラグを設定
      markAsChanged();
    },
    [markAsChanged]
  );

  /**
   * メタデータ・順序一括保存ハンドラ (Task 33.1: 手動保存方式)
   *
   * 保存ボタンクリック時に、pendingChangesとpendingOrderにある全ての変更を
   * batch APIを使用して一括保存します。
   */
  const handleSaveMetadata = useCallback(async () => {
    const hasMetadataChanges = pendingChangesRef.current.size > 0;
    const hasOrderChanges = pendingOrderRef.current !== null;

    if (!hasMetadataChanges && !hasOrderChanges) return;

    setIsSavingMetadata(true);
    setError(null);

    try {
      // メタデータの保存
      if (hasMetadataChanges) {
        // pendingChangesをBatchUpdateImageMetadataInput[]に変換
        const updates: BatchUpdateImageMetadataInput[] = [];
        pendingChangesRef.current.forEach((changes, imageId) => {
          updates.push({
            id: imageId,
            ...changes,
          });
        });

        // 一括更新APIを呼び出し
        await updateImageMetadataBatch(updates);
      }

      // 順序の保存
      if (hasOrderChanges && id && pendingOrderRef.current) {
        await updateSurveyImageOrder(id, pendingOrderRef.current);
      }

      // 成功したらpendingChangesとpendingOrderをクリア
      pendingChangesRef.current.clear();
      pendingOrderRef.current = null;
      markAsSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setIsSavingMetadata(false);
    }
  }, [id, markAsSaved]);

  /**
   * 編集ボタンクリックハンドラ
   */
  const handleEdit = useCallback(() => {
    navigate(`/site-surveys/${id}/edit`);
  }, [navigate, id]);

  /**
   * 削除ボタンクリックハンドラ
   */
  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  /**
   * 削除確認ハンドラ
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!id || !survey) return;

    setIsDeleting(true);
    try {
      await deleteSiteSurvey(id);
      // 削除成功後、現場調査一覧へ遷移
      navigate(`/projects/${survey.projectId}/site-surveys`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  }, [id, survey, navigate]);

  /**
   * 削除キャンセルハンドラ
   */
  const handleDeleteCancel = useCallback(() => {
    setShowDeleteDialog(false);
  }, []);

  /**
   * 画像削除ハンドラ (Task 34: 画像削除機能)
   *
   * PhotoManagementPanelから呼び出され、指定された画像を削除します。
   * 削除成功後、ローカルの画像リストを更新します。
   *
   * Requirements:
   * - 10.10: 画像削除確認ダイアログ表示
   * - 10.11: 画像削除実行
   */
  const handleImageDelete = useCallback(async (imageId: string) => {
    try {
      // 画像削除APIを呼び出し
      await deleteSurveyImage(imageId);

      // ローカルの画像リストから削除
      setSurvey((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          images: prev.images.filter((img) => img.id !== imageId),
        };
      });

      // pendingChangesから該当画像の変更を削除
      pendingChangesRef.current.delete(imageId);

      // pendingOrderRefから該当画像を削除し、順序を再計算
      if (pendingOrderRef.current) {
        const filteredOrders = pendingOrderRef.current.filter((o) => o.id !== imageId);
        // 順序を1から連番に再計算
        pendingOrderRef.current = filteredOrders.map((o, index) => ({
          ...o,
          order: index + 1,
        }));
      }

      // 一括エクスポート選択集合からも該当 ID を除去 (Task 87.3, Requirement 31.3)
      setSelectedImageIds((prev) => {
        if (!prev.has(imageId)) return prev;
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像の削除に失敗しました');
      throw err; // PhotoManagementPanelにエラーを伝播
    }
  }, []);

  /**
   * 画像アップロードハンドラ
   *
   * ImageUploaderからバリデーション済みファイルを受け取り、
   * 現場調査に画像をアップロードします。
   *
   * Task 46.2: バッチアップロードエラーをユーザーに通知
   * Requirements: 19.11, 19.13, 19.14, 19.15, 19.16
   */
  const handleImageUpload = useCallback(
    async (files: File[]) => {
      if (!id) return;

      setIsUploading(true);
      setError(null);
      setUploadProgress({ completed: 0, total: files.length, current: 0 });

      try {
        const { results, errors } = await uploadSurveyImages(id, files, {
          onProgress: (progress) => {
            setUploadProgress({
              completed: progress.completed,
              total: progress.total,
              current: progress.current,
            });
          },
        });

        // 成功した画像がある場合、データを再取得して画像一覧を更新
        // fetchData内でsetError(null)が呼ばれるため、エラーメッセージ設定前に実行する
        if (results.length > 0) {
          await fetchData();
        }

        // エラーがある場合、ユーザーに通知 (Requirement 19.11)
        // fetchDataの後に設定することで、fetchData内のsetError(null)で上書きされることを防ぐ
        if (errors.length > 0) {
          const successCount = results.length;
          const errorCount = errors.length;

          // エラーメッセージ生成
          const errorDetails = errors
            .map((err) => {
              // エラーカテゴリ判定 (Requirement 19.14, 19.15)
              const isFileTypeError =
                err.error.includes('サポートされていないファイル形式') ||
                err.error.includes('サポートされていない画像形式') ||
                err.error.includes('MIMEタイプと一致しません');
              const reason = isFileTypeError
                ? 'サポートされていないファイル形式'
                : 'サーバーエラー';
              return `${err.fileName}: ${reason}`;
            })
            .join('\n');

          if (successCount > 0) {
            // 部分成功 (Requirement 19.13)
            setError(
              `${successCount}件のアップロードに成功しました。${errorCount}件のアップロードに失敗しました。\n${errorDetails}`
            );
          } else {
            // 全件失敗 (Requirement 19.14)
            setError(`全${errorCount}件のアップロードに失敗しました。\n${errorDetails}`);
          }
        }
      } finally {
        setIsUploading(false);
        setUploadProgress(undefined);
      }
    },
    [id, fetchData]
  );

  /**
   * バリデーションエラーハンドラ
   */
  const handleValidationError = useCallback((_errors: ValidationError[]) => {
    // バリデーションエラーはImageUploader内で表示されるため、
    // ここでは追加の処理は不要
  }, []);

  // ===========================================================================
  // 一括エクスポート関連ハンドラ (Task 87.3, Requirements 31.1, 31.2, 31.3, 31.15)
  // ===========================================================================

  /**
   * 選択画像エクスポート対象の解決
   *
   * `bulkExportMode === 'all'` → 現場調査配下の全画像
   * `bulkExportMode === 'selected'` → selectedImageIds に含まれる画像のみ
   */
  const bulkExportImages = useMemo<SurveyImageInfo[]>(() => {
    if (!survey) return [];
    if (bulkExportMode === 'all') {
      return survey.images;
    }
    if (bulkExportMode === 'selected') {
      return survey.images.filter((img) => selectedImageIds.has(img.id));
    }
    return [];
  }, [survey, bulkExportMode, selectedImageIds]);

  /** 「全件一括エクスポート」ボタン押下 (Requirement 31.1) */
  const handleBulkExportAll = useCallback(() => {
    setBulkExportMode('all');
  }, []);

  /** 「選択画像エクスポート」ボタン押下 (Requirement 31.2) */
  const handleBulkExportSelected = useCallback(() => {
    setBulkExportMode('selected');
  }, []);

  /** BulkExportDialog の close（キャンセル / 開始時の自動 close） */
  const handleBulkExportDialogClose = useCallback(() => {
    setBulkExportMode(null);
  }, []);

  /** BulkExportDialog の onStart: 親で promise / controller を保持 */
  const handleBulkExportStart = useCallback((args: BulkExportStartArgs) => {
    setBulkExportPromise(args.promise);
    setBulkExportController(args.controller);
    setBulkExportProgress(null);
  }, []);

  /** BulkExportDialog の onProgress: 進捗 state を更新 */
  const handleBulkExportProgress = useCallback((progress: BulkExportProgress) => {
    setBulkExportProgress(progress);
  }, []);

  /** BulkExportDialog の onEmptyTarget: 対象 0 件時の通知 (Requirement 31.15) */
  const handleBulkExportEmptyTarget = useCallback(() => {
    // 現時点では alert() で簡易通知する。
    // ※将来的に snackbar 等に置き換える余地あり
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert('エクスポート対象の画像がありません。');
    }
  }, []);

  /**
   * BulkExportProgressDialog の onComplete: result.status に応じて
   * ZIP ダウンロード or 中止を実行し、関連 state をリセットする。
   */
  const handleBulkExportComplete = useCallback(
    (result: BulkExportResult, decision?: PartialFailureChoice) => {
      try {
        const shouldDownload =
          result.status === 'success' ||
          (result.status === 'partial' && decision === 'download-partial');

        if (shouldDownload && result.zipBlob && result.zipFileName) {
          // Blob → a タグ download で ZIP をダウンロード
          const url = URL.createObjectURL(result.zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.zipFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } finally {
        // 進捗ダイアログ関連 state を必ずリセット
        setBulkExportPromise(null);
        setBulkExportController(null);
        setBulkExportProgress(null);
      }
    },
    []
  );

  // ローディング表示
  if (isLoading && !survey) {
    return (
      <main role="main" style={STYLES.container}>
        <div style={STYLES.loadingContainer}>
          <div role="status" style={STYLES.loadingSpinner} aria-label="読み込み中" />
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

  // エラー表示
  if (error && !survey) {
    return (
      <main role="main" style={STYLES.container}>
        <div role="alert" style={STYLES.errorContainer}>
          <p style={STYLES.errorText}>{error}</p>
          <button type="button" onClick={fetchData} style={STYLES.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // 現場調査が見つからない場合
  if (!survey || !id) {
    return null;
  }

  // ブレッドクラム生成 (Requirements 2.5, 2.6, 2.7)
  const breadcrumbItems = buildSiteSurveyDetailBreadcrumb(
    survey.projectId,
    survey.project.name,
    survey.id,
    survey.name
  );

  return (
    <main role="main" aria-busy={isLoading} style={STYLES.container}>
      {/* ブレッドクラムナビゲーション (Requirements 2.5, 2.6, 2.7) */}
      <div style={STYLES.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* 基本情報表示 (Requirement 12.2: 権限に基づくボタン表示制御) */}
      <SiteSurveyDetailInfo
        survey={survey}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        isDeleting={isDeleting}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {/* 画像一覧セクション (Requirement 2.4, Task 27.6) */}
      <div style={STYLES.imageSection}>
        <h3 style={STYLES.sectionTitle}>画像一覧</h3>

        {/* 一括エクスポート起動ボタン群 (Task 87.3, Requirements 31.1, 31.2, 31.3) */}
        <div style={STYLES.bulkExportActions} data-testid="bulk-export-actions">
          <button
            type="button"
            onClick={handleBulkExportAll}
            style={STYLES.bulkExportButton}
            data-testid="bulk-export-all-button"
          >
            全件一括エクスポート
          </button>
          <button
            type="button"
            onClick={handleBulkExportSelected}
            disabled={selectedImageIds.size === 0}
            style={{
              ...STYLES.bulkExportButton,
              ...(selectedImageIds.size === 0 ? STYLES.bulkExportButtonDisabled : {}),
            }}
            data-testid="bulk-export-selected-button"
            aria-disabled={selectedImageIds.size === 0}
          >
            選択画像エクスポート（{selectedImageIds.size} 件）
          </button>
        </div>

        {/* 画像アップロードUI (Requirement 4.1) */}
        {canEdit && (
          <div style={{ marginBottom: '24px' }}>
            <ImageUploader
              onUpload={handleImageUpload}
              onValidationError={handleValidationError}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              compact={true}
            />
          </div>
        )}

        {/* アップロードエラー表示 (Task 46.2, Requirements 19.11, 19.13, 19.14, 19.15) */}
        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
              whiteSpace: 'pre-line',
            }}
          >
            <p style={{ color: '#991b1b', fontSize: '14px', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* 写真管理パネル (Requirement 10.1: サムネイル一覧は表示せず、フルサイズ写真のみを表示) */}
        {/* Task 33.1: 手動保存方式に変更 - 保存ボタンとisDirty状態を追加 */}
        {/* Task 34: 画像削除機能を追加 */}
        <PhotoManagementPanel
          images={survey.images}
          onImageMetadataChange={handleImageMetadataChange}
          onImageClick={handleImageClick}
          onOrderChange={canEdit ? handleOrderChange : undefined}
          isLoading={isLoading}
          readOnly={!canEdit}
          showOrderNumbers={true}
          onSave={canEdit ? handleSaveMetadata : undefined}
          isDirty={isDirty}
          isSaving={isSavingMetadata}
          onDelete={canDelete ? handleImageDelete : undefined}
        />
      </div>

      {/* 削除確認ダイアログ */}
      <DeleteConfirmDialog
        surveyName={survey.name}
        isOpen={showDeleteDialog}
        isDeleting={isDeleting}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
      />

      {/* 一括エクスポート設定ダイアログ (Task 87.3, Requirements 31.1, 31.2, 31.4, 31.5, 31.15) */}
      {bulkExportMode !== null && (
        <BulkExportDialog
          open={true}
          mode={bulkExportMode}
          surveyId={survey.id}
          surveyName={survey.name}
          images={bulkExportImages}
          onClose={handleBulkExportDialogClose}
          onStart={handleBulkExportStart}
          onProgress={handleBulkExportProgress}
          onEmptyTarget={handleBulkExportEmptyTarget}
        />
      )}

      {/* 一括エクスポート進捗ダイアログ (Task 87.3, Requirements 31.10, 31.11, 31.13, 31.14) */}
      {bulkExportPromise !== null && bulkExportController !== null && (
        <BulkExportProgressDialog
          open={true}
          surveyName={survey.name}
          progress={bulkExportProgress}
          promise={bulkExportPromise}
          controller={bulkExportController}
          onComplete={handleBulkExportComplete}
        />
      )}

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
