/**
 * @fileoverview ProfitRateDialog - 実行金額→見積金額転記ダイアログ（利益率適用）
 *
 * Task 23.1: ProfitRateDialogコンポーネントの実装
 *
 * Requirements (estimate-creation):
 * - REQ-19.1: 「実行金額を見積金額に転記」ボタンを提供する
 * - REQ-19.2: 利益率適用ダイアログを表示する
 * - REQ-19.3: 利益率入力フィールド（0.00〜500.00%）を提供する
 * - REQ-19.4: 上書きオプションを提供する
 * - REQ-19.5: プレビュー表示する
 * - REQ-19.6: 適用ボタンで実行金額行を見積金額行に反映する
 * - REQ-19.7: 処理中インジケーターを表示する
 *
 * @module components/estimate/ProfitRateDialog
 */

import { useState, useCallback, useMemo } from 'react';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import { apiClient } from '../../api/client';
import Decimal from 'decimal.js';

export interface ProfitRateDialogProps {
  isOpen: boolean;
  estimateId: string;
  items: EstimateItemHierarchyEdit[];
  onClose: () => void;
  onComplete: () => void;
}

type OverwriteOption = 'all' | 'empty_only' | 'unit_price_only';

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
    maxWidth: '700px',
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
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
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
  arrow: {
    padding: '8px 4px',
    borderBottom: '1px solid #f3f4f6',
    textAlign: 'center' as const,
    color: '#6b7280',
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
  disabledButton: { backgroundColor: '#93c5fd', cursor: 'not-allowed' } as React.CSSProperties,
};

function formatAmount(amount: string | null | undefined): string {
  if (!amount) return '-';
  const num = parseFloat(amount);
  if (isNaN(num)) return '-';
  return num.toLocaleString('ja-JP') + '円';
}

interface ExecutionLine {
  itemId: string;
  lineId: string;
  name: string | null;
  unitPrice: string | null;
}

function collectExecutionLines(items: EstimateItemHierarchyEdit[]): ExecutionLine[] {
  const result: ExecutionLine[] = [];
  for (const item of items) {
    const execLine = item.lines.find((l) => l.lineType === 'EXECUTION');
    if (execLine && execLine.unitPrice) {
      result.push({
        itemId: item.id,
        lineId: execLine.id,
        name: execLine.name,
        unitPrice: execLine.unitPrice,
      });
    }
    if (item.children.length > 0) {
      result.push(...collectExecutionLines(item.children));
    }
  }
  return result;
}

export function ProfitRateDialog({
  isOpen,
  estimateId,
  items,
  onClose,
  onComplete,
}: ProfitRateDialogProps) {
  const DEFAULT_PROFIT_RATE = '12.27';
  const [profitRate, setProfitRate] = useState(DEFAULT_PROFIT_RATE);
  const [overwriteOption, setOverwriteOption] = useState<OverwriteOption>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const executionLines = useMemo(() => collectExecutionLines(items), [items]);

  const previewResults = useMemo(() => {
    if (!profitRate || !executionLines.length) return null;
    try {
      const rate = new Decimal(profitRate).div(100).add(1);
      return executionLines.map((line) => ({
        lineId: line.lineId,
        name: line.name,
        originalUnitPrice: line.unitPrice,
        newUnitPrice: new Decimal(line.unitPrice || 0)
          .mul(rate)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toString(),
      }));
    } catch {
      return null;
    }
  }, [profitRate, executionLines]);

  const handleSubmit = useCallback(async () => {
    if (!profitRate) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(`/api/estimates/${estimateId}/apply-profit-rate`, {
        profitRate,
        overwriteOption,
      });
      onComplete();
      onClose();
    } catch {
      // error handling
    } finally {
      setIsSubmitting(false);
    }
  }, [estimateId, profitRate, overwriteOption, onComplete, onClose]);

  if (!isOpen) return null;

  const isFormValid = profitRate !== '';

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profit-dialog-title"
    >
      <div style={styles.dialog}>
        <h2 id="profit-dialog-title" style={styles.title}>
          実行金額を見積金額に転記（利益率適用）
        </h2>

        {/* 利益率入力 (REQ-19.3) */}
        <div style={styles.section}>
          <label htmlFor="profit-rate" style={styles.sectionTitle}>
            利益率 (%)
          </label>
          <input
            id="profit-rate"
            type="number"
            value={profitRate}
            onChange={(e) => setProfitRate(e.target.value)}
            placeholder="例: 10"
            min="0"
            max="500"
            step="0.01"
            style={styles.input}
            disabled={isSubmitting}
          />
        </div>

        {/* 上書きオプション (REQ-19.4) */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>上書きオプション</div>
          <div style={styles.radioGroup}>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="overwrite"
                checked={overwriteOption === 'all'}
                onChange={() => setOverwriteOption('all')}
                disabled={isSubmitting}
              />
              すべて上書き（名称・規格・単位・数量・単価）
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="overwrite"
                checked={overwriteOption === 'empty_only'}
                onChange={() => setOverwriteOption('empty_only')}
                disabled={isSubmitting}
              />
              空の場合のみ上書き
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="overwrite"
                checked={overwriteOption === 'unit_price_only'}
                onChange={() => setOverwriteOption('unit_price_only')}
                disabled={isSubmitting}
              />
              単価のみ上書き
            </label>
          </div>
        </div>

        {/* プレビュー (REQ-19.5) */}
        {previewResults && previewResults.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>適用プレビュー</div>
            <table style={styles.previewTable}>
              <thead>
                <tr>
                  <th style={styles.previewHeader}>名称</th>
                  <th style={styles.previewHeader}>元の単価</th>
                  <th style={{ ...styles.previewHeader, textAlign: 'center', width: '40px' }}></th>
                  <th style={styles.previewHeader}>新しい単価</th>
                </tr>
              </thead>
              <tbody>
                {previewResults.map((r) => (
                  <tr key={r.lineId}>
                    <td style={styles.previewCell}>{r.name || '(名称なし)'}</td>
                    <td style={{ ...styles.previewCell, textAlign: 'right' }}>
                      {formatAmount(r.originalUnitPrice)}
                    </td>
                    <td style={styles.arrow}>→</td>
                    <td style={{ ...styles.previewCell, textAlign: 'right' }}>
                      {formatAmount(r.newUnitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ボタン (REQ-19.6, REQ-19.7) */}
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
            {isSubmitting ? '適用中...' : '適用'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfitRateDialog;
