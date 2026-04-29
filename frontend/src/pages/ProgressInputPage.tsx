/**
 * @fileoverview 出来高入力ページ
 *
 * Task 10.1: 出来高入力UI実装
 * Task 10.2: 出来高履歴管理UI実装
 * Task 10.3: 月別出来高集計UI実装
 *
 * Requirements:
 * - REQ-11.1-11.11: 出来高入力機能
 * - REQ-12.3-12.6: 出来高の履歴管理
 * - REQ-16.1-16.5: 月別出来高集計
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  getExecutionBudget,
  type ExecutionBudgetWithItems,
  type ExecutionBudgetItem,
} from '../api/execution-budget';
import {
  saveProgress,
  getProgressHistory,
  getProgressByDate,
  deleteProgress,
  getMonthlyProgress,
  getMonthlyProgressDetail,
  exportMonthlyProgress,
  type ProgressRecordSummary,
  type MonthlyProgressSummary,
  type MonthlyProgressDetailItem,
} from '../api/progress';
import { Breadcrumb } from '../components/common';
import { useToast } from '../hooks/useToast';

// ============================================================================
// 型定義
// ============================================================================

/** 各項目の出来高入力状態 */
interface ProgressItemState {
  itemId: string;
  amount: number;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 金額を3桁区切りカンマ付き整数形式でフォーマットする
 * REQ-18.2
 */
function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseInt(value, 10) : Math.round(value);
  if (isNaN(num)) return '';
  return num.toLocaleString('ja-JP');
}

/**
 * 出来高率を計算する（小数点以下1桁）
 * REQ-11.10, 18.4
 */
function calcProgressRate(progressAmount: number, executionAmount: number): string {
  if (!executionAmount || executionAmount === 0) return '0.0';
  return ((progressAmount / executionAmount) * 100).toFixed(1);
}

/**
 * ツリー構造からリーフ項目（子を持たない項目）を取得
 */
function getLeafItems(items: ExecutionBudgetItem[]): ExecutionBudgetItem[] {
  const result: ExecutionBudgetItem[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      result.push(...getLeafItems(item.children));
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * 実行金額合計を算出（リーフ項目のみ）
 */
function getTotalExecutionAmount(items: ExecutionBudgetItem[]): number {
  return getLeafItems(items).reduce((sum, item) => {
    return sum + (item.executionAmount ? parseInt(item.executionAmount, 10) : 0);
  }, 0);
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
  section: {
    marginBottom: '32px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
  formGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
    fontSize: '14px',
  } as React.CSSProperties,
  dateInput: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  } as React.CSSProperties,
  th: {
    padding: '8px 12px',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: '#374151',
  } as React.CSSProperties,
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  tdRight: {
    padding: '8px 12px',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'right' as const,
  } as React.CSSProperties,
  amountInput: {
    width: '120px',
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    textAlign: 'right' as const,
    fontSize: '14px',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  quickButton: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    border: '1px solid #d1d5db',
    cursor: 'pointer',
    backgroundColor: '#f9fafb',
    color: '#374151',
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
  totalRow: {
    fontWeight: 'bold' as const,
    backgroundColor: '#f0fdf4',
  } as React.CSSProperties,
  historyRow: {
    cursor: 'pointer',
  } as React.CSSProperties,
  monthlyRow: {
    cursor: 'pointer',
  } as React.CSSProperties,
  dialog: {
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
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '12px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '16px',
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  exportButtonGroup: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  } as React.CSSProperties,
  detailTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
    marginTop: '16px',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

export default function ProgressInputPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { success: showSuccess, error: showError } = useToast();

  // Ref for stable toast function references (prevents useEffect re-triggering)
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const showSuccessRef = useRef(showSuccess);
  showSuccessRef.current = showSuccess;

  // 状態
  const [budget, setBudget] = useState<ExecutionBudgetWithItems | null>(null);
  const [loading, setLoading] = useState(true);

  // 出来高入力状態
  const [constructionDate, setConstructionDate] = useState<string>(
    new Date().toISOString().split('T')[0]!
  );
  const [progressItems, setProgressItems] = useState<ProgressItemState[]>([]);
  const [saving, setSaving] = useState(false);

  // 出来高履歴
  const [history, setHistory] = useState<ProgressRecordSummary[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // 月別出来高集計
  const [monthlySummary, setMonthlySummary] = useState<MonthlyProgressSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthlyDetail, setMonthlyDetail] = useState<MonthlyProgressDetailItem[]>([]);

  // リーフ項目
  const leafItems = useMemo(() => {
    if (!budget) return [];
    return getLeafItems(budget.items);
  }, [budget]);

  // 全体の実行金額合計
  const totalExecutionAmount = useMemo(() => {
    if (!budget) return 0;
    return getTotalExecutionAmount(budget.items);
  }, [budget]);

  // 合計出来高金額
  const totalProgressAmount = useMemo(() => {
    return progressItems.reduce((sum, item) => sum + item.amount, 0);
  }, [progressItems]);

  // 合計出来高率
  const totalProgressRate = useMemo(() => {
    if (totalExecutionAmount === 0) return '0.0';
    return ((totalProgressAmount / totalExecutionAmount) * 100).toFixed(1);
  }, [totalProgressAmount, totalExecutionAmount]);

  // パンくずリスト
  const breadcrumbItems = useMemo(
    () => [
      { label: 'プロジェクト一覧', href: '/projects' },
      { label: 'プロジェクト詳細', href: `/projects/${projectId}` },
      { label: '実行予算', href: `/projects/${projectId}/execution-budget` },
      { label: '出来高入力' },
    ],
    [projectId]
  );

  // データ読み込み
  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [budgetData, historyData, monthlyData] = await Promise.all([
        getExecutionBudget(projectId),
        getProgressHistory(projectId),
        getMonthlyProgress(projectId),
      ]);
      setBudget(budgetData);
      setHistory(historyData);
      setMonthlySummary(monthlyData);

      // リーフ項目の出来高入力初期化
      if (budgetData) {
        const leaves = getLeafItems(budgetData.items);
        setProgressItems(
          leaves.map((item) => ({
            itemId: item.id,
            amount: 0,
          }))
        );
      }
    } catch {
      showErrorRef.current('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 出来高金額を更新する
  const updateAmount = useCallback((itemId: string, newAmount: number) => {
    // REQ-11.8: 0円未満にならないようバリデーション
    const clampedAmount = Math.max(0, Math.round(newAmount));
    setProgressItems((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, amount: clampedAmount } : item))
    );
  }, []);

  // 即0%ボタン (REQ-11.3)
  const handleSetZero = useCallback(
    (itemId: string) => {
      updateAmount(itemId, 0);
    },
    [updateAmount]
  );

  // 即50%ボタン (REQ-11.4)
  const handleSetFifty = useCallback(
    (itemId: string, executionAmount: number) => {
      updateAmount(itemId, Math.round(executionAmount * 0.5));
    },
    [updateAmount]
  );

  // 即100%ボタン (REQ-11.5)
  const handleSetHundred = useCallback(
    (itemId: string, executionAmount: number) => {
      updateAmount(itemId, executionAmount);
    },
    [updateAmount]
  );

  // +5%ボタン (REQ-11.6)
  const handlePlusFive = useCallback(
    (itemId: string, executionAmount: number) => {
      const current = progressItems.find((p) => p.itemId === itemId)?.amount ?? 0;
      updateAmount(itemId, current + Math.round(executionAmount * 0.05));
    },
    [progressItems, updateAmount]
  );

  // -5%ボタン (REQ-11.7)
  const handleMinusFive = useCallback(
    (itemId: string, executionAmount: number) => {
      const current = progressItems.find((p) => p.itemId === itemId)?.amount ?? 0;
      updateAmount(itemId, current - Math.round(executionAmount * 0.05));
    },
    [progressItems, updateAmount]
  );

  // 直接入力 (REQ-11.9)
  const handleDirectInput = useCallback(
    (itemId: string, value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        updateAmount(itemId, 0);
      } else {
        updateAmount(itemId, num);
      }
    },
    [updateAmount]
  );

  // 保存 (REQ-11.1, 12.1)
  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveProgress(projectId, {
        constructionDate,
        items: progressItems.map((item) => ({
          itemId: item.itemId,
          amount: String(item.amount),
        })),
      });
      showSuccessRef.current('出来高を保存しました');
      // 履歴を再読み込み
      const [historyData, monthlyData] = await Promise.all([
        getProgressHistory(projectId),
        getMonthlyProgress(projectId),
      ]);
      setHistory(historyData);
      setMonthlySummary(monthlyData);
    } catch {
      showErrorRef.current('出来高の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [projectId, constructionDate, progressItems]);

  // 履歴レコード選択 (REQ-12.4)
  const handleSelectHistory = useCallback(
    async (record: ProgressRecordSummary) => {
      if (!projectId) return;
      try {
        const data = await getProgressByDate(projectId, record.constructionDate);
        // backend の ISO 8601 datetime 文字列 ("2024-06-15T00:00:00.000Z") を
        // <input type="date"> 用の YYYY-MM-DD 形式に変換する
        setConstructionDate(record.constructionDate.substring(0, 10));
        // 既存の出来高データを入力欄に読み込み
        setProgressItems((prev) =>
          prev.map((item) => {
            const recordItem = data.items.find((ri) => ri.executionBudgetItemId === item.itemId);
            return {
              ...item,
              amount: recordItem ? parseInt(recordItem.amount, 10) : 0,
            };
          })
        );
      } catch {
        showErrorRef.current('出来高データの読み込みに失敗しました');
      }
    },
    [projectId]
  );

  // 削除確認 (REQ-12.5)
  const handleDeleteClick = useCallback((recordId: string) => {
    setDeleteTargetId(recordId);
  }, []);

  // 削除実行 (REQ-12.6)
  const handleDeleteConfirm = useCallback(async () => {
    if (!projectId || !deleteTargetId) return;
    try {
      await deleteProgress(projectId, deleteTargetId);
      showSuccessRef.current('出来高レコードを削除しました');
      setDeleteTargetId(null);
      // 履歴を再読み込み
      const [historyData, monthlyData] = await Promise.all([
        getProgressHistory(projectId),
        getMonthlyProgress(projectId),
      ]);
      setHistory(historyData);
      setMonthlySummary(monthlyData);
    } catch {
      showErrorRef.current('出来高レコードの削除に失敗しました');
    }
  }, [projectId, deleteTargetId]);

  // 月選択 (REQ-16.3)
  const handleSelectMonth = useCallback(
    async (yearMonth: string) => {
      if (!projectId) return;
      setSelectedMonth(yearMonth);
      try {
        const detail = await getMonthlyProgressDetail(projectId, yearMonth);
        setMonthlyDetail(detail);
      } catch {
        showErrorRef.current('月別明細の取得に失敗しました');
      }
    },
    [projectId]
  );

  // Excelエクスポート (REQ-16.4)
  const handleExportExcel = useCallback(async () => {
    if (!projectId) return;
    try {
      const blob = await exportMonthlyProgress(projectId, 'xlsx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `出来高集計.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showErrorRef.current('Excelエクスポートに失敗しました');
    }
  }, [projectId]);

  // PDFエクスポート (REQ-16.5)
  const handleExportPdf = useCallback(async () => {
    if (!projectId) return;
    try {
      const blob = await exportMonthlyProgress(projectId, 'pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `出来高集計.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showErrorRef.current('PDFエクスポートに失敗しました');
    }
  }, [projectId]);

  // ローディング
  if (loading) {
    return (
      <div style={styles.page}>
        <p>読み込み中...</p>
      </div>
    );
  }

  // 実行予算が存在しない
  if (!budget) {
    return (
      <div style={styles.page}>
        <Breadcrumb items={breadcrumbItems} />
        <p>実行予算が見つかりません</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <Breadcrumb items={breadcrumbItems} />

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>出来高入力</h1>
        <div style={styles.headerActions}>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={handleSave}
            disabled={saving}
          >
            保存
          </button>
        </div>
      </div>

      {/* ============================================== */}
      {/* Task 10.1: 出来高入力セクション */}
      {/* ============================================== */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>出来高入力</h2>

        {/* 施工日入力 REQ-11.2 */}
        <div style={styles.formGroup}>
          <label htmlFor="construction-date" style={styles.label}>
            施工日
          </label>
          <input
            id="construction-date"
            type="date"
            value={constructionDate}
            onChange={(e) => setConstructionDate(e.target.value)}
            style={styles.dateInput}
          />
        </div>

        {/* 出来高入力テーブル */}
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>項目名</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>実行金額</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>操作</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>出来高金額</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>出来高率</th>
            </tr>
          </thead>
          <tbody>
            {leafItems.map((item) => {
              const executionAmount = item.executionAmount ? parseInt(item.executionAmount, 10) : 0;
              const progressItem = progressItems.find((p) => p.itemId === item.id);
              const amount = progressItem?.amount ?? 0;
              const rate = calcProgressRate(amount, executionAmount);

              return (
                <tr key={item.id}>
                  <td style={styles.td}>{item.name}</td>
                  <td style={styles.tdRight}>{formatAmount(item.executionAmount)}</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <div style={styles.buttonGroup}>
                      <button style={styles.quickButton} onClick={() => handleSetZero(item.id)}>
                        0%
                      </button>
                      <button
                        style={styles.quickButton}
                        onClick={() => handleSetFifty(item.id, executionAmount)}
                      >
                        50%
                      </button>
                      <button
                        style={styles.quickButton}
                        onClick={() => handleSetHundred(item.id, executionAmount)}
                      >
                        100%
                      </button>
                      <button
                        style={styles.quickButton}
                        onClick={() => handleMinusFive(item.id, executionAmount)}
                      >
                        -5%
                      </button>
                      <button
                        style={styles.quickButton}
                        onClick={() => handlePlusFive(item.id, executionAmount)}
                      >
                        +5%
                      </button>
                    </div>
                  </td>
                  <td style={styles.tdRight}>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => handleDirectInput(item.id, e.target.value)}
                      style={styles.amountInput}
                      min={0}
                    />
                  </td>
                  <td style={styles.tdRight}>{rate}%</td>
                </tr>
              );
            })}

            {/* 合計行 */}
            <tr style={styles.totalRow}>
              <td style={styles.td}>合計</td>
              <td style={styles.tdRight}>{formatAmount(totalExecutionAmount)}</td>
              <td style={styles.td}></td>
              <td style={styles.tdRight} data-testid="total-amount">
                {formatAmount(totalProgressAmount)}
              </td>
              <td style={styles.tdRight} data-testid="total-rate">
                {totalProgressRate}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ============================================== */}
      {/* Task 10.2: 出来高履歴セクション */}
      {/* ============================================== */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>出来高履歴</h2>

        {history.length === 0 ? (
          <p>出来高履歴がありません</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>施工日</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>合計出来高金額</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>合計出来高率</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr
                  key={record.id}
                  data-testid={`history-row-${record.id}`}
                  style={styles.historyRow}
                  onClick={() => handleSelectHistory(record)}
                >
                  <td style={styles.td}>{record.constructionDate}</td>
                  <td style={styles.tdRight}>{formatAmount(record.totalAmount)}</td>
                  <td style={styles.tdRight}>{record.totalRate}%</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <button
                      style={{
                        ...styles.button,
                        ...styles.dangerButton,
                        padding: '4px 12px',
                        fontSize: '12px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(record.id);
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ============================================== */}
      {/* Task 10.3: 月別出来高集計セクション */}
      {/* ============================================== */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>月別出来高集計</h2>

        {/* エクスポートボタン REQ-16.4, 16.5 */}
        <div style={styles.exportButtonGroup}>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={handleExportExcel}
          >
            Excel
          </button>
          <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={handleExportPdf}>
            PDF
          </button>
        </div>

        {monthlySummary.length === 0 ? (
          <p>月別出来高データがありません</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>対象月</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>当月出来高金額</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>累計出来高金額</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>累計出来高率</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.map((monthly) => (
                <tr
                  key={monthly.yearMonth}
                  data-testid={`monthly-row-${monthly.yearMonth}`}
                  style={styles.monthlyRow}
                  onClick={() => handleSelectMonth(monthly.yearMonth)}
                >
                  <td style={styles.td}>{monthly.yearMonth}</td>
                  <td style={styles.tdRight}>{formatAmount(monthly.monthlyAmount)}</td>
                  <td style={styles.tdRight}>{formatAmount(monthly.cumulativeAmount)}</td>
                  <td style={styles.tdRight}>{monthly.cumulativeRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 月別明細 REQ-16.3 */}
        {selectedMonth && monthlyDetail.length > 0 && (
          <div>
            <h3 style={{ ...styles.sectionTitle, marginTop: '16px', fontSize: '16px' }}>
              {selectedMonth} 項目別出来高明細
            </h3>
            <table style={styles.detailTable}>
              <thead>
                <tr>
                  <th style={styles.th}>項目名</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>実行金額</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>出来高金額</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>出来高率</th>
                </tr>
              </thead>
              <tbody>
                {monthlyDetail.map((detail) => (
                  <tr key={detail.executionBudgetItemId}>
                    <td style={styles.td}>{detail.itemName}</td>
                    <td style={styles.tdRight}>{formatAmount(detail.executionAmount)}</td>
                    <td style={styles.tdRight}>{formatAmount(detail.progressAmount)}</td>
                    <td style={styles.tdRight}>{detail.progressRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 削除確認ダイアログ REQ-12.5 */}
      {deleteTargetId && (
        <div style={styles.dialog}>
          <div style={styles.dialogContent}>
            <h3 style={styles.dialogTitle}>出来高レコードを削除しますか？</h3>
            <p>この操作は取り消せません。</p>
            <div style={styles.dialogActions}>
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={() => setDeleteTargetId(null)}
              >
                キャンセル
              </button>
              <button
                style={{ ...styles.button, ...styles.dangerButton }}
                onClick={handleDeleteConfirm}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
