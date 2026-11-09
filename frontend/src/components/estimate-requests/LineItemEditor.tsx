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
 *
 * Task 117.2（design.md の章「Requirements 43-50」の D5・D11）:
 * 区分・分類キー・参考の列、行の操作の「詳細」で開く欄（条件・換算・参考の理由・数量表の行のキー）、
 * 区分ごとの小計と別途を除く合計、単価が空の行の金額の直接入力、行ごとの検証のエラーの表示を足した
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import { formatQuantity, formatUnitPrice, calculateFormattedAmount } from './number-format';
import { LINE_ITEM_CATEGORIES, type LineItemCategory } from '../../api/received-quotations';

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
export interface LineItemLedgerFormData {
  /** 区分（既定は DIRECT＝直接工事） */
  category: LineItemCategory;
  /** その行にだけ当てはまる条件（500 文字まで） */
  condition: string;
  /** 換算の数量（入力用文字列） */
  conversionQuantity: string;
  /** 換算の単位（50 文字まで） */
  conversionUnit: string;
  /** 換算の単価（入力用文字列。欄を離れると整数へ丸める） */
  conversionUnitPrice: string;
  /** 換算の根拠（500 文字まで） */
  conversionBasis: string;
  /** 工事内容の分類キー（50 文字まで。体系の検査はしない） */
  classificationKey: string;
  /** 数量表の行のキー（画面では読むだけ） */
  quantityRowKey: string;
  /** 参考の印 */
  isReference: boolean;
  /** 参考の理由（200 文字まで） */
  referenceReason: string;
}

/**
 * 明細行フォームデータ
 *
 * Task 117.2: 台帳の項目（`LineItemLedgerFormData`）は省略できる。省略した項目は
 * `getLineItemLedgerFields` が既定（区分は直接工事、文字は空、参考の印は無）として読む。
 * 新しく作る行（`createEmptyLineItem`・取り込み・転記）は `createLineItemLedgerDefaults` で明示して持つ。
 */
export interface LineItemFormData extends Partial<LineItemLedgerFormData> {
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
  /**
   * 明細行ごとの検証のエラー（行の ID → 文言の並び）。行の下に表示する
   * （Task 117.2。文言はフォームが検証の結果から渡す）
   */
  lineItemErrors?: Readonly<Record<string, readonly string[]>>;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * 入力フィールドの順序（Tabキー移動用）
 * 金額フィールドは単価が空の行でだけ入力欄になる（Task 117.2）
 */
const FIELD_ORDER: (keyof LineItemFormData)[] = [
  'category',
  'customCategory',
  'workType',
  'name',
  'specification',
  'unit',
  'quantity',
  'unitPrice',
  'amount',
  'classificationKey',
  'isReference',
  'remarks',
];

/** 区分の表示名（design.md の Data Models の ReceivedQuotationLineItem の category） */
export const LINE_ITEM_CATEGORY_LABELS: Readonly<Record<LineItemCategory, string>> = {
  DIRECT: '直接工事',
  OVERHEAD: '諸経費',
  TRAVEL: '交通費',
  WASTE: '産廃',
  DISCOUNT: '値引き',
  LEGAL_WELFARE: '法定福利費',
  EXCLUDED: '別途',
};

/** 明細行の文字の欄の上限（design.md の Data Models の長さ） */
export const LINE_ITEM_FIELD_MAX_LENGTHS = {
  condition: 500,
  conversionUnit: 50,
  conversionBasis: 500,
  classificationKey: 50,
  referenceReason: 200,
} as const;

/** 表の列の数（行の詳細・行のエラーの欄の colSpan） */
const COLUMN_COUNT = 14;

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
  // Task 117.2: 区分が別途（EXCLUDED）の行は合計に入れない（D5）
  return items.reduce(
    (sum, item) => (item.category === 'EXCLUDED' ? sum : sum + (item.amount ?? 0)),
    0
  );
}

/**
 * 区分ごとの金額の小計を求める（Task 117.2）
 *
 * 区分の項目を持たない行は直接工事として数える。
 *
 * @param items - 明細行データ配列
 * @returns 7 つの区分それぞれの金額の和
 */
export function calculateCategorySubtotals(
  items: LineItemFormData[]
): Record<LineItemCategory, number> {
  const subtotals = Object.fromEntries(LINE_ITEM_CATEGORIES.map((c) => [c, 0])) as Record<
    LineItemCategory,
    number
  >;
  for (const item of items) {
    const category = item.category ?? 'DIRECT';
    subtotals[category] += item.amount ?? 0;
  }
  return subtotals;
}

/**
 * 台帳の項目の既定値を作る（Task 117.2）
 *
 * 新しい行・OCR やデータパースの取り込みの行・項目選択からの転記の行に使う。
 * 区分は直接工事、分類キーと数量表の行のキーは空、参考の印は無。
 */
export function createLineItemLedgerDefaults(): LineItemLedgerFormData {
  return {
    category: 'DIRECT',
    condition: '',
    conversionQuantity: '',
    conversionUnit: '',
    conversionUnitPrice: '',
    conversionBasis: '',
    classificationKey: '',
    quantityRowKey: '',
    isReference: false,
    referenceReason: '',
  };
}

/**
 * 行の台帳の項目を、省略された項目を既定で補って読む（Task 117.2）
 */
export function getLineItemLedgerFields(item: LineItemFormData): LineItemLedgerFormData {
  const defaults = createLineItemLedgerDefaults();
  return {
    category: item.category ?? defaults.category,
    condition: item.condition ?? defaults.condition,
    conversionQuantity: item.conversionQuantity ?? defaults.conversionQuantity,
    conversionUnit: item.conversionUnit ?? defaults.conversionUnit,
    conversionUnitPrice: item.conversionUnitPrice ?? defaults.conversionUnitPrice,
    conversionBasis: item.conversionBasis ?? defaults.conversionBasis,
    classificationKey: item.classificationKey ?? defaults.classificationKey,
    quantityRowKey: item.quantityRowKey ?? defaults.quantityRowKey,
    isReference: item.isReference ?? defaults.isReference,
    referenceReason: item.referenceReason ?? defaults.referenceReason,
  };
}

/** 単価が空か（空の行は金額を直接入力できる。45.11） */
function isUnitPriceEmpty(unitPrice: string): boolean {
  return unitPrice.trim() === '';
}

/**
 * 空の明細行を生成する
 *
 * 改訂4 (Task 78.1): sortOrder 引数を受け取れるように拡張。
 * - design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §Type Changes に準拠する。
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
    ...createLineItemLedgerDefaults(),
  };
}

/**
 * sortOrder を 0,1,2,... の連続値に再採番する純粋関数
 *
 * 改訂4 (Task 78.1): design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §Type Changes（`reassignSortOrder`）に準拠。
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
 * 改訂4 (Task 78.1): design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §Type Changes（`sortBySortOrder`）に準拠。
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
 * 改訂4 (Task 78.1): design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §Implementation Notes にある
 * Migration（sortOrder が NULL のレコードを配列インデックス順に補完する）に準拠。
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
  thCategory: {
    width: '84px',
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
  thClassificationKey: {
    minWidth: '88px',
  },
  thReference: {
    width: '36px',
    textAlign: 'center' as const,
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
  tdReference: {
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
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  },
  inputNumber: {
    textAlign: 'right' as const,
  },
  inputReadOnly: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
  },
  select: {
    width: '100%',
    height: '22px',
    padding: '0 2px',
    borderRadius: '0px',
    border: '1px solid #d1d5db',
    fontSize: '12px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
  },
  errorCell: {
    padding: '2px 8px 6px 48px',
    borderBottom: '1px solid #e5e7eb',
  },
  errorList: {
    margin: 0,
    paddingLeft: '16px',
    fontSize: '12px',
    color: '#b91c1c',
  },
  detailCell: {
    padding: '6px 8px 8px 48px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '8px 16px',
    alignItems: 'start',
  },
  detailFieldWide: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  detailFieldset: {
    margin: 0,
    padding: 0,
    border: 'none',
    minWidth: 0,
  },
  detailLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#4b5563',
    padding: 0,
    marginBottom: '2px',
  },
  detailHint: {
    fontSize: '11px',
    color: '#4b5563',
  },
  conversionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 2fr',
    gap: '4px',
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
  footerTotals: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: '4px',
  },
  subtotalList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end',
    gap: '4px 12px',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  subtotalItem: {
    display: 'inline-flex',
    gap: '4px',
    fontSize: '12px',
  },
  subtotalLabel: {
    color: '#4b5563',
  },
  subtotalAmount: {
    color: '#1f2937',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  totalNote: {
    fontSize: '12px',
    color: '#4b5563',
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
  lineItemErrors,
}: LineItemEditorProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const idPrefix = useId();

  // Task 117.2: 行の詳細の欄を開いている行の ID（行の操作の「詳細」で開閉する。D11）
  const [expandedDetailIds, setExpandedDetailIds] = useState<ReadonlySet<string>>(() => new Set());

  // --------------------------------------------------------------------------
  // 表示用ソート（task 78.3 / Req 37.2, 37.3）
  // --------------------------------------------------------------------------
  // design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §Type Changes（`sortBySortOrder`）と
  // §Implementation Notes（Integration）: lineItems は常に sortOrder 順で表示・操作する。
  // render 直前で sortBySortOrder を一度だけ適用し、その結果を表示・各種ハンドラ
  // のインデックス基準として共通利用することで、表示順 (=DOM 順) とデータ順を
  // 一致させる。これにより Req 37.17（並び替え後も Tab 順次移動が表示順序に
  // 追従する）も DOM 順を維持するだけで自然に満たされる。
  const sortedItems = useMemo(() => sortBySortOrder(lineItems), [lineItems]);

  // --------------------------------------------------------------------------
  // 合計金額（別途を除く）と区分ごとの小計の計算（useMemo）
  // --------------------------------------------------------------------------

  const totalAmount = useMemo(() => calculateTotalAmount(lineItems), [lineItems]);
  const categorySubtotals = useMemo(() => calculateCategorySubtotals(lineItems), [lineItems]);

  // --------------------------------------------------------------------------
  // 明細行の追加（task 78.3 / Req 37.15）
  // --------------------------------------------------------------------------
  // design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §並び替え操作:
  // 新規行の sortOrder は既存最大値 + 1（空配列時は 0）。

  const handleAddLine = useCallback(() => {
    const nextSortOrder =
      lineItems.length === 0 ? 0 : Math.max(...lineItems.map((item) => item.sortOrder)) + 1;
    const newItems = [...lineItems, createEmptyLineItem(nextSortOrder)];
    onLineItemsChange(newItems);
  }, [lineItems, onLineItemsChange]);

  // --------------------------------------------------------------------------
  // 明細行の削除（task 78.3 / Req 11 AC 17, 37.6）
  // --------------------------------------------------------------------------
  // design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §並び替え操作:
  // 削除後に reassignSortOrder で 0,1,2,... の連続性を維持する。

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
  // design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §並び替え操作:
  // 表示順 (sortedItems) における隣接要素とスワップし、
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
  // 行の詳細の開閉（Task 117.2 / D11）
  // --------------------------------------------------------------------------
  // 開いたら条件の欄へフォーカスを移す（メニューの項目は閉じると消えるため）。
  // 閉じたら行の操作メニューのトグルへフォーカスを戻す。

  const handleToggleDetail = useCallback(
    (id: string, rowIndex: number) => {
      const opening = !expandedDetailIds.has(id);
      const next = new Set(expandedDetailIds);
      if (opening) {
        next.add(id);
      } else {
        next.delete(id);
      }
      setExpandedDetailIds(next);
      requestAnimationFrame(() => {
        const selector = opening
          ? `[data-row="${rowIndex}"][data-field="condition"]`
          : `[data-row="${rowIndex}"][data-action-menu-toggle]`;
        tableRef.current?.querySelector<HTMLElement>(selector)?.focus();
      });
    },
    [expandedDetailIds]
  );

  // --------------------------------------------------------------------------
  // フィールド値の変更
  // --------------------------------------------------------------------------

  const handleFieldChange = useCallback(
    (id: string, field: keyof LineItemFormData, value: string) => {
      const newItems = lineItems.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // 数量または単価が変更された場合は金額を再計算（11.11・11.12）。
        // Task 117.2: 単価が空の行で数量だけを変えたときは、直接入力した金額を保つ（45.11）
        if (field === 'unitPrice' || (field === 'quantity' && !isUnitPriceEmpty(item.unitPrice))) {
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

  // Task 117.2: 区分・参考の印・直接入力の金額の変更（文字以外の値）
  const handleItemPatch = useCallback(
    (id: string, patch: Partial<LineItemFormData>) => {
      onLineItemsChange(lineItems.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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
            // Task 117.2: 単価が空の行は直接入力した金額を保つ（45.11）
            if (!isUnitPriceEmpty(item.unitPrice)) {
              updated.amount = calculateFormattedAmount(formatted, item.unitPrice);
            }
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
      } else if (field === 'conversionUnitPrice') {
        // Task 117.2: 換算の単価にも単価の表示形式と丸め規則を適用する（45.10）
        const formatted = formatUnitPrice(value);
        if (formatted !== value) {
          handleItemPatch(id, { conversionUnitPrice: formatted });
        }
      }
    },
    [lineItems, onLineItemsChange, handleItemPatch]
  );

  // --------------------------------------------------------------------------
  // Tabキーフォーカス移動（最終フィールド→次の行の最初のフィールド）
  // --------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (
      e: KeyboardEvent<HTMLElement>,
      rowIndex: number,
      fieldName: keyof LineItemFormData,
      detailOpen = false
    ) => {
      if (e.key !== 'Tab' || e.shiftKey) return;

      // 現在のフィールドが行の最終フィールド（備考）であるか確認
      const isLastField = fieldName === FIELD_ORDER[FIELD_ORDER.length - 1];

      // Task 117.2: 行の詳細を開いている行は、既定の順（操作メニュー → 詳細の欄）に任せる
      if (detailOpen) return;

      // task 78.3 / Req 37.17: 「次の行」は表示順 (sortedItems) 上の次の行を指す。
      // data-row はソート後インデックスで採番されるため、DOM 順序と整合する。
      if (isLastField && rowIndex < sortedItems.length - 1) {
        // 次の行が存在する場合、次の行の最初のフィールドにフォーカス
        e.preventDefault();
        const nextRowIndex = rowIndex + 1;
        const firstFieldName = FIELD_ORDER[0];
        const nextInput = tableRef.current?.querySelector<HTMLElement>(
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
            <th scope="col" style={{ ...styles.th, ...styles.thCategory }}>
              区分
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
            <th scope="col" style={{ ...styles.th, ...styles.thClassificationKey }}>
              分類キー
            </th>
            <th scope="col" style={{ ...styles.th, ...styles.thReference }}>
              参考
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
          {sortedItems.map((item, index) => {
            const ledger = getLineItemLedgerFields(item);
            const rowNumber = index + 1;
            const detailOpen = expandedDetailIds.has(item.id);
            const detailId = `${idPrefix}-line-item-detail-${index}`;
            const reasonHintId = `${idPrefix}-line-item-reason-hint-${index}`;
            const errors = lineItemErrors?.[item.id] ?? [];
            const amountEditable = isUnitPriceEmpty(item.unitPrice);

            return (
              <Fragment key={item.id}>
                <tr>
                  {/* No */}
                  <td style={{ ...styles.td, ...styles.tdNo }}>{rowNumber}</td>

                  {/* 区分（Task 117.2 / 45.2。既定は直接工事） */}
                  <td style={styles.td}>
                    <select
                      value={ledger.category}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        handleItemPatch(item.id, {
                          category: e.target.value as LineItemCategory,
                        })
                      }
                      onKeyDown={(e) => handleKeyDown(e, index, 'category')}
                      disabled={disabled}
                      style={styles.select}
                      data-row={index}
                      data-field="category"
                      aria-label={`行${rowNumber} 区分`}
                    >
                      {LINE_ITEM_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {LINE_ITEM_CATEGORY_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  </td>

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
                      aria-label={`行${rowNumber} 任意分類`}
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
                      aria-label={`行${rowNumber} 工種`}
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
                      aria-label={`行${rowNumber} 名称`}
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
                      aria-label={`行${rowNumber} 規格`}
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
                      aria-label={`行${rowNumber} 単位`}
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
                      aria-label={`行${rowNumber} 数量`}
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
                      aria-label={`行${rowNumber} 単価`}
                    />
                  </td>

                  {/* 金額: 単価がある行は自動計算の表示（11.11）、単価が空の行は直接入力（45.11） */}
                  <td
                    style={{
                      ...styles.td,
                      ...(amountEditable ? {} : styles.tdAmount),
                    }}
                    data-testid="line-item-amount"
                  >
                    {amountEditable ? (
                      <DirectAmountInput
                        amount={item.amount}
                        onAmountChange={(amount) => handleItemPatch(item.id, { amount })}
                        onKeyDown={(e) => handleKeyDown(e, index, 'amount')}
                        disabled={disabled}
                        rowIndex={index}
                        ariaLabel={`行${rowNumber} 金額`}
                      />
                    ) : item.amount !== null ? (
                      formatNumber(item.amount)
                    ) : (
                      ''
                    )}
                  </td>

                  {/* 分類キー（Task 117.2 / 47.2。入力のまま保持し体系は検査しない） */}
                  <td style={styles.td}>
                    <input
                      type="text"
                      value={ledger.classificationKey}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        handleFieldChange(item.id, 'classificationKey', e.target.value)
                      }
                      onKeyDown={(e) => handleKeyDown(e, index, 'classificationKey')}
                      placeholder="分類キー"
                      maxLength={LINE_ITEM_FIELD_MAX_LENGTHS.classificationKey}
                      disabled={disabled}
                      style={styles.input}
                      data-row={index}
                      data-field="classificationKey"
                      aria-label={`行${rowNumber} 分類キー`}
                    />
                  </td>

                  {/* 参考の印（Task 117.2 / 46.4） */}
                  <td style={{ ...styles.td, ...styles.tdReference }}>
                    <input
                      type="checkbox"
                      checked={ledger.isReference}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        handleItemPatch(item.id, { isReference: e.target.checked })
                      }
                      onKeyDown={(e) => handleKeyDown(e, index, 'isReference')}
                      disabled={disabled}
                      data-row={index}
                      data-field="isReference"
                      aria-label={`行${rowNumber} 参考`}
                    />
                  </td>

                  {/* 備考 */}
                  <td style={styles.td}>
                    <input
                      type="text"
                      value={item.remarks}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        handleFieldChange(item.id, 'remarks', e.target.value)
                      }
                      onKeyDown={(e) => handleKeyDown(e, index, 'remarks', detailOpen)}
                      placeholder="備考"
                      disabled={disabled}
                      style={styles.input}
                      data-row={index}
                      data-field="remarks"
                      aria-label={`行${rowNumber} 備考`}
                    />
                  </td>

                  {/* 操作（アクションメニュー） - task 78.3 / Req 37.4-37.6 */}
                  {/* design.md「LineItemEditor - 改訂4（並び順保持・並び替え・アクションメニュー集約）」の §Implementation Notes（Visual）:
                      既存の行内削除ボタンと同じ列（行末）に配置し、列幅は変更しない。
                      Req 11 AC 19（1 行のみのとき削除を非活性化）の責務は LineItemEditor 側で扱い、
                      deleteDisabled を介してメニュー内の削除項目を非活性化する。
                      Task 117.2: メニューに「詳細」を足し、行の下の欄を開閉する（D11） */}
                  <td style={{ ...styles.td, ...styles.tdAction }}>
                    <LineItemActionMenu
                      isFirst={index === 0}
                      isLast={index === sortedItems.length - 1}
                      isOnly={sortedItems.length === 1}
                      onMoveUp={() => handleMoveUp(index)}
                      onMoveDown={() => handleMoveDown(index)}
                      onDelete={() => handleDeleteLine(item.id)}
                      onToggleDetail={() => handleToggleDetail(item.id, index)}
                      detailExpanded={detailOpen}
                      detailControlsId={detailId}
                      rowIndex={index}
                      disabled={disabled}
                      deleteDisabled={!canDelete}
                      ariaLabel={`行${rowNumber}の操作メニュー`}
                    />
                  </td>
                </tr>

                {/* 行ごとの検証のエラー（Task 117.2 / D11: 行の下に出す） */}
                {errors.length > 0 && (
                  <tr>
                    <td colSpan={COLUMN_COUNT} style={styles.errorCell} aria-live="polite">
                      <ul
                        role="list"
                        aria-label={`行${rowNumber}のエラー`}
                        style={styles.errorList}
                        data-testid={`line-item-errors-${index}`}
                      >
                        {errors.map((message, errorIndex) => (
                          <li key={`${errorIndex}-${message}`}>{message}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}

                {/* 行の詳細（Task 117.2 / D11: 条件・換算・参考の理由・数量表の行のキー） */}
                {detailOpen && (
                  <tr>
                    <td colSpan={COLUMN_COUNT} style={styles.detailCell}>
                      <div
                        id={detailId}
                        role="group"
                        aria-label={`行${rowNumber}の詳細`}
                        style={styles.detailGrid}
                        data-testid={`line-item-detail-${index}`}
                      >
                        <label style={styles.detailFieldWide}>
                          <span style={styles.detailLabel}>条件</span>
                          <input
                            type="text"
                            value={ledger.condition}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              handleFieldChange(item.id, 'condition', e.target.value)
                            }
                            maxLength={LINE_ITEM_FIELD_MAX_LENGTHS.condition}
                            placeholder="例: 夜間、棟別"
                            disabled={disabled}
                            style={styles.input}
                            data-row={index}
                            data-field="condition"
                            aria-label={`行${rowNumber} 条件`}
                          />
                        </label>

                        <fieldset style={styles.detailFieldset}>
                          <legend style={styles.detailLabel}>換算</legend>
                          <div style={styles.conversionGrid}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={ledger.conversionQuantity}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                handleFieldChange(item.id, 'conversionQuantity', e.target.value)
                              }
                              placeholder="換算の数量"
                              disabled={disabled}
                              style={{ ...styles.input, ...styles.inputNumber }}
                              data-row={index}
                              data-field="conversionQuantity"
                              aria-label={`行${rowNumber} 換算の数量`}
                            />
                            <input
                              type="text"
                              value={ledger.conversionUnit}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                handleFieldChange(item.id, 'conversionUnit', e.target.value)
                              }
                              maxLength={LINE_ITEM_FIELD_MAX_LENGTHS.conversionUnit}
                              placeholder="換算の単位"
                              disabled={disabled}
                              style={styles.input}
                              data-row={index}
                              data-field="conversionUnit"
                              aria-label={`行${rowNumber} 換算の単位`}
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              value={ledger.conversionUnitPrice}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                handleFieldChange(item.id, 'conversionUnitPrice', e.target.value)
                              }
                              onBlur={(e) => handleBlur(e, item.id, 'conversionUnitPrice')}
                              placeholder="換算の単価"
                              disabled={disabled}
                              style={{ ...styles.input, ...styles.inputNumber }}
                              data-row={index}
                              data-field="conversionUnitPrice"
                              aria-label={`行${rowNumber} 換算の単価`}
                            />
                            <input
                              type="text"
                              value={ledger.conversionBasis}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                handleFieldChange(item.id, 'conversionBasis', e.target.value)
                              }
                              maxLength={LINE_ITEM_FIELD_MAX_LENGTHS.conversionBasis}
                              placeholder="換算の根拠"
                              disabled={disabled}
                              style={styles.input}
                              data-row={index}
                              data-field="conversionBasis"
                              aria-label={`行${rowNumber} 換算の根拠`}
                            />
                          </div>
                        </fieldset>

                        <label style={styles.detailFieldWide}>
                          <span style={styles.detailLabel}>参考の理由</span>
                          <input
                            type="text"
                            value={ledger.referenceReason}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              handleFieldChange(item.id, 'referenceReason', e.target.value)
                            }
                            maxLength={LINE_ITEM_FIELD_MAX_LENGTHS.referenceReason}
                            disabled={disabled}
                            style={styles.input}
                            data-row={index}
                            data-field="referenceReason"
                            aria-label={`行${rowNumber} 参考の理由`}
                            aria-describedby={reasonHintId}
                          />
                          <span id={reasonHintId} style={styles.detailHint}>
                            {ledger.isReference
                              ? '参考にした理由を入力します'
                              : '参考の印を付けた行に入力します'}
                          </span>
                        </label>

                        <label style={styles.detailFieldWide}>
                          <span style={styles.detailLabel}>数量表の行のキー</span>
                          <input
                            type="text"
                            value={ledger.quantityRowKey}
                            readOnly
                            disabled={disabled}
                            style={{ ...styles.input, ...styles.inputReadOnly }}
                            data-row={index}
                            data-field="quantityRowKey"
                            aria-label={`行${rowNumber} 数量表の行のキー`}
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* フッター: 追加ボタン、区分ごとの小計、別途を除く合計 */}
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

        <div style={styles.footerTotals}>
          {/* 区分ごとの小計（Task 117.2 / 45.6） */}
          <ul role="list" aria-label="区分ごとの小計" style={styles.subtotalList}>
            {LINE_ITEM_CATEGORIES.map((category) => (
              <li key={category} style={styles.subtotalItem}>
                <span style={styles.subtotalLabel}>{LINE_ITEM_CATEGORY_LABELS[category]}</span>
                <span style={styles.subtotalAmount} data-testid={`category-subtotal-${category}`}>
                  {formatNumber(categorySubtotals[category])}
                </span>
              </li>
            ))}
          </ul>

          {/* 合計は別途の行を除く（11.13・45.5） */}
          <div style={styles.totalRow}>
            <span style={styles.totalLabel}>合計</span>
            <span style={styles.totalNote}>（別途を除く）</span>
            <span style={styles.totalAmount} data-testid="total-amount">
              {formatNumber(totalAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DirectAmountInput サブコンポーネント（Task 117.2 / 45.11）
// ============================================================================

interface DirectAmountInputProps {
  amount: number | null;
  onAmountChange: (amount: number | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
  rowIndex: number;
  ariaLabel: string;
}

/**
 * 単価が空の行の金額の入力欄
 *
 * 入力中の文字（「-」など数にならない途中の文字を含む）は欄の中だけで保ち、
 * 数として読めた値を整数へ丸めて行の金額にする（18.9 と同じ Math.round）。
 * 空にすれば金額を null にする。欄を離れたら行の金額の表示へ戻す。
 */
function DirectAmountInput({
  amount,
  onAmountChange,
  onKeyDown,
  disabled,
  rowIndex,
  ariaLabel,
}: DirectAmountInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (amount !== null ? String(amount) : '');

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(value);
    const trimmed = value.trim();
    if (trimmed === '') {
      onAmountChange(null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      onAmountChange(Math.round(parsed));
    }
  };

  return (
    <input
      type="text"
      value={shown}
      onChange={handleChange}
      onBlur={() => setDraft(null)}
      onKeyDown={onKeyDown}
      placeholder="金額"
      disabled={disabled}
      style={{ ...styles.input, ...styles.inputNumber }}
      data-row={rowIndex}
      data-field="amount"
      aria-label={ariaLabel}
    />
  );
}

// ============================================================================
// LineItemActionMenu サブコンポーネント
// ============================================================================
// design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」および
// design.md「Components and Interfaces - 改訂（Requirements 36-38）」の部品表に基づき、
// 同ファイル内のサブコンポーネントとして定義する。
//
// Requirements: 37.4, 37.5, 37.9, 37.10, 37.11
// Task: 78.2

/**
 * 明細行アクションメニューの Props
 *
 * design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」の §Component Interface に準拠。
 *
 * 注: design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」の §Component Interface にある
 * `isOnly` のコメントには「上下と削除を非活性にする」
 * とあるが、Req 11 AC 19（行が1行のみのとき削除ボタンを非活性化する）の
 * 責務は LineItemEditor 側で扱い、本コンポーネントは isOnly=true 時に
 * 「上に移動」「下に移動」のみを非活性化する（task 78.2 指示書および
 * design.md「Components and Interfaces - 改訂（Requirements 36-38）」の部品表が
 * LineItemActionMenu に与える Req Coverage 37.4-37.5, 37.9-37.11 と整合）。
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
  /**
   * 行の詳細の開閉（Task 117.2 / D11）。渡したときだけメニューに「詳細」を出す
   */
  onToggleDetail?: () => void;
  /** 行の詳細を開いているか（「詳細」の aria-expanded） */
  detailExpanded?: boolean;
  /** 行の詳細の欄の ID（「詳細」の aria-controls） */
  detailControlsId?: string;
  /** 表示順の行の番号（0 始まり）。トグルの data-row に入れ、詳細を閉じたときのフォーカスの戻り先にする */
  rowIndex?: number;
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
 * design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」に基づき、明細行ごとに「上に移動」「下に移動」「削除」
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
  onToggleDetail,
  detailExpanded = false,
  detailControlsId,
  rowIndex,
}: LineItemActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moveUpRef = useRef<HTMLButtonElement>(null);
  const moveDownRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const detailRef = useRef<HTMLButtonElement>(null);

  // disabled 状態の判定（design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」の
  // §Responsibilities & Constraints: isFirst/isLast/isOnly による上下移動の非活性）
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

  // メニュー外クリックでクローズ（design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」の
  // §Implementation Notes: document level の click リスナ）
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

  // Escape キーでクローズしてトグルボタンへフォーカスを戻す
  // （design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」の §Implementation Notes の A11y）
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

  // メニュー展開時に最初の有効項目にフォーカス
  // （design.md「LineItemActionMenu - 新規（明細行アクションメニュー）」の §Implementation Notes の A11y）
  useEffect(() => {
    if (!isOpen) return;
    // 上→下→削除の順で最初に活性な項目にフォーカス
    const firstEnabled =
      (!moveUpDisabled && moveUpRef.current) ||
      (!moveDownDisabled && moveDownRef.current) ||
      (!deleteDisabled && deleteRef.current) ||
      (!disabled && detailRef.current) ||
      null;
    if (firstEnabled) {
      // useEffect 内なので DOM 反映済み。requestAnimationFrame で 1 フレーム待ってからフォーカスする
      requestAnimationFrame(() => {
        firstEnabled.focus();
      });
    }
  }, [isOpen, moveUpDisabled, moveDownDisabled, deleteDisabled, disabled]);

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
        data-row={rowIndex}
        data-action-menu-toggle=""
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
          {onToggleDetail && (
            <button
              ref={detailRef}
              type="button"
              role="menuitem"
              disabled={disabled}
              aria-expanded={detailExpanded}
              aria-controls={detailControlsId}
              onClick={() => handleMenuItemClick(onToggleDetail)}
              style={actionMenuStyles.menuItem}
            >
              詳細
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default LineItemEditor;
