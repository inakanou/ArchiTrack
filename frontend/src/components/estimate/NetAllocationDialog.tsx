/**
 * @fileoverview NetAllocationDialog - 業者金額→実行金額転記ダイアログ（NET金額案分）
 *
 * Task 55.3: 案分ダイアログの入力元を編集中の明細へ変更
 *
 * 案分対象は**編集中の明細ツリー**（未保存の追加・編集を含む）から構成し、対象の識別には
 * 項目キー（`NodeKey` = サーバーの項目ID または未保存行の一時識別子 `tmp-*`）を用いる。
 * プレビューと適用は同一の計算関数 `estimateCalculations.allocateNet` を通り、適用は
 * `onApply` で編集状態への遷移（`estimateEditReducer` の `applyNetAllocation`）へ渡す。
 * サーバーへの書き込みは行わない（49.3）。
 *
 * Requirements (estimate-creation):
 * - 5.1: 業者と対象の業者金額行を指定した場合、案分対象として選択状態にする
 * - 5.2: 案分から除外する諸経費行を指定した場合、案分対象から除外する
 * - 5.3: NET金額を入力した場合、除外行以外の業者金額行を実行金額行に転記する
 * - 5.9: 未保存の新規行が案分対象に含まれる場合、その行も案分対象として扱う
 * - 18.1〜18.8: NET金額案分ダイアログの各機能
 * - 18.10: 編集中の業者金額行（未保存の追加・編集を含む）を案分対象の一覧に表示する
 * - 31.1, 31.2: 受領見積書の合計金額とNET金額を縦並びで表示する
 * - 33.1〜33.4: 選択済み案分対象行の合計金額を編集中の値に基づいて表示する
 * - 36.1, 36.2: 対象業者の選択でNET金額を自動設定し、手動変更も可能とする
 * - 41.9, 55.4: 値引き行・注記行を案分の対象外とする
 * - 49.1, 49.3, 49.6, 49.7: 結果を未保存の変更として反映し、サーバーへ書き込まない
 *
 * 18.9 / 5.7 の「処理中の表示」は、案分がクライアント内で同期的に完結するように
 * なったため成立する処理中の期間が存在しない（49.3 でサーバーへの往復が無くなった）。
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateCalculations`,
 *         Requirements Traceability `5.8, 5.9`（`allocateNet` を NetAllocationDialog が用いる）
 *
 * @module components/estimate/NetAllocationDialog
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Decimal from 'decimal.js';

import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import { getReceivedQuotationsByProject } from '../../api/received-quotations';
import type { ReceivedQuotationInfo } from '../../api/received-quotations';
import { allocateNet } from '../../domain/estimate/estimateCalculations';
import type { AllocationRow } from '../../domain/estimate/estimateCalculations';
import type {
  EstimateEditItemType,
  NetAllocationPayload,
  NodeKey,
} from '../../domain/estimate/estimateEditReducer.types';

export interface NetAllocationDialogProps {
  isOpen: boolean;
  projectId: string;
  /** 編集中の明細ツリー（未保存の追加・編集を含む / 18.10, 49.6） */
  items: EstimateItemHierarchyEdit[];
  onClose: () => void;
  /** 案分結果を編集状態へ反映する（49.1, 49.3） */
  onApply: (payload: NetAllocationPayload) => void;
}

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
  section: { marginBottom: '24px' } as React.CSSProperties,
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
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  lineItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  checkbox: { width: '18px', height: '18px', cursor: 'pointer' } as React.CSSProperties,
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,
  previewHeader: {
    backgroundColor: '#f9fafb',
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontWeight: 600,
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  previewCell: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
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
  disabledButton: { backgroundColor: '#93c5fd', cursor: 'not-allowed' } as React.CSSProperties,
};

function formatAmount(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '-';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return '-';
  return num.toLocaleString('ja-JP') + '円';
}

/**
 * 数値文字列を Decimal へ変換する（変換できない場合は null）
 *
 * `estimateEditReducer` が適用時に用いる変換規則と同一。プレビューと適用で
 * 同じ入力値を得るために規則を揃える必要がある（5.8）。
 */
function toDecimal(value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 案分対象の候補行（編集中の明細ツリーから収集する）
 *
 * `key` は項目キー。未保存の新規行は一時識別子（`tmp-*`）がそのまま入るため、
 * サーバーへ保存していない行も案分対象として識別できる（5.9, 18.10, 49.7）。
 */
interface VendorTargetRow {
  readonly key: NodeKey;
  readonly itemType: EstimateEditItemType;
  readonly name: string | null;
  readonly amount: string | null;
  readonly quantity: string | null;
  readonly vendorName: string | null;
  readonly sourceReceivedQuotationLineItemId: string | null;
}

/** 案分・利益率の対象になる項目種別か（41.9, 55.4） */
function isCalculationTargetType(itemType: EstimateEditItemType): boolean {
  return itemType !== 'DISCOUNT' && itemType !== 'NOTE';
}

/**
 * 編集中の明細ツリーから案分対象の候補を収集する
 *
 * 階層の深さに上限を設けないため明示スタックで走査する（2.5）。
 * 実行金額行を持たない項目は転記先が無いため対象にしない（適用側の
 * `applyNetAllocation` と同じ選定にすることでプレビューと結果を一致させる / 5.8）。
 */
function collectVendorTargetRows(items: readonly EstimateItemHierarchyEdit[]): VendorTargetRow[] {
  const result: VendorTargetRow[] = [];
  const stack: EstimateItemHierarchyEdit[] = [...items].reverse();

  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) {
      break;
    }

    const itemType: EstimateEditItemType = item.itemType ?? 'STANDARD';
    const vendorLine = item.lines.find((line) => line.lineType === 'VENDOR');
    const hasExecutionLine = item.lines.some((line) => line.lineType === 'EXECUTION');

    if (
      vendorLine !== undefined &&
      vendorLine.amount !== null &&
      vendorLine.amount !== '' &&
      hasExecutionLine &&
      isCalculationTargetType(itemType)
    ) {
      result.push({
        key: item.id,
        itemType,
        name: vendorLine.name,
        amount: vendorLine.amount,
        quantity: vendorLine.quantity,
        vendorName: vendorLine.sourceVendorName ?? null,
        sourceReceivedQuotationLineItemId: vendorLine.sourceReceivedQuotationLineItemId ?? null,
      });
    }

    for (let index = item.children.length - 1; index >= 0; index -= 1) {
      const child = item.children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  return result;
}

export function NetAllocationDialog({
  isOpen,
  projectId,
  items,
  onClose,
  onApply,
}: NetAllocationDialogProps) {
  const [selectedVendor, setSelectedVendor] = useState('');
  const [excludeKeys, setExcludeKeys] = useState<NodeKey[]>([]);
  const [netAmount, setNetAmount] = useState('');
  const [quotations, setQuotations] = useState<ReceivedQuotationInfo[]>([]);

  // 受領見積書データを取得（31.1, 31.2, 36.1 の表示・自動設定にのみ用いる）
  useEffect(() => {
    if (!isOpen) return;
    async function fetchQuotations() {
      try {
        const data = await getReceivedQuotationsByProject(projectId);
        setQuotations(Array.isArray(data) ? data : []);
      } catch {
        // エラー処理は省略
      }
    }
    fetchQuotations();
  }, [isOpen, projectId]);

  const allVendorRows = useMemo(() => collectVendorTargetRows(items), [items]);

  const vendors = useMemo(() => {
    const names = new Set(allVendorRows.map((row) => row.vendorName).filter(Boolean) as string[]);
    return Array.from(names);
  }, [allVendorRows]);

  /** 選択した業者の案分対象行（表示順） */
  const targetRows = useMemo(
    () => allVendorRows.filter((row) => row.vendorName === selectedVendor),
    [allVendorRows, selectedVendor]
  );

  const excludeKeySet = useMemo(() => new Set<NodeKey>(excludeKeys), [excludeKeys]);

  /** 計算関数へ渡す入力行（プレビューと適用で同一の値を用いる / 5.8） */
  const allocationRows = useMemo<AllocationRow[]>(
    () =>
      targetRows.map((row) => ({
        key: row.key,
        itemType: row.itemType,
        amount: toDecimal(row.amount),
        quantity: toDecimal(row.quantity),
      })),
    [targetRows]
  );

  // 選択済み案分対象行の合計金額（33.1〜33.4: 編集中の業者金額行の値に基づく）
  const selectedRowsTotal = useMemo(
    () =>
      allocationRows
        .filter((row) => !excludeKeySet.has(row.key))
        .reduce((sum, row) => sum.add(row.amount ?? new Decimal(0)), new Decimal(0)),
    [allocationRows, excludeKeySet]
  );

  const netAmountDecimal = useMemo(() => toDecimal(netAmount), [netAmount]);

  /**
   * 案分プレビュー（18.7）
   *
   * 計算は 55.1 の `allocateNet` に委ねる。適用側（`applyNetAllocation`）も同じ関数を
   * 通るため、プレビューに出た金額と反映される金額が一致する（5.8）。
   */
  const previewResults = useMemo(() => {
    if (netAmountDecimal === null || allocationRows.length === 0) return null;
    return allocateNet(allocationRows, netAmountDecimal, excludeKeySet);
  }, [allocationRows, netAmountDecimal, excludeKeySet]);

  const nameByKey = useMemo(() => {
    const map = new Map<NodeKey, string | null>();
    for (const row of targetRows) {
      map.set(row.key, row.name);
    }
    return map;
  }, [targetRows]);

  const amountByKey = useMemo(() => {
    const map = new Map<NodeKey, string | null>();
    for (const row of targetRows) {
      map.set(row.key, row.amount);
    }
    return map;
  }, [targetRows]);

  const handleToggleExclude = useCallback((key: NodeKey) => {
    setExcludeKeys((prev) =>
      prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key]
    );
  }, []);

  const isFormValid = selectedVendor !== '' && netAmount !== '' && targetRows.length > 0;

  /**
   * 案分の実行（18.8）
   *
   * サーバーへは書き込まず、編集状態への反映として `onApply` へ渡す（49.1, 49.3）。
   * 対象キーは表示中の対象行すべてを渡し、除外はキーの集合で表す（5.2）。
   */
  const handleApply = useCallback(() => {
    if (!isFormValid) return;
    onApply({
      targetKeys: targetRows.map((row) => row.key),
      excludeKeys: targetRows.filter((row) => excludeKeySet.has(row.key)).map((row) => row.key),
      netAmount,
    });
    onClose();
  }, [isFormValid, onApply, onClose, targetRows, excludeKeySet, netAmount]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="net-dialog-title">
      <div style={styles.dialog}>
        <h2 id="net-dialog-title" style={styles.title}>
          業者金額を実行金額に転記（NET金額案分）
        </h2>

        {/* 対象業者選択 (REQ-18.3) */}
        <div style={styles.section}>
          <label htmlFor="vendor-select" style={styles.sectionTitle}>
            対象業者を選択
          </label>
          <select
            id="vendor-select"
            value={selectedVendor}
            onChange={(e) => {
              const vendorName = e.target.value;
              setSelectedVendor(vendorName);
              setExcludeKeys([]);

              // REQ-36.1: 選択した業者に対応する受領見積書のNET金額を自動設定
              if (vendorName && quotations.length > 0) {
                const matchingQuotation = quotations.find(
                  (q) => (q.tradingPartnerName || q.name) === vendorName
                );
                if (matchingQuotation?.netAmount != null) {
                  setNetAmount(matchingQuotation.netAmount.toString());
                }
              }
            }}
            style={styles.select}
          >
            <option value="">選択してください</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* 業者金額行一覧 (REQ-18.4, REQ-18.5, REQ-18.10) */}
        {selectedVendor && targetRows.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              案分対象行（除外する行のチェックを外してください）
            </div>
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden',
                maxHeight: '250px',
                overflowY: 'auto',
              }}
            >
              {targetRows.map((row) => (
                <div
                  key={row.key}
                  data-testid="allocation-target"
                  data-allocation-key={row.key}
                  style={styles.lineItem}
                >
                  <input
                    type="checkbox"
                    checked={!excludeKeySet.has(row.key)}
                    onChange={() => handleToggleExclude(row.key)}
                    style={styles.checkbox}
                    aria-label={`${row.name || '(名称なし)'} を案分対象にする`}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>
                      {row.name || '(名称なし)'}
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>
                    {formatAmount(row.amount)}
                  </div>
                </div>
              ))}
              {/* 選択済み案分対象行の合計金額 (REQ-33.1, REQ-33.2, REQ-33.3, REQ-33.4) */}
              <div
                data-testid="selected-lines-total"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  padding: '10px 16px',
                  backgroundColor: '#f3f4f6',
                  fontWeight: 700,
                  fontSize: '14px',
                  borderTop: '2px solid #d1d5db',
                }}
              >
                <span>合計:</span>
                <span>{formatAmount(selectedRowsTotal.toString())}</span>
              </div>
            </div>
          </div>
        )}

        {/* 受領見積書の合計金額・NET金額表示 (REQ-31.1, REQ-31.2) */}
        {selectedVendor &&
          (() => {
            // 選択した業者名に対応する受領見積書を検索
            const matchingQuotation = quotations.find(
              (q) =>
                q.name.includes(selectedVendor) ||
                q.lineItems.some((li) => li.name?.includes(selectedVendor))
            );
            // 転記元の受領見積書明細行から逆引きする
            const sourceLineItemIds = new Set(
              targetRows
                .map((row) => row.sourceReceivedQuotationLineItemId)
                .filter(Boolean) as string[]
            );
            const relatedQuotation =
              quotations.find((q) => q.lineItems.some((li) => sourceLineItemIds.has(li.id))) ||
              matchingQuotation;

            if (!relatedQuotation) return null;

            const quotationTotalAmount = relatedQuotation.totalAmount;
            const quotationNetAmount = relatedQuotation.netAmount;
            const hasNetAmount = quotationNetAmount !== null && quotationNetAmount !== undefined;

            return (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>受領見積書情報</div>
                <div
                  data-testid="quotation-info-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '12px',
                    padding: '12px 16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                      受領見積書合計金額
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                      {formatAmount(quotationTotalAmount)}
                    </div>
                  </div>
                  {hasNetAmount && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                        NET金額（受領見積書入力値）
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                        {formatAmount(quotationNetAmount)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

        {/* NET金額入力 (REQ-18.6, REQ-36.2) */}
        {selectedVendor && (
          <div style={styles.section}>
            <label htmlFor="net-amount" style={styles.sectionTitle}>
              NET金額
            </label>
            <input
              id="net-amount"
              type="text"
              value={netAmount}
              onChange={(e) => setNetAmount(e.target.value)}
              placeholder="NET金額を入力"
              style={styles.input}
            />
          </div>
        )}

        {/* プレビュー (REQ-18.7) */}
        {previewResults && previewResults.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>案分プレビュー</div>
            <table style={styles.previewTable}>
              <thead>
                <tr>
                  <th style={styles.previewHeader}>名称</th>
                  <th style={styles.previewHeader}>元の金額</th>
                  <th style={styles.previewHeader}>案分率</th>
                  <th style={styles.previewHeader}>案分後金額</th>
                </tr>
              </thead>
              <tbody>
                {previewResults.map((result) => (
                  <tr
                    key={result.key}
                    data-testid="allocation-preview-row"
                    data-allocation-key={result.key}
                  >
                    <td style={styles.previewCell}>{nameByKey.get(result.key) || '(名称なし)'}</td>
                    <td style={{ ...styles.previewCell, textAlign: 'right' }}>
                      {formatAmount(amountByKey.get(result.key))}
                    </td>
                    {/* 比率は生の値で返るため百分率化・桁丸めは表示側で行う（55.1） */}
                    <td
                      style={{ ...styles.previewCell, textAlign: 'right' }}
                      data-testid="preview-ratio"
                    >
                      {result.ratio.mul(100).toDecimalPlaces(2).toString()}%
                    </td>
                    <td
                      style={{ ...styles.previewCell, textAlign: 'right' }}
                      data-testid="preview-allocated"
                    >
                      {formatAmount(result.allocatedAmount.toString())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ボタン (REQ-18.8) */}
        <div style={styles.buttonGroup}>
          <button type="button" onClick={onClose} style={styles.cancelButton}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!isFormValid}
            style={{
              ...styles.submitButton,
              ...(!isFormValid ? styles.disabledButton : {}),
            }}
          >
            案分実行
          </button>
        </div>
      </div>
    </div>
  );
}

export default NetAllocationDialog;
