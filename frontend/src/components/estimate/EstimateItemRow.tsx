/**
 * @fileoverview EstimateItemRowコンポーネント - 見積項目行（3行1セット）
 *
 * Task 9.2: EstimateItemRowコンポーネントの実装
 *
 * 見積項目を3行1セット（見積金額行・実行金額行・業者金額行）で表示するコンポーネントです。
 * 各行にはフィールド入力（名称、規格、単位、数量、単価、備考）と
 * 自動計算される金額フィールドを提供します。
 *
 * Requirements (estimate-creation):
 * - REQ-1.2: 見積項目行を「見積金額行」「実行金額行」「業者金額行」の3行1セットで構成する
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-1.4: 金額フィールドを入力不可として表示する
 * - REQ-1.6: 各見積項目行に名称・規格・単位・数量・単価・備考の入力フィールドを提供する
 *
 * @module components/estimate/EstimateItemRow
 */

import { useCallback } from 'react';
import type { EstimateItemLineEdit, EstimateItemLineType } from '../../hooks/useEstimateEditor';
import { EstimateCalculator } from '../../utils/estimate-calculation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateItemRowコンポーネントのProps
 */
export interface EstimateItemRowProps {
  /** 項目ID */
  itemId: string;
  /** 3行1セットの行データ */
  lines: EstimateItemLineEdit[];
  /** インデントレベル（0から開始） */
  indentLevel?: number;
  /** 選択状態 */
  isSelected?: boolean;
  /** 行フィールド変更コールバック */
  onLineChange?: (
    itemId: string,
    lineId: string,
    field: keyof EstimateItemLineEdit,
    value: string | null
  ) => void;
  /** 子項目を持つかどうか（trueの場合、単価は自動計算で編集不可） */
  hasChildren?: boolean;
  /** 表示する行タイプのフィルター */
  visibleLineTypes?: Set<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * 行タイプのラベルマップ
 */
const LINE_TYPE_LABELS: Record<EstimateItemLineType, string> = {
  ESTIMATE: '見積',
  EXECUTION: '実行',
  VENDOR: '業者',
};

/**
 * 行タイプの表示順序
 */
const LINE_TYPE_ORDER: EstimateItemLineType[] = ['ESTIMATE', 'EXECUTION', 'VENDOR'];

/**
 * インデント単位（ピクセル）
 */
const INDENT_UNIT = 16;

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    borderBottom: '1px solid #e5e7eb',
    transition: 'background-color 0.2s',
  },
  containerSelected: {
    backgroundColor: '#eff6ff',
  },
  lineRow: {
    display: 'grid',
    gridTemplateColumns: '60px 120px 1fr 120px 80px 100px 100px 120px 1fr',
    gap: '8px',
    alignItems: 'center',
    padding: '8px 16px',
    minHeight: '40px',
  } as React.CSSProperties,
  lineTypeLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#4b5563',
    textAlign: 'center' as const,
    backgroundColor: '#f3f4f6',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  lineTypeLabelEstimate: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  lineTypeLabelExecution: {
    backgroundColor: '#dcfce7',
    color: '#166534', // Changed from #15803d for better contrast (4.5:1+ on #dcfce7)
  },
  lineTypeLabelVendor: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  } as React.CSSProperties,
  inputFocus: {
    borderColor: '#3b82f6',
    outline: 'none',
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)',
  } as React.CSSProperties,
  amountField: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1f2937',
    textAlign: 'right' as const,
    padding: '6px 8px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
  } as React.CSSProperties,
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 金額をフォーマットする（桁区切り）
 */
/**
 * 金額をフォーマットする（桁区切り、REQ-22: 整数表示）
 */
const formatAmount = (amount: string | null): string => {
  if (amount === null || amount === '') {
    return '-';
  }
  try {
    const num = parseFloat(amount);
    if (isNaN(num)) return '-';
    return Math.round(num).toLocaleString('ja-JP');
  } catch {
    return '-';
  }
};

/**
 * 行タイプのラベルスタイルを取得
 */
const getLabelStyle = (lineType: EstimateItemLineType): React.CSSProperties => {
  const base = styles.lineTypeLabel;
  switch (lineType) {
    case 'ESTIMATE':
      return { ...base, ...styles.lineTypeLabelEstimate };
    case 'EXECUTION':
      return { ...base, ...styles.lineTypeLabelExecution };
    case 'VENDOR':
      return { ...base, ...styles.lineTypeLabelVendor };
    default:
      return base;
  }
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 見積項目行（単一行）のProps
 */
interface LineRowProps {
  itemId: string;
  line: EstimateItemLineEdit;
  onLineChange?: (
    itemId: string,
    lineId: string,
    field: keyof EstimateItemLineEdit,
    value: string | null
  ) => void;
  hasChildren?: boolean;
}

/**
 * 見積項目行（単一行）
 */
function LineRow({ itemId, line, onLineChange, hasChildren = false }: LineRowProps) {
  const handleFieldChange = useCallback(
    (field: keyof EstimateItemLineEdit) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value || null;
      onLineChange?.(itemId, line.id, field, value);
    },
    [itemId, line.id, onLineChange]
  );

  /**
   * 数量フィールドのフォーカスアウト時フォーマット（REQ-22.7）
   * 小数2桁固定でフォーマットする
   */
  const handleQuantityBlur = useCallback(() => {
    if (line.quantity && onLineChange) {
      const formatted = EstimateCalculator.formatQuantity(line.quantity);
      if (formatted !== null && formatted !== line.quantity) {
        onLineChange(itemId, line.id, 'quantity', formatted);
      }
    }
  }, [itemId, line.id, line.quantity, onLineChange]);

  /**
   * 単価フィールドのフォーカスアウト時フォーマット（REQ-22.8）
   * 小数第1位で四捨五入して整数にする
   */
  const handleUnitPriceBlur = useCallback(() => {
    if (line.unitPrice && onLineChange) {
      const rounded = EstimateCalculator.roundUnitPrice(line.unitPrice);
      if (rounded !== null && rounded !== line.unitPrice) {
        onLineChange(itemId, line.id, 'unitPrice', rounded);
      }
    }
  }, [itemId, line.id, line.unitPrice, onLineChange]);

  return (
    <div style={styles.lineRow} data-testid={`line-type-${line.lineType}`}>
      {/* 行タイプラベル */}
      <div style={getLabelStyle(line.lineType)}>{LINE_TYPE_LABELS[line.lineType]}</div>

      {/* 見積業者 (REQ-17.3, REQ-17.4) */}
      <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
        {line.lineType === 'VENDOR' && line.sourceVendorName ? line.sourceVendorName : ''}
      </div>

      {/* 名称 */}
      <div>
        <input
          type="text"
          value={line.name ?? ''}
          onChange={handleFieldChange('name')}
          style={styles.input}
          aria-label="名称"
          placeholder="名称を入力"
        />
      </div>

      {/* 規格 */}
      <div>
        <input
          type="text"
          value={line.specification ?? ''}
          onChange={handleFieldChange('specification')}
          style={styles.input}
          aria-label="規格"
          placeholder="規格"
        />
      </div>

      {/* 単位 */}
      <div>
        <input
          type="text"
          value={line.unit ?? ''}
          onChange={handleFieldChange('unit')}
          style={styles.input}
          aria-label="単位"
          placeholder="単位"
        />
      </div>

      {/* 数量 (REQ-22.7: フォーカスアウト時に小数2桁固定フォーマット) */}
      <div>
        <input
          type="text"
          value={line.quantity ?? ''}
          onChange={handleFieldChange('quantity')}
          onBlur={handleQuantityBlur}
          style={styles.input}
          aria-label="数量"
          placeholder="数量"
        />
      </div>

      {/* 単価 (REQ-22.8: フォーカスアウト時に整数丸め) */}
      <div>
        {hasChildren ? (
          <div style={styles.amountField} aria-label="単価">
            {formatAmount(line.unitPrice)}
          </div>
        ) : (
          <input
            type="text"
            value={line.unitPrice ?? ''}
            onChange={handleFieldChange('unitPrice')}
            onBlur={handleUnitPriceBlur}
            style={styles.input}
            aria-label="単価"
            placeholder="単価"
          />
        )}
      </div>

      {/* 金額（自動計算、入力不可） */}
      <div style={styles.amountField} data-testid="amount-field" aria-label="金額">
        {formatAmount(line.amount)}
      </div>

      {/* 備考 */}
      <div>
        <input
          type="text"
          value={line.remarks ?? ''}
          onChange={handleFieldChange('remarks')}
          style={styles.input}
          aria-label="備考"
          placeholder="備考"
        />
      </div>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積項目行（3行1セット）
 *
 * 見積項目を見積金額行・実行金額行・業者金額行の3行で表示します。
 * 各行には入力フィールドと自動計算される金額フィールドがあります。
 *
 * @example
 * ```tsx
 * <EstimateItemRow
 *   itemId="item-1"
 *   lines={[
 *     { id: 'line-1', lineType: 'ESTIMATE', name: '工事', ... },
 *     { id: 'line-2', lineType: 'EXECUTION', name: '工事', ... },
 *     { id: 'line-3', lineType: 'VENDOR', name: '工事', ... },
 *   ]}
 *   indentLevel={0}
 *   onLineChange={(itemId, lineId, field, value) => console.log(field, value)}
 * />
 * ```
 */
export function EstimateItemRow({
  itemId,
  lines,
  indentLevel = 0,
  isSelected = false,
  onLineChange,
  hasChildren = false,
  visibleLineTypes,
}: EstimateItemRowProps) {
  // 行タイプの順序で並び替え、フィルター適用
  const sortedLines = LINE_TYPE_ORDER.map((lineType) =>
    lines.find((line) => line.lineType === lineType)
  ).filter((line): line is EstimateItemLineEdit => {
    if (line === undefined) return false;
    if (visibleLineTypes && !visibleLineTypes.has(line.lineType)) return false;
    return true;
  });

  // インデントスタイル
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    ...(isSelected ? styles.containerSelected : {}),
    paddingLeft: `${indentLevel * INDENT_UNIT}px`,
  };

  return (
    <div
      style={containerStyle}
      data-testid="estimate-item-row"
      data-selected={isSelected.toString()}
    >
      {sortedLines.map((line) => (
        <LineRow key={line.id} itemId={itemId} line={line} onLineChange={onLineChange} hasChildren={hasChildren} />
      ))}
    </div>
  );
}

export default EstimateItemRow;
