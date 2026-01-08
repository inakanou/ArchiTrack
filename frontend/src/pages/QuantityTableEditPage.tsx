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

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getQuantityTableDetail,
  createQuantityGroup,
  deleteQuantityGroup,
  createQuantityItem,
  updateQuantityItem,
  deleteQuantityItem,
  copyQuantityItem,
} from '../api/quantity-tables';
import type {
  QuantityTableDetail,
  QuantityGroupDetail,
  QuantityItemDetail,
} from '../types/quantity-table.types';
import { Breadcrumb } from '../components/common';
import QuantityGroupCard from '../components/quantity-table/QuantityGroupCard';

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

  // データ状態
  const [quantityTable, setQuantityTable] = useState<QuantityTableDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  // 削除確認ダイアログ用state（REQ-4.5）
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  /**
   * 数量表詳細を取得
   */
  const fetchQuantityTableDetail = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getQuantityTableDetail(id);
      setQuantityTable(result);
    } catch {
      setError('読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchQuantityTableDetail();
  }, [fetchQuantityTableDetail]);

  /**
   * グループ追加ハンドラ
   *
   * Requirements: 4.1
   */
  const handleAddGroup = useCallback(async () => {
    if (!id || !quantityTable || isAddingGroup) return;

    setIsAddingGroup(true);
    setError(null);

    try {
      // 現在のグループ数に基づいて表示順序を設定
      const currentGroups = quantityTable.groups ?? [];
      const maxDisplayOrder = currentGroups.reduce((max, g) => Math.max(max, g.displayOrder), -1);

      const newGroup = await createQuantityGroup(id, {
        name: null, // グループ名は任意
        displayOrder: maxDisplayOrder + 1,
      });

      // ローカル状態を更新（再取得せずに即時反映）
      setQuantityTable((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groupCount: prev.groupCount + 1,
          groups: [...(prev.groups ?? []), { ...newGroup, items: [] }],
        };
      });
    } catch {
      setError('グループの追加に失敗しました');
    } finally {
      setIsAddingGroup(false);
    }
  }, [id, quantityTable, isAddingGroup]);

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
  const handleDeleteGroup = useCallback((groupId: string) => {
    setGroupToDelete(groupId);
  }, []);

  /**
   * 削除をキャンセル
   */
  const handleCancelDelete = useCallback(() => {
    setGroupToDelete(null);
  }, []);

  /**
   * グループ削除を実行
   *
   * Requirements: 4.5
   */
  const handleConfirmDeleteGroup = useCallback(async () => {
    if (!groupToDelete || isDeletingGroup) return;

    setIsDeletingGroup(true);
    setError(null);

    try {
      await deleteQuantityGroup(groupToDelete);

      // ローカル状態を更新（再取得せずに即時反映）
      setQuantityTable((prev) => {
        if (!prev) return prev;
        const updatedGroups = (prev.groups ?? []).filter((g) => g.id !== groupToDelete);
        return {
          ...prev,
          groupCount: updatedGroups.length,
          groups: updatedGroups,
        };
      });

      setGroupToDelete(null);
    } catch {
      setError('グループの削除に失敗しました');
    } finally {
      setIsDeletingGroup(false);
    }
  }, [groupToDelete, isDeletingGroup]);

  /**
   * 項目追加ハンドラ
   *
   * Requirements: 5.1
   */
  const handleAddItem = useCallback(
    async (groupId: string) => {
      setError(null);

      try {
        // 対象グループの現在の項目数を取得
        const targetGroup = (quantityTable?.groups ?? []).find((g) => g.id === groupId);
        const currentItems = targetGroup?.items ?? [];
        const maxDisplayOrder = currentItems.reduce(
          (max, item) => Math.max(max, item.displayOrder),
          -1
        );

        // デフォルト値で新規項目を作成（必須フィールドにデフォルト値を設定）
        const newItem = await createQuantityItem(groupId, {
          majorCategory: '未設定',
          workType: '未設定',
          name: '新規項目',
          unit: '式',
          quantity: 0,
          displayOrder: maxDisplayOrder + 1,
        });

        // ローカル状態を更新（再取得せずに即時反映）
        setQuantityTable((prev) => {
          if (!prev) return prev;
          const updatedGroups = (prev.groups ?? []).map((g) => {
            if (g.id === groupId) {
              return {
                ...g,
                items: [...(g.items ?? []), newItem],
              };
            }
            return g;
          });
          return {
            ...prev,
            itemCount: prev.itemCount + 1,
            groups: updatedGroups,
          };
        });
      } catch {
        setError('項目の追加に失敗しました');
      }
    },
    [quantityTable]
  );

  /**
   * 項目更新ハンドラ
   *
   * Requirements: 5.2
   */
  const handleUpdateItem = useCallback(
    async (itemId: string, updates: Partial<QuantityItemDetail>) => {
      setError(null);

      try {
        // 対象項目を見つけてupdatedAtを取得
        let expectedUpdatedAt: string | undefined;
        for (const group of quantityTable?.groups ?? []) {
          const item = (group.items ?? []).find((i) => i.id === itemId);
          if (item) {
            expectedUpdatedAt = item.updatedAt;
            break;
          }
        }

        if (!expectedUpdatedAt) {
          setError('項目が見つかりません');
          return;
        }

        const updatedItem = await updateQuantityItem(itemId, updates, expectedUpdatedAt);

        // ローカル状態を更新
        setQuantityTable((prev) => {
          if (!prev) return prev;
          const updatedGroups = (prev.groups ?? []).map((g) => ({
            ...g,
            items: (g.items ?? []).map((item) => (item.id === itemId ? updatedItem : item)),
          }));
          return {
            ...prev,
            groups: updatedGroups,
          };
        });
      } catch {
        setError('項目の更新に失敗しました');
      }
    },
    [quantityTable]
  );

  /**
   * 項目削除ハンドラ
   *
   * Requirements: 5.3
   */
  const handleDeleteItem = useCallback(async (itemId: string) => {
    setError(null);

    try {
      await deleteQuantityItem(itemId);

      // ローカル状態を更新
      setQuantityTable((prev) => {
        if (!prev) return prev;
        const updatedGroups = (prev.groups ?? []).map((g) => ({
          ...g,
          items: (g.items ?? []).filter((item) => item.id !== itemId),
        }));
        return {
          ...prev,
          itemCount: prev.itemCount - 1,
          groups: updatedGroups,
        };
      });
    } catch {
      setError('項目の削除に失敗しました');
    }
  }, []);

  /**
   * 項目コピーハンドラ
   *
   * Requirements: 5.4
   */
  const handleCopyItem = useCallback(async (itemId: string) => {
    setError(null);

    try {
      const copiedItem = await copyQuantityItem(itemId);

      // コピー元の項目が属するグループを探す
      setQuantityTable((prev) => {
        if (!prev) return prev;
        const updatedGroups = (prev.groups ?? []).map((g) => {
          const hasItem = (g.items ?? []).some((item) => item.id === itemId);
          if (hasItem) {
            return {
              ...g,
              items: [...(g.items ?? []), copiedItem],
            };
          }
          return g;
        });
        return {
          ...prev,
          itemCount: prev.itemCount + 1,
          groups: updatedGroups,
        };
      });
    } catch {
      setError('項目のコピーに失敗しました');
    }
  }, []);

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

  // エラー表示
  if (error) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchQuantityTableDetail} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // データがない場合
  if (!quantityTable) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>数量表が見つかりません</p>
        </div>
      </main>
    );
  }

  const groups = quantityTable.groups ?? [];

  return (
    <main role="main" style={styles.container} data-testid="quantity-table-edit-area">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト', path: '/projects' },
            { label: quantityTable.project.name, path: `/projects/${quantityTable.projectId}` },
            { label: '数量表一覧', path: `/projects/${quantityTable.projectId}/quantity-tables` },
            { label: quantityTable.name },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link
            to={`/projects/${quantityTable.projectId}/quantity-tables`}
            style={styles.backLink}
            aria-label="数量表一覧に戻る"
          >
            ← 数量表一覧に戻る
          </Link>
          <h1 style={styles.title}>{quantityTable.name}</h1>
          <p style={styles.subtitle}>
            {quantityTable.groupCount}グループ / {quantityTable.itemCount}項目
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            type="button"
            style={{
              ...styles.addGroupButton,
              opacity: isAddingGroup ? 0.7 : 1,
              cursor: isAddingGroup ? 'wait' : 'pointer',
            }}
            onClick={handleAddGroup}
            disabled={isAddingGroup}
            aria-busy={isAddingGroup}
          >
            <PlusIcon />
            {isAddingGroup ? '追加中...' : 'グループを追加'}
          </button>
        </div>
      </div>

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
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onCopyItem={handleCopyItem}
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
              <button
                type="button"
                style={styles.cancelButton}
                onClick={handleCancelDelete}
                disabled={isDeletingGroup}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={{
                  ...styles.deleteButton,
                  opacity: isDeletingGroup ? 0.7 : 1,
                  cursor: isDeletingGroup ? 'wait' : 'pointer',
                }}
                onClick={handleConfirmDeleteGroup}
                disabled={isDeletingGroup}
              >
                {isDeletingGroup ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
