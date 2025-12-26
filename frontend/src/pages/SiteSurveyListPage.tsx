/**
 * @fileoverview 現場調査一覧ページ
 *
 * Task 10.2: ブレッドクラムナビゲーションを実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 *
 * プロジェクトに紐づく現場調査の一覧を表示するページコンポーネントです。
 * ブレッドクラムナビゲーションによる階層構造の把握と遷移機能を提供します。
 *
 * Requirements:
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
 * - 2.7: ユーザーがブレッドクラムの各項目をクリックすると対応する画面に遷移する
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 */

import { useState, useEffect, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Breadcrumb } from '../components/common';
import { buildSiteSurveyListBreadcrumb } from '../utils/siteSurveyBreadcrumb';
import { getProject } from '../api/projects';
import { getSiteSurveys } from '../api/site-surveys';
import { useSiteSurveyPermission } from '../hooks/useSiteSurveyPermission';
import type { ProjectDetail } from '../types/project.types';
import type {
  PaginatedSiteSurveys,
  SiteSurveySortableField,
  SiteSurveyFilter,
} from '../types/site-survey.types';
import SiteSurveyResponsiveView from '../components/site-surveys/SiteSurveyResponsiveView';

// ============================================================================
// 定数定義
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
  // フィルター関連スタイル
  filterContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '16px',
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  searchForm: {
    display: 'flex',
    flex: '1 1 300px',
    minWidth: '200px',
  } as React.CSSProperties,
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px 0 0 6px',
    outline: 'none',
  } as React.CSSProperties,
  searchButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0 6px 6px 0',
    cursor: 'pointer',
  } as React.CSSProperties,
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  filterLabel: {
    fontSize: '14px',
    color: '#374151',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  dateInput: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
  } as React.CSSProperties,
  sortSelect: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
  clearButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 現場調査一覧ページ
 */
export default function SiteSurveyListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // 権限チェック (Requirement 12.2)
  const { canCreate } = useSiteSurveyPermission();

  // データ状態
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [siteSurveys, setSiteSurveys] = useState<PaginatedSiteSurveys | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フィルター状態
  const [filter, setFilter] = useState<SiteSurveyFilter>({});
  const [searchInput, setSearchInput] = useState('');

  // ソート状態
  const [sortField, setSortField] = useState<SiteSurveySortableField>('surveyDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  /**
   * データ取得
   */
  const fetchData = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [projectData, surveysData] = await Promise.all([
        getProject(projectId),
        getSiteSurveys(projectId, {
          page: 1,
          limit: 50,
          filter,
          sort: sortField,
          order: sortOrder,
        }),
      ]);

      setProject(projectData);
      setSiteSurveys(surveysData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, filter, sortField, sortOrder]);

  // 初回読み込みとフィルター・ソート変更時の再取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * ソート変更ハンドラ
   */
  const handleSort = useCallback(
    (field: SiteSurveySortableField) => {
      if (field === sortField) {
        // 同じフィールドの場合は順序を反転
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        // 新しいフィールドの場合はデフォルト順序（desc）
        setSortField(field);
        setSortOrder('desc');
      }
    },
    [sortField]
  );

  /**
   * 検索フォーム送信ハンドラ
   */
  const handleSearchSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setFilter((prev) => ({ ...prev, search: searchInput || undefined }));
    },
    [searchInput]
  );

  /**
   * 日付フィルター変更ハンドラ
   */
  const handleDateFromChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilter((prev) => ({ ...prev, surveyDateFrom: value || undefined }));
  }, []);

  const handleDateToChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilter((prev) => ({ ...prev, surveyDateTo: value || undefined }));
  }, []);

  /**
   * ソートフィールド選択ハンドラ
   */
  const handleSortFieldChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as SiteSurveySortableField;
    setSortField(value);
  }, []);

  /**
   * ソート順序変更ハンドラ
   */
  const handleSortOrderChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'asc' | 'desc';
    setSortOrder(value);
  }, []);

  /**
   * フィルタークリアハンドラ
   */
  const handleClearFilters = useCallback(() => {
    setFilter({});
    setSearchInput('');
    setSortField('surveyDate');
    setSortOrder('desc');
  }, []);

  /**
   * 行クリックハンドラ
   */
  const handleRowClick = useCallback(
    (surveyId: string) => {
      navigate(`/site-surveys/${surveyId}`);
    },
    [navigate]
  );

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

  // ブレッドクラム生成
  const breadcrumbItems = buildSiteSurveyListBreadcrumb(projectId, project.name);

  return (
    <main role="main" aria-busy={isLoading} style={STYLES.container}>
      {/* ブレッドクラムナビゲーション (Requirements 2.5, 2.6, 2.7) */}
      <div style={STYLES.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div style={STYLES.header}>
        <h1 style={STYLES.title}>現場調査</h1>
        {canCreate && (
          <Link to={`/projects/${projectId}/site-surveys/new`} style={STYLES.createButton}>
            + 新規作成
          </Link>
        )}
      </div>

      {/* フィルター・検索 (Requirements 3.2, 3.3, 3.4) */}
      <div style={STYLES.filterContainer}>
        {/* 検索フォーム */}
        <form onSubmit={handleSearchSubmit} style={STYLES.searchForm}>
          <input
            type="search"
            placeholder="現場調査名・メモで検索"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={STYLES.searchInput}
            aria-label="検索"
          />
          <button type="submit" style={STYLES.searchButton}>
            検索
          </button>
        </form>

        {/* 日付フィルター */}
        <div style={STYLES.filterGroup}>
          <label htmlFor="dateFrom" style={STYLES.filterLabel}>
            調査日:
          </label>
          <input
            id="dateFrom"
            type="date"
            value={filter.surveyDateFrom || ''}
            onChange={handleDateFromChange}
            style={STYLES.dateInput}
            aria-label="調査日開始"
          />
          <span style={STYLES.filterLabel}>〜</span>
          <input
            id="dateTo"
            type="date"
            value={filter.surveyDateTo || ''}
            onChange={handleDateToChange}
            style={STYLES.dateInput}
            aria-label="調査日終了"
          />
        </div>

        {/* ソート */}
        <div style={STYLES.filterGroup}>
          <label htmlFor="sortField" style={STYLES.filterLabel}>
            並び替え:
          </label>
          <select
            id="sortField"
            value={sortField}
            onChange={handleSortFieldChange}
            style={STYLES.sortSelect}
            aria-label="ソート項目"
          >
            <option value="surveyDate">調査日</option>
            <option value="createdAt">作成日</option>
            <option value="updatedAt">更新日</option>
          </select>
          <select
            id="sortOrder"
            value={sortOrder}
            onChange={handleSortOrderChange}
            style={STYLES.sortSelect}
            aria-label="ソート順序"
          >
            <option value="desc">新しい順</option>
            <option value="asc">古い順</option>
          </select>
        </div>

        {/* クリアボタン */}
        <button type="button" onClick={handleClearFilters} style={STYLES.clearButton}>
          クリア
        </button>
      </div>

      {/* コンテンツ */}
      {siteSurveys && siteSurveys.data.length > 0 ? (
        <SiteSurveyResponsiveView
          surveys={siteSurveys.data}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          onRowClick={handleRowClick}
        />
      ) : (
        <div style={STYLES.emptyState}>
          <p style={STYLES.emptyStateTitle}>現場調査がありません</p>
          {canCreate ? (
            <>
              <p style={STYLES.emptyStateText}>
                「新規作成」ボタンをクリックして、最初の現場調査を作成しましょう。
              </p>
              <Link to={`/projects/${projectId}/site-surveys/new`} style={STYLES.createButton}>
                + 新規作成
              </Link>
            </>
          ) : (
            <p style={STYLES.emptyStateText}>このプロジェクトにはまだ現場調査がありません。</p>
          )}
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
