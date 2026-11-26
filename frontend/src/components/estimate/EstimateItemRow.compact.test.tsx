/**
 * @fileoverview 見積項目テーブルの入力欄のコンパクト化のテスト（数量表との突き合わせ）
 *
 * 見積項目の各列の文字の大きさ・パディング・セルの余白を、数量表の画面が実際に描画する
 * 部品（テキスト列は `AutocompleteInput`、数量列は `EditableQuantityItemRow` の入力欄）の
 * 値と突き合わせる。期待値を数値で書き写すと数量表の側が変わったときに気づけないため、
 * 両方を描画して比べる（design.md「見積項目テキストフィールドのコンパクト化（REQ-40）」の
 * Implementation Notes「数量表のスタイル定数を参照し、完全に一致させる」）。
 *
 * 対応列: 名称・規格・単位・備考は数量表の同名の列、数量・単価・金額は数量表の数量列
 * （design.md の「数値フィールドのスタイル統一」）。
 *
 * @module components/estimate/EstimateItemRow.compact.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { EstimateItemRow } from './EstimateItemRow';
import EditableQuantityItemRow from '../quantity-table/EditableQuantityItemRow';
import type { EstimateItemLineEdit } from '../../hooks/useEstimateEditor';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

const estimateLines: EstimateItemLineEdit[] = (['ESTIMATE', 'EXECUTION', 'VENDOR'] as const).map(
  (lineType) => ({
    id: `line-${lineType}`,
    estimateItemId: 'item-1',
    lineType,
    name: '外壁塗装工事',
    specification: 'アクリルシリコン塗装',
    unit: 'm2',
    quantity: '150.5',
    unitPrice: '2500',
    amount: '376250',
    remarks: '備考',
  })
);

const quantityItem: QuantityItemDetail = {
  id: 'qi-1',
  quantityGroupId: 'group-1',
  majorCategory: '建築工事',
  middleCategory: null,
  minorCategory: null,
  customCategory: null,
  workType: '塗装工事',
  name: '外壁塗装',
  specification: 'アクリルシリコン塗装',
  unit: 'm2',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1,
  roundingUnit: 0.01,
  quantity: 150.5,
  remarks: '備考',
  displayOrder: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

/** 見積項目（見積金額行）と数量表の行を同じ文書に描画し、列ごとの要素を返す */
function renderBoth() {
  const estimate = render(<EstimateItemRow itemId="item-1" lines={estimateLines} />);
  const estimateRow = estimate.getByTestId('line-type-ESTIMATE');
  const quantity = render(
    <EditableQuantityItemRow
      item={quantityItem}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onCopy={vi.fn()}
      getSuggestions={vi.fn().mockReturnValue([])}
      onBlurAddCandidate={vi.fn()}
    />
  );
  const quantityRow = quantity.getByRole('row');
  const quantityField = (field: string): HTMLElement => {
    const el = quantityRow.querySelector<HTMLElement>(`#qi-1-${field}`);
    if (!el) throw new Error(`数量表の ${field} 欄が見つかりません`);
    return el;
  };

  const estimateField = (label: string): HTMLElement =>
    within(estimateRow).getByLabelText(label, { selector: 'input, div' });

  /** 見積項目の列 → 数量表の対応列 */
  const pairs: Array<{ column: string; estimate: HTMLElement; quantity: HTMLElement }> = [
    { column: '名称', estimate: estimateField('名称'), quantity: quantityField('name') },
    {
      column: '規格',
      estimate: estimateField('規格'),
      quantity: quantityField('specification'),
    },
    { column: '単位', estimate: estimateField('単位'), quantity: quantityField('unit') },
    { column: '数量', estimate: estimateField('数量'), quantity: quantityField('quantity') },
    { column: '単価', estimate: estimateField('単価'), quantity: quantityField('quantity') },
    {
      column: '金額',
      estimate: within(estimateRow).getByTestId('amount-field'),
      quantity: quantityField('quantity'),
    },
    { column: '備考', estimate: estimateField('備考'), quantity: quantityField('remarks') },
  ];

  return { estimateRow, quantityRow, pairs };
}

const PADDING_SIDES = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;

const px = (value: string): number => (value === '' ? 0 : Number.parseFloat(value));

describe('EstimateItemRow のコンパクト化（数量表との突き合わせ）', () => {
  /**
   * 7 列すべての文字の大きさが、数量表の対応列の入力欄と同じ値であること。
   * @requirement estimate-creation/REQ-40.1
   */
  it('名称・規格・単位・数量・単価・金額・備考の文字の大きさが数量表の対応列と同じである', () => {
    const { pairs } = renderBoth();

    expect(pairs.map((p) => p.column)).toEqual([
      '名称',
      '規格',
      '単位',
      '数量',
      '単価',
      '金額',
      '備考',
    ]);
    for (const { column, estimate, quantity } of pairs) {
      const expected = getComputedStyle(quantity).fontSize;
      expect(expected, `数量表の ${column} の対応列`).not.toBe('');
      expect(getComputedStyle(estimate).fontSize, column).toBe(expected);
    }
  });

  /**
   * 7 列すべての入力欄のパディング（上下左右）が、数量表の対応列と同じ値であること。
   * @requirement estimate-creation/REQ-40.2
   */
  it('全列のパディングが数量表の対応列と同じである', () => {
    const { pairs } = renderBoth();

    for (const { column, estimate, quantity } of pairs) {
      for (const side of PADDING_SIDES) {
        const expected = getComputedStyle(quantity)[side];
        expect(expected, `数量表の ${column} の ${side}`).not.toBe('');
        expect(getComputedStyle(estimate)[side], `${column} の ${side}`).toBe(expected);
      }
    }
  });

  /**
   * 入力欄を包むセルが余白を持たないこと（数量表のセルと同じ）と、行の余白が数量表の行の
   * 余白を超えないこと。
   * @requirement estimate-creation/REQ-40.3
   */
  it('全列のセル内余白が数量表のセルと同様に最小化されている', () => {
    const { estimateRow, quantityRow, pairs } = renderBoth();

    for (const { column, estimate, quantity } of pairs) {
      // 見積項目のセル＝行のグリッドの直下の要素（金額は欄そのものがセル）
      const estimateCell =
        estimate.parentElement === estimateRow ? null : (estimate.parentElement as HTMLElement);
      const quantityCell = quantity.closest<HTMLElement>('[role="cell"]');
      expect(quantityCell, `数量表の ${column} のセル`).not.toBeNull();
      for (const side of PADDING_SIDES) {
        expect(px(getComputedStyle(quantityCell!)[side]), `数量表の ${column} の ${side}`).toBe(0);
        if (estimateCell) {
          expect(px(getComputedStyle(estimateCell)[side]), `${column} のセルの ${side}`).toBe(0);
        }
      }
    }

    for (const side of PADDING_SIDES) {
      expect(px(getComputedStyle(estimateRow)[side]), `行の ${side}`).toBeLessThanOrEqual(
        px(getComputedStyle(quantityRow)[side])
      );
    }
  });

  /**
   * 入力欄がセルの幅いっぱいに広がり（枠と余白を幅に含める）、セルと行の余白が
   * 設計の値（行 1px 2px・セル 0）まで削られていること。
   * @requirement estimate-creation/REQ-40.4
   */
  it('セルの余白・パディングを削減して入力欄の領域を最大化している', () => {
    const { estimateRow, pairs } = renderBoth();

    const rowStyle = getComputedStyle(estimateRow);
    expect([rowStyle.paddingTop, rowStyle.paddingRight]).toEqual(['1px', '2px']);
    expect([rowStyle.paddingBottom, rowStyle.paddingLeft]).toEqual(['1px', '2px']);

    const inputs = pairs.filter((p) => p.estimate.tagName === 'INPUT');
    // 名称・規格・単位・数量・単価・備考の 6 欄が入力欄（金額は入力不可の表示）
    expect(inputs.map((p) => p.column)).toEqual(['名称', '規格', '単位', '数量', '単価', '備考']);
    for (const { column, estimate } of inputs) {
      const style = getComputedStyle(estimate);
      expect(style.width, column).toBe('100%');
      expect(style.boxSizing, column).toBe('border-box');
      const cell = estimate.parentElement as HTMLElement;
      expect(cell.parentElement, `${column} のセルが行の直下にあること`).toBe(estimateRow);
      for (const side of PADDING_SIDES) {
        expect(px(getComputedStyle(cell)[side]), `${column} のセルの ${side}`).toBe(0);
      }
    }
  });
});
