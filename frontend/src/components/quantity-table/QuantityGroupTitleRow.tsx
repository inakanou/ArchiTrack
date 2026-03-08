/**
 * @fileoverview 数量グループのメインタイトル行コンポーネント
 *
 * Task 23.1: 数量グループのメインタイトル行コンポーネントを実装する
 *
 * Requirements:
 * - 18.1: メインのタイトル行（大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考）
 *   を数量グループの一番上にのみ表示する
 *
 * 数量グループ内の項目リストの先頭にのみ表示される。
 * メインの列タイトルを表示する専用コンポーネント。
 *
 * 計算方法固有のタイトル行（面積・体積/ピッチ）はこのコンポーネントの対象外であり、
 * 各EditableQuantityItemRow内のCalculationFieldsコンポーネントが従来通り担当する。
 */

import { QUANTITY_ITEM_GRID_COLUMNS } from './gridConstants';

// ============================================================================
// 型定義
// ============================================================================

/**
 * QuantityGroupTitleRowコンポーネントのProps
 */
export interface QuantityGroupTitleRowProps {
  /** 編集モードかどうか（trueの場合はEditableQuantityItemRowと同じグリッド構造を使用） */
  isEditable?: boolean;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * メインタイトル行の列テキスト定義
 */
const TITLE_COLUMNS = [
  '大項目',
  '中項目',
  '小項目',
  '任意分類',
  '工種',
  '名称',
  '規格',
  '計算方法',
  '数量',
  '単位',
  '備考',
  '並替 / 操作',
] as const;

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: QUANTITY_ITEM_GRID_COLUMNS,
    gap: '2px',
    alignItems: 'center',
    padding: '4px 4px',
    backgroundColor: '#f3f4f6',
    fontSize: '11px',
    fontWeight: 600,
    color: '#374151',
    borderBottom: '1px solid #d1d5db',
  } as React.CSSProperties,
  cell: {
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量グループのメインタイトル行
 *
 * 数量グループ内の項目リストの先頭にのみ表示される。
 * EditableQuantityItemRow と同一の gridTemplateColumns を使用してカラム位置を一致させる。
 */
export default function QuantityGroupTitleRow(_props: QuantityGroupTitleRowProps) {
  return (
    <div style={styles.row} role="row" data-testid="quantity-group-title-row">
      {TITLE_COLUMNS.map((title) => (
        <div key={title} style={styles.cell} role="columnheader">
          {title}
        </div>
      ))}
    </div>
  );
}
