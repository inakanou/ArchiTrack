/**
 * @fileoverview 工事写真一覧ページ
 *
 * Task 6.1: 工事写真一覧画面
 *
 * プロジェクトに紐づく工事写真アルバムの一覧を表示するページコンポーネント。
 * site-survey の SiteSurveyListPage を雛形に、他機能同様のレスポンシブUI
 * （デスクトップ表 / モバイルカード）、キーワード検索、作成日/更新日ソート、
 * ページング（50件）、代表サムネイル優先表示を提供する。
 *
 * Requirements:
 * - 3.1: プロジェクト配下のアルバムをページネーション付きで表示
 * - 3.2: 他機能同様のレスポンシブUI（表/カード切替）
 * - 3.3: アルバム名での部分一致検索
 * - 3.4: 作成日・更新日でソート
 * - 3.5, 11.3: 代表サムネイル優先表示
 * - 2.4: 一覧項目選択で工事写真詳細画面へ遷移
 *
 * 注: ルート登録・ブレッドクラム階層規約（2.5-2.9）は Task 7.1 で行う。
 * 本タスクでは画面単体で描画可能なよう共通 Breadcrumb をインラインで利用する。
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Breadcrumb } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import { getProject } from '../api/projects';
import { getConstructionPhotoAlbums } from '../api/construction-photos';
import type { ProjectDetail } from '../types/project.types';
import type {
  PaginatedConstructionPhotoAlbums,
  ConstructionPhotoAlbumSortableField,
  ConstructionPhotoSortOrder,
} from '../types/construction-photo.types';
import ConstructionPhotoResponsiveView from '../components/construction-photos/ConstructionPhotoResponsiveView';
import ConstructionPhotoSearchFilter, {
  type ConstructionPhotoAlbumFilter,
} from '../components/construction-photos/ConstructionPhotoSearchFilter';

// ============================================================================
// 定数定義
// ============================================================================

/** 1ページあたりの取得件数（R11: 一覧 limit=50） */
const PAGE_LIMIT = 50;

const STYLES = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
  } as React.CSSProperties,
  createButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    textDecoration: 'none',
    cursor: 'pointer',
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
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  emptyStateTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  } as React.CSSProperties,
  emptyStateText: {
    color: '#6b7280',
    marginBottom: '16px',
  } as React.CSSProperties,
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginTop: '24px',
  } as React.CSSProperties,
  pageButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  pageButtonDisabled: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  pageInfo: {
    fontSize: '14px',
    color: '#374151',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事写真一覧ページ
 */
export default function ConstructionPhotoListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // データ状態
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [albums, setAlbums] = useState<PaginatedConstructionPhotoAlbums | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フィルター状態
  const [filter, setFilter] = useState<ConstructionPhotoAlbumFilter>({});

  // ソート状態（R3.4: 作成日/更新日）
  const [sortField, setSortField] = useState<ConstructionPhotoAlbumSortableField>('createdAt');
  const [sortOrder, setSortOrder] = useState<ConstructionPhotoSortOrder>('desc');

  // ページング状態
  const [page, setPage] = useState(1);

  /**
   * データ取得
   */
  const fetchData = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [projectData, albumsData] = await Promise.all([
        getProject(projectId),
        getConstructionPhotoAlbums(projectId, {
          page,
          limit: PAGE_LIMIT,
          search: filter.search || undefined,
          sort: sortField,
          order: sortOrder,
        }),
      ]);

      setProject(projectData);
      setAlbums(albumsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, filter, sortField, sortOrder, page]);

  // 初回読み込みとフィルター・ソート・ページ変更時の再取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * ソート変更ハンドラ（テーブルヘッダークリック）
   */
  const handleSort = useCallback(
    (field: ConstructionPhotoAlbumSortableField) => {
      setPage(1);
      if (field === sortField) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortOrder('desc');
      }
    },
    [sortField]
  );

  /**
   * 検索・フィルタ変更ハンドラ
   */
  const handleFilterChange = useCallback((newFilter: ConstructionPhotoAlbumFilter) => {
    setPage(1);
    setFilter(newFilter);
  }, []);

  /**
   * ソート選択変更ハンドラ
   */
  const handleSortChange = useCallback(
    (field: ConstructionPhotoAlbumSortableField, order: ConstructionPhotoSortOrder) => {
      setPage(1);
      setSortField(field);
      setSortOrder(order);
    },
    []
  );

  /**
   * 行クリックハンドラ（R2.4: 詳細画面へ遷移）
   */
  const handleRowClick = useCallback(
    (albumId: string) => {
      navigate(`/construction-photos/${albumId}`);
    },
    [navigate]
  );

  /**
   * ページ変更ハンドラ
   */
  const handlePrevPage = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((prev) => prev + 1);
  }, []);

  // ローディング表示
  if (isLoading && !project) {
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
  if (error && !project) {
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

  // プロジェクトがない場合
  if (!project || !projectId) {
    return null;
  }

  // ブレッドクラム生成（階層規約は Task 7.1 で共通化予定）
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: project.name, path: `/projects/${projectId}` },
    { label: '工事写真一覧' },
  ];

  const pagination = albums?.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  const hasPagination = totalPages > 1;
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <main role="main" aria-busy={isLoading} style={STYLES.container}>
      {/* ブレッドクラムナビゲーション */}
      <div style={STYLES.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div style={STYLES.header}>
        <h1 style={STYLES.title}>工事写真一覧</h1>
        <Link to={`/projects/${projectId}/construction-photos/new`} style={STYLES.createButton}>
          + 新規作成
        </Link>
      </div>

      {/* 検索・ソート (Requirements 3.3, 3.4) */}
      <ConstructionPhotoSearchFilter
        filter={filter}
        sortField={sortField}
        sortOrder={sortOrder}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
      />

      {/* コンテンツ */}
      {albums && albums.data.length > 0 ? (
        <>
          <ConstructionPhotoResponsiveView
            albums={albums.data}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onRowClick={handleRowClick}
          />

          {/* ページング (Requirement 3.1) */}
          {hasPagination && (
            <nav role="navigation" aria-label="ページネーション" style={STYLES.pagination}>
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={isFirstPage}
                aria-label="前のページ"
                style={isFirstPage ? STYLES.pageButtonDisabled : STYLES.pageButton}
              >
                前へ
              </button>
              <span style={STYLES.pageInfo} data-testid="page-info">
                {page} / {totalPages} ページ
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={isLastPage}
                aria-label="次のページ"
                style={isLastPage ? STYLES.pageButtonDisabled : STYLES.pageButton}
              >
                次へ
              </button>
            </nav>
          )}
        </>
      ) : (
        <div style={STYLES.emptyState}>
          <p style={STYLES.emptyStateTitle}>工事写真アルバムがありません</p>
          <p style={STYLES.emptyStateText}>
            「新規作成」ボタンをクリックして、最初のアルバムを作成しましょう。
          </p>
          <Link to={`/projects/${projectId}/construction-photos/new`} style={STYLES.createButton}>
            + 新規作成
          </Link>
        </div>
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
