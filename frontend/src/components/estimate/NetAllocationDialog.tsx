/**
 * @fileoverview NetAllocationDialog - 業者金額→実行金額転記ダイアログ（NET金額案分）
 *
 * Task 22.1: NetAllocationDialogコンポーネントの実装
 *
 * Requirements (estimate-creation):
 * - REQ-18.1: 「業者金額を実行金額に転記」ボタンを提供する
 * - REQ-18.2: NET金額案分ダイアログを表示する
 * - REQ-18.3: 対象業者を選択するドロップダウンを提供する
 * - REQ-18.4: 業者金額行一覧をチェックボックス付きで表示する
 * - REQ-18.5: 案分から除外する諸経費行を指定可能とする
 * - REQ-18.6: NET金額の入力フィールドを提供する
 * - REQ-18.7: 案分率と案分後金額のプレビューを表示する
 * - REQ-18.8: 案分実行ボタンで業者金額行を実行金額行に転記する
 * - REQ-18.9: 処理中インジケーターを表示する
 *
 * @module components/estimate/NetAllocationDialog
 */

import { useState, useCallback, useMemo } from 'react';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import { apiClient } from '../../api/client';
import Decimal from 'decimal.js';

export interface NetAllocationDialogProps {
  isOpen: boolean;
  estimateId: string;
  items: EstimateItemHierarchyEdit[];
  onClose: () => void;
  onComplete: () => void;
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

interface VendorLine {
  itemId: string;
  lineId: string;
  name: string | null;
  amount: string | null;
  vendorName: string | null;
}

function collectVendorLines(items: EstimateItemHierarchyEdit[]): VendorLine[] {
  const result: VendorLine[] = [];
  for (const item of items) {
    const vendorLine = item.lines.find((l) => l.lineType === 'VENDOR');
    if (vendorLine && vendorLine.amount) {
      result.push({
        itemId: item.id,
        lineId: vendorLine.id,
        name: vendorLine.name,
        amount: vendorLine.amount,
        vendorName: vendorLine.sourceVendorName || null,
      });
    }
    if (item.children.length > 0) {
      result.push(...collectVendorLines(item.children));
    }
  }
  return result;
}

export function NetAllocationDialog({
  isOpen,
  estimateId,
  items,
  onClose,
  onComplete,
}: NetAllocationDialogProps) {
  const [selectedVendor, setSelectedVendor] = useState('');
  const [excludeLineIds, setExcludeLineIds] = useState<string[]>([]);
  const [netAmount, setNetAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allVendorLines = useMemo(() => collectVendorLines(items), [items]);
  const vendors = useMemo(() => {
    const names = new Set(allVendorLines.map((l) => l.vendorName).filter(Boolean) as string[]);
    return Array.from(names);
  }, [allVendorLines]);

  const targetLines = useMemo(
    () => allVendorLines.filter((l) => l.vendorName === selectedVendor),
    [allVendorLines, selectedVendor]
  );

  const previewResults = useMemo(() => {
    if (!netAmount || !targetLines.length) return null;
    try {
      const net = new Decimal(netAmount);
      const activeLines = targetLines.filter((l) => !excludeLineIds.includes(l.lineId));
      const totalAmount = activeLines.reduce(
        (sum, l) => sum.add(new Decimal(l.amount || 0)),
        new Decimal(0)
      );
      return activeLines.map((line) => {
        const ratio = totalAmount.isZero()
          ? new Decimal(0)
          : new Decimal(line.amount || 0).div(totalAmount);
        const allocated = net.mul(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        return {
          lineId: line.lineId,
          name: line.name,
          originalAmount: line.amount,
          ratio: ratio.mul(100).toDecimalPlaces(2).toString(),
          allocatedAmount: allocated.toString(),
        };
      });
    } catch {
      return null;
    }
  }, [netAmount, targetLines, excludeLineIds]);

  const handleToggleExclude = useCallback((lineId: string) => {
    setExcludeLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId]
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedVendor || !netAmount || !targetLines.length) return;
    setIsSubmitting(true);
    try {
      const activeLineIds = targetLines
        .filter((l) => !excludeLineIds.includes(l.lineId))
        .map((l) => l.lineId);
      await apiClient.post(`/api/estimates/${estimateId}/calculate-net`, {
        vendorName: selectedVendor,
        targetLineIds: activeLineIds,
        excludeLineIds,
        netAmount,
      });
      onComplete();
      onClose();
    } catch {
      // error handling
    } finally {
      setIsSubmitting(false);
    }
  }, [estimateId, selectedVendor, netAmount, targetLines, excludeLineIds, onComplete, onClose]);

  if (!isOpen) return null;

  const isFormValid = selectedVendor && netAmount && targetLines.length > 0;

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
              setSelectedVendor(e.target.value);
              setExcludeLineIds([]);
            }}
            style={styles.select}
            disabled={isSubmitting}
          >
            <option value="">選択してください</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* 業者金額行一覧 (REQ-18.4, REQ-18.5) */}
        {selectedVendor && targetLines.length > 0 && (
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
              {targetLines.map((line) => (
                <div key={line.lineId} style={styles.lineItem}>
                  <input
                    type="checkbox"
                    checked={!excludeLineIds.includes(line.lineId)}
                    onChange={() => handleToggleExclude(line.lineId)}
                    style={styles.checkbox}
                    disabled={isSubmitting}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>
                      {line.name || '(名称なし)'}
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>
                    {formatAmount(line.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NET金額入力 (REQ-18.6) */}
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
              disabled={isSubmitting}
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
                {previewResults.map((r) => (
                  <tr key={r.lineId}>
                    <td style={styles.previewCell}>{r.name || '(名称なし)'}</td>
                    <td style={{ ...styles.previewCell, textAlign: 'right' }}>
                      {formatAmount(r.originalAmount)}
                    </td>
                    <td style={{ ...styles.previewCell, textAlign: 'right' }}>{r.ratio}%</td>
                    <td style={{ ...styles.previewCell, textAlign: 'right' }}>
                      {formatAmount(r.allocatedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ボタン (REQ-18.8, REQ-18.9) */}
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
              ...(!isFormValid || isSubmitting ? styles.disabledButton : {}),
            }}
          >
            {isSubmitting ? '案分実行中...' : '案分実行'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NetAllocationDialog;
