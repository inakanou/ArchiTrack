/**
 * @fileoverview 工事看板マスタ管理ページ
 *
 * Task 6.5: 看板マスタ管理画面
 *
 * プロジェクト配下の工事看板マスタを一覧表示し、SignboardForm を用いた登録・編集、
 * 確認ダイアログ付きの削除を1画面で完結させる。使用中（inUseCount>0）の看板削除時は
 * 使用件数入りの警告を表示してから削除する（R8.8）。
 *
 * 注: ルート登録（routes.tsx）はこのタスクの境界外（Task 7.1）。フォームは本ページ内に
 * SignboardForm として描画する。
 *
 * Requirements:
 * - 8.1: 看板の新規登録
 * - 8.2, 8.3, 8.4: 標準項目＋自由項目＋固定テキスト（SignboardForm）
 * - 8.6: 看板の編集（楽観的排他制御 updatedAt）
 * - 8.8: 使用中削除は確認ダイアログ
 * - 8.9: 当該プロジェクト配下のみ
 * - 8.10: 看板一覧表示（inUseCount）
 *
 * @module pages/ConstructionSignboardListPage
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getConstructionSignboards,
  createConstructionSignboard,
  updateConstructionSignboard,
  deleteConstructionSignboard,
} from '../api/construction-signboards';
import { getProject } from '../api/projects';
import { ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import { SignboardForm } from '../components/construction-photos/SignboardForm';
import { Breadcrumb } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import type { ProjectDetail } from '../types/project.types';
import type {
  ConstructionSignboard,
  CreateConstructionSignboardInput,
} from '../types/construction-photo.types';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '960px',
    margin: '0 auto',
    padding: '32px 16px',
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
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
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
  newButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  formTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '16px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  } as React.CSSProperties,
  th: {
    textAlign: 'left',
    padding: '0.75rem',
    borderBottom: '2px solid #e5e7eb',
    fontSize: '0.875rem',
    color: '#6b7280',
  } as React.CSSProperties,
  td: {
    padding: '0.75rem',
    borderBottom: '1px solid #f3f4f6',
    fontSize: '0.875rem',
    color: '#1f2937',
  } as React.CSSProperties,
  rowActions: {
    display: 'flex',
    gap: '0.5rem',
  } as React.CSSProperties,
  editButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#ffffff',
    color: '#2563eb',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
  } as React.CSSProperties,
  empty: {
    padding: '32px',
    textAlign: 'center',
    color: '#6b7280',
  } as React.CSSProperties,
  errorAlert: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
  } as React.CSSProperties,
  errorText: {
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
  // 確認ダイアログ
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '480px',
    width: '100%',
    margin: '0 16px',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '12px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '16px',
  } as React.CSSProperties,
  dialogWarning: {
    fontSize: '14px',
    color: '#b45309',
    fontWeight: 500,
    marginBottom: '16px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,
  dialogCancelButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  dialogDeleteButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

type FormMode =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; signboard: ConstructionSignboard };

/**
 * 工事看板マスタ管理ページ
 */
export default function ConstructionSignboardListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [signboards, setSignboards] = useState<ConstructionSignboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<FormMode>({ type: 'closed' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ConstructionSignboard | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * 看板一覧を再取得する（当該プロジェクト配下のみ）
   */
  const reloadSignboards = useCallback(async () => {
    if (!projectId) return;
    const data = await getConstructionSignboards(projectId);
    setSignboards(data);
  }, [projectId]);

  /**
   * 初期ロード（プロジェクト情報＋看板一覧）
   */
  useEffect(() => {
    const load = async () => {
      if (!projectId) {
        setIsLoading(false);
        return;
      }
      try {
        const [projectData, signboardData] = await Promise.all([
          getProject(projectId),
          getConstructionSignboards(projectId),
        ]);
        setProject(projectData);
        setSignboards(signboardData);
      } catch (err) {
        const message =
          err instanceof ApiError && err.message ? err.message : '看板一覧の取得に失敗しました';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [projectId]);

  /**
   * 新規登録の送信
   */
  const handleCreate = useCallback(
    async (input: CreateConstructionSignboardInput) => {
      if (!projectId) return;
      setIsSubmitting(true);
      try {
        await createConstructionSignboard(projectId, input);
        toast.success('工事看板を登録しました');
        setFormMode({ type: 'closed' });
        await reloadSignboards();
      } catch (err) {
        const message =
          err instanceof ApiError && err.message ? err.message : '登録中にエラーが発生しました';
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, toast, reloadSignboards]
  );

  /**
   * 編集の送信（楽観的排他制御 updatedAt）
   */
  const handleUpdate = useCallback(
    async (target: ConstructionSignboard, input: CreateConstructionSignboardInput) => {
      setIsSubmitting(true);
      try {
        await updateConstructionSignboard(
          target.id,
          {
            workName: input.workName,
            workLocation: input.workLocation,
            freeItems: input.freeItems,
            footerText: input.footerText,
          },
          target.updatedAt
        );
        toast.success('工事看板を更新しました');
        setFormMode({ type: 'closed' });
        await reloadSignboards();
      } catch (err) {
        const message =
          err instanceof ApiError && err.message ? err.message : '更新中にエラーが発生しました';
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [toast, reloadSignboards]
  );

  /**
   * 削除確定（確認ダイアログのはい）
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteConstructionSignboard(deleteTarget.id);
      toast.success('工事看板を削除しました');
      setDeleteTarget(null);
      await reloadSignboards();
    } catch (err) {
      const message =
        err instanceof ApiError && err.message ? err.message : '削除中にエラーが発生しました';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, toast, reloadSignboards]);

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} aria-label="読み込み中" />
          <p>読み込み中...</p>
        </div>
        <style>
          {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
        </style>
      </main>
    );
  }

  // プロジェクトが見つからない場合
  if (!project || !projectId) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorAlert}>
          <p style={styles.errorText}>{error || 'プロジェクトが見つかりません'}</p>
        </div>
      </main>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: project.name, path: `/projects/${projectId}` },
    { label: '工事写真一覧', path: `/projects/${projectId}/construction-photos` },
    { label: '工事看板マスタ' },
  ];

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <Link to={`/projects/${projectId}/construction-photos`} style={styles.backLink}>
        &larr; 工事写真一覧に戻る
      </Link>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>工事看板マスタ</h1>
        {formMode.type === 'closed' && (
          <button
            type="button"
            onClick={() => setFormMode({ type: 'create' })}
            style={styles.newButton}
          >
            新規登録
          </button>
        )}
      </div>

      {/* 作成/編集フォーム */}
      {formMode.type !== 'closed' && (
        <div style={styles.section}>
          <h2 style={styles.formTitle}>
            {formMode.type === 'create' ? '工事看板を新規登録' : '工事看板を編集'}
          </h2>
          {formMode.type === 'create' ? (
            <SignboardForm
              onSubmit={handleCreate}
              onCancel={() => setFormMode({ type: 'closed' })}
              submitLabel="登録"
              isSubmitting={isSubmitting}
            />
          ) : (
            <SignboardForm
              initialValue={formMode.signboard}
              onSubmit={(input) => handleUpdate(formMode.signboard, input)}
              onCancel={() => setFormMode({ type: 'closed' })}
              submitLabel="更新"
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      )}

      {/* 一覧 */}
      <div style={styles.section}>
        {signboards.length === 0 ? (
          <p style={styles.empty}>登録済みの工事看板はありません</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>工事件名</th>
                <th style={styles.th}>工事場所</th>
                <th style={styles.th}>使用件数</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {signboards.map((signboard) => (
                <tr key={signboard.id}>
                  <td style={styles.td}>{signboard.workName}</td>
                  <td style={styles.td}>{signboard.workLocation}</td>
                  <td style={styles.td}>
                    {signboard.inUseCount > 0 ? `${signboard.inUseCount}件` : '未使用'}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.rowActions}>
                      <button
                        type="button"
                        onClick={() => setFormMode({ type: 'edit', signboard })}
                        style={styles.editButton}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(signboard)}
                        style={styles.deleteButton}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 削除確認ダイアログ（R8.8: 使用中は件数入り警告） */}
      {deleteTarget && (
        <div
          style={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signboard-delete-title"
        >
          <div style={styles.dialog}>
            <h2 id="signboard-delete-title" style={styles.dialogTitle}>
              工事看板を削除しますか?
            </h2>
            {deleteTarget.inUseCount > 0 ? (
              <p role="alert" style={styles.dialogWarning}>
                {deleteTarget.inUseCount}件の写真項目で使用中です。削除しますか?
              </p>
            ) : (
              <p style={styles.dialogMessage}>この操作は取り消せません。</p>
            )}
            <div style={styles.dialogActions}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                style={styles.dialogCancelButton}
                disabled={isDeleting}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={styles.dialogDeleteButton}
                disabled={isDeleting}
              >
                {isDeleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
