/**
 * @fileoverview 現場調査詳細ページ
 *
 * Task 10.3: 現場調査詳細から画像ビューアへの導線を実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 * Task 27.6: 現場調査詳細画面への写真一覧管理パネル統合
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
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Breadcrumb } from '../components/common';
import { buildSiteSurveyDetailBreadcrumb } from '../utils/siteSurveyBreadcrumb';
import { getSiteSurvey, deleteSiteSurvey } from '../api/site-surveys';
import {
  uploadSurveyImages,
  updateImageMetadata,
  updateSurveyImageOrder,
} from '../api/survey-images';
import { useSiteSurveyPermission } from '../hooks/useSiteSurveyPermission';
import SiteSurveyDetailInfo from '../components/site-surveys/SiteSurveyDetailInfo';
import { PhotoManagementPanel } from '../components/site-surveys/PhotoManagementPanel';
import {
  ImageUploader,
  type UploadProgress,
  type ValidationError,
} from '../components/site-surveys/ImageUploader';
import type {
  SiteSurveyDetail,
  SurveyImageInfo,
  ImageOrderItem,
  UpdateImageMetadataInput,
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

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
   * 画像順序変更ハンドラ (Requirement 10.5, 10.6)
   *
   * ドラッグアンドドロップで順序が変更された時に呼び出され、
   * APIを呼び出して順序を保存します。
   */
  const handleOrderChange = useCallback(
    async (newOrders: ImageOrderItem[]) => {
      if (!id || !survey) return;

      try {
        await updateSurveyImageOrder(id, newOrders);
        // 順序変更後、データを再取得して表示を更新
        await fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : '順序の保存に失敗しました');
      }
    },
    [id, survey, fetchData]
  );

  /**
   * 画像メタデータ変更ハンドラ (Task 27.6)
   *
   * 報告書出力フラグやコメントが変更された時にAPIを呼び出します。
   */
  const handleImageMetadataChange = useCallback(
    async (imageId: string, metadata: UpdateImageMetadataInput) => {
      try {
        await updateImageMetadata(imageId, metadata);
        // 状態を即座に更新（楽観的UI更新）
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'メタデータの保存に失敗しました');
      }
    },
    []
  );

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
   * 画像アップロードハンドラ
   *
   * ImageUploaderからバリデーション済みファイルを受け取り、
   * 現場調査に画像をアップロードします。
   */
  const handleImageUpload = useCallback(
    async (files: File[]) => {
      if (!id) return;

      setIsUploading(true);
      setUploadProgress({ completed: 0, total: files.length, current: 0 });

      try {
        await uploadSurveyImages(id, files, {
          onProgress: (progress) => {
            setUploadProgress({
              completed: progress.completed,
              total: progress.total,
              current: progress.current,
            });
          },
        });

        // アップロード完了後、データを再取得して画像一覧を更新
        await fetchData();
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

        {/* 写真管理パネル (Requirement 10.1: サムネイル一覧は表示せず、フルサイズ写真のみを表示) */}
        <PhotoManagementPanel
          images={survey.images}
          onImageMetadataChange={handleImageMetadataChange}
          onImageClick={handleImageClick}
          onOrderChange={canEdit ? handleOrderChange : undefined}
          isLoading={isLoading}
          readOnly={!canEdit}
          showOrderNumbers={true}
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
