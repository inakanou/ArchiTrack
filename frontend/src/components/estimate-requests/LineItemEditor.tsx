/**
 * @fileoverview 構造化明細行入力エディタコンポーネント
 *
 * Task 23.1: LineItemEditorコンポーネントの実装
 *
 * Requirements:
 * - 11.9: 構造化データ入力エリアに明細行フィールドを表示する
 * - 11.10: 金額フィールドを入力不可とし自動計算する
 * - 11.11: 数量または単価変更時に金額を自動再計算する
 * - 11.12: 全明細行の金額合計を自動計算して表示する
 * - 11.13: フォーム初期表示時に1行の空の明細行を表示する
 * - 11.14: 明細行の追加ボタンを表示する
 * - 11.15: 追加ボタンクリックで新しい空の明細行を末尾に追加する
 * - 11.16: 各明細行に削除ボタンを表示する
 * - 11.17: 削除ボタンクリックで該当行を削除し合計金額を再計算する
 * - 11.18: 明細行が1行のみの場合は削除ボタンを非活性にする
 * - 11.19: Tabキーによるフィールド間の順次移動をサポートする
 * - 11.20: 最終フィールドでTabキーを押すと次の明細行の最初のフィールドへ移動する
 * - 11.21: 金額フィールドは入力不可（読み取り専用）とする
 */

import { useCallback, useMemo, useRef, type KeyboardEvent, type ChangeEvent } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 明細行フォームデータ
 *
 * design.mdに基づく型定義。
 * quantity/unitPriceは入力用に文字列、amountは自動計算値。
 */
export interface LineItemFormData {
  /** クライアントサイド一時ID */
  id: string;
  /** 名称 */
  name: string;
  /** 規格 */
  specification: string;
  /** 単位 */
  unit: string;
  /** 数量（入力用文字列） */
  quantity: string;
  /** 単価（入力用文字列） */
  unitPrice: string;
  /** 金額（自動計算値） */
  amount: number | null;
  /** 備考 */
  remarks: string;
}

/**
 * LineItemEditorコンポーネントのProps
 */
export interface LineItemEditorProps {
  /** 明細行データ */
  lineItems: LineItemFormData[];
  /** 明細行変更時のコールバック */
  onLineItemsChange: (items: LineItemFormData[]) => void;
  /** 無効状態 */
  disabled?: boolean;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * 入力フィールドの順序（Tabキー移動用）
 * 金額フィールドは読み取り専用のため含めない
 */
const FIELD_ORDER: (keyof LineItemFormData)[] = [
  'name',
  'specification',
  'unit',
  'quantity',
  'unitPrice',
  'remarks',
];

/**
 * 一意IDカウンター（簡易的なID生成）
 */
let idCounter = 0;

/**
 * 一意IDを生成する
 */
function generateId(): string {
  idCounter += 1;
  return `line-item-${Date.now()}-${idCounter}`;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 金額を計算する
 *
 * design.md: Math.round(q * p) で整数丸め（円単位）
 *
 * @param quantity - 数量（文字列）
 * @param unitPrice - 単価（文字列）
 * @returns 金額（整数）またはnull
 */
export function calculateAmount(quantity: string, unitPrice: string): number | null {
  const q = parseFloat(quantity);
  const p = parseFloat(unitPrice);
  if (isNaN(q) || isNaN(p)) return null;
  return Math.round(q * p);
}

/**
 * 合計金額を計算する
 *
 * @param items - 明細行データ配列
 * @returns 合計金額
 */
export function calculateTotalAmount(items: LineItemFormData[]): number {
  return items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

/**
 * 空の明細行を生成する
 *
 * @returns 空の明細行データ
 */
export function createEmptyLineItem(): LineItemFormData {
  return {
    id: generateId(),
    name: '',
    specification: '',
    unit: '',
    quantity: '',
    unitPrice: '',
    amount: null,
    remarks: '',
  };
}

/**
 * 数値を日本語の3桁区切りでフォーマットする
 */
function formatNumber(value: number): string {
  return value.toLocaleString('ja-JP');
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
    overflow: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  thead: {
    backgroundColor: '#f9fafb',
  },
  th: {
    padding: '8px 6px',
    fontWeight: 600,
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'left' as const,
    borderBottom: '2px solid #e5e7eb',
    whiteSpace: 'nowrap' as const,
  },
  thNo: {
    width: '40px',
    textAlign: 'center' as const,
  },
  thName: {
    minWidth: '120px',
  },
  thSpec: {
    minWidth: '80px',
  },
  thUnit: {
    width: '60px',
  },
  thQuantity: {
    width: '80px',
  },
  thUnitPrice: {
    width: '100px',
  },
  thAmount: {
    width: '100px',
    textAlign: 'right' as const,
  },
  thRemarks: {
    minWidth: '80px',
  },
  thAction: {
    width: '50px',
    textAlign: 'center' as const,
  },
  td: {
    padding: '4px 4px',
    borderBottom: '1px solid #e5e7eb',
    verticalAlign: 'middle' as const,
  },
  tdNo: {
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '13px',
  },
  tdAmount: {
    textAlign: 'right' as const,
    padding: '4px 8px',
    color: '#374151',
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  tdAction: {
    textAlign: 'center' as const,
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #d1d5db',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box' as const,
  },
  inputNumber: {
    textAlign: 'right' as const,
  },
  deleteButton: {
    padding: '4px 8px',
    fontSize: '12px',
    color: '#dc2626', // Changed from #ef4444 for better contrast (4.5:1+ on white)
    backgroundColor: 'transparent',
    border: '1px solid #dc2626',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  deleteButtonDisabled: {
    color: '#d1d5db',
    borderColor: '#d1d5db',
    cursor: 'not-allowed',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '8px',
    padding: '8px 0',
  },
  addButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    fontSize: '13px',
    color: '#2563eb',
    backgroundColor: 'transparent',
    border: '1px solid #2563eb',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  addButtonDisabled: {
    color: '#6b7280',
    borderColor: '#6b7280',
    cursor: 'not-allowed',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '12px',
  },
  totalLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
  },
  totalAmount: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1f2937',
    fontVariantNumeric: 'tabular-nums' as const,
  },
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 構造化明細行入力エディタ
 *
 * 受領見積書の明細行データを表形式で入力・編集するためのコンポーネント。
 * 金額の自動計算、行の追加・削除、Tabキーによるフォーカス移動を提供する。
 *
 * @example
 * ```tsx
 * <LineItemEditor
 *   lineItems={lineItems}
 *   onLineItemsChange={setLineItems}
 * />
 * ```
 */
export function LineItemEditor({
  lineItems,
  onLineItemsChange,
  disabled = false,
}: LineItemEditorProps) {
  const tableRef = useRef<HTMLTableElement>(null);

  // --------------------------------------------------------------------------
  // 合計金額の計算（useMemo）
  // --------------------------------------------------------------------------

  const totalAmount = useMemo(() => calculateTotalAmount(lineItems), [lineItems]);

  // --------------------------------------------------------------------------
  // 明細行の追加
  // --------------------------------------------------------------------------

  const handleAddLine = useCallback(() => {
    const newItems = [...lineItems, createEmptyLineItem()];
    onLineItemsChange(newItems);
  }, [lineItems, onLineItemsChange]);

  // --------------------------------------------------------------------------
  // 明細行の削除
  // --------------------------------------------------------------------------

  const handleDeleteLine = useCallback(
    (id: string) => {
      const newItems = lineItems.filter((item) => item.id !== id);
      onLineItemsChange(newItems);
    },
    [lineItems, onLineItemsChange]
  );

  // --------------------------------------------------------------------------
  // フィールド値の変更
  // --------------------------------------------------------------------------

  const handleFieldChange = useCallback(
    (id: string, field: keyof LineItemFormData, value: string) => {
      const newItems = lineItems.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // 数量または単価が変更された場合は金額を再計算
        if (field === 'quantity' || field === 'unitPrice') {
          const quantity = field === 'quantity' ? value : item.quantity;
          const unitPrice = field === 'unitPrice' ? value : item.unitPrice;
          updated.amount = calculateAmount(quantity, unitPrice);
        }

        return updated;
      });
      onLineItemsChange(newItems);
    },
    [lineItems, onLineItemsChange]
  );

  // --------------------------------------------------------------------------
  // Tabキーフォーカス移動（最終フィールド→次の行の最初のフィールド）
  // --------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, rowIndex: number, fieldName: keyof LineItemFormData) => {
      if (e.key !== 'Tab' || e.shiftKey) return;

      // 現在のフィールドが行の最終フィールド（備考）であるか確認
      const isLastField = fieldName === FIELD_ORDER[FIELD_ORDER.length - 1];

      if (isLastField && rowIndex < lineItems.length - 1) {
        // 次の行が存在する場合、次の行の最初のフィールドにフォーカス
        e.preventDefault();
        const nextRowIndex = rowIndex + 1;
        const firstFieldName = FIELD_ORDER[0];
        const nextInput = tableRef.current?.querySelector<HTMLInputElement>(
          `[data-row="${nextRowIndex}"][data-field="${firstFieldName}"]`
        );
        if (nextInput) {
          nextInput.focus();
        }
      }
    },
    [lineItems.length]
  );

  // --------------------------------------------------------------------------
  // レンダリング
  // --------------------------------------------------------------------------

  const canDelete = lineItems.length > 1;

  return (
    <div style={styles.container}>
      <table ref={tableRef} style={styles.table}>
        <thead style={styles.thead}>
          <tr>
            <th scope="col" style={{ ...styles.th, ...styles.thNo }}>
              No
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thName }}>
              名称
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thSpec }}>
              規格
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thUnit }}>
              単位
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thQuantity }}>
              数量
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thUnitPrice }}>
              単価
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thAmount }}>
              金額
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thRemarks }}>
              備考
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thAction }}>
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, index) => (
            <tr key={item.id}>
              {/* No */}
              <td style={{ ...styles.td, ...styles.tdNo }}>{index + 1}</td>

              {/* 名称 */}
              <td style={styles.td}>
                <input
                  type="text"
                  value={item.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'name', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'name')}
                  placeholder="名称"
                  disabled={disabled}
                  style={styles.input}
                  data-row={index}
                  data-field="name"
                  aria-label={`行${index + 1} 名称`}
                />
              </td>

              {/* 規格 */}
              <td style={styles.td}>
                <input
                  type="text"
                  value={item.specification}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'specification', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'specification')}
                  placeholder="規格"
                  disabled={disabled}
                  style={styles.input}
                  data-row={index}
                  data-field="specification"
                  aria-label={`行${index + 1} 規格`}
                />
              </td>

              {/* 単位 */}
              <td style={styles.td}>
                <input
                  type="text"
                  value={item.unit}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'unit', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'unit')}
                  placeholder="単位"
                  disabled={disabled}
                  style={styles.input}
                  data-row={index}
                  data-field="unit"
                  aria-label={`行${index + 1} 単位`}
                />
              </td>

              {/* 数量 */}
              <td style={styles.td}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'quantity', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'quantity')}
                  placeholder="数量"
                  disabled={disabled}
                  style={{ ...styles.input, ...styles.inputNumber }}
                  data-row={index}
                  data-field="quantity"
                  aria-label={`行${index + 1} 数量`}
                />
              </td>

              {/* 単価 */}
              <td style={styles.td}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.unitPrice}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'unitPrice', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'unitPrice')}
                  placeholder="単価"
                  disabled={disabled}
                  style={{ ...styles.input, ...styles.inputNumber }}
                  data-row={index}
                  data-field="unitPrice"
                  aria-label={`行${index + 1} 単価`}
                />
              </td>

              {/* 金額（読み取り専用） */}
              <td style={{ ...styles.td, ...styles.tdAmount }} data-testid="line-item-amount">
                {item.amount !== null ? formatNumber(item.amount) : ''}
              </td>

              {/* 備考 */}
              <td style={styles.td}>
                <input
                  type="text"
                  value={item.remarks}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'remarks', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'remarks')}
                  placeholder="備考"
                  disabled={disabled}
                  style={styles.input}
                  data-row={index}
                  data-field="remarks"
                  aria-label={`行${index + 1} 備考`}
                />
              </td>

              {/* 操作（削除ボタン） */}
              <td style={{ ...styles.td, ...styles.tdAction }}>
                <button
                  type="button"
                  onClick={() => handleDeleteLine(item.id)}
                  disabled={disabled || !canDelete}
                  style={{
                    ...styles.deleteButton,
                    ...(disabled || !canDelete ? styles.deleteButtonDisabled : {}),
                  }}
                  aria-label={`行${index + 1}を削除`}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* フッター: 追加ボタンと合計金額 */}
      <div style={styles.footer}>
        <button
          type="button"
          onClick={handleAddLine}
          disabled={disabled}
          style={{
            ...styles.addButton,
            ...(disabled ? styles.addButtonDisabled : {}),
          }}
          aria-label="行を追加"
        >
          + 行を追加
        </button>

        <div style={styles.totalRow}>
          <span style={styles.totalLabel}>合計</span>
          <span style={styles.totalAmount} data-testid="total-amount">
            {formatNumber(totalAmount)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default LineItemEditor;
