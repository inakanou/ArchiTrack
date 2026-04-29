/**
 * @fileoverview 変更契約反映ページ
 *
 * 同一プロジェクト内の未反映変更契約一覧を表示し、選択した変更契約を実行予算に反映する。
 *
 * Requirements:
 * - REQ-15.1: 「変更契約の反映」ボタン押下時に未反映変更契約一覧を表示する
 * - REQ-15.2: 変更契約に紐づく見積書の項目差分（追加・変更）を表示する
 * - REQ-15.3: ユーザーが変更内容を確認して適用すると実行予算に反映する
 * - REQ-15.6: 変更前後の契約金額を並べて表示する
 *
 * @module pages/ExecutionBudgetAmendmentPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getExecutionBudget,
  getUnreflectedAmendments,
  getAmendmentDiff,
  applyAmendment,
  type ExecutionBudgetWithItems,
  type UnreflectedAmendment,
  type AmendmentDiff,
} from '../api/execution-budget';
import { ApiError } from '../api/client';
import { Breadcrumb } from '../components/common';

// ============================================================================
// ユーティリティ
// ============================================================================

/**
 * 金額を3桁区切りカンマ付き整数形式でフォーマットする
 * REQ-18.2 準拠
 */
function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('ja-JP');
}

/**
 * 数値の差分を計算（after - before）
 */
function calcDiff(before: string | null, after: string | null): number {
  const b = before ? parseInt(before, 10) || 0 : 0;
  const a = after ? parseInt(after, 10) || 0 : 0;
  return a - b;
}

// ============================================================================
// スタイル
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
  } as React.CSSProperties,
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#1f2937',
  } as React.CSSProperties,
  tdRight: {
    textAlign: 'right' as const,
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
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#6b7280',
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
    maxWidth: '900px',
    width: '95%',
    maxHeight: '90vh',
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
  comparisonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    marginBottom: '16px',
  } as React.CSSProperties,
  comparisonItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  comparisonLabel: {
    fontSize: '12px',
    color: '#6b7280',
  } as React.CSSProperties,
  comparisonValue: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
  } as React.CSSProperties,
  comparisonArrow: {
    fontSize: '20px',
    color: '#6b7280',
  } as React.CSSProperties,
  diffPositive: {
    color: '#059669',
  } as React.CSSProperties,
  diffNegative: {
    color: '#dc2626',
  } as React.CSSProperties,
  errorBanner: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    borderRadius: '6px',
    marginBottom: '16px',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

export function ExecutionBudgetAmendmentPage(): React.ReactElement {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [budget, setBudget] = useState<ExecutionBudgetWithItems | null>(null);
  const [amendments, setAmendments] = useState<UnreflectedAmendment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 詳細ダイアログ
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [diff, setDiff] = useState<AmendmentDiff | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // データ取得
  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [budgetData, amendmentsData] = await Promise.all([
        getExecutionBudget(projectId),
        getUnreflectedAmendments(projectId).catch(() => [] as UnreflectedAmendment[]),
      ]);
      setBudget(budgetData);
      setAmendments(amendmentsData);
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

  // 詳細ダイアログ表示
  const handleOpenDetail = useCallback(
    async (contractId: string) => {
      if (!projectId) return;
      setDialogError(null);
      setSelectedContractId(contractId);
      setDiff(null);
      try {
        const diffData = await getAmendmentDiff(projectId, contractId);
        setDiff(diffData);
      } catch (err) {
        if (err instanceof ApiError) {
          setDialogError(err.message);
        } else {
          setDialogError('差分の取得に失敗しました');
        }
      }
    },
    [projectId]
  );

  // 詳細ダイアログを閉じる
  const handleCloseDetail = useCallback(() => {
    setSelectedContractId(null);
    setDiff(null);
    setDialogError(null);
  }, []);

  // 反映実行
  const handleApply = useCallback(async () => {
    if (!projectId || !selectedContractId) return;
    setIsApplying(true);
    setDialogError(null);
    try {
      await applyAmendment(projectId, selectedContractId);
      handleCloseDetail();
      // 一覧を再取得（反映済み契約は除外される）
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setDialogError(err.message);
      } else {
        setDialogError('反映に失敗しました');
      }
    } finally {
      setIsApplying(false);
    }
  }, [projectId, selectedContractId, fetchData, handleCloseDetail]);

  if (isLoading) {
    return (
      <div style={styles.page}>
        <div data-testid="loading-skeleton">読み込み中...</div>
      </div>
    );
  }

  // 変更前契約金額（基契約金額）
  // budget.contract が API レスポンスに含まれない可能性があるため null 安全にアクセス
  const beforeContractAmount = budget?.contract?.contractAmount ?? null;

  return (
    <div style={styles.page}>
      <Breadcrumb
        items={[
          { label: 'プロジェクト', path: '/projects' },
          { label: 'プロジェクト詳細', path: `/projects/${projectId}` },
          { label: '実行予算', path: `/projects/${projectId}/execution-budget` },
          { label: '変更契約の反映' },
        ]}
      />

      <div style={styles.header}>
        <h1 style={styles.title}>変更契約の反映</h1>
        <button
          style={{ ...styles.button, ...styles.secondaryButton }}
          onClick={() => navigate(`/projects/${projectId}/execution-budget`)}
        >
          実行予算に戻る
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>未反映の変更契約一覧</h2>
        {amendments.length === 0 ? (
          <div style={styles.emptyState} data-testid="amendment-empty-state">
            未反映の変更契約はありません
          </div>
        ) : (
          <table style={styles.table} data-testid="unreflected-amendment-table">
            <thead>
              <tr>
                <th style={styles.th}>契約名</th>
                <th style={styles.th}>契約種類</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>契約金額</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {amendments.map((amendment) => (
                <tr key={amendment.id} data-testid={`amendment-row-${amendment.id}`}>
                  <td style={styles.td}>{amendment.estimateName ?? '(名称なし)'}</td>
                  <td style={styles.td}>変更契約</td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>
                    {formatAmount(amendment.contractAmount)}円
                  </td>
                  <td style={styles.td}>
                    <button
                      data-testid={`open-detail-${amendment.id}`}
                      style={{ ...styles.button, ...styles.primaryButton }}
                      onClick={() => handleOpenDetail(amendment.id)}
                    >
                      反映
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 詳細ダイアログ */}
      {selectedContractId && (
        <div style={styles.dialogOverlay}>
          <div style={styles.dialog} role="dialog" aria-label="変更契約反映の確認">
            <h3 style={styles.dialogTitle}>変更契約反映の確認</h3>

            {dialogError && <div style={styles.errorBanner}>{dialogError}</div>}

            {!diff ? (
              <div style={styles.emptyState}>差分を取得中...</div>
            ) : (
              <>
                {/* 変更前後の契約金額比較 (REQ-15.6) */}
                <div style={styles.comparisonRow} data-testid="contract-amount-comparison">
                  <div style={styles.comparisonItem}>
                    <span style={styles.comparisonLabel}>変更前 契約金額</span>
                    <span style={styles.comparisonValue} data-testid="before-contract-amount">
                      {formatAmount(beforeContractAmount)}円
                    </span>
                  </div>
                  <span style={styles.comparisonArrow}>→</span>
                  <div style={styles.comparisonItem}>
                    <span style={styles.comparisonLabel}>変更後 契約金額</span>
                    <span style={styles.comparisonValue} data-testid="after-contract-amount">
                      {formatAmount(diff.contractAmount)}円
                    </span>
                  </div>
                  <div style={styles.comparisonItem}>
                    <span style={styles.comparisonLabel}>差分</span>
                    {(() => {
                      const d = calcDiff(
                        beforeContractAmount !== null ? String(beforeContractAmount) : null,
                        diff.contractAmount
                      );
                      const diffStyle =
                        d > 0 ? styles.diffPositive : d < 0 ? styles.diffNegative : {};
                      return (
                        <span
                          data-testid="contract-amount-diff"
                          style={{ ...styles.comparisonValue, ...diffStyle }}
                        >
                          {d > 0 ? '+' : ''}
                          {formatAmount(String(d))}円
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* 追加項目 */}
                <h4 style={{ ...styles.sectionTitle, fontSize: '14px', marginTop: '16px' }}>
                  追加される項目（{diff.addedItems.length}件）
                </h4>
                {diff.addedItems.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '13px' }}>追加される項目はありません</p>
                ) : (
                  <table style={styles.table} data-testid="added-items-table">
                    <thead>
                      <tr>
                        <th style={styles.th}>項目名</th>
                        <th style={styles.th}>規格</th>
                        <th style={styles.th}>単位</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>実行金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.addedItems.map((item) => (
                        <tr key={item.estimateItemId}>
                          <td style={styles.td}>{item.name ?? ''}</td>
                          <td style={styles.td}>{item.specification ?? ''}</td>
                          <td style={styles.td}>{item.unit ?? ''}</td>
                          <td style={{ ...styles.td, ...styles.tdRight }}>{item.quantity ?? ''}</td>
                          <td style={{ ...styles.td, ...styles.tdRight }}>
                            {formatAmount(item.executionAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 変更項目 */}
                <h4 style={{ ...styles.sectionTitle, fontSize: '14px', marginTop: '16px' }}>
                  変更される項目（{diff.modifiedItems.length}件）
                </h4>
                {diff.modifiedItems.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '13px' }}>変更される項目はありません</p>
                ) : (
                  <table style={styles.table} data-testid="modified-items-table">
                    <thead>
                      <tr>
                        <th style={styles.th}>項目名</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>変更前 数量</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>変更後 数量</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>変更前 金額</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>変更後 金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.modifiedItems.map((item) => (
                        <tr key={item.budgetItemId}>
                          <td style={styles.td}>{item.name ?? ''}</td>
                          <td style={{ ...styles.td, ...styles.tdRight }}>
                            {item.oldQuantity ?? ''}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdRight }}>
                            {item.newQuantity ?? ''}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdRight }}>
                            {formatAmount(item.oldExecutionAmount)}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdRight }}>
                            {formatAmount(item.newExecutionAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            <div style={styles.dialogActions}>
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={handleCloseDetail}
                disabled={isApplying}
              >
                キャンセル
              </button>
              <button
                data-testid="apply-amendment-confirm"
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={handleApply}
                disabled={!diff || isApplying}
              >
                {isApplying ? '反映中...' : '実行予算に反映'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExecutionBudgetAmendmentPage;
