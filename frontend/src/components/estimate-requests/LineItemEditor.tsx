/**
 * @fileoverview 構造化明細行入力エディタコンポーネント
 *
 * Task 23.1: LineItemEditorコンポーネントの実装
 * Task 78.3: 並び順保持・上下移動・アクションメニュー集約への改訂4対応
 *
 * Requirements:
 * - 11.9: 構造化データ入力エリアに明細行フィールドを表示する
 * - 11.10: 金額フィールドを入力不可とし自動計算する
 * - 11.11: 数量または単価変更時に金額を自動再計算する
 * - 11.12: 全明細行の金額合計を自動計算して表示する
 * - 11.13: フォーム初期表示時に1行の空の明細行を表示する
 * - 11.14: 明細行の追加ボタンを表示する
 * - 11.15: 追加ボタンクリックで新しい空の明細行を末尾に追加する
 * - 11.16: 各明細行に削除ボタンを表示する（task 78.3 でアクションメニュー内に統合）
 * - 11.17: 削除ボタンクリックで該当行を削除し合計金額を再計算する
 * - 11.18: 明細行が1行のみの場合は削除ボタンを非活性にする
 * - 11.19: Tabキーによるフィールド間の順次移動をサポートする
 * - 11.20: 最終フィールドでTabキーを押すと次の明細行の最初のフィールドへ移動する
 * - 11.21: 金額フィールドは入力不可（読み取り専用）とする
 * - 37.2: 受領見積書登録画面の明細行を sortOrder の昇順で表示する
 * - 37.3: 受領見積書編集画面の明細行を sortOrder の昇順で表示する
 * - 37.6: 行内既存削除ボタンをアクションメニュー内に統合する
 * - 37.7: 「上に移動」操作で隣接要素とスワップして並び順を更新する
 * - 37.8: 「下に移動」操作で隣接要素とスワップして並び順を更新する
 * - 37.12: 並び替え操作はクライアントサイドのみで状態を管理する
 * - 37.15: 行追加時に末尾 sortOrder の次の値を割り当てる
 * - 37.17: 並び替え操作後も Tab 順次移動を表示順序に追従させる
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import { formatQuantity, formatUnitPrice, calculateFormattedAmount } from './number-format';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 明細行フォームデータ
 *
 * design.mdに基づく型定義。
 * quantity/unitPriceは入力用に文字列、amountは自動計算値。
 *
 * 改訂4 (Task 78.1): sortOrder フィールドを追加。
 *   - 0始まりの連続値で並び順を保持する。
 *   - 上下移動・行追加・行削除時には reassignSortOrder で連続性を維持する。
 *   - 表示時は sortBySortOrder で昇順ソートしてからレンダリングする。
 *   Requirements: 37.1, 37.16
 */
export interface LineItemFormData {
  /** クライアントサイド一時ID */
  id: string;
  /** 並び順（0始まり、連続値）。改訂4 (Task 78.1) で追加 */
  sortOrder: number;
  /** 任意分類 */
  customCategory: string;
  /** 工種 */
  workType: string;
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
  'customCategory',
  'workType',
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
 * 改訂4 (Task 78.1): sortOrder 引数を受け取れるように拡張。
 * - design.md「LineItemEditor 改訂4」§Type Changes (4655-4669) に準拠する。
 * - 既存呼び出し箇所との後方互換性のため引数はオプショナル（デフォルト 0）。
 *   実際の運用では handleAddRow / convertToLineItemFormData 等から
 *   明示的な値（末尾 sortOrder + 1 や配列 index 等）が渡される（Task 78.3 / 79.3 で改訂）。
 *
 * @param sortOrder - 並び順（0始まり、連続値）。省略時は 0
 * @returns 空の明細行データ
 */
export function createEmptyLineItem(sortOrder: number = 0): LineItemFormData {
  return {
    id: generateId(),
    sortOrder,
    customCategory: '',
    workType: '',
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
 * sortOrder を 0,1,2,... の連続値に再採番する純粋関数
 *
 * 改訂4 (Task 78.1): design.md「LineItemEditor 改訂4」§Type Changes (4672-4675) に準拠。
 * 上下移動・行追加・行削除後に呼び出して並び順の連続性を維持する。
 *
 * Requirements: 37.16
 *
 * @param items - 明細行データ配列（順序は保持される）
 * @returns sortOrder が 0,1,2,... に再採番された新しい配列（参照は新規）
 */
export function reassignSortOrder(items: LineItemFormData[]): LineItemFormData[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

/**
 * sortOrder 昇順でソートする純粋関数
 *
 * 改訂4 (Task 78.1): design.md「LineItemEditor 改訂4」§Type Changes (4677-4680) に準拠。
 * サーバー応答変換時および表示時に呼び出して表示順を確定する。
 *
 * Requirements: 37.2, 37.3
 *
 * @param items - 明細行データ配列
 * @returns sortOrder 昇順にソートされた新しい配列（入力配列は変更しない）
 */
export function sortBySortOrder(items: LineItemFormData[]): LineItemFormData[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * サーバー応答などで sortOrder が NULL/undefined の明細行を、
 * 配列インデックスから補完する防御的ヘルパー関数
 *
 * 改訂4 (Task 78.1): design.md「LineItemEditor 改訂4」§Implementation Notes (4722) に準拠。
 * 既存データに sort_order が NULL のレコードが残存している場合に備えた
 * フロントエンド側の防御として用意する。
 *
 * 使用想定:
 * - ReceivedQuotationForm.convertToLineItemFormData 等のサーバー応答変換ヘルパー
 *   から呼び出して、sortOrder が欠落している要素にインデックス値を割り当てる。
 *   （実際の組み込みは Task 79.3 で行う）
 *
 * Requirements: 37.16
 *
 * @param items - sortOrder が欠落している可能性がある明細行配列
 * @returns 全要素に有効な sortOrder が設定された新しい配列
 */
export function ensureSortOrders(
  items: Array<Omit<LineItemFormData, 'sortOrder'> & { sortOrder?: number | null }>
): LineItemFormData[] {
  return items.map((item, index) => ({
    ...item,
    sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index,
  }));
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
    padding: '4px 4px',
    fontWeight: 600,
    fontSize: '11px',
    color: '#6b7280',
    textAlign: 'left' as const,
    borderBottom: '2px solid #e5e7eb',
    whiteSpace: 'nowrap' as const,
  },
  thNo: {
    width: '40px',
    textAlign: 'center' as const,
  },
  thCustomCategory: {
    minWidth: '76px',
  },
  thWorkType: {
    minWidth: '88px',
  },
  thName: {
    minWidth: '202px',
  },
  thSpec: {
    minWidth: '202px',
  },
  thUnit: {
    width: '46px',
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
    minWidth: '76px',
  },
  thAction: {
    width: '50px',
    textAlign: 'center' as const,
  },
  td: {
    padding: '2px 2px',
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
    height: '22px',
    padding: '2px 4px',
    borderRadius: '0px',
    border: '1px solid #d1d5db',
    fontSize: '12px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s',
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
  // 表示用ソート（task 78.3 / Req 37.2, 37.3）
  // --------------------------------------------------------------------------
  // design.md 4677-4680, 4719: lineItems は常に sortOrder 順で表示・操作する。
  // render 直前で sortBySortOrder を一度だけ適用し、その結果を表示・各種ハンドラ
  // のインデックス基準として共通利用することで、表示順 (=DOM 順) とデータ順を
  // 一致させる。これにより Req 37.17（並び替え後も Tab 順次移動が表示順序に
  // 追従する）も DOM 順を維持するだけで自然に満たされる。
  const sortedItems = useMemo(() => sortBySortOrder(lineItems), [lineItems]);

  // --------------------------------------------------------------------------
  // 合計金額の計算（useMemo）
  // --------------------------------------------------------------------------

  const totalAmount = useMemo(() => calculateTotalAmount(lineItems), [lineItems]);

  // --------------------------------------------------------------------------
  // 明細行の追加（task 78.3 / Req 37.15）
  // --------------------------------------------------------------------------
  // design.md 4702-4709: 新規行の sortOrder は既存最大値 + 1（空配列時は 0）。

  const handleAddLine = useCallback(() => {
    const nextSortOrder =
      lineItems.length === 0 ? 0 : Math.max(...lineItems.map((item) => item.sortOrder)) + 1;
    const newItems = [...lineItems, createEmptyLineItem(nextSortOrder)];
    onLineItemsChange(newItems);
  }, [lineItems, onLineItemsChange]);

  // --------------------------------------------------------------------------
  // 明細行の削除（task 78.3 / Req 11 AC 17, 37.6）
  // --------------------------------------------------------------------------
  // design.md 4711-4715: 削除後に reassignSortOrder で 0,1,2,... の連続性を維持する。

  const handleDeleteLine = useCallback(
    (id: string) => {
      const filtered = lineItems.filter((item) => item.id !== id);
      onLineItemsChange(reassignSortOrder(filtered));
    },
    [lineItems, onLineItemsChange]
  );

  // --------------------------------------------------------------------------
  // 明細行の上に移動 / 下に移動（task 78.3 / Req 37.7, 37.8）
  // --------------------------------------------------------------------------
  // design.md 4683-4700: 表示順 (sortedItems) における隣接要素とスワップし、
  // reassignSortOrder で 0,1,2,... の連続値に再採番する。
  // rowIndex は表示順インデックス（=sortedItems の index）を受け取る。

  const handleMoveUp = useCallback(
    (rowIndex: number) => {
      if (rowIndex <= 0) return; // 先頭行は無視（Req 37.9 の防御）
      const next = [...sortedItems];
      const prev = next[rowIndex - 1];
      const cur = next[rowIndex];
      if (!prev || !cur) return;
      next[rowIndex - 1] = cur;
      next[rowIndex] = prev;
      onLineItemsChange(reassignSortOrder(next));
    },
    [sortedItems, onLineItemsChange]
  );

  const handleMoveDown = useCallback(
    (rowIndex: number) => {
      if (rowIndex >= sortedItems.length - 1) return; // 末尾行は無視（Req 37.10 の防御）
      const next = [...sortedItems];
      const cur = next[rowIndex];
      const after = next[rowIndex + 1];
      if (!cur || !after) return;
      next[rowIndex] = after;
      next[rowIndex + 1] = cur;
      onLineItemsChange(reassignSortOrder(next));
    },
    [sortedItems, onLineItemsChange]
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
  // 数量・単価フォーカスアウト時のフォーマット (18.7, 18.8)
  // --------------------------------------------------------------------------

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>, id: string, field: keyof LineItemFormData) => {
      const value = e.target.value;

      if (field === 'quantity') {
        const formatted = formatQuantity(value);
        if (formatted !== value) {
          const newItems = lineItems.map((item) => {
            if (item.id !== id) return item;
            const updated = { ...item, quantity: formatted };
            updated.amount = calculateFormattedAmount(formatted, item.unitPrice);
            return updated;
          });
          onLineItemsChange(newItems);
        }
      } else if (field === 'unitPrice') {
        const formatted = formatUnitPrice(value);
        if (formatted !== value) {
          const newItems = lineItems.map((item) => {
            if (item.id !== id) return item;
            const updated = { ...item, unitPrice: formatted };
            updated.amount = calculateFormattedAmount(item.quantity, formatted);
            return updated;
          });
          onLineItemsChange(newItems);
        }
      }
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

      // task 78.3 / Req 37.17: 「次の行」は表示順 (sortedItems) 上の次の行を指す。
      // data-row はソート後インデックスで採番されるため、DOM 順序と整合する。
      if (isLastField && rowIndex < sortedItems.length - 1) {
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
    [sortedItems.length]
  );

  // --------------------------------------------------------------------------
  // レンダリング
  // --------------------------------------------------------------------------

  // task 78.3: 削除可否は表示順上の長さに基づく（=元配列長と等しいが、
  // sortedItems を表示の真とするため統一する）。
  const canDelete = sortedItems.length > 1;

  return (
    <div style={styles.container}>
      <table ref={tableRef} style={styles.table}>
        <thead style={styles.thead}>
          <tr>
            <th scope="col" style={{ ...styles.th, ...styles.thNo }}>
              No
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thCustomCategory }}>
              任意分類
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thWorkType }}>
              工種
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
          {sortedItems.map((item, index) => (
            <tr key={item.id}>
              {/* No */}
              <td style={{ ...styles.td, ...styles.tdNo }}>{index + 1}</td>

              {/* 任意分類 */}
              <td style={styles.td}>
                <input
                  type="text"
                  value={item.customCategory}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'customCategory', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'customCategory')}
                  placeholder="任意分類"
                  disabled={disabled}
                  style={styles.input}
                  data-row={index}
                  data-field="customCategory"
                  aria-label={`行${index + 1} 任意分類`}
                />
              </td>

              {/* 工種 */}
              <td style={styles.td}>
                <input
                  type="text"
                  value={item.workType}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'workType', e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, index, 'workType')}
                  placeholder="工種"
                  disabled={disabled}
                  style={styles.input}
                  data-row={index}
                  data-field="workType"
                  aria-label={`行${index + 1} 工種`}
                />
              </td>

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

              {/* 数量 (18.7: フォーカスアウト時に小数2桁固定フォーマット) */}
              <td style={styles.td}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'quantity', e.target.value)
                  }
                  onBlur={(e) => handleBlur(e, item.id, 'quantity')}
                  onKeyDown={(e) => handleKeyDown(e, index, 'quantity')}
                  placeholder="数量"
                  disabled={disabled}
                  style={{ ...styles.input, ...styles.inputNumber }}
                  data-row={index}
                  data-field="quantity"
                  aria-label={`行${index + 1} 数量`}
                />
              </td>

              {/* 単価 (18.8: フォーカスアウト時に整数丸めフォーマット) */}
              <td style={styles.td}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.unitPrice}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(item.id, 'unitPrice', e.target.value)
                  }
                  onBlur={(e) => handleBlur(e, item.id, 'unitPrice')}
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

              {/* 操作（アクションメニュー） - task 78.3 / Req 37.4-37.6 */}
              {/* design.md 4724: 既存の行内削除ボタンと同じ列（行末）に配置し、列幅は変更しない。
                  Req 11 AC 19（1 行のみのとき削除を非活性化）の責務は LineItemEditor 側で扱い、
                  deleteDisabled を介してメニュー内の削除項目を非活性化する。 */}
              <td style={{ ...styles.td, ...styles.tdAction }}>
                <LineItemActionMenu
                  isFirst={index === 0}
                  isLast={index === sortedItems.length - 1}
                  isOnly={sortedItems.length === 1}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  onDelete={() => handleDeleteLine(item.id)}
                  disabled={disabled}
                  deleteDisabled={!canDelete}
                  ariaLabel={`行${index + 1}の操作メニュー`}
                />
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

// ============================================================================
// LineItemActionMenu サブコンポーネント
// ============================================================================
// design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」(4559-4609)
// および design.md「Components and Interfaces - 改訂」(4375) に基づき、
// 同ファイル内のサブコンポーネントとして定義する。
//
// Requirements: 37.4, 37.5, 37.9, 37.10, 37.11
// Task: 78.2

/**
 * 明細行アクションメニューの Props
 *
 * design.md「LineItemActionMenu §Component Interface」(4582-4598) に準拠。
 *
 * 注: design.md 4588-4589 の `isOnly` コメントには「上下と削除を非活性にする」
 * とあるが、Req 11 AC 19（行が1行のみのとき削除ボタンを非活性化する）の
 * 責務は LineItemEditor 側で扱い、本コンポーネントは isOnly=true 時に
 * 「上に移動」「下に移動」のみを非活性化する（task 78.2 指示書および
 * design.md 4375 の Req Coverage 37.4-37.5, 37.9-37.11 と整合）。
 */
export interface LineItemActionMenuProps {
  /** 該当行が先頭行かどうか（上に移動を非活性にする） */
  isFirst: boolean;
  /** 該当行が末尾行かどうか（下に移動を非活性にする） */
  isLast: boolean;
  /** 明細行が1行のみかどうか（上に移動・下に移動の両方を非活性にする） */
  isOnly: boolean;
  /** 上に移動コールバック */
  onMoveUp: () => void;
  /** 下に移動コールバック */
  onMoveDown: () => void;
  /** 削除コールバック */
  onDelete: () => void;
  /** メニュー全体の非活性化（保存中・再認証中などに使用） */
  disabled?: boolean;
  /**
   * 削除メニュー項目のみを個別に非活性化するフラグ
   *
   * task 78.3: Req 11 AC 19（行が1行のみのとき削除を非活性化）の責務は
   * LineItemEditor 側で扱う。LineItemEditor は `isOnly` 時に
   * `deleteDisabled={true}` を渡すことで本コンポーネントの削除項目を
   * disabled 表示にする。`disabled` (全体) と独立して制御できる点が要点。
   */
  deleteDisabled?: boolean;
  /** トグルボタンに付与する追加 aria-label（行番号などを補強する用途） */
  ariaLabel?: string;
}

// LineItemActionMenu 専用スタイル
const actionMenuStyles = {
  container: {
    position: 'relative' as const,
    display: 'inline-block',
  },
  toggleButton: {
    width: '24px',
    height: '24px',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    lineHeight: 1,
    color: '#374151',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
  },
  toggleButtonDisabled: {
    color: '#d1d5db',
    cursor: 'not-allowed',
  },
  panel: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: '2px',
    minWidth: '120px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
    padding: '4px 0',
    zIndex: 10,
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    fontSize: '13px',
    color: '#1f2937',
    backgroundColor: 'transparent',
    border: 'none',
    textAlign: 'left' as const,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'background-color 0.1s',
  },
  menuItemDisabled: {
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  menuItemDelete: {
    color: '#dc2626',
  },
};

/**
 * 明細行アクションメニュー
 *
 * design.md 4559-4609 に基づき、明細行ごとに「上に移動」「下に移動」「削除」
 * を集約したポップオーバー型のアクションメニューを提供する。
 *
 * 主な責務:
 * - 縦三点リーダー (⋮) のトグルボタンと、クリックで開閉するメニューパネルの提供
 * - 外側クリック・Escape キーでのメニュー自動クローズ
 * - メニュー展開時に最初の有効項目へフォーカスを移動
 * - Escape クローズ時にトグルボタンへフォーカスを戻す
 * - isFirst/isLast/isOnly フラグによる上下移動の非活性化
 *
 * @example
 * ```tsx
 * <LineItemActionMenu
 *   isFirst={index === 0}
 *   isLast={index === items.length - 1}
 *   isOnly={items.length === 1}
 *   onMoveUp={() => handleMoveUp(index)}
 *   onMoveDown={() => handleMoveDown(index)}
 *   onDelete={() => handleDelete(item.id)}
 *   disabled={isSaving}
 * />
 * ```
 */
export function LineItemActionMenu({
  isFirst,
  isLast,
  isOnly,
  onMoveUp,
  onMoveDown,
  onDelete,
  disabled = false,
  deleteDisabled: deleteDisabledProp = false,
  ariaLabel,
}: LineItemActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moveUpRef = useRef<HTMLButtonElement>(null);
  const moveDownRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  // disabled 状態の判定（design.md 4571: isFirst/isLast/isOnly による上下移動の非活性）
  const moveUpDisabled = disabled || isFirst || isOnly;
  const moveDownDisabled = disabled || isLast || isOnly;
  // task 78.3: 削除メニュー項目は親（LineItemEditor）から渡される
  // deleteDisabled prop と全体 disabled の OR で確定する。
  const deleteDisabled = disabled || deleteDisabledProp;

  // メニューを閉じてトグルボタンへフォーカスを戻す（Escape クローズ時）
  const closeMenuAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    // 次のレンダリング後にフォーカスを戻す
    requestAnimationFrame(() => {
      toggleRef.current?.focus();
    });
  }, []);

  // トグルボタンクリック
  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  // メニュー外クリックでクローズ（design.md 4606: document level click listener）
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [isOpen]);

  // Escape キーでクローズしてトグルボタンへフォーカスを戻す（design.md 4609）
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeMenuAndRestoreFocus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeMenuAndRestoreFocus]);

  // メニュー展開時に最初の有効項目にフォーカス（design.md 4609）
  useEffect(() => {
    if (!isOpen) return;
    // 上→下→削除の順で最初に活性な項目にフォーカス
    const firstEnabled =
      (!moveUpDisabled && moveUpRef.current) ||
      (!moveDownDisabled && moveDownRef.current) ||
      (!deleteDisabled && deleteRef.current) ||
      null;
    if (firstEnabled) {
      // useEffect 内なので DOM 反映済み。requestAnimationFrame で 1 フレーム待ってからフォーカスする
      requestAnimationFrame(() => {
        firstEnabled.focus();
      });
    }
  }, [isOpen, moveUpDisabled, moveDownDisabled, deleteDisabled]);

  // メニュー項目クリックハンドラ（コールバック実行 → メニュー閉じる）
  const handleMenuItemClick = useCallback((callback: () => void) => {
    callback();
    setIsOpen(false);
  }, []);

  return (
    <div ref={containerRef} style={actionMenuStyles.container}>
      <button
        ref={toggleRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel ?? '操作メニュー'}
        style={{
          ...actionMenuStyles.toggleButton,
          ...(disabled ? actionMenuStyles.toggleButtonDisabled : {}),
        }}
      >
        {/* 縦三点リーダー（⋮） */}
        <span aria-hidden="true">&#x22EE;</span>
      </button>

      {isOpen && (
        <div role="menu" style={actionMenuStyles.panel}>
          <button
            ref={moveUpRef}
            type="button"
            role="menuitem"
            disabled={moveUpDisabled}
            onClick={() => handleMenuItemClick(onMoveUp)}
            style={{
              ...actionMenuStyles.menuItem,
              ...(moveUpDisabled ? actionMenuStyles.menuItemDisabled : {}),
            }}
          >
            上に移動
          </button>
          <button
            ref={moveDownRef}
            type="button"
            role="menuitem"
            disabled={moveDownDisabled}
            onClick={() => handleMenuItemClick(onMoveDown)}
            style={{
              ...actionMenuStyles.menuItem,
              ...(moveDownDisabled ? actionMenuStyles.menuItemDisabled : {}),
            }}
          >
            下に移動
          </button>
          <button
            ref={deleteRef}
            type="button"
            role="menuitem"
            disabled={deleteDisabled}
            onClick={() => handleMenuItemClick(onDelete)}
            style={{
              ...actionMenuStyles.menuItem,
              ...actionMenuStyles.menuItemDelete,
              ...(deleteDisabled ? actionMenuStyles.menuItemDisabled : {}),
            }}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

export default LineItemEditor;
