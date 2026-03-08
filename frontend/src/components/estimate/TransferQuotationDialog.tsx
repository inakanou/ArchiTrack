/**
 * @fileoverview TransferQuotationDialog - 受領見積書転記ダイアログ
 *
 * Task 11.4: 受領見積書転記ダイアログの実装
 *
 * Requirements (estimate-creation):
 * - REQ-4.1: 見積項目行を指定して受領見積書の行を選択した場合、業者金額行に転記する
 * - REQ-4.2: 見積項目行を指定せずに受領見積書の行を選択した場合、新規見積項目行を作成
 * - REQ-4.3: 名称・規格・単位・数量・単価を転記対象とする
 * - REQ-4.4: 複数の受領見積書を順次転記した場合、別の見積項目行として反映する
 * - REQ-4.5: 見積依頼機能で登録された受領見積書のみを転記元として選択可能とする
 *
 * @module components/estimate/TransferQuotationDialog
 */

import { useState, useEffect, useCallback } from 'react';
import { getReceivedQuotationsByProject } from '../../api/received-quotations';
import { transferFromQuotation } from '../../api/estimates';
import type { ReceivedQuotationInfo } from '../../api/received-quotations';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';

// ============================================================================
// 型定義
// ============================================================================

export interface TransferQuotationDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** 見積書ID */
  estimateId: string;
  /** プロジェクトID */
  projectId: string;
  /** 見積項目一覧（転記先選択用） */
  estimateItems: EstimateItemHierarchyEdit[];
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** 転記完了コールバック */
  onTransferComplete: () => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '800px',
    width: '95%',
    maxHeight: '90vh',
    overflow: 'auto',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '24px',
  } as React.CSSProperties,
  section: {
    marginBottom: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  lineItemsContainer: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    maxHeight: '300px',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  lineItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  lineItemLast: {
    borderBottom: 'none',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  } as React.CSSProperties,
  lineItemInfo: {
    flex: 1,
  } as React.CSSProperties,
  lineItemName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  lineItemMeta: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px',
  } as React.CSSProperties,
  lineItemAmount: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '12px',
  } as React.CSSProperties,
  emptyText: {
    textAlign: 'center' as const,
    color: '#6b7280',
    padding: '24px',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 金額をフォーマット
 */
function formatAmount(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '-';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return '-';
  return num.toLocaleString('ja-JP') + '円';
}

/**
 * フラット化した見積項目リストを取得（転記先選択用）
 */
function flattenEstimateItems(
  items: EstimateItemHierarchyEdit[],
  level: number = 0
): Array<{ id: string; name: string; level: number }> {
  const result: Array<{ id: string; name: string; level: number }> = [];
  for (const item of items) {
    const estimateLine = item.lines.find((l) => l.lineType === 'ESTIMATE');
    result.push({
      id: item.id,
      name: estimateLine?.name || '(名称なし)',
      level,
    });
    if (item.children.length > 0) {
      result.push(...flattenEstimateItems(item.children, level + 1));
    }
  }
  return result;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 受領見積書転記ダイアログ
 */
export function TransferQuotationDialog({
  isOpen,
  estimateId,
  projectId,
  estimateItems,
  onClose,
  onTransferComplete,
}: TransferQuotationDialogProps) {
  // 状態
  const [quotations, setQuotations] = useState<ReceivedQuotationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<string[]>([]);
  const [targetEstimateItemId, setTargetEstimateItemId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 受領見積書一覧を取得
   * Requirements: REQ-4.5
   */
  useEffect(() => {
    async function fetchQuotations() {
      if (!isOpen) return;

      setIsLoading(true);
      try {
        const data = await getReceivedQuotationsByProject(projectId);
        setQuotations(data);
      } catch {
        // エラー処理
      } finally {
        setIsLoading(false);
      }
    }

    fetchQuotations();
  }, [isOpen, projectId]);

  /**
   * 受領見積書選択時のハンドラ
   * REQ-35.3: 選択された受領見積書の全明細行IDをデフォルトで全選択
   */
  const handleQuotationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const quotationId = e.target.value;
      setSelectedQuotationId(quotationId);
      if (quotationId) {
        const quotation = quotations.find((q) => q.id === quotationId);
        if (quotation) {
          setSelectedLineItemIds(quotation.lineItems.map((li) => li.id));
        }
      } else {
        setSelectedLineItemIds([]);
      }
    },
    [quotations]
  );

  /**
   * 明細行選択時のハンドラ
   * Requirements: REQ-4.3, REQ-4.4
   */
  const handleLineItemToggle = useCallback((lineItemId: string) => {
    setSelectedLineItemIds((prev) =>
      prev.includes(lineItemId) ? prev.filter((id) => id !== lineItemId) : [...prev, lineItemId]
    );
  }, []);

  /**
   * 転記先変更時のハンドラ
   */
  const handleTargetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetEstimateItemId(e.target.value);
  }, []);

  /**
   * 転記実行
   * Requirements: REQ-4.1, REQ-4.2
   */
  const handleSubmit = useCallback(async () => {
    if (!selectedQuotationId || selectedLineItemIds.length === 0) return;

    setIsSubmitting(true);
    try {
      await transferFromQuotation(estimateId, {
        receivedQuotationId: selectedQuotationId,
        lineItemIds: selectedLineItemIds,
        targetEstimateItemId: targetEstimateItemId || undefined,
      });
      onTransferComplete();
      onClose();
    } catch {
      // エラー処理
    } finally {
      setIsSubmitting(false);
    }
  }, [
    estimateId,
    selectedQuotationId,
    selectedLineItemIds,
    targetEstimateItemId,
    onTransferComplete,
    onClose,
  ]);

  if (!isOpen) return null;

  const selectedQuotation = quotations.find((q) => q.id === selectedQuotationId);
  const flattenedItems = flattenEstimateItems(estimateItems);
  const isFormValid = selectedQuotationId && selectedLineItemIds.length > 0;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-dialog-title"
    >
      <div style={styles.dialog}>
        <h2 id="transfer-dialog-title" style={styles.title}>
          受領見積書から転記
        </h2>

        {isLoading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner} />
            <p>読み込み中...</p>
            <style>
              {`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}
            </style>
          </div>
        ) : (
          <>
            {/* 受領見積書選択 */}
            <div style={styles.section}>
              <label htmlFor="quotation-select" style={styles.sectionTitle}>
                受領見積書を選択
              </label>
              <select
                id="quotation-select"
                value={selectedQuotationId}
                onChange={handleQuotationChange}
                style={styles.select}
                disabled={isSubmitting}
              >
                <option value="">選択してください</option>
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.tradingPartnerName || q.name} - {formatAmount(q.totalAmount)}
                  </option>
                ))}
              </select>
            </div>

            {/* 明細行選択 */}
            {selectedQuotation && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>転記する明細行を選択</div>
                {selectedQuotation.lineItems.length === 0 ? (
                  <p style={styles.emptyText}>明細行がありません</p>
                ) : (
                  <div style={styles.lineItemsContainer}>
                    {selectedQuotation.lineItems.map((item, index) => (
                      <div
                        key={item.id}
                        style={{
                          ...styles.lineItem,
                          ...(index === selectedQuotation.lineItems.length - 1
                            ? styles.lineItemLast
                            : {}),
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedLineItemIds.includes(item.id)}
                          onChange={() => handleLineItemToggle(item.id)}
                          style={styles.checkbox}
                          data-testid={`line-checkbox-${item.id}`}
                          disabled={isSubmitting}
                        />
                        <div style={styles.lineItemInfo}>
                          <div style={styles.lineItemName}>{item.name || '(名称なし)'}</div>
                          <div style={styles.lineItemMeta}>
                            {item.specification && `${item.specification} / `}
                            {item.unit && `${item.unit} / `}
                            {item.quantity && `数量: ${item.quantity}`}
                          </div>
                        </div>
                        <div style={styles.lineItemAmount}>{formatAmount(item.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 転記先選択 */}
            <div style={styles.section}>
              <label htmlFor="target-select" style={styles.sectionTitle}>
                転記先見積項目
              </label>
              <select
                id="target-select"
                value={targetEstimateItemId}
                onChange={handleTargetChange}
                style={styles.select}
                disabled={isSubmitting}
              >
                <option value="">新規項目として作成</option>
                {flattenedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {'  '.repeat(item.level)}
                    {item.name} の子項目として作成
                  </option>
                ))}
              </select>
            </div>

            {/* ボタン */}
            <div style={styles.buttonGroup}>
              <button
                type="button"
                onClick={onClose}
                style={styles.cancelButton}
                disabled={isSubmitting}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
                style={{
                  ...styles.submitButton,
                  ...(!isFormValid || isSubmitting ? styles.submitButtonDisabled : {}),
                }}
              >
                {isSubmitting ? '転記中...' : '転記'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TransferQuotationDialog;
