/**
 * @fileoverview EditableQuantityItemRow の一括操作用選択欄・別グループ移動導線テスト
 *
 * Task 115.29: 数量項目のグループ間移動と複数選択の一括操作を実装する
 *
 * Requirements:
 * - 6.2: 数量項目の移動操作で移動先選択UI（同一数量グループ内または別数量グループ）を表示する
 * - 6.4: 移動先に別数量グループが選択されると移動先へ移し元の位置から削除する
 * - 6.5: 複数の数量項目を選択して一括で削除・コピー・移動を実行する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditableQuantityItemRow from '../../../components/quantity-table/EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

const mockItem: QuantityItemDetail = {
  id: 'item-1',
  quantityGroupId: 'group-1',
  majorCategory: '共通仮設',
  middleCategory: null,
  minorCategory: null,
  customCategory: null,
  workType: '仮設工',
  name: '足場',
  specification: null,
  unit: 'm2',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 100,
  remarks: null,
  displayOrder: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const defaultProps = {
  item: mockItem,
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onCopy: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  canMoveUp: true,
  canMoveDown: true,
  getSuggestions: vi.fn().mockReturnValue([]),
  onBlurAddCandidate: vi.fn(),
  showFieldLabels: false,
};

describe('EditableQuantityItemRow 一括操作用の選択欄（REQ-6.5）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('行に一括操作の対象を選ぶチェックボックスが1つ表示される', () => {
    render(<EditableQuantityItemRow {...defaultProps} />);

    const row = screen.getByTestId('quantity-item-row');
    const checkboxes = within(row).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0]!).toHaveAccessibleName('項目を選択');
  });

  it('isSelected=false のとき未選択、true のとき選択状態で表示される', () => {
    const { rerender } = render(<EditableQuantityItemRow {...defaultProps} isSelected={false} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    rerender(<EditableQuantityItemRow {...defaultProps} isSelected={true} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('チェックボックス操作で onSelectionChange が項目IDと選択状態つきで呼ばれる', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <EditableQuantityItemRow
        {...defaultProps}
        isSelected={false}
        onSelectionChange={onSelectionChange}
      />
    );

    await user.click(screen.getByRole('checkbox'));
    expect(onSelectionChange).toHaveBeenLastCalledWith('item-1', true);

    rerender(
      <EditableQuantityItemRow
        {...defaultProps}
        isSelected={true}
        onSelectionChange={onSelectionChange}
      />
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onSelectionChange).toHaveBeenLastCalledWith('item-1', false);
  });
});

describe('EditableQuantityItemRow 別グループへの移動導線（REQ-6.2, 6.4）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('onMoveToGroup 未指定のときアクションメニューに「別グループに移動」が現れない', async () => {
    const user = userEvent.setup();
    render(<EditableQuantityItemRow {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'アクション' }));

    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('別グループに移動')).not.toBeInTheDocument();
  });

  it('onMoveToGroup 指定時にメニューから「別グループに移動」を選ぶと項目IDつきで呼ばれる', async () => {
    const user = userEvent.setup();
    const onMoveToGroup = vi.fn();
    render(<EditableQuantityItemRow {...defaultProps} onMoveToGroup={onMoveToGroup} />);

    await user.click(screen.getByRole('button', { name: 'アクション' }));

    const menu = screen.getByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: /別グループに移動/ }));

    expect(onMoveToGroup).toHaveBeenCalledWith('item-1');
  });
});
