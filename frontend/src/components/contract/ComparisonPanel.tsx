/**
 * @fileoverview 変更前後比較表示パネル
 *
 * Task 5.4: 変更契約の変更前後比較表示パネルを実装する
 *
 * Requirements (contract-management):
 * - REQ-6.1: 基契約書の各フィールド値を「変更前」として入力項目に並べて表示
 * - REQ-6.2: 変更前後比較表示（値が変更されたフィールドのハイライト表示）
 *
 * @module components/contract/ComparisonPanel
 */

import type { EstimateInfo } from '../../api/estimates';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 比較用の値
 */
export interface ComparisonValues {
  estimateId: string;
  estimateName?: string;
  contractDate: string;
  constructionStartDate: string;
  constructionEndDate: string;
  deliveryDate: string;
  taxRate: string;
  paymentTerms: string;
  separateConstruction: string;
  otherNotes: string;
  supervisorTradingPartnerId: string;
  contractAmount: number;
  constructionPrice: number;
  taxAmount: number;
}

/**
 * ComparisonPanelのプロパティ
 */
export interface ComparisonPanelProps {
  /** 変更前の値 */
  previousValues: ComparisonValues;
  /** 現在の値 */
  currentValues: ComparisonValues;
  /** 見積書一覧（名前表示用） */
  estimates: EstimateInfo[];
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  panel: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#fffbeb',
    borderRadius: '8px',
    border: '1px solid #fbbf24',
  } as React.CSSProperties,
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#92400e',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #fbbf24',
  } as React.CSSProperties,
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr 1fr',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid #fde68a',
    alignItems: 'center',
  } as React.CSSProperties,
  fieldRowChanged: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr 1fr',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid #fde68a',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#4b5563',
  } as React.CSSProperties,
  fieldValue: {
    fontSize: '13px',
    color: '#1f2937',
    padding: '4px 8px',
    borderRadius: '4px',
  } as React.CSSProperties,
  columnHeader: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr 1fr',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '2px solid #f59e0b',
    marginBottom: '4px',
  } as React.CSSProperties,
  columnHeaderLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#78350f',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 金額をフォーマットする
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ja-JP').format(amount);
}

/**
 * 日付をフォーマットする
 */
function formatDate(dateString: string): string {
  if (!dateString) return '未設定';
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 変更前後比較表示パネル
 *
 * Requirements:
 * - REQ-6.1: 基契約書の各フィールド値を「変更前」として表示
 * - REQ-6.2: 値が変更されたフィールドのハイライト表示
 */
export default function ComparisonPanel({
  previousValues,
  currentValues,
  estimates,
}: ComparisonPanelProps) {
  /**
   * 見積書名を取得
   */
  function getEstimateName(estimateId: string): string {
    if (previousValues.estimateName && estimateId === previousValues.estimateId) {
      return previousValues.estimateName;
    }
    const estimate = estimates.find((e) => e.id === estimateId);
    return estimate?.name ?? '不明';
  }

  /**
   * フィールドが変更されたかどうか判定する
   */
  function isChanged(field: keyof ComparisonValues): boolean {
    return String(previousValues[field]) !== String(currentValues[field]);
  }

  /**
   * 比較行をレンダリング
   */
  function renderComparisonRow(
    label: string,
    field: keyof ComparisonValues,
    formatFn?: (value: string | number) => string
  ) {
    const changed = isChanged(field);
    const prevValue = previousValues[field];
    const currValue = currentValues[field];

    const format = formatFn ?? ((v: string | number) => String(v));

    return (
      <div
        key={field}
        style={changed ? styles.fieldRowChanged : styles.fieldRow}
        data-testid={changed ? `comparison-field-changed-${field}` : `comparison-field-${field}`}
      >
        <div style={styles.fieldLabel}>{label}</div>
        <div style={styles.fieldValue}>{format(prevValue ?? '')}</div>
        <div style={styles.fieldValue}>{format(currValue ?? '')}</div>
      </div>
    );
  }

  return (
    <div style={styles.panel} data-testid="comparison-panel">
      <h3 style={styles.title}>変更前後比較</h3>

      {/* カラムヘッダー */}
      <div style={styles.columnHeader}>
        <div style={styles.columnHeaderLabel}>項目</div>
        <div style={styles.columnHeaderLabel}>変更前</div>
        <div style={styles.columnHeaderLabel}>変更後</div>
      </div>

      {/* 各フィールドの比較 */}
      {renderComparisonRow('見積書', 'estimateId', (v) => getEstimateName(String(v)))}
      {renderComparisonRow('契約日', 'contractDate', (v) => formatDate(String(v)))}
      {renderComparisonRow('工期着手日', 'constructionStartDate', (v) => formatDate(String(v)))}
      {renderComparisonRow('工期完成日', 'constructionEndDate', (v) => formatDate(String(v)))}
      {renderComparisonRow('引渡日', 'deliveryDate', (v) => formatDate(String(v)))}
      {renderComparisonRow('消費税率', 'taxRate', (v) => `${v}%`)}
      {renderComparisonRow('支払条件', 'paymentTerms')}
      {renderComparisonRow('別途工事', 'separateConstruction')}
      {renderComparisonRow('その他', 'otherNotes')}
      {renderComparisonRow('工事価格', 'constructionPrice', (v) => formatAmount(Number(v)))}
      {renderComparisonRow('消費税額', 'taxAmount', (v) => formatAmount(Number(v)))}
      {renderComparisonRow('請負代金額', 'contractAmount', (v) => formatAmount(Number(v)))}
    </div>
  );
}
