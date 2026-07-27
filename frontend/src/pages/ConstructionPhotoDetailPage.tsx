/**
 * @fileoverview 工事写真アルバム詳細ページ
 *
 * Task 6.3: 詳細画面：写真項目管理＋3系統アップロード
 *
 * site-survey の SiteSurveyDetailPage を雛形に、工事写真アルバム配下の写真項目を
 * 管理する詳細画面を提供する。
 *   - 詳細1リクエストで写真項目＋署名付きサムネURLを一括取得（R7.8, R11.2, R11.3）
 *   - 3系統アップローダ（ローカル/カメラ/現調選択）で写真項目を追加（R4, R5, R6）
 *   - コメント/印刷対象/並び替えを未保存状態で保持し、手動「保存」でメタデータ一括更新＋
 *     表示順序更新の最大2リクエストに束ねて確定（R7.6, R11.4）
 *
 * ルート登録（routes.tsx）・看板配置エディタ（Task 6.4）・PDF出力（Task 8.x）は本タスクの
 * 境界外。5.1 のAPIクライアントを使用する。
 *
 * Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 7.1, 7.3, 7.4, 7.5, 7.6, 7.8, 11.3, 11.4, 11.5
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getConstructionPhotoAlbum } from '../api/construction-photos';
import {
  getConstructionPhotos,
  updateConstructionPhotoMetadataBatch,
  updateConstructionPhotoOrder,
  deleteConstructionPhoto,
} from '../api/construction-photo-images';
import { getProject } from '../api/projects';
import { ApiError } from '../api/client';
import { Breadcrumb } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import { PhotoUploader } from '../components/construction-photos/PhotoUploader';
import {
  PhotoItemPanel,
  type PhotoMetadataChange,
} from '../components/construction-photos/PhotoItemPanel';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoWithUrls,
  BatchUpdatePhotoMetadataItem,
  PhotoOrderItem,
} from '../types/construction-photo.types';
import type { ProjectDetail } from '../types/project.types';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
    overflowX: 'auto' as const,
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  } as React.CSSProperties,
  memo: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
  uploaderWrapper: {
    marginBottom: '24px',
  } as React.CSSProperties,
  notice: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    whiteSpace: 'pre-line' as const,
    color: '#991b1b',
    fontSize: '14px',
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
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事写真アルバム詳細ページ
 */
export default function ConstructionPhotoDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [album, setAlbum] = useState<ConstructionPhotoAlbum | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [photos, setPhotos] = useState<ConstructionPhotoWithUrls[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 未保存のメタデータ変更（photoId -> {comment?, includeInReport?}）
  const pendingChangesRef = useRef<Map<string, PhotoMetadataChange>>(new Map());
  // 未保存の順序変更
  const pendingOrderRef = useRef<PhotoOrderItem[] | null>(null);

  /**
   * アルバム・プロジェクト・写真項目一覧を取得する。
   * 写真項目は一覧APIで署名付きサムネURLと共に一括取得する（R7.8, R11.2）。
   */
  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const albumData = await getConstructionPhotoAlbum(id);
      setAlbum(albumData);

      const [photosResult, projectResult] = await Promise.allSettled([
        getConstructionPhotos(id),
        getProject(albumData.projectId),
      ]);

      if (photosResult.status === 'fulfilled') {
        setPhotos(photosResult.value);
      } else {
        throw photosResult.reason;
      }

      // プロジェクト取得失敗はブレッドクラムのみに影響するため致命的ではない
      setProject(projectResult.status === 'fulfilled' ? projectResult.value : null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || '工事写真アルバムの取得に失敗しました'
          : '工事写真アルバムの取得に失敗しました'
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 3系統アップローダから追加された写真項目をローカル状態へ追記する。
   * 応答には署名付きサムネURLが含まれるため再取得なしで即座に一覧へ反映する。
   */
  const handlePhotosAdded = useCallback((added: ConstructionPhotoWithUrls[]) => {
    if (added.length === 0) return;
    setNotice(null);
    setPhotos((prev) =>
      [...prev, ...added].sort((a, b) => a.displayOrder - b.displayOrder)
    );
  }, []);

  const handleUploaderNotify = useCallback((message: string) => {
    setNotice(message);
  }, []);

  /**
   * メタデータ（コメント/印刷対象）変更ハンドラ（未保存状態で保持, R7.1, R7.5）
   */
  const handleMetadataChange = useCallback(
    (photoId: string, metadata: PhotoMetadataChange) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? {
                ...p,
                ...(metadata.comment !== undefined && { comment: metadata.comment }),
                ...(metadata.includeInReport !== undefined && {
                  includeInReport: metadata.includeInReport,
                }),
              }
            : p
        )
      );

      const existing = pendingChangesRef.current.get(photoId) ?? {};
      pendingChangesRef.current.set(photoId, { ...existing, ...metadata });
      setIsDirty(true);
    },
    []
  );

  /**
   * 順序変更ハンドラ（未保存状態で保持, R7.3, R7.4）
   */
  const handleOrderChange = useCallback((newOrders: PhotoOrderItem[]) => {
    setPhotos((prev) => {
      const orderMap = new Map(newOrders.map((o) => [o.id, o.order]));
      return prev.map((p) => ({
        ...p,
        displayOrder: orderMap.get(p.id) ?? p.displayOrder,
      }));
    });
    pendingOrderRef.current = newOrders;
    setIsDirty(true);
  }, []);

  /**
   * 手動保存（R7.6, R11.4）
   * 未保存のメタデータ変更をメタバッチ1リクエスト、順序変更を順序更新1リクエストの
   * 最大2リクエストにまとめて確定する。
   */
  const handleSave = useCallback(async () => {
    if (!id) return;
    const hasMetadataChanges = pendingChangesRef.current.size > 0;
    const hasOrderChanges = pendingOrderRef.current !== null;
    if (!hasMetadataChanges && !hasOrderChanges) return;

    setIsSaving(true);
    setError(null);
    try {
      // メタデータ一括更新（1リクエスト）
      if (hasMetadataChanges) {
        const items: BatchUpdatePhotoMetadataItem[] = [];
        pendingChangesRef.current.forEach((changes, photoId) => {
          items.push({ id: photoId, ...changes });
        });
        await updateConstructionPhotoMetadataBatch(items);
      }

      // 表示順序更新（1リクエスト）
      if (hasOrderChanges && pendingOrderRef.current) {
        await updateConstructionPhotoOrder(id, pendingOrderRef.current);
      }

      pendingChangesRef.current.clear();
      pendingOrderRef.current = null;
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  }, [id]);

  /**
   * 写真項目削除ハンドラ（R7.7）
   */
  const handleDelete = useCallback(async (photoId: string) => {
    await deleteConstructionPhoto(photoId);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    pendingChangesRef.current.delete(photoId);
    if (pendingOrderRef.current) {
      pendingOrderRef.current = pendingOrderRef.current
        .filter((o) => o.id !== photoId)
        .map((o, index) => ({ ...o, order: index + 1 }));
    }
  }, []);

  // ローディング
  if (isLoading && !album) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} aria-label="読み込み中" />
          <p>読み込み中...</p>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  // エラー（データ未取得）
  if (error && !album) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchData} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  if (!album || !id) {
    return null;
  }

  // ブレッドクラム（階層規約の共通化は Task 7.1 で実施予定）
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト一覧', path: '/projects' },
    ...(project ? [{ label: project.name, path: `/projects/${album.projectId}` }] : []),
    { label: '工事写真一覧', path: `/projects/${album.projectId}/construction-photos` },
    { label: album.name },
  ];

  return (
    <main role="main" aria-busy={isLoading} style={styles.container}>
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div style={styles.header}>
        <h1 style={styles.title}>{album.name}</h1>
        {album.memo && <p style={styles.memo}>{album.memo}</p>}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>写真項目</h2>

        {/* 通知（部分失敗・保存エラーなど） */}
        {(notice || error) && (
          <div role="alert" style={styles.notice}>
            {notice ?? error}
          </div>
        )}

        {/* 3系統アップローダ（R4, R5, R6, R11.5） */}
        <div style={styles.uploaderWrapper}>
          <PhotoUploader
            albumId={album.id}
            projectId={album.projectId}
            onPhotosAdded={handlePhotosAdded}
            onNotify={handleUploaderNotify}
          />
        </div>

        {/* 写真項目管理パネル（R7, R11.3） */}
        <PhotoItemPanel
          photos={photos}
          onPhotoMetadataChange={handleMetadataChange}
          onOrderChange={handleOrderChange}
          onSave={handleSave}
          onDelete={handleDelete}
          isDirty={isDirty}
          isSaving={isSaving}
          isLoading={isLoading}
          showOrderNumbers
        />
      </div>

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
