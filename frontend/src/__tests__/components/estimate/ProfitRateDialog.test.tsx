/**
 * @fileoverview ProfitRateDialog テスト
 *
 * Task 55.4: 利益率ダイアログの入力元を編集中の明細へ変更
 *
 * 適用対象は**編集中の明細ツリー**から構成し、上書きオプションの3分岐も
 * 編集中の値に対して判定する。プレビューと適用は同一の計算関数
 * （`estimateCalculations.applyProfitRate`）を通り、適用はサーバーへ書き込まず
 * `onApply` で編集状態への遷移へ渡す。
 *
 * Requirements (estimate-creation):
 * - 6.2: 「すべて上書き」は名称・規格・単位・数量・単価を見積金額行に上書きする
 * - 6.3: 「空の場合のみ上書き」は見積金額行が空の項目のみ上書きする
 * - 6.4: 「単価のみ上書き」は単価のみを上書きする
 * - 6.5: 反映が実行された場合、金額を自動計算して表示する
 * - 6.6: 利益率を百分率で入力可能とする
 * - 6.7: 「空の場合のみ上書き」の判定を編集中の見積金額行の単価に対して行う
 * - 6.9: 未保存の新規行が適用対象に含まれる場合、その行も適用対象として扱う
 * - 19.3: 利益率の入力フィールド（0.00〜500.00%）を提供する
 * - 19.4: 上書きオプションを提供する
 * - 19.5: 各行の元の単価と新しい単価のプレビューを表示する
 * - 19.6: 適用ボタンで実行金額行の内容を利益率適用後に見積金額行へ反映する
 * - 19.8: 編集中の実行金額行（未保存の追加・編集を含む）を適用対象の一覧に表示する
 * - 37.1, 37.2: 利益率のデフォルト値12.27%と手動変更
 * - 49.7: 計算対象に未保存の新規項目を含める
 *
 * 19.7（処理中インジケーター）は、適用がクライアント内で同期的に完結するように
 * なったため成立する処理中の期間が存在しない（49.3 でサーバーへの往復が無くなった）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfitRateDialog } from '../../../components/estimate/ProfitRateDialog';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
} from '../../../hooks/useEstimateEditor';

type LineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

const buildLine = (
  itemId: string,
  lineType: LineType,
  overrides: Partial<EstimateItemLineEdit> = {}
): EstimateItemLineEdit => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name: null,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: null,
  remarks: null,
  ...overrides,
});

const buildItem = (
  id: string,
  lines: EstimateItemLineEdit[],
  overrides: Partial<EstimateItemHierarchyEdit> = {}
): EstimateItemHierarchyEdit => ({
  id,
  estimateId: 'est-1',
  parentId: null,
  displayOrder: 0,
  lines,
  children: [],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

/**
 * 標準の適用対象（実行金額行・見積金額行の双方を持つ）
 *
 * 実行金額行の数量(2)と見積金額行の数量(3)を意図的に違える。上書きオプションによって
 * 金額の算出に使う数量が変わる（6.2 は実行金額行・6.4 は見積金額行）ため。
 */
const standardItem = (
  id: string,
  name: string,
  executionUnitPrice: string | null,
  estimateUnitPrice: string | null
): EstimateItemHierarchyEdit =>
  buildItem(id, [
    buildLine(id, 'ESTIMATE', {
      name: `旧${name}`,
      unit: '個',
      quantity: '3',
      unitPrice: estimateUnitPrice,
      amount: estimateUnitPrice,
    }),
    buildLine(id, 'EXECUTION', {
      name,
      specification: '仕様A',
      unit: '式',
      quantity: '2',
      unitPrice: executionUnitPrice,
      amount: executionUnitPrice,
    }),
    buildLine(id, 'VENDOR', { name }),
  ]);

/** プレビュー行（項目キーで引く） */
const previewRow = (key: string): HTMLElement => {
  const row = screen
    .getAllByTestId('profit-preview-row')
    .find((element) => element.getAttribute('data-profit-key') === key);
  if (row === undefined) {
    throw new Error(`プレビュー行が見つかりません: ${key}`);
  }
  return row;
};

const previewKeys = (): (string | null)[] =>
  screen
    .queryAllByTestId('profit-preview-row')
    .map((element) => element.getAttribute('data-profit-key'));

const cellText = (key: string, testId: string): string =>
  (within(previewRow(key)).getByTestId(testId).textContent ?? '').trim();

describe('ProfitRateDialog', () => {
  const onClose = vi.fn();
  const onApply = vi.fn();

  const defaultProps = {
    isOpen: true,
    items: [standardItem('item-1', '外壁塗装', '90000', null)],
    onClose,
    onApply,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen=falseの場合は何も表示しない', () => {
    const { container } = render(<ProfitRateDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=trueの場合はダイアログが表示される', () => {
    render(<ProfitRateDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('実行金額を見積金額に転記（利益率適用）')).toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-19.3 */
  it('利益率入力フィールドが百分率で提供される (19.3, 6.6)', () => {
    render(<ProfitRateDialog {...defaultProps} />);
    const input = screen.getByLabelText('利益率 (%)');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '500');
    expect(input).toHaveAttribute('step', '0.01');
  });

  /** @requirement estimate-creation/REQ-19.4 */
  it('上書きオプションの3分岐が提供される (19.4)', () => {
    render(<ProfitRateDialog {...defaultProps} />);
    expect(screen.getByLabelText(/すべて上書き/)).toBeChecked();
    expect(screen.getByLabelText(/空の場合のみ上書き/)).toBeInTheDocument();
    expect(screen.getByLabelText(/単価のみ上書き/)).toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-37.1 */
  it('利益率のデフォルト値が12.27である (37.1)', () => {
    render(<ProfitRateDialog {...defaultProps} />);
    expect(screen.getByLabelText('利益率 (%)')).toHaveValue(12.27);
  });

  /** @requirement estimate-creation/REQ-37.2 */
  it('利益率のデフォルト値を手動で変更できる (37.2)', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    const input = screen.getByLabelText('利益率 (%)');
    await user.clear(input);
    await user.type(input, '25');

    expect(input).toHaveValue(25);
    // 90,000 × 1.25 = 112,500
    expect(cellText('item-1', 'preview-new-unit-price')).toBe('112,500円');
  });

  /** @requirement estimate-creation/REQ-19.5 */
  it('元の単価と新しい単価のプレビューを表示する (19.5)', () => {
    render(<ProfitRateDialog {...defaultProps} />);

    expect(screen.getByText('適用プレビュー')).toBeInTheDocument();
    expect(cellText('item-1', 'preview-original-unit-price')).toBe('90,000円');
    // 90,000 × 1.1227 = 101,043
    expect(cellText('item-1', 'preview-new-unit-price')).toBe('101,043円');
  });

  /** @requirement estimate-creation/REQ-19.8 */
  it('編集中の実行金額行を適用対象の一覧に表示する（子孫を含む） (19.8, 49.7)', () => {
    const child = standardItem('tmp-child', '子項目工事', '50000', null);
    const parent = standardItem('item-parent', '親項目工事', '30000', null);
    render(<ProfitRateDialog {...defaultProps} items={[{ ...parent, children: [child] }]} />);

    // 未保存の一時識別子（tmp-*）の行も適用対象になる（6.9, 49.7）
    expect(previewKeys()).toEqual(['item-parent', 'tmp-child']);
    expect(within(previewRow('tmp-child')).getByText('子項目工事')).toBeInTheDocument();
  });

  /**
   * 適用側（`estimateEditReducer` の `applyProfitRate`）は見積金額行を持たない項目を
   * `continue` で飛ばす。ダイアログが同じ条件で選ばないと、反映されない行に
   * 新しい単価を示してしまい 6.8 に反する。
   */
  /** @requirement estimate-creation/REQ-6.8 */
  it('見積金額行を持たない項目は適用対象にしない（適用側と同じ選定） (6.8)', () => {
    const noEstimate = buildItem('item-no-estimate', [
      buildLine('item-no-estimate', 'EXECUTION', {
        name: '見積金額行なし工事',
        quantity: '1',
        unitPrice: '70000',
        amount: '70000',
      }),
    ]);

    render(
      <ProfitRateDialog
        {...defaultProps}
        items={[standardItem('item-1', '外壁塗装', '90000', null), noEstimate]}
      />
    );

    expect(previewKeys()).toEqual(['item-1']);
    expect(screen.queryByText('見積金額行なし工事')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-6.8 */
  it('実行金額行を持たない項目は適用対象にしない（適用側と同じ選定） (6.8)', () => {
    const noExecution = buildItem('item-no-execution', [
      buildLine('item-no-execution', 'ESTIMATE', {
        name: '実行金額行なし工事',
        quantity: '1',
        unitPrice: '70000',
        amount: '70000',
      }),
    ]);

    render(
      <ProfitRateDialog
        {...defaultProps}
        items={[standardItem('item-1', '外壁塗装', '90000', null), noExecution]}
      />
    );

    expect(previewKeys()).toEqual(['item-1']);
    expect(screen.queryByText('実行金額行なし工事')).not.toBeInTheDocument();
  });

  /**
   * 値引き行・注記行は利益率の対象外（design.md Invariants / 41.9, 55.4）。
   * 項目種別を計算関数へ渡さないとこの除外が効かず、適用側だけが除外して食い違う。
   */
  /** @requirement estimate-creation/REQ-6.8 */
  it('値引き行・注記行は適用対象にしない (6.8)', () => {
    const discount = standardItem('item-discount', '値引き', '90000', null);
    const note = standardItem('item-note', '注記', '90000', null);

    render(
      <ProfitRateDialog
        {...defaultProps}
        items={[
          standardItem('item-1', '外壁塗装', '90000', null),
          { ...discount, itemType: 'DISCOUNT' as const },
          { ...note, itemType: 'NOTE' as const },
        ]}
      />
    );

    expect(previewKeys()).toEqual(['item-1']);
  });

  /** @requirement estimate-creation/REQ-6.7 */
  it('「空の場合のみ上書き」を編集中の見積金額行の単価で判定する (6.3, 6.7)', async () => {
    const user = userEvent.setup();
    render(
      <ProfitRateDialog
        {...defaultProps}
        items={[
          standardItem('item-empty', '見積単価が空', '90000', null),
          standardItem('item-filled', '見積単価あり', '90000', '50000'),
        ]}
      />
    );

    await user.click(screen.getByLabelText(/空の場合のみ上書き/));

    // 単価が入っている行は反映されないことをプレビューで示す（6.8）
    expect(cellText('item-empty', 'preview-applied')).toBe('反映する');
    expect(cellText('item-filled', 'preview-applied')).toBe('反映しない');
  });

  /** @requirement estimate-creation/REQ-6.2 */
  it('「すべて上書き」は見積金額行の単価が入っていても反映する (6.2)', () => {
    render(
      <ProfitRateDialog
        {...defaultProps}
        items={[standardItem('item-filled', '見積単価あり', '90000', '50000')]}
      />
    );

    expect(cellText('item-filled', 'preview-applied')).toBe('反映する');
  });

  /**
   * 金額の算出に使う数量は上書きオプションで変わる（バックエンド実装と同じ規約）。
   * 「すべて上書き」「空の場合のみ上書き」は実行金額行の数量を複写するのでその数量、
   * 「単価のみ上書き」は見積金額行の数量が残るのでその数量を用いる。
   */
  /** @requirement estimate-creation/REQ-6.5 */
  it('新しい金額を上書きオプションに応じた数量で自動計算して表示する (6.5, 6.2, 6.4)', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    // すべて上書き: 実行金額行の数量 2 × 101,043
    expect(cellText('item-1', 'preview-new-amount')).toBe('202,086円');

    await user.click(screen.getByLabelText(/単価のみ上書き/));

    // 単価のみ上書き: 見積金額行の数量 3 × 101,043
    expect(cellText('item-1', 'preview-new-amount')).toBe('303,129円');
  });

  /** @requirement estimate-creation/REQ-19.6 */
  it('適用ボタンで編集状態への反映を要求し、サーバーへは送らない (19.6, 49.1, 49.3)', async () => {
    const user = userEvent.setup();
    render(
      <ProfitRateDialog
        {...defaultProps}
        items={[
          standardItem('item-1', '外壁塗装', '90000', null),
          standardItem('tmp-2', '未保存工事', '30000', null),
        ]}
      />
    );

    await user.click(screen.getByLabelText(/単価のみ上書き/));
    await user.click(screen.getByRole('button', { name: '適用' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      targetKeys: ['item-1', 'tmp-2'],
      rate: '12.27',
      overwriteOption: 'unit_price_only',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('利益率が空の場合は適用ボタンが無効', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    await user.clear(screen.getByLabelText('利益率 (%)'));

    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled();
    expect(screen.queryByText('適用プレビュー')).not.toBeInTheDocument();
  });

  it('適用対象が無い場合は適用ボタンが無効', () => {
    render(<ProfitRateDialog {...defaultProps} items={[]} />);

    expect(screen.getByRole('button', { name: '適用' })).toBeDisabled();
    expect(screen.queryByText('適用プレビュー')).not.toBeInTheDocument();
  });

  it('キャンセルボタンでonCloseが呼ばれ、適用は行われない', async () => {
    const user = userEvent.setup();
    render(<ProfitRateDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
