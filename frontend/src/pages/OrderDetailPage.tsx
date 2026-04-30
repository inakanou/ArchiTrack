/**
 * @fileoverview 発注詳細ページ
 *
 * Task 9.1: 発注の作成・編集・削除UI実装
 * Task 9.2: 発注エクスポートUI実装
 *
 * Requirements:
 * - REQ-6.1-6.8: 発注の作成と取引先指定
 * - REQ-7.1-7.5: 発注の編集と削除
 * - REQ-8.1-8.9: 発注金額の確定と案分
 * - REQ-10.1-10.4: 発注一覧のエクスポート
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOrderDetail,
  createOrder,
  updateOrder,
  updateOrderItems,
  updateOrderStatus,
  deleteOrder,
  exportOrder,
  type OrderWithItems,
} from '../api/order-detail';
import type { OrderStatus } from '../api/execution-budget';
import { ApiError } from '../api/client';
import TradingPartnerSelect from '../components/projects/TradingPartnerSelect';
import { Breadcrumb } from '../components/common';

// ============================================================================
// 金額フォーマットユーティリティ
// ============================================================================

/**
 * 金額を3桁区切りカンマ付き整数形式でフォーマットする
 * REQ-18.2
 */
function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('ja-JP');
}

/**
 * 発注ステータスの表示名
 */
function getOrderStatusLabel(status: OrderStatus | null): string {
  switch (status) {
    case 'BEFORE_ORDER':
      return '発注前';
    case 'UNDER_REVIEW':
      return '検討中';
    case 'ORDERED':
      return '発注済';
    case 'CANCELLED':
      return '取消';
    default:
      return '';
  }
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  page: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
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
  headerActions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  primaryButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  } as React.CSSProperties,
  dangerButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
  } as React.CSSProperties,
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  successButton: {
    backgroundColor: '#059669',
    color: '#ffffff',
  } as React.CSSProperties,
  warningButton: {
    backgroundColor: '#d97706',
    color: '#ffffff',
  } as React.CSSProperties,
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
  infoBar: {
    display: 'flex',
    gap: '24px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '12px',
    color: '#6b7280',
  } as React.CSSProperties,
  infoValue: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
  } as React.CSSProperties,
  tableContainer: {
    overflowX: 'auto' as const,
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,
  th: {
    padding: '8px 12px',
    backgroundColor: '#f3f4f6',
    borderBottom: '2px solid #d1d5db',
    textAlign: 'left' as const,
    fontWeight: 600,
    fontSize: '12px',
    color: '#4b5563',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  td: {
    padding: '6px 12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#1f2937',
  } as React.CSSProperties,
  tdRight: {
    textAlign: 'right' as const,
  } as React.CSSProperties,
  totalRow: {
    backgroundColor: '#eff6ff',
    fontWeight: 600,
  } as React.CSSProperties,
  statusBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 500,
    display: 'inline-block',
  } as React.CSSProperties,
  statusBadgeOrdered: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  } as React.CSSProperties,
  statusBadgeBeforeOrder: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
  } as React.CSSProperties,
  statusBadgeUnderReview: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  } as React.CSSProperties,
  statusBadgeCancelled: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  } as React.CSSProperties,
  dialogOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto' as const,
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '16px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
  } as React.CSSProperties,
  errorMessage: {
    color: '#dc2626',
    fontSize: '13px',
    marginTop: '8px',
  } as React.CSSProperties,
};

// ============================================================================
// ステータスバッジスタイル
// ============================================================================

function getStatusBadgeStyle(status: OrderStatus): React.CSSProperties {
  switch (status) {
    case 'BEFORE_ORDER':
      return { ...styles.statusBadge, ...styles.statusBadgeBeforeOrder };
    case 'UNDER_REVIEW':
      return { ...styles.statusBadge, ...styles.statusBadgeUnderReview };
    case 'ORDERED':
      return { ...styles.statusBadge, ...styles.statusBadgeOrdered };
    case 'CANCELLED':
      return { ...styles.statusBadge, ...styles.statusBadgeCancelled };
    default:
      return styles.statusBadge;
  }
}

// ============================================================================
// メインコンポーネント
// ============================================================================

export function OrderDetailPage() {
  const { projectId, orderId } = useParams<{ projectId: string; orderId: string }>();
  const navigate = useNavigate();
  const isCreateMode = orderId === 'new';

  // State
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());
  const [confirmedAmountInput, setConfirmedAmountInput] = useState('');
  const [selectedTradingPartnerId, setSelectedTradingPartnerId] = useState('');

  // ダイアログ state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showOrderConfirmDialog, setShowOrderConfirmDialog] = useState(false);
  const [showCancelConfirmDialog, setShowCancelConfirmDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const isOrdered = order?.status === 'ORDERED';
  const isCancelled = order?.status === 'CANCELLED';
  const isLocked = isOrdered || isCancelled;

  // チェック済み項目の合計実行金額を計算
  // order が null、items が未定義（API レスポンスに含まれない更新系応答）の場合は 0 を返す
  const totalCheckedExecutionAmount = useMemo(() => {
    if (!order || !order.items) return 0;
    return order.items
      .filter((item) => checkedItemIds.has(item.executionBudgetItemId))
      .reduce((sum, item) => {
        const amount = parseInt(item.executionBudgetItem?.executionAmount || '0', 10);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);
  }, [order, checkedItemIds]);

  // データ取得
  const fetchData = useCallback(async () => {
    if (!projectId || !orderId || isCreateMode) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getOrderDetail(projectId, orderId);
      setOrder(data);
      // チェック済み項目のIDをセット
      const checkedIds = new Set<string>();
      data.items.forEach((item) => {
        if (item.checked) {
          checkedIds.add(item.executionBudgetItemId);
        }
      });
      setCheckedItemIds(checkedIds);
      setConfirmedAmountInput(data.confirmedAmount || '');
      setSelectedTradingPartnerId(data.tradingPartnerId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('データの取得に失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId, orderId, isCreateMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // チェックボックス変更
  const handleCheckChange = useCallback(
    (itemId: string, checked: boolean) => {
      if (isLocked) return;
      setCheckedItemIds((prev) => {
        const newSet = new Set(prev);
        if (checked) {
          newSet.add(itemId);
        } else {
          newSet.delete(itemId);
        }
        return newSet;
      });
    },
    [isLocked]
  );

  // 項目保存
  const handleSaveItems = useCallback(async () => {
    if (!projectId || !orderId || isLocked) return;
    try {
      const data = await updateOrderItems(projectId, orderId, {
        itemIds: Array.from(checkedItemIds),
      });
      setOrder(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }, [projectId, orderId, checkedItemIds, isLocked]);

  // 確定発注金額保存
  const handleSaveConfirmedAmount = useCallback(async () => {
    if (!projectId || !orderId || isLocked) return;
    try {
      const data = await updateOrder(projectId, orderId, {
        confirmedAmount: confirmedAmountInput || undefined,
      });
      setOrder(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }, [projectId, orderId, confirmedAmountInput, isLocked]);

  // ステータス変更
  const handleStatusChange = useCallback(
    async (newStatus: OrderStatus) => {
      if (!projectId || !orderId) return;
      setStatusError(null);

      if (newStatus === 'ORDERED') {
        // 確定発注金額チェック
        if (!confirmedAmountInput) {
          setStatusError('確定発注金額を入力してください');
          return;
        }
        setShowOrderConfirmDialog(true);
        return;
      }

      if (newStatus === 'CANCELLED') {
        setShowCancelConfirmDialog(true);
        return;
      }

      try {
        const data = await updateOrderStatus(projectId, orderId, { status: newStatus });
        setOrder(data);
      } catch (err) {
        if (err instanceof ApiError) {
          setStatusError(err.message);
        }
      }
    },
    [projectId, orderId, confirmedAmountInput]
  );

  // 発注確定実行
  const handleConfirmOrder = useCallback(async () => {
    if (!projectId || !orderId) return;
    try {
      const data = await updateOrderStatus(projectId, orderId, {
        status: 'ORDERED',
        confirmedAmount: confirmedAmountInput,
      });
      setOrder(data);
      setShowOrderConfirmDialog(false);
      // チェック状態の更新
      const checkedIds = new Set<string>();
      data.items.forEach((item) => {
        if (item.checked) {
          checkedIds.add(item.executionBudgetItemId);
        }
      });
      setCheckedItemIds(checkedIds);
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusError(err.message);
      }
      setShowOrderConfirmDialog(false);
    }
  }, [projectId, orderId, confirmedAmountInput]);

  // 発注取消実行
  const handleCancelOrder = useCallback(async () => {
    if (!projectId || !orderId) return;
    try {
      const data = await updateOrderStatus(projectId, orderId, { status: 'CANCELLED' });
      setOrder(data);
      setShowCancelConfirmDialog(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusError(err.message);
      }
      setShowCancelConfirmDialog(false);
    }
  }, [projectId, orderId]);

  // 削除
  const handleDelete = useCallback(async () => {
    if (!projectId || !orderId) return;

    if (isOrdered) {
      setDeleteError('発注済みの発注は削除できません');
      return;
    }

    setShowDeleteDialog(true);
  }, [projectId, orderId, isOrdered]);

  const handleConfirmDelete = useCallback(async () => {
    if (!projectId || !orderId) return;
    try {
      await deleteOrder(projectId, orderId);
      navigate(`/projects/${projectId}/execution-budget`);
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message);
      }
    }
  }, [projectId, orderId, navigate]);

  // エクスポート
  const handleExport = useCallback(
    async (format: 'xlsx' | 'pdf') => {
      if (!projectId || !orderId) return;
      try {
        const blob = await exportOrder(projectId, orderId, format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `order-${orderId}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        }
      }
    },
    [projectId, orderId]
  );

  // 新規作成
  const handleCreate = useCallback(async () => {
    if (!projectId || !selectedTradingPartnerId) return;
    try {
      const data = await createOrder(projectId, {
        tradingPartnerId: selectedTradingPartnerId,
      });
      navigate(`/projects/${projectId}/execution-budget/orders/${data.id}`, {
        replace: true,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }, [projectId, selectedTradingPartnerId, navigate]);

  // 取引先変更
  const handleTradingPartnerChange = useCallback(
    async (tradingPartnerId: string) => {
      setSelectedTradingPartnerId(tradingPartnerId);
      if (!isCreateMode && projectId && orderId && !isLocked && tradingPartnerId) {
        try {
          const data = await updateOrder(projectId, orderId, { tradingPartnerId });
          setOrder(data);
        } catch (err) {
          if (err instanceof ApiError) {
            setError(err.message);
          }
        }
      }
    },
    [projectId, orderId, isCreateMode, isLocked]
  );

  if (isLoading) {
    return (
      <div style={styles.page}>
        <div data-testid="loading-skeleton">読み込み中...</div>
      </div>
    );
  }

  // 新規作成モード
  if (isCreateMode) {
    return (
      <div style={styles.page}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
            { label: '実行予算', path: `/projects/${projectId}/execution-budget` },
            { label: '発注作成' },
          ]}
        />
        <div style={styles.header}>
          <h1 style={styles.title}>発注作成</h1>
        </div>

        <div style={styles.section}>
          <TradingPartnerSelect
            value={selectedTradingPartnerId}
            onChange={handleTradingPartnerChange}
            filterTypes={['SUBCONTRACTOR']}
            label="取引先"
            required
            placeholder="取引先を検索または選択"
            showEmptyOption={false}
          />

          {error && <p style={styles.errorMessage}>{error}</p>}

          <div style={styles.dialogActions}>
            <button
              style={{ ...styles.button, ...styles.secondaryButton }}
              onClick={() => navigate(`/projects/${projectId}/execution-budget`)}
            >
              キャンセル
            </button>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={handleCreate}
              disabled={!selectedTradingPartnerId}
            >
              作成
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 発注が取得できない場合
  if (!order) {
    return (
      <div style={styles.page}>
        <p style={{ color: '#dc2626' }}>{error || '発注が見つかりません'}</p>
      </div>
    );
  }

  // 発注詳細表示
  return (
    <div style={styles.page}>
      <Breadcrumb
        items={[
          { label: 'プロジェクト', path: '/projects' },
          { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
          { label: '実行予算', path: `/projects/${projectId}/execution-budget` },
          { label: '発注詳細' },
        ]}
      />

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>発注詳細</h1>
        <div style={styles.headerActions}>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => handleExport('xlsx')}
            aria-label="Excel出力"
          >
            Excel出力
          </button>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => handleExport('pdf')}
            aria-label="PDF出力"
          >
            PDF出力
          </button>
          <button
            style={{ ...styles.button, ...styles.dangerButton }}
            onClick={handleDelete}
            aria-label="削除"
          >
            削除
          </button>
        </div>
      </div>

      {/* 基本情報 */}
      <div style={styles.infoBar}>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>取引先</span>
          <span style={styles.infoValue}>{order.tradingPartnerName}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>ステータス</span>
          <span style={getStatusBadgeStyle(order.status)}>{getOrderStatusLabel(order.status)}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>チェック済み項目の合計実行金額</span>
          <span style={styles.infoValue}>{formatAmount(totalCheckedExecutionAmount)}円</span>
        </div>
        {order.confirmedAmount && (
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>確定発注金額</span>
            <span style={styles.infoValue}>{formatAmount(order.confirmedAmount)}円</span>
          </div>
        )}
      </div>

      {/* 取引先選択（未発注時のみ編集可能） */}
      {!isLocked && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>取引先変更</h2>
          <TradingPartnerSelect
            value={selectedTradingPartnerId}
            onChange={handleTradingPartnerChange}
            filterTypes={['SUBCONTRACTOR']}
            label="取引先"
            required
            placeholder="取引先を検索または選択"
            showEmptyOption={false}
            disabled={isLocked}
          />
        </div>
      )}

      {/* 確定発注金額入力 */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>確定発注金額</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={confirmedAmountInput}
            onChange={(e) => setConfirmedAmountInput(e.target.value)}
            disabled={isLocked}
            placeholder="確定発注金額を入力"
            aria-label="確定発注金額"
            style={{
              ...styles.input,
              maxWidth: '300px',
              backgroundColor: isLocked ? '#f3f4f6' : '#ffffff',
            }}
          />
          {!isLocked && (
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={handleSaveConfirmedAmount}
            >
              保存
            </button>
          )}
        </div>
        {statusError && <p style={styles.errorMessage}>{statusError}</p>}
      </div>

      {/* ステータス遷移 */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>ステータス変更</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {order.status === 'BEFORE_ORDER' && (
            <button
              style={{ ...styles.button, ...styles.warningButton }}
              onClick={() => handleStatusChange('UNDER_REVIEW')}
              aria-label="発注金額検討中にする"
            >
              発注金額検討中
            </button>
          )}
          {(order.status === 'BEFORE_ORDER' || order.status === 'UNDER_REVIEW') && (
            <button
              style={{ ...styles.button, ...styles.successButton }}
              onClick={() => handleStatusChange('ORDERED')}
              aria-label="発注済にする"
            >
              発注済
            </button>
          )}
          {order.status === 'ORDERED' && (
            <button
              style={{ ...styles.button, ...styles.dangerButton }}
              onClick={() => handleStatusChange('CANCELLED')}
              aria-label="発注取消"
            >
              発注取消
            </button>
          )}
        </div>
      </div>

      {/* 項目一覧 */}
      <div style={styles.section}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>発注項目一覧</h2>
          {!isLocked && (
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveItems}>
              チェック状態を保存
            </button>
          )}
        </div>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>選択</th>
                <th style={styles.th}>項目名</th>
                <th style={styles.th}>規格</th>
                <th style={styles.th}>単位</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>実行単価</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>実行金額</th>
                {isOrdered && <th style={{ ...styles.th, textAlign: 'right' }}>発注金額</th>}
                <th style={styles.th}>発注予定取引先</th>
              </tr>
            </thead>
            <tbody>
              {(order.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={checkedItemIds.has(item.executionBudgetItemId)}
                      onChange={(e) =>
                        handleCheckChange(item.executionBudgetItemId, e.target.checked)
                      }
                      disabled={isLocked}
                      aria-label={`${item.executionBudgetItem.name || '項目'}を選択`}
                    />
                  </td>
                  <td style={styles.td}>{item.executionBudgetItem.name || ''}</td>
                  <td style={styles.td}>{item.executionBudgetItem.specification || ''}</td>
                  <td style={styles.td}>{item.executionBudgetItem.unit || ''}</td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>
                    {item.executionBudgetItem.quantity || ''}
                  </td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>
                    {formatAmount(item.executionBudgetItem.executionUnitPrice)}
                  </td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>
                    {formatAmount(item.executionBudgetItem.executionAmount)}
                  </td>
                  {isOrdered && (
                    <td style={{ ...styles.td, ...styles.tdRight }}>
                      {formatAmount(item.orderAmount)}
                    </td>
                  )}
                  <td style={styles.td}>{item.executionBudgetItem.plannedVendorName || ''}</td>
                </tr>
              ))}
              {/* 合計行 */}
              <tr style={styles.totalRow}>
                <td style={styles.td}></td>
                <td style={{ ...styles.td, fontWeight: 600 }}>合計</td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(totalCheckedExecutionAmount)}
                </td>
                {isOrdered && (
                  <td style={{ ...styles.td, ...styles.tdRight }}>
                    {formatAmount(order.confirmedAmount)}
                  </td>
                )}
                <td style={styles.td}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 削除ダイアログ / 削除エラー */}
      {deleteError && !showDeleteDialog && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
          }}
        >
          {deleteError}
        </div>
      )}

      {showDeleteDialog && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialog} role="dialog" aria-label="削除確認">
            <h3 style={styles.dialogTitle}>発注の削除</h3>
            <p>この発注を削除してもよろしいですか？</p>
            {deleteError && <p style={styles.errorMessage}>{deleteError}</p>}
            <div style={styles.dialogActions}>
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteError(null);
                }}
              >
                キャンセル
              </button>
              <button
                style={{ ...styles.button, ...styles.dangerButton }}
                onClick={handleConfirmDelete}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 発注確定ダイアログ */}
      {showOrderConfirmDialog && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialog} role="dialog" aria-label="発注確定確認">
            <h3 style={styles.dialogTitle}>発注を確定しますか？</h3>
            <p>
              確定発注金額: {formatAmount(confirmedAmountInput)}円<br />
              チェック済み項目に案分計算されます。
            </p>
            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '8px' }}>
              発注確定後はチェック状態・確定発注金額・取引先の変更ができなくなります。
            </p>
            <div style={styles.dialogActions}>
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={() => setShowOrderConfirmDialog(false)}
              >
                キャンセル
              </button>
              <button
                style={{ ...styles.button, ...styles.successButton }}
                onClick={handleConfirmOrder}
              >
                確定する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 発注取消ダイアログ */}
      {showCancelConfirmDialog && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialog} role="dialog" aria-label="発注取消確認">
            <h3 style={styles.dialogTitle}>発注を取消しますか？</h3>
            <p style={{ color: '#dc2626' }}>
              案分済みの発注金額がクリアされます。この操作は元に戻せません。
            </p>
            <div style={styles.dialogActions}>
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={() => setShowCancelConfirmDialog(false)}
              >
                キャンセル
              </button>
              <button
                style={{ ...styles.button, ...styles.dangerButton }}
                onClick={handleCancelOrder}
              >
                取消する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderDetailPage;
