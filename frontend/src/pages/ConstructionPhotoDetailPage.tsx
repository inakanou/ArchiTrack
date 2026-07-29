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
 * ルート登録（routes.tsx）・看板配置エディタ（Task 6.4）は本タスクの境界外。5.1 のAPIクライアントを
 * 使用する。
 *
 * Task 8.2 追加: 「PDF出力」ボタンを追加し、印刷対象のみ・保存表示順で印字画像をオンデマンド取得して
 * 台帳PDFを出力する（看板重畳はサーバ委譲、印刷対象0件は非実行で通知）。
 *
 * Task 12.2 追加: ZIP一括エクスポート（全件/選択）を結線する。
 *   - エクスポート起動導線（全件/選択ボタン）、対象選択（`PhotoItemPanel` の選択チェックで
 *     選択集合を本コンポーネントが保持, R15.6, R15.7）
 *   - `AbortController` の生成・`ConstructionPhotoBulkExportService.export` の実行・
 *     進捗（`onProgress`）反映・中断（`abort()`）・完了後の ZIP ダウンロード確定は
 *     本コンポーネントが担うオーケストレーション（`BulkExportDialog`/
 *     `BulkExportProgressDialog` は疎結合なプレゼンテーション部品, R15.1, R15.8, R15.9）
 *   - 対象0件時は非実行のまま通知（`onEmptyTarget`, R15.11）
 *
 * Task 12.4 追加: 権限に基づくUI表示制御を結線する。
 *   - `useConstructionPhotoPermission` の canEdit/canDelete で編集系・削除系の操作手段を
 *     出し分け（権限ロード中は当該フックが安全側でfalseを返すため追加のロード判定は不要, R17.5）
 *   - canEdit=false: アップローダ・アルバム編集導線を非表示にし、`PhotoItemPanel` を
 *     `readOnly` で保存/並び替え/コメント/印刷対象/看板配置を抑止（R17.1, R17.3）
 *   - canDelete=false: アルバム削除導線を非表示にし、写真項目削除ハンドラを渡さない（R17.2）
 *
 * Task 12.5 追加: 未保存離脱警告を結線する（独自isDirty stateを共有フックへ置換）。
 *   - `useUnsavedChanges({ enabled: canEdit })` を用い、コメント/印刷対象/並び替え/看板配置の
 *     変更発生で `markAsChanged()`、保存成功で `markAsSaved()`（R18.1, R18.3）
 *   - `enabled: canEdit` により編集権限が無い場合は未保存追跡自体を無効化する（R18.4）
 *   - ブラウザのリロード/タブ・ウィンドウ閉じはフックの beforeunload が担う（R18.1）。
 *     アプリ内遷移は `useBlocker(uc.isDirty)`（QuantityTableEditPage/CompanyInfoPage/
 *     ItemizedStatementDetailPage の確立済みパターン）で `Breadcrumb` のリンククリックを含む
 *     遷移全般を汎用的に捕捉し、`UnsavedChangesDialog` で確認、「離れる」選択時のみ
 *     `blocker.proceed()` で遷移を継続する（R18.2）
 *
 * Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 7.1, 7.3, 7.4, 7.5, 7.6, 7.8, 11.3, 11.4, 11.5,
 *   10.1, 10.3, 10.12, 10.13, 15.1, 15.5, 15.6, 15.7, 15.8, 15.9, 15.11, 17.1, 17.2, 17.3,
 *   17.4, 17.5, 18.1, 18.2, 18.3, 18.4
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import {
  getConstructionPhotoAlbum,
  deleteConstructionPhotoAlbum,
} from '../api/construction-photos';
import {
  getConstructionPhotos,
  updateConstructionPhotoMetadataBatch,
  updateConstructionPhotoOrder,
  deleteConstructionPhoto,
} from '../api/construction-photo-images';
import { getProject } from '../api/projects';
import { getConstructionSignboards } from '../api/construction-signboards';
import { ApiError } from '../api/client';
import { exportConstructionPhotoLedger } from '../services/export/ConstructionPhotoLedgerExportService';
import { constructionPhotoBulkExportService } from '../services/export/ConstructionPhotoBulkExportService';
import type {
  ConstructionPhotoExportProgress,
  ConstructionPhotoExportSettings,
} from '../services/export/ConstructionPhotoBulkExportService';
import { buildConstructionPhotoZipFileName } from '../services/export/constructionPhotoZipNaming';
import { Breadcrumb } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import { PhotoUploader } from '../components/construction-photos/PhotoUploader';
import {
  PhotoItemPanel,
  type PhotoMetadataChange,
} from '../components/construction-photos/PhotoItemPanel';
import { SignboardAssignDialog } from '../components/construction-photos/SignboardAssignDialog';
import AlbumDeleteDialog from '../components/construction-photos/AlbumDeleteDialog';
import {
  BulkExportDialog,
  type BulkExportDialogMode,
} from '../components/construction-photos/BulkExportDialog';
import { BulkExportProgressDialog } from '../components/construction-photos/BulkExportProgressDialog';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog';
import { useConstructionPhotoPermission } from '../hooks/useConstructionPhotoPermission';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import useMediaQuery from '../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../utils/responsive';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
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
  // モバイル幅では固定 maxWidth:1200px の支配を解消し、コンテナを画面幅にフィットさせて
  // 横スクロールを防ぐ（site-survey SiteSurveyDetailPage Task 100.2 と同一パターン, R19.1）
  containerMobile: {
    maxWidth: '100%',
    margin: '0',
    padding: '16px 12px',
  } as React.CSSProperties,
  // overflowX:auto は常時付与し、長いパンくず行を水平スクロール内に収めて
  // 祖先(コンテナ)の scrollWidth への寄与を断つ（デスクトップ幅でも回帰しない, R19.4）
  breadcrumbWrapper: {
    marginBottom: '16px',
    overflowX: 'auto' as const,
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  headerTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  albumActionsRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  editAlbumButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteAlbumButton: {
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #fca5a5',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    gap: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  exportButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  exportButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  headerButtonRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  zipExportButton: {
    backgroundColor: '#ffffff',
    color: '#1d4ed8',
    border: '1px solid #1d4ed8',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  zipExportButtonDisabled: {
    color: '#9ca3af',
    border: '1px solid #d1d5db',
    cursor: 'not-allowed',
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
  const navigate = useNavigate();

  // 権限（R17.1, R17.2, R17.3, R17.5: ロード中は canEdit/canDelete が安全側でfalseになる）
  const { canEdit, canDelete } = useConstructionPhotoPermission();

  // モバイル幅判定（Requirement 19 / Task 12.6）。固定幅の支配を解消するため、
  // ページコンテナの maxWidth/padding をモバイル幅で切り替える（R19.1）。
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    ...(isMobile ? styles.containerMobile : {}),
  };

  // 未保存離脱警告（R18.1, R18.3, R18.4）。編集権限が無ければ未保存変更が生じないため無効化する。
  const uc = useUnsavedChanges({ enabled: canEdit });
  // アプリ内遷移の汎用ガード（Breadcrumbのリンククリック含む全遷移を捕捉, R18.2）。
  // QuantityTableEditPage/CompanyInfoPage/ItemizedStatementDetailPage の確立済みパターンに準拠。
  const blocker = useBlocker(uc.isDirty);

  const [album, setAlbum] = useState<ConstructionPhotoAlbum | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [photos, setPhotos] = useState<ConstructionPhotoWithUrls[]>([]);
  const [signboards, setSignboards] = useState<ConstructionSignboard[]>([]);

  // 看板配置ダイアログの対象写真項目（null=閉）
  const [assignTargetPhoto, setAssignTargetPhoto] = useState<ConstructionPhotoWithUrls | null>(
    null
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // アルバム削除確認ダイアログの開閉状態（R16.3, R16.4）
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);

  // ZIP一括エクスポート対象の選択集合（R15.6, R15.7）
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  // 起動中の BulkExportDialog モード（null は閉, R15.5, R15.6）
  const [bulkExportMode, setBulkExportMode] = useState<BulkExportDialogMode | null>(null);
  // 進捗ダイアログの開閉状態
  const [exportProgressOpen, setExportProgressOpen] = useState(false);
  // 直近の onProgress 通知（R15.8）
  const [exportProgress, setExportProgress] = useState<ConstructionPhotoExportProgress | null>(
    null
  );
  // エクスポート処理が実行中かどうか（false=完了/中断確定）
  const [isExportRunning, setIsExportRunning] = useState(false);
  // 実行中の AbortController（中断操作で abort() を呼ぶ, R15.9）
  const exportControllerRef = useRef<AbortController | null>(null);

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

      const [photosResult, projectResult, signboardsResult] = await Promise.allSettled([
        getConstructionPhotos(id),
        getProject(albumData.projectId),
        getConstructionSignboards(albumData.projectId),
      ]);

      if (photosResult.status === 'fulfilled') {
        setPhotos(photosResult.value);
      } else {
        throw photosResult.reason;
      }

      // プロジェクト取得失敗はブレッドクラムのみに影響するため致命的ではない
      setProject(projectResult.status === 'fulfilled' ? projectResult.value : null);

      // 看板一覧取得失敗は配置ダイアログの選択肢のみに影響するため致命的ではない
      setSignboards(signboardsResult.status === 'fulfilled' ? signboardsResult.value : []);
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
    setPhotos((prev) => [...prev, ...added].sort((a, b) => a.displayOrder - b.displayOrder));
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
                ...(metadata.signboardId !== undefined && {
                  signboardId: metadata.signboardId,
                }),
                ...(metadata.signboardPlacement !== undefined && {
                  signboardPlacement: metadata.signboardPlacement,
                }),
              }
            : p
        )
      );

      const existing = pendingChangesRef.current.get(photoId) ?? {};
      pendingChangesRef.current.set(photoId, { ...existing, ...metadata });
      uc.markAsChanged();
    },
    [uc]
  );

  /**
   * 写真項目クリックハンドラ（R14.1）。
   * 当該写真項目のフルスクリーンビューアへ遷移する。
   * 未保存変更時の確認は `useBlocker`（下記）がアプリ内遷移全般を汎用的にガードする（R18.2）。
   */
  const handlePhotoClick = useCallback(
    (photo: ConstructionPhotoWithUrls) => {
      if (!album) return;
      navigate(`/construction-photos/${album.id}/photos/${photo.id}`);
    },
    [album, navigate]
  );

  /**
   * アルバム編集ボタンハンドラ（R16.1, R16.2）。アルバム編集画面へ遷移する。
   * 未保存変更時の確認は `useBlocker`（下記）がアプリ内遷移全般を汎用的にガードする（R18.2）。
   */
  const handleEditAlbum = useCallback(() => {
    if (!album) return;
    navigate(`/construction-photos/${album.id}/edit`);
  }, [album, navigate]);

  /**
   * アルバム削除ボタンハンドラ（R16.3, R16.4）。削除確認ダイアログを開く。
   */
  const handleDeleteAlbumRequest = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  /**
   * アルバム削除確認ダイアログのキャンセルハンドラ
   */
  const handleDeleteAlbumCancel = useCallback(() => {
    setIsDeleteDialogOpen(false);
  }, []);

  /**
   * アルバム削除確認の承認ハンドラ（R16.5）。
   * 削除APIを呼び出し、成功したら工事写真一覧画面へ遷移する。
   */
  const handleDeleteAlbumConfirm = useCallback(async () => {
    if (!album) return;
    setIsDeletingAlbum(true);
    try {
      await deleteConstructionPhotoAlbum(album.id);
      navigate(`/projects/${album.projectId}/construction-photos`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || 'アルバムの削除に失敗しました'
          : 'アルバムの削除に失敗しました'
      );
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeletingAlbum(false);
    }
  }, [album, navigate]);

  /**
   * 「看板を配置」導線ハンドラ（R9.1）。対象写真項目の配置ダイアログを開く。
   */
  const handleAssignSignboard = useCallback((photo: ConstructionPhotoWithUrls) => {
    setAssignTargetPhoto(photo);
  }, []);

  /**
   * 看板配置ダイアログの保存ハンドラ（R9.1, R9.2, R9.5）。
   * 選択看板ID（未指定は null）と配置ジオメトリ（未指定は null）を、写真項目ごとの
   * 未保存メタ変更として保持し、既存の保存フロー（メタバッチ）で確定する。
   */
  const handleSignboardSave = useCallback(
    (signboardId: string | null, placement: SignboardPlacement | null) => {
      if (!assignTargetPhoto) return;
      handleMetadataChange(assignTargetPhoto.id, {
        signboardId,
        signboardPlacement: placement,
      });
      setAssignTargetPhoto(null);
    },
    [assignTargetPhoto, handleMetadataChange]
  );

  /**
   * 順序変更ハンドラ（未保存状態で保持, R7.3, R7.4）
   */
  const handleOrderChange = useCallback(
    (newOrders: PhotoOrderItem[]) => {
      setPhotos((prev) => {
        const orderMap = new Map(newOrders.map((o) => [o.id, o.order]));
        return prev.map((p) => ({
          ...p,
          displayOrder: orderMap.get(p.id) ?? p.displayOrder,
        }));
      });
      pendingOrderRef.current = newOrders;
      uc.markAsChanged();
    },
    [uc]
  );

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
      uc.markAsSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  }, [id, uc]);

  /**
   * PDF出力ハンドラ（R10.1, R10.3, R10.12, R10.13）
   *
   * 印刷対象のみ・保存表示順で印字画像をオンデマンド取得して台帳PDFを出力する。
   * 看板重畳はサーバの印字画像エンドポイントに委譲する。印刷対象0件は非実行で通知する。
   */
  const handleExportPdf = useCallback(async () => {
    if (!album) return;
    setNotice(null);
    setIsExporting(true);
    try {
      const result = await exportConstructionPhotoLedger({
        photos,
        workName: project?.name ?? album.name,
      });
      if (!result.generated) {
        setNotice('印刷対象の写真がありません。印刷対象を選択してからPDF出力してください。');
      }
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'PDF出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  }, [album, project, photos]);

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
    setSelectedPhotoIds((prev) => {
      if (!prev.has(photoId)) return prev;
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
  }, []);

  /**
   * エクスポート対象の選択チェックのトグルハンドラ（R15.6）
   */
  const handleToggleSelectPhoto = useCallback((photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  /** 「全件エクスポート」起動ボタン（R15.1, R15.5） */
  const handleExportAll = useCallback(() => {
    setBulkExportMode('all');
  }, []);

  /** 「選択エクスポート」起動ボタン（R15.1, R15.6, R15.7） */
  const handleExportSelected = useCallback(() => {
    setBulkExportMode('selected');
  }, []);

  /** BulkExportDialog のキャンセル close */
  const handleExportDialogClose = useCallback(() => {
    setBulkExportMode(null);
  }, []);

  /** 対象0件時の通知（R15.11） */
  const handleExportEmptyTarget = useCallback(() => {
    setNotice('エクスポート対象の写真項目がありません。');
  }, []);

  /**
   * ZIP一括エクスポートの実行オーケストレーション（R15.1, R15.5, R15.6, R15.8, R15.9）
   *
   * `AbortController` を生成して `ConstructionPhotoBulkExportService.export` を呼び出し、
   * `onProgress` で進捗 state を更新する。完了後は ZIP Blob を `a` タグでダウンロードし、
   * 部分失敗（`failed`）はユーザーへ通知する。`AbortError` は中断として扱う。
   */
  const handleExportStart = useCallback(
    (settings: ConstructionPhotoExportSettings) => {
      if (!album) return;
      const mode = bulkExportMode;
      const targets =
        mode === 'selected' ? photos.filter((p) => selectedPhotoIds.has(p.id)) : photos;

      setBulkExportMode(null);

      if (targets.length === 0) {
        // BulkExportDialog 側で開始ボタン非活性により既に防止済みだが念のため二重防御する
        setNotice('エクスポート対象の写真項目がありません。');
        return;
      }

      const controller = new AbortController();
      exportControllerRef.current = controller;
      setNotice(null);
      setExportProgress(null);
      setIsExportRunning(true);
      setExportProgressOpen(true);

      constructionPhotoBulkExportService
        .export(targets, settings, {
          onProgress: (progress) => setExportProgress(progress),
          signal: controller.signal,
        })
        .then((result) => {
          const fileName = buildConstructionPhotoZipFileName(album.name, new Date());
          const url = URL.createObjectURL(result.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          if (result.failed.length > 0) {
            setNotice(
              `一部の写真項目（${result.failed.length}件）のエクスポートに失敗しました。成功した項目のみでZIPをダウンロードしました。`
            );
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setNotice('エクスポートを中断しました。');
          } else {
            setNotice(err instanceof ApiError ? err.message : 'エクスポートに失敗しました');
          }
        })
        .finally(() => {
          setIsExportRunning(false);
          exportControllerRef.current = null;
        });
    },
    [album, bulkExportMode, photos, selectedPhotoIds]
  );

  /** 進捗ダイアログの中断ボタン（R15.9） */
  const handleExportCancel = useCallback(() => {
    exportControllerRef.current?.abort();
  }, []);

  /** 進捗ダイアログの「閉じる」（完了/中断確定後） */
  const handleExportProgressClose = useCallback(() => {
    setExportProgressOpen(false);
    setExportProgress(null);
  }, []);

  // ローディング
  if (isLoading && !album) {
    return (
      <main role="main" style={containerStyle}>
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
      <main role="main" style={containerStyle}>
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
    <main role="main" aria-busy={isLoading} style={containerStyle}>
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div style={styles.header}>
        <div style={styles.headerTitleRow}>
          <h1 style={styles.title}>{album.name}</h1>
          {/* アルバム編集・削除導線（R16.1, R16.2, R16.3, R16.4、権限連動 R17.1, R17.2, R17.5） */}
          <div style={styles.albumActionsRow}>
            {canEdit && (
              <button type="button" onClick={handleEditAlbum} style={styles.editAlbumButton}>
                編集
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDeleteAlbumRequest}
                style={styles.deleteAlbumButton}
              >
                削除
              </button>
            )}
          </div>
        </div>
        {album.memo && <p style={styles.memo}>{album.memo}</p>}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>写真項目</h2>
          <div style={styles.headerButtonRow}>
            {/* ZIP一括エクスポート起動導線（R15.1, R15.5, R15.6, R15.7） */}
            <button type="button" onClick={handleExportAll} style={styles.zipExportButton}>
              全件エクスポート
            </button>
            <button
              type="button"
              onClick={handleExportSelected}
              disabled={selectedPhotoIds.size === 0}
              aria-disabled={selectedPhotoIds.size === 0}
              style={{
                ...styles.zipExportButton,
                ...(selectedPhotoIds.size === 0 ? styles.zipExportButtonDisabled : {}),
              }}
            >
              選択エクスポート（{selectedPhotoIds.size}件）
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting}
              style={{
                ...styles.exportButton,
                ...(isExporting ? styles.exportButtonDisabled : {}),
              }}
            >
              {isExporting ? 'PDF出力中...' : 'PDF出力'}
            </button>
          </div>
        </div>

        {/* 通知（部分失敗・保存エラーなど） */}
        {(notice || error) && (
          <div role="alert" style={styles.notice}>
            {notice ?? error}
          </div>
        )}

        {/* 3系統アップローダ（R4, R5, R6, R11.5、編集権限連動 R17.1, R17.5） */}
        {canEdit && (
          <div style={styles.uploaderWrapper}>
            <PhotoUploader
              albumId={album.id}
              projectId={album.projectId}
              onPhotosAdded={handlePhotosAdded}
              onNotify={handleUploaderNotify}
            />
          </div>
        )}

        {/* 写真項目管理パネル（R7, R11.3）
            編集権限なしは readOnly で保存・並び替え・コメント・印刷対象・看板配置を抑止
            （R17.1, R17.3, R17.5）。写真項目削除は削除権限がある場合のみハンドラを渡す（R17.2）。 */}
        <PhotoItemPanel
          photos={photos}
          onPhotoMetadataChange={handleMetadataChange}
          onPhotoClick={handlePhotoClick}
          onOrderChange={handleOrderChange}
          onSave={handleSave}
          onDelete={canDelete ? handleDelete : undefined}
          onAssignSignboard={handleAssignSignboard}
          isDirty={uc.isDirty}
          isSaving={isSaving}
          isLoading={isLoading}
          readOnly={!canEdit}
          showOrderNumbers
          selectedPhotoIds={selectedPhotoIds}
          onToggleSelect={handleToggleSelectPhoto}
        />
      </div>

      {/* 看板配置ダイアログ（R9.1, R9.2, R9.5） */}
      {assignTargetPhoto && (
        <SignboardAssignDialog
          photo={assignTargetPhoto}
          signboards={signboards}
          onSave={handleSignboardSave}
          onClose={() => setAssignTargetPhoto(null)}
        />
      )}

      {/* ZIP一括エクスポート設定ダイアログ（R15.1, R15.2, R15.3, R15.4, R15.5, R15.6, R15.7, R15.11） */}
      {bulkExportMode !== null && (
        <BulkExportDialog
          open
          mode={bulkExportMode}
          totalCount={photos.length}
          selectedCount={selectedPhotoIds.size}
          onClose={handleExportDialogClose}
          onStart={handleExportStart}
          onEmptyTarget={handleExportEmptyTarget}
        />
      )}

      {/* ZIP一括エクスポート進捗ダイアログ（R15.8, R15.9） */}
      {exportProgressOpen && (
        <BulkExportProgressDialog
          open
          progress={exportProgress}
          isRunning={isExportRunning}
          onCancel={handleExportCancel}
          onClose={handleExportProgressClose}
        />
      )}

      {/* アルバム削除確認ダイアログ（R16.3, R16.4, R16.5） */}
      <AlbumDeleteDialog
        isOpen={isDeleteDialogOpen}
        albumName={album.name}
        onConfirm={handleDeleteAlbumConfirm}
        onClose={handleDeleteAlbumCancel}
        isDeleting={isDeletingAlbum}
      />

      {/* 未保存離脱確認ダイアログ（アプリ内遷移全般をuseBlockerで捕捉, R18.2） */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onLeave={() => blocker.proceed?.()}
        onStay={() => blocker.reset?.()}
      />

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
