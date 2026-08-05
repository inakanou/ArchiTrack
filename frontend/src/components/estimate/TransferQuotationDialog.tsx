/**
 * @fileoverview TransferQuotationDialog - 受領見積書転記ダイアログ
 *
 * Task 55.5: 受領見積書転記ダイアログの入力元を編集中の明細へ変更
 *
 * 転記先の選択肢は**編集中の明細ツリー**（未保存の追加・編集を含む）から構成し、
 * 識別には項目キー（`NodeKey` = サーバーの項目ID または未保存行の一時識別子 `tmp-*`）を
 * 用いる。転記は `onApply` で編集状態への遷移（`estimateEditReducer` の
 * `applyQuotationTransfer`）へ渡し、サーバーへの書き込みは行わない（49.3）。
 * 受領見積書の一覧と明細の取得は従来どおりサーバーから行う（17.1, 17.2）。
 *
 * Requirements (estimate-creation):
 * - 4.1, 4.2: 転記先の指定有無で、既存項目の子として作るか新規項目として作るかを切り替える
 * - 4.3: 名称・規格・単位・数量・単価を転記対象とする
 * - 4.4: 選択した明細行はそれぞれ別の見積項目行の業者金額行として反映する
 * - 4.5: 見積依頼機能で登録された受領見積書のみを転記元として選択可能とする
 * - 4.6, 49.1, 49.3: 転記結果を未保存の変更として反映し、サーバーへ書き込まない
 * - 17.1, 17.2: プロジェクトに紐付く受領見積書一覧をドロップダウンリストに表示する
 * - 30.1, 30.2, 30.3: 「新規項目として作成」と「＜既存項目名＞の子項目として作成」を提供する
 * - 30.4: 未保存の新規項目も転記先の選択肢に含める
 * - 35.1, 35.2: 受領見積書の選択肢を「業者名 - 金額」形式で表示する
 * - 35.3: 転記する明細行をデフォルトですべてチェック済みにする
 * - 41.3: 子を持てない値引き行・注記行は転記先の選択肢に出さない
 *
 * Design: design.md `#### TransferQuotationDialog変更`（30.1〜30.3）
 *
 * @module components/estimate/TransferQuotationDialog
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getReceivedQuotationsByProject } from '../../api/received-quotations';
import type { LineItemInfo, ReceivedQuotationInfo } from '../../api/received-quotations';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import type {
  EstimateEditItemType,
  NodeKey,
  QuotationTransferLine,
  QuotationTransferPayload,
} from '../../domain/estimate/estimateEditReducer.types';

// ============================================================================
// 型定義
// ============================================================================

export interface TransferQuotationDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** プロジェクトID */
  projectId: string;
  /** 編集中の明細ツリー（未保存の追加・編集を含む / 30.4, 49.7） */
  items: EstimateItemHierarchyEdit[];
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** 転記結果を編集状態へ反映する（4.6, 49.1, 49.3） */
  onApply: (payload: QuotationTransferPayload) => void;
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

/** 転記先の選択肢 */
interface TransferTargetOption {
  /** 項目キー。未保存の新規項目は一時識別子（`tmp-*`）が入る（30.4） */
  readonly key: NodeKey;
  readonly name: string;
  readonly level: number;
}

/**
 * 転記項目の親になれる項目種別か（41.3）
 *
 * 値引き行・注記行は子を持てないため転記先にできない。適用側
 * （`estimateEditReducer` の `validateInsertParent`）と同じ判定を用いる。
 * ここが食い違うと、選べるのに転記が反映されない選択肢が生まれる。
 */
function canHostTransferredItem(itemType: EstimateEditItemType): boolean {
  return itemType !== 'DISCOUNT' && itemType !== 'NOTE';
}

/**
 * 編集中の明細ツリーから転記先の選択肢を組み立てる（30.2, 30.4）
 *
 * 階層の深さに上限を設けない（2.5）ため明示スタックで先行順に走査する。
 */
function collectTransferTargets(
  items: readonly EstimateItemHierarchyEdit[]
): TransferTargetOption[] {
  const result: TransferTargetOption[] = [];
  const stack: Array<{ item: EstimateItemHierarchyEdit; level: number }> = [...items]
    .reverse()
    .map((item) => ({ item, level: 0 }));

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) {
      break;
    }
    const { item, level } = entry;
    const itemType: EstimateEditItemType = item.itemType ?? 'STANDARD';

    if (canHostTransferredItem(itemType)) {
      const estimateLine = item.lines.find((line) => line.lineType === 'ESTIMATE');
      result.push({ key: item.id, name: estimateLine?.name || '(名称なし)', level });
    }

    for (let index = item.children.length - 1; index >= 0; index -= 1) {
      const child = item.children[index];
      if (child !== undefined) {
        stack.push({ item: child, level: level + 1 });
      }
    }
  }

  return result;
}

/**
 * 受領見積書の明細行を転記ペイロードの1行へ変換する（4.3）
 *
 * 転記対象は名称・規格・単位・数量・単価のみ。金額は転記せず、適用側が
 * 数量 × 単価 として導出する（22.9）。数値は10進数文字列で渡す。
 */
function toTransferLine(lineItem: LineItemInfo): QuotationTransferLine {
  return {
    name: lineItem.name ?? null,
    specification: lineItem.specification,
    unit: lineItem.unit,
    quantity: lineItem.quantity === null ? null : String(lineItem.quantity),
    unitPrice: lineItem.unitPrice === null ? null : String(lineItem.unitPrice),
  };
}

/** 業者金額行に記録する転記元の業者名（35.1 の表示と同じ解決） */
function vendorNameOf(quotation: ReceivedQuotationInfo): string {
  return quotation.tradingPartnerName || quotation.name;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 受領見積書転記ダイアログ
 */
export function TransferQuotationDialog({
  isOpen,
  projectId,
  items,
  onClose,
  onApply,
}: TransferQuotationDialogProps) {
  // 状態
  const [quotations, setQuotations] = useState<ReceivedQuotationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<string[]>([]);
  const [targetKey, setTargetKey] = useState('');

  /**
   * 受領見積書一覧を取得（サーバー参照は読み取りのみ / 4.5, 17.1, 17.2）
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
    setTargetKey(e.target.value);
  }, []);

  const selectedQuotation = quotations.find((q) => q.id === selectedQuotationId);
  const targetOptions = useMemo(() => collectTransferTargets(items), [items]);
  const isFormValid = selectedQuotation !== undefined && selectedLineItemIds.length > 0;

  /**
   * 転記実行（4.1, 4.2, 4.3, 4.4, 4.6, 30.3, 49.3）
   *
   * サーバーへは書き込まず、編集状態への反映として `onApply` へ渡す。
   * 明細行はチェックした順ではなく**受領見積書の並び順**で渡す（作られる
   * 見積項目の並びを転記元と一致させる）。
   */
  const handleSubmit = useCallback(() => {
    if (selectedQuotation === undefined || selectedLineItemIds.length === 0) {
      return;
    }
    const selected = new Set(selectedLineItemIds);
    onApply({
      parentKey: targetKey === '' ? null : targetKey,
      vendorName: vendorNameOf(selectedQuotation),
      lines: selectedQuotation.lineItems
        .filter((lineItem) => selected.has(lineItem.id))
        .map(toTransferLine),
    });
    onClose();
  }, [selectedQuotation, selectedLineItemIds, targetKey, onApply, onClose]);

  if (!isOpen) return null;

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
            {/* 受領見積書選択 (REQ-4.5, REQ-17.1, REQ-35.1, REQ-35.2) */}
            <div style={styles.section}>
              <label htmlFor="quotation-select" style={styles.sectionTitle}>
                受領見積書を選択
              </label>
              <select
                id="quotation-select"
                value={selectedQuotationId}
                onChange={handleQuotationChange}
                style={styles.select}
              >
                <option value="">選択してください</option>
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {vendorNameOf(q)} - {formatAmount(q.totalAmount)}
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

            {/* 転記先選択 (REQ-30.1, REQ-30.2, REQ-30.4) */}
            <div style={styles.section}>
              <label htmlFor="target-select" style={styles.sectionTitle}>
                転記先見積項目
              </label>
              <select
                id="target-select"
                value={targetKey}
                onChange={handleTargetChange}
                style={styles.select}
              >
                <option value="">新規項目として作成</option>
                {targetOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {'  '.repeat(option.level)}
                    {option.name} の子項目として作成
                  </option>
                ))}
              </select>
            </div>

            {/* ボタン */}
            <div style={styles.buttonGroup}>
              <button type="button" onClick={onClose} style={styles.cancelButton}>
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isFormValid}
                style={{
                  ...styles.submitButton,
                  ...(!isFormValid ? styles.submitButtonDisabled : {}),
                }}
              >
                転記
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TransferQuotationDialog;
