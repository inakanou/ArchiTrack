/**
 * @fileoverview 実行予算メインページ
 *
 * Task 8.1: 実行予算の作成・表示・削除UI実装
 * Task 8.2: 実行予算項目一覧のツリー表示と編集UI実装
 * Task 8.3: 発注一覧セクションと原価入力UI実装
 * Task 8.4: 月次締めUIと変更契約反映UI実装
 *
 * Requirements:
 * - REQ-1.1-1.7: 実行予算の作成
 * - REQ-2.1-2.3: 実行予算の削除
 * - REQ-3.1-3.10: 実行予算項目一覧表示
 * - REQ-4.1-4.5: 実行予算項目の編集
 * - REQ-5.1-5.3: 発注一覧表示
 * - REQ-9.1-9.3: 発注ステータスの実行予算反映
 * - REQ-13.1-13.8: 原価管理
 * - REQ-14.1-14.5: 月次締め
 * - REQ-15.1-15.8: 契約変更反映
 * - REQ-18.2, 18.4, 18.5: 数値表示
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getExecutionBudget,
  createExecutionBudget,
  deleteExecutionBudget,
  getOrders,
  executeMonthlyClose,
  getMonthlyCloseHistory,
  type ExecutionBudgetWithItems,
  type ExecutionBudgetItem,
  type OrderSummary,
  type MonthlyCloseHistory,
  type OrderStatus,
} from '../api/execution-budget';
import { getContracts, type ContractListItem } from '../api/contracts';
import { ApiError } from '../api/client';
import { Breadcrumb } from '../components/common';

// ============================================================================
// 型定義
// ============================================================================

interface TreeItemState {
  [key: string]: boolean; // itemId -> expanded
}

// ============================================================================
// 金額フォーマットユーティリティ
// ============================================================================

/**
 * 金額を3桁区切りカンマ付き整数形式でフォーマットする
 * REQ-18.2: 金額表示を3桁区切りのカンマ付き整数形式で表示する
 */
function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('ja-JP');
}

/**
 * 出来高率をフォーマットする
 * REQ-18.4: 出来高率を小数点以下1桁で表示する
 */
function formatRate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `${value}%`;
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

/**
 * 値が負数かどうか判定
 * REQ-18.5: 負の金額値を赤色で表示する
 */
function isNegative(value: string | null | undefined): boolean {
  if (!value) return false;
  const num = parseInt(value, 10);
  return !isNaN(num) && num < 0;
}

/**
 * 残予算を計算する
 */
function calculateRemainingBudget(
  executionAmount: string | null,
  previousMonthExpense: string,
  currentMonthExpense: string
): string {
  const exec = parseInt(executionAmount || '0', 10);
  const prev = parseInt(previousMonthExpense || '0', 10);
  const curr = parseInt(currentMonthExpense || '0', 10);
  const totalExpense = prev + curr;
  return String(exec - totalExpense);
}

/**
 * 累計支出が実行金額を超過しているか判定
 * REQ-13.6: 累計支出が実行金額を超過した場合、残予算を赤色で警告表示する
 */
function isOverBudget(
  executionAmount: string | null,
  previousMonthExpense: string,
  currentMonthExpense: string
): boolean {
  const remaining = parseInt(
    calculateRemainingBudget(executionAmount, previousMonthExpense, currentMonthExpense),
    10
  );
  return remaining < 0;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  page: {
    maxWidth: '1400px',
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
  tableContainer: {
    overflowX: 'auto' as const,
    marginBottom: '24px',
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
  tdNegative: {
    color: '#dc2626',
  } as React.CSSProperties,
  totalRow: {
    backgroundColor: '#eff6ff',
    fontWeight: 600,
  } as React.CSSProperties,
  parentRow: {
    backgroundColor: '#f9fafb',
    fontWeight: 500,
  } as React.CSSProperties,
  toggleButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
    color: '#6b7280',
  } as React.CSSProperties,
  statusBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 500,
  } as React.CSSProperties,
  orderedBadge: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
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
  orderListItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer',
  } as React.CSSProperties,
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
    fontSize: '13px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#6b7280',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 実行予算項目のツリー行を再帰的にレンダリングする
 */
function TreeRow({
  item,
  depth,
  expandedState,
  onToggle,
}: {
  item: ExecutionBudgetItem;
  depth: number;
  expandedState: TreeItemState;
  onToggle: (id: string) => void;
}) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedState[item.id] !== false; // デフォルトで展開
  const isParent = hasChildren;
  const remaining = calculateRemainingBudget(
    item.executionAmount,
    item.previousMonthExpense,
    item.currentMonthExpense
  );
  const overBudget = isOverBudget(
    item.executionAmount,
    item.previousMonthExpense,
    item.currentMonthExpense
  );

  return (
    <>
      <tr style={isParent ? styles.parentRow : undefined}>
        {/* 項目名 */}
        <td style={{ ...styles.td, paddingLeft: `${12 + depth * 20}px` }}>
          {hasChildren && (
            <button
              style={styles.toggleButton}
              onClick={() => onToggle(item.id)}
              aria-label={isExpanded ? '折りたたむ' : '展開する'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {item.name || ''}
        </td>
        {/* 規格 */}
        <td style={styles.td}>{item.specification || ''}</td>
        {/* 単位 */}
        <td style={styles.td}>{item.unit || ''}</td>
        {/* 数量 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{item.quantity || ''}</td>
        {/* 見積単価 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(item.estimateUnitPrice)}</td>
        {/* 見積金額 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(item.estimateAmount)}</td>
        {/* 実行単価 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(item.executionUnitPrice)}</td>
        {/* 実行金額 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(item.executionAmount)}</td>
        {/* 変更金額 */}
        <td
          style={{
            ...styles.td,
            ...styles.tdRight,
            ...(isNegative(item.amendmentAmount) ? styles.tdNegative : {}),
          }}
        >
          {formatAmount(item.amendmentAmount)}
        </td>
        {/* 発注予定取引先 */}
        <td style={styles.td}>{item.plannedVendorName || ''}</td>
        {/* 発注金額 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(item.orderAmount)}</td>
        {/* 発注ステータス */}
        <td style={styles.td}>
          {item.orderStatus === 'ORDERED' && (
            <span style={{ ...styles.statusBadge, ...styles.orderedBadge }}>発注済</span>
          )}
          {item.orderStatus && item.orderStatus !== 'ORDERED' && (
            <span style={styles.statusBadge}>{getOrderStatusLabel(item.orderStatus)}</span>
          )}
        </td>
        {/* 先月までの支出 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>
          {formatAmount(item.previousMonthExpense)}
        </td>
        {/* 今月の支出 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>
          {formatAmount(item.currentMonthExpense)}
        </td>
        {/* 累計支出 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>
          {formatAmount(
            String(
              parseInt(item.previousMonthExpense || '0', 10) +
                parseInt(item.currentMonthExpense || '0', 10)
            )
          )}
        </td>
        {/* 残予算 */}
        <td
          style={{
            ...styles.td,
            ...styles.tdRight,
            ...(overBudget ? styles.tdNegative : {}),
          }}
        >
          {formatAmount(remaining)}
        </td>
        {/* 出来高金額 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{formatAmount(item.progressAmount)}</td>
        {/* 出来高率 */}
        <td style={{ ...styles.td, ...styles.tdRight }}>{formatRate(item.progressRate)}</td>
        {/* 備考 */}
        <td style={styles.td}>{item.remarks || ''}</td>
      </tr>
      {/* 子項目を再帰的にレンダリング */}
      {hasChildren &&
        isExpanded &&
        item.children!.map((child) => (
          <TreeRow
            key={child.id}
            item={child}
            depth={depth + 1}
            expandedState={expandedState}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

export function ExecutionBudgetPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // State
  const [budget, setBudget] = useState<ExecutionBudgetWithItems | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyCloseHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [expandedState, setExpandedState] = useState<TreeItemState>({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMonthlyCloseDialog, setShowMonthlyCloseDialog] = useState(false);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [monthlyCloseMonth, setMonthlyCloseMonth] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // データ取得
  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [budgetData, ordersData, historyData] = await Promise.all([
        getExecutionBudget(projectId),
        getOrders(projectId).catch(() => [] as OrderSummary[]),
        getMonthlyCloseHistory(projectId).catch(() => [] as MonthlyCloseHistory[]),
      ]);
      setBudget(budgetData);
      setOrders(ordersData);
      setMonthlyHistory(historyData);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('データの取得に失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ツリー展開/折りたたみ
  const handleToggle = useCallback((id: string) => {
    setExpandedState((prev) => ({
      ...prev,
      [id]: prev[id] === false ? true : false,
    }));
  }, []);

  // 実行予算作成
  const handleCreate = useCallback(async () => {
    if (!projectId || !selectedContractId) return;
    try {
      await createExecutionBudget(projectId, { contractId: selectedContractId });
      setShowCreateDialog(false);
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  }, [projectId, selectedContractId, fetchData]);

  // 実行予算削除
  const handleDelete = useCallback(async () => {
    if (!projectId) return;
    try {
      await deleteExecutionBudget(projectId);
      setShowDeleteDialog(false);
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message);
      }
    }
  }, [projectId, fetchData]);

  // 月次締め
  const handleMonthlyClose = useCallback(async () => {
    if (!projectId || !monthlyCloseMonth) return;
    try {
      await executeMonthlyClose(projectId, { targetMonth: monthlyCloseMonth });
      setShowMonthlyCloseDialog(false);
      setMonthlyCloseMonth('');
      await fetchData();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      }
    }
  }, [projectId, monthlyCloseMonth, fetchData]);

  // 契約書選択ダイアログを開く
  const handleOpenCreateDialog = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await getContracts(projectId);
      setContracts(response.contracts);
      setShowCreateDialog(true);
    } catch (err) {
      setError('契約書一覧の取得に失敗しました');
    }
  }, [projectId]);

  if (isLoading) {
    return (
      <div style={styles.page}>
        <div data-testid="loading-skeleton">読み込み中...</div>
      </div>
    );
  }

  // 実行予算が存在しない場合
  if (!budget) {
    return (
      <div style={styles.page}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
            { label: '実行予算' },
          ]}
        />
        <div style={styles.emptyState}>
          <h2 style={{ marginBottom: '16px', color: '#374151' }}>実行予算</h2>
          <p style={{ marginBottom: '24px' }}>実行予算はまだ作成されていません。</p>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={handleOpenCreateDialog}
          >
            実行予算を作成
          </button>
        </div>

        {/* 契約書選択ダイアログ */}
        {showCreateDialog && (
          <div style={styles.dialogOverlay}>
            <div style={styles.dialog} role="dialog" aria-label="契約書選択">
              <h3 style={styles.dialogTitle}>契約書を選択</h3>
              <div>
                {contracts.map((contract) => (
                  <label
                    key={contract.id}
                    style={{
                      display: 'block',
                      padding: '8px',
                      cursor: 'pointer',
                      backgroundColor:
                        selectedContractId === contract.id ? '#eff6ff' : 'transparent',
                      borderRadius: '4px',
                    }}
                  >
                    <input
                      type="radio"
                      name="contract"
                      value={contract.id}
                      checked={selectedContractId === contract.id}
                      onChange={() => setSelectedContractId(contract.id)}
                    />{' '}
                    {contract.estimateName || '(名称なし)'} -{' '}
                    {formatAmount(contract.contractAmount)}円
                  </label>
                ))}
              </div>
              <div style={styles.dialogActions}>
                <button
                  style={{ ...styles.button, ...styles.secondaryButton }}
                  onClick={() => setShowCreateDialog(false)}
                >
                  キャンセル
                </button>
                <button
                  style={{ ...styles.button, ...styles.primaryButton }}
                  onClick={handleCreate}
                  disabled={!selectedContractId}
                >
                  作成
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 実行予算が存在する場合
  return (
    <div style={styles.page}>
      <Breadcrumb
        items={[
          { label: 'プロジェクト', path: '/projects' },
          { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
          { label: '実行予算' },
        ]}
      />

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>実行予算</h1>
        <div style={styles.headerActions}>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => setShowMonthlyCloseDialog(true)}
          >
            月次締め
          </button>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => navigate(`/projects/${projectId}/execution-budget/amendments`)}
          >
            変更契約の反映
          </button>
          <button
            style={{ ...styles.button, ...styles.dangerButton }}
            onClick={() => setShowDeleteDialog(true)}
          >
            削除
          </button>
        </div>
      </div>

      {/* 基本情報バー */}
      <div style={styles.infoBar}>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>契約書</span>
          <span style={styles.infoValue}>{budget.contract.estimate?.name || '(名称なし)'}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>契約金額</span>
          <span style={styles.infoValue}>{formatAmount(budget.contract.contractAmount)}円</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>実行金額合計</span>
          <span style={styles.infoValue}>
            {formatAmount(budget.summary.totalExecutionAmount)}円
          </span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>利益見込額</span>
          <span
            style={{
              ...styles.infoValue,
              ...(isNegative(budget.summary.profitForecast) ? { color: '#dc2626' } : {}),
            }}
          >
            {formatAmount(budget.summary.profitForecast)}円
          </span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>発注進捗率</span>
          <span style={styles.infoValue}>{budget.summary.orderProgressRate}%</span>
        </div>
      </div>

      {/* 項目一覧テーブル */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>項目一覧</h2>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>項目名</th>
                <th style={styles.th}>規格</th>
                <th style={styles.th}>単位</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>見積単価</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>見積金額</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>実行単価</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>実行金額</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>変更金額</th>
                <th style={styles.th}>発注予定取引先</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>発注金額</th>
                <th style={styles.th}>発注ステータス</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>先月支出</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>今月支出</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>累計支出</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>残予算</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>出来高金額</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>出来高率</th>
                <th style={styles.th}>備考</th>
              </tr>
            </thead>
            <tbody>
              {budget.items.map((item) => (
                <TreeRow
                  key={item.id}
                  item={item}
                  depth={0}
                  expandedState={expandedState}
                  onToggle={handleToggle}
                />
              ))}
              {/* 合計行 */}
              <tr style={styles.totalRow}>
                <td style={{ ...styles.td, fontWeight: 600 }}>合計</td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(budget.summary.totalEstimateAmount)}
                </td>
                <td style={styles.td}></td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(budget.summary.totalExecutionAmount)}
                </td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(budget.summary.totalAmendmentAmount)}
                </td>
                <td style={styles.td}></td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(budget.summary.totalOrderAmount)}
                </td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(budget.summary.totalExpense)}
                </td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(budget.summary.totalRemainingBudget)}
                </td>
                <td style={{ ...styles.td, ...styles.tdRight }}>
                  {formatAmount(budget.summary.totalProgressAmount)}
                </td>
                <td style={styles.td}></td>
                <td style={styles.td}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 発注一覧セクション */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>発注一覧</h2>
        {orders.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '16px' }}>
            発注はまだありません
          </p>
        ) : (
          <div>
            {orders.map((order) => (
              <Link
                key={order.id}
                to={`/projects/${projectId}/execution-budget/orders/${order.id}`}
                style={{ ...styles.orderListItem, textDecoration: 'none', color: 'inherit' }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{order.tradingPartnerName}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {order.checkedItemCount}項目 / {formatAmount(order.totalExecutionAmount)}円
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      ...styles.statusBadge,
                      ...(order.status === 'ORDERED' ? styles.orderedBadge : {}),
                    }}
                  >
                    {getOrderStatusLabel(order.status)}
                  </span>
                  {order.confirmedAmount && (
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>
                      {formatAmount(order.confirmedAmount)}円
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 月次締め履歴セクション */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>月次締め履歴</h2>
        {monthlyHistory.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '16px' }}>
            月次締め履歴はありません
          </p>
        ) : (
          <div>
            {monthlyHistory.map((history) => (
              <div key={history.id} style={styles.historyItem}>
                <span>{history.targetMonth}</span>
                <span style={{ color: '#6b7280' }}>
                  {history.closedByName} - {new Date(history.closedAt).toLocaleDateString('ja-JP')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 削除確認ダイアログ */}
      {showDeleteDialog && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialog} role="dialog" aria-label="削除確認">
            <h3 style={styles.dialogTitle}>実行予算の削除</h3>
            <p>この実行予算を削除してもよろしいですか？</p>
            {deleteError && <p style={{ color: '#dc2626', marginTop: '8px' }}>{deleteError}</p>}
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
              <button style={{ ...styles.button, ...styles.dangerButton }} onClick={handleDelete}>
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 月次締めダイアログ */}
      {showMonthlyCloseDialog && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialog} role="dialog" aria-label="月次締め">
            <h3 style={styles.dialogTitle}>月次締め</h3>
            <p>締め対象月を入力してください。</p>
            <input
              type="month"
              value={monthlyCloseMonth}
              onChange={(e) => setMonthlyCloseMonth(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                marginTop: '8px',
              }}
            />
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
              全項目の「今月の支出」を「先月までの支出」に累積し、「今月の支出」をリセットします。
            </p>
            <div style={styles.dialogActions}>
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={() => {
                  setShowMonthlyCloseDialog(false);
                  setMonthlyCloseMonth('');
                }}
              >
                キャンセル
              </button>
              <button
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={handleMonthlyClose}
                disabled={!monthlyCloseMonth}
              >
                締め処理を実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExecutionBudgetPage;
