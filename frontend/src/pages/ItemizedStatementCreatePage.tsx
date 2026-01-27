/**
 * @fileoverview 内訳書新規作成ページ
 *
 * Task 17.1: 内訳書新規作成ページの実装
 *
 * Requirements:
 * - 15.1: 内訳書新規作成画面を独立したページとして提供する
 * - 15.2: プロジェクト詳細画面に戻るリンクを表示する
 * - 15.3: 内訳書名入力フィールドを表示する
 * - 15.4: 内訳書名フィールドのデフォルト値として「内訳書」を設定する
 * - 15.5: 数量表選択リストを表示する
 * - 15.6: 作成成功時に内訳書詳細画面へ遷移する
 * - 15.7: キャンセル時にプロジェクト詳細画面に遷移する（location.stateまたは?from=listで判定）
 * - 9.5: パンくずナビゲーションを表示する
 * - 9.6: パンくず「プロジェクト一覧 > {プロジェクト名} > 内訳書 > 新規作成」形式
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { getProject } from '../api/projects';
import { getQuantityTables } from '../api/quantity-tables';
import { CreateItemizedStatementForm } from '../components/itemized-statement/CreateItemizedStatementForm';
import { Breadcrumb } from '../components/common';
import type { ProjectDetail } from '../types/project.types';
import type { QuantityTableInfo } from '../types/quantity-table.types';
import type { ItemizedStatementInfo } from '../types/itemized-statement.types';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '640px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  formWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
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
    margin: 0,
  } as React.CSSProperties,
};

// ============================================================================
// 型定義
// ============================================================================

interface LocationState {
  from?: 'list';
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 内訳書新規作成ページ
 *
 * プロジェクトに紐付く新しい内訳書を作成します。
 * SiteSurveyCreatePage・QuantityTableCreatePageと同様のパターンを適用しています。
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 9.5, 9.6
 */
export default function ItemizedStatementCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // locationからstateを取得
  const locationState = location.state as LocationState | null;

  // プロジェクト情報
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);

  // 数量表一覧
  const [quantityTables, setQuantityTables] = useState<QuantityTableInfo[]>([]);

  /**
   * プロジェクト情報と数量表一覧を取得
   */
  const fetchData = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingProject(true);
    setProjectError(null);

    try {
      const [projectData, quantityTableData] = await Promise.all([
        getProject(projectId),
        getQuantityTables(projectId, { limit: 100 }),
      ]);
      setProject(projectData);
      setQuantityTables(quantityTableData.data);
    } catch {
      setProjectError('プロジェクトの取得に失敗しました');
    } finally {
      setIsLoadingProject(false);
    }
  }, [projectId]);

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 内訳書作成成功時
   * Requirements: 15.6 - 作成成功時に内訳書詳細画面へ遷移する
   */
  const handleSuccess = useCallback(
    (statement: ItemizedStatementInfo) => {
      navigate(`/itemized-statements/${statement.id}`);
    },
    [navigate]
  );

  /**
   * キャンセル時
   * Requirements: 15.7 - キャンセル時の遷移先をlocation.stateまたは?from=listで判定
   */
  const handleCancel = useCallback(() => {
    // location.stateまたはクエリパラメータでfrom=listの場合は内訳書一覧に戻る
    const searchParams = new URLSearchParams(location.search);
    const fromQuery = searchParams.get('from');

    if (locationState?.from === 'list' || fromQuery === 'list') {
      navigate(`/projects/${projectId}/itemized-statements`);
    } else {
      // デフォルトはプロジェクト詳細画面
      navigate(`/projects/${projectId}`);
    }
  }, [navigate, projectId, locationState, location.search]);

  // ローディング表示
  if (isLoadingProject) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} aria-label="読み込み中" />
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

  // プロジェクトエラー表示
  if (projectError || !project) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{projectError || 'プロジェクトが見つかりません'}</p>
        </div>
      </main>
    );
  }

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      {/* REQ-9.5, REQ-9.6: プロジェクト一覧 > {プロジェクト名} > 内訳書 > 新規作成 */}
      <nav aria-label="breadcrumb" style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: project.name, path: `/projects/${projectId}` },
            { label: '内訳書', path: `/projects/${projectId}/itemized-statements` },
            { label: '新規作成' },
          ]}
        />
      </nav>

      {/* ヘッダー */}
      <div style={styles.header}>
        <Link
          to={`/projects/${projectId}`}
          style={styles.backLink}
          aria-label="プロジェクト詳細に戻る"
        >
          ← プロジェクト詳細に戻る
        </Link>
        <h1 style={styles.title}>内訳書を新規作成</h1>
      </div>

      {/* フォーム */}
      <div style={styles.formWrapper}>
        <CreateItemizedStatementForm
          projectId={projectId!}
          quantityTables={quantityTables}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          defaultName="内訳書"
        />
      </div>
    </main>
  );
}
