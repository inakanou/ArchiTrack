/**
 * @fileoverview EditableQuantityItemRow アクションメニュー統合テスト
 *
 * Task 50.2, 50.3: 数量項目行のアクションセルをメニューに統合するテスト
 *
 * Requirements:
 * - 36.1: 並び替えボタン・削除ボタンを個別表示せず、アクションメニューボタン内に統合
 * - 36.3: 「上へ移動」選択で1つ上に移動
 * - 36.4: 「下へ移動」選択で1つ下に移動
 * - 36.5: 「削除」選択で項目削除
 * - 36.8: 既存操作項目（コピー・移動等）と統合表示
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
  itemIndex: 1,
  itemTotalCount: 3,
};

describe('EditableQuantityItemRow アクションメニュー統合 (Task 50.2, 50.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-36.1: 行に表示されるボタンがアクションメニューボタン1つのみ', () => {
    it('アクションセルにアクションメニューボタン（三点メニュー）のみ表示されること', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const row = screen.getByTestId('quantity-item-row');

      // アクションメニューボタン（三点メニュー）が存在する
      const actionButton = within(row).getByRole('button', { name: 'アクション' });
      expect(actionButton).toBeInTheDocument();

      // 個別の「削除」ボタンが行に存在しないこと
      const deleteButtons = within(row).queryAllByRole('button', { name: '削除' });
      expect(deleteButtons).toHaveLength(0);

      // SortOrderButtonsの上下ボタンが行に直接存在しないこと
      const moveUpButtons = within(row).queryAllByRole('button', { name: '上に移動' });
      const moveDownButtons = within(row).queryAllByRole('button', { name: '下に移動' });
      expect(moveUpButtons).toHaveLength(0);
      expect(moveDownButtons).toHaveLength(0);
    });
  });

  describe('REQ-36.3, 36.4, 36.5, 36.8: メニューからの操作', () => {
    it('メニューを開くと「上へ移動」「下へ移動」「コピー」「削除」が表示されること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      // メニューを開く
      const actionButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(actionButton);

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('上へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('下へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('コピー')).toBeInTheDocument();
      expect(within(menu).getByText('削除')).toBeInTheDocument();
    });

    it('「上へ移動」を選択するとonMoveUpが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('上へ移動'));

      expect(defaultProps.onMoveUp).toHaveBeenCalledWith('item-1');
    });

    it('「下へ移動」を選択するとonMoveDownが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('下へ移動'));

      expect(defaultProps.onMoveDown).toHaveBeenCalledWith('item-1');
    });

    it('「コピー」を選択するとonCopyが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('コピー'));

      expect(defaultProps.onCopy).toHaveBeenCalledWith('item-1');
    });

    it('「削除」を選択するとonDeleteが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('削除'));

      expect(defaultProps.onDelete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('REQ-36.6, 36.7: disabled状態', () => {
    it('最上位項目（canMoveUp=false）で「上へ移動」がdisabledであること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} canMoveUp={false} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      const moveUpButton = screen.getByText('上へ移動').closest('button');
      expect(moveUpButton).toBeDisabled();
    });

    it('最下位項目（canMoveDown=false）で「下へ移動」がdisabledであること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} canMoveDown={false} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      const moveDownButton = screen.getByText('下へ移動').closest('button');
      expect(moveDownButton).toBeDisabled();
    });
  });
});
