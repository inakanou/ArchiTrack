/**
 * @fileoverview 取引先詳細ページ
 *
 * Task 12.3: TradingPartnerDetailPageの実装
 *
 * TradingPartnerDetailViewコンポーネントを活用した詳細ページ。
 * パンくずナビゲーション、編集・削除機能、存在しない取引先の表示を提供。
 *
 * Requirements:
 * - 3.1: ユーザーが一覧から取引先を選択したとき、取引先詳細ページを表示する
 * - 3.2: 以下の情報を詳細ページに表示する: 名前、フリガナ、部課/支店/支社名、
 *        部課/支店/支社フリガナ、代表者名、代表者フリガナ、種別、住所、電話番号、
 *        FAX番号、メールアドレス、請求締日、支払日、備考、登録日、更新日
 * - 3.3: 編集ボタンと削除ボタンを詳細ページに表示する
 * - 3.4: 当該取引先に紐付くプロジェクト一覧を表示する
 * - 12.11: 取引先詳細ページを /trading-partners/:id のURLで提供する
 * - 12.13: 存在しない取引先IDへのアクセス時はResourceNotFound表示
 * - 12.15: パンくず: ダッシュボード > 取引先 > [取引先名]
 * - 12.20: 編集ボタンクリックで編集ページへ遷移
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getTradingPartner, deleteTradingPartner } from '../api/trading-partners';
import { getProjects } from '../api/projects';
import { useToast } from '../hooks/useToast';
import type { TradingPartnerDetail } from '../types/trading-partner.types';
import type { ProjectInfo } from '../types/project.types';
import { PROJECT_STATUS_LABELS } from '../types/project.types';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import TradingPartnerDetailView from '../components/trading-partners/TradingPartnerDetailView';
import TradingPartnerDeleteDialog from '../components/trading-partners/TradingPartnerDeleteDialog';

// ============================================================================
// 型定義
// ============================================================================

/**
 * APIエラーの型
 */
interface ApiErrorLike {
  statusCode?: number;
  message?: string;
}

/**
 * ApiErrorかどうかを判定する型ガード
 */
function isApiError(error: unknown): error is ApiErrorLike {
  return (
    typeof error === 'object' && error !== null && ('statusCode' in error || 'message' in error)
  );
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1024px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbContainer: {
    marginBottom: '24px',
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
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 関連プロジェクトセクション (REQ-3.4)
  projectsSection: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginTop: '24px',
  } as React.CSSProperties,
  projectsSectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  projectsEmptyMessage: {
    color: '#6b7280',
    fontSize: '14px',
    textAlign: 'center' as const,
    padding: '24px 0',
  } as React.CSSProperties,
  projectsTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  } as React.CSSProperties,
  projectsTableHeader: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  projectsTableCell: {
    padding: '12px',
    fontSize: '14px',
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  projectLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: '500',
  } as React.CSSProperties,
  statusBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: '500',
    borderRadius: '9999px',
    backgroundColor: '#e5e7eb',
    color: '#374151',
  } as React.CSSProperties,
  projectsLoadingText: {
    color: '#6b7280',
    fontSize: '14px',
    textAlign: 'center' as const,
    padding: '16px 0',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 取引先詳細ページ
 *
 * 取引先の詳細情報表示、編集・削除機能を提供。
 * パンくずナビゲーションで現在位置を示す。
 */
export default function TradingPartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // データ状態
  const [partner, setPartner] = useState<TradingPartnerDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // エラー状態
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // 関連プロジェクト状態 (REQ-3.4)
  const [relatedProjects, setRelatedProjects] = useState<ProjectInfo[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  /**
   * 取引先データを取得
   */
  const fetchPartner = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await getTradingPartner(id);
      setPartner(data);
    } catch (err) {
      if (isApiError(err)) {
        if (err.statusCode === 404) {
          setIsNotFound(true);
          return;
        }
        setError(err.message || 'エラーが発生しました');
      } else {
        setError('エラーが発生しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchPartner();
  }, [fetchPartner]);

  // 関連プロジェクトを取得 (REQ-3.4)
  useEffect(() => {
    if (!id) return;

    const fetchRelatedProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const result = await getProjects({
          filter: { tradingPartnerId: id },
          limit: 10,
          sort: 'updatedAt',
          order: 'desc',
        });
        setRelatedProjects(result.data);
      } catch {
        // プロジェクト取得エラーは無視（メイン表示に影響しないため）
      } finally {
        setIsLoadingProjects(false);
      }
    };

    fetchRelatedProjects();
  }, [id]);

  /**
   * 編集ページへ遷移
   */
  const handleEdit = useCallback(() => {
    if (partner) {
      navigate(`/trading-partners/${partner.id}/edit`);
    }
  }, [partner, navigate]);

  /**
   * 削除確認ダイアログを表示
   */
  const handleDeleteClick = useCallback(() => {
    setDeleteError(null);
    setShowDeleteDialog(true);
  }, []);

  /**
   * 削除確認ダイアログを閉じる
   */
  const handleCloseDeleteDialog = useCallback(() => {
    setShowDeleteDialog(false);
    setDeleteError(null);
  }, []);

  /**
   * 取引先を削除
   */
  const handleDelete = useCallback(async () => {
    if (!id) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteTradingPartner(id);

      // トースト通知で成功メッセージを表示
      toast.success('取引先を削除しました');

      // 一覧ページへ遷移
      navigate('/trading-partners');
    } catch (err) {
      if (isApiError(err)) {
        const errorMessage = err.message || '削除中にエラーが発生しました';
        setDeleteError(errorMessage);
        toast.operationFailed(errorMessage);
      } else {
        const defaultErrorMessage = '削除中にエラーが発生しました';
        setDeleteError(defaultErrorMessage);
        toast.operationFailed(defaultErrorMessage);
      }
    } finally {
      setIsDeleting(false);
    }
  }, [id, navigate, toast]);

  // 存在しない取引先の表示
  if (isNotFound) {
    return (
      <main role="main" style={styles.container}>
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      </main>
    );
  }

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

  // エラー表示（データ未取得の場合）
  if (error && !partner) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchPartner} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // パートナーデータがない場合
  if (!partner) {
    return null;
  }

  // パンくずナビゲーション項目
  const breadcrumbItems = [
    { label: 'ダッシュボード', path: '/' },
    { label: '取引先', path: '/trading-partners' },
    { label: partner.name },
  ];

  // 詳細表示
  return (
    <main role="main" aria-busy={isLoading} style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbContainer}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* 詳細表示 */}
      <TradingPartnerDetailView
        partner={partner}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
      />

      {/* 関連プロジェクトセクション (REQ-3.4) */}
      <section style={styles.projectsSection}>
        <h2 style={styles.projectsSectionTitle}>関連プロジェクト</h2>
        {isLoadingProjects ? (
          <p style={styles.projectsLoadingText}>読み込み中...</p>
        ) : relatedProjects.length === 0 ? (
          <p style={styles.projectsEmptyMessage}>関連するプロジェクトはありません</p>
        ) : (
          <table style={styles.projectsTable} aria-label="プロジェクト一覧">
            <thead>
              <tr>
                <th style={styles.projectsTableHeader}>プロジェクト名</th>
                <th style={styles.projectsTableHeader}>ステータス</th>
                <th style={styles.projectsTableHeader}>営業担当者</th>
              </tr>
            </thead>
            <tbody>
              {relatedProjects.map((project) => (
                <tr key={project.id}>
                  <td style={styles.projectsTableCell}>
                    <Link to={`/projects/${project.id}`} style={styles.projectLink}>
                      {project.name}
                    </Link>
                  </td>
                  <td style={styles.projectsTableCell}>
                    <span style={styles.statusBadge}>
                      {PROJECT_STATUS_LABELS[project.status] || project.status}
                    </span>
                  </td>
                  <td style={styles.projectsTableCell}>{project.salesPerson.displayName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 削除確認ダイアログ */}
      <TradingPartnerDeleteDialog
        isOpen={showDeleteDialog}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDelete}
        partnerName={partner.name}
        isDeleting={isDeleting}
        error={deleteError}
      />
    </main>
  );
}
