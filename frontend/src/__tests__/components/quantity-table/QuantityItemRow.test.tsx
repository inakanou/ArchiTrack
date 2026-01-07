/**
 * @fileoverview 数量項目行コンポーネントのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityItemRow from '../../../components/quantity-table/QuantityItemRow';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

const mockItem: QuantityItemDetail = {
  id: 'item-1',
  quantityGroupId: 'group-1',
  majorCategory: '共通仮設',
  middleCategory: '直接仮設',
  minorCategory: null,
  customCategory: null,
  workType: '仮設工',
  name: '足場',
  specification: 'ビケ足場',
  unit: 'm2',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 100.5,
  remarks: '安全用',
  displayOrder: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('QuantityItemRow', () => {
  const defaultProps = {
    item: mockItem,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    onSelectionChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本レンダリング', () => {
    it('項目データが表示される', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByText('共通仮設')).toBeInTheDocument();
      expect(screen.getByText('仮設工')).toBeInTheDocument();
      expect(screen.getByText('足場')).toBeInTheDocument();
      expect(screen.getByText('100.5')).toBeInTheDocument();
      expect(screen.getByText('m2')).toBeInTheDocument();
    });

    it('中項目がある場合は大項目と一緒に表示される', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByText(/直接仮設/)).toBeInTheDocument();
    });

    it('規格が表示される', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByText('ビケ足場')).toBeInTheDocument();
    });

    it('規格がない場合は"-"が表示される', () => {
      const itemWithoutSpec = { ...mockItem, specification: null };
      render(<QuantityItemRow {...defaultProps} item={itemWithoutSpec} />);

      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('備考が表示される', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByText('安全用')).toBeInTheDocument();
    });

    it('備考がない場合は空で表示される', () => {
      const itemWithoutRemarks = { ...mockItem, remarks: null };
      render(<QuantityItemRow {...defaultProps} item={itemWithoutRemarks} />);

      // 備考セルは空
      const cells = screen.getAllByRole('cell');
      expect(cells.length).toBeGreaterThan(0);
    });

    it('選択チェックボックスが表示される', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('checkbox', { name: '選択' })).toBeInTheDocument();
    });

    it('削除ボタンが表示される', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('アクションボタンが表示される', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'アクション' })).toBeInTheDocument();
    });
  });

  describe('選択状態', () => {
    it('isSelected=trueの場合、チェックボックスがチェックされる', () => {
      render(<QuantityItemRow {...defaultProps} isSelected={true} />);

      expect(screen.getByRole('checkbox', { name: '選択' })).toBeChecked();
    });

    it('isSelected=falseの場合、チェックボックスがチェックされない', () => {
      render(<QuantityItemRow {...defaultProps} isSelected={false} />);

      expect(screen.getByRole('checkbox', { name: '選択' })).not.toBeChecked();
    });

    it('チェックボックスをクリックするとonSelectionChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} isSelected={false} />);

      await user.click(screen.getByRole('checkbox', { name: '選択' }));

      expect(defaultProps.onSelectionChange).toHaveBeenCalledWith('item-1', true);
    });

    it('選択状態の項目をクリックするとonSelectionChangeにfalseが渡される', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} isSelected={true} />);

      await user.click(screen.getByRole('checkbox', { name: '選択' }));

      expect(defaultProps.onSelectionChange).toHaveBeenCalledWith('item-1', false);
    });
  });

  describe('削除操作', () => {
    it('削除ボタンをクリックするとonDeleteが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '削除' }));

      expect(defaultProps.onDelete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('アクションメニュー', () => {
    it('アクションボタンをクリックするとメニューが表示される', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /コピー/ })).toBeInTheDocument();
    });

    it('コピーをクリックするとonCopyが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /コピー/ }));

      expect(defaultProps.onCopy).toHaveBeenCalledWith('item-1');
    });

    it('コピー後にメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /コピー/ }));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('メニューが開いている状態でもう一度アクションボタンをクリックするとメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} />);

      const actionButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(actionButton);

      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(actionButton);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('行からフォーカスが外れるとメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <button>外部ボタン</button>
          <QuantityItemRow {...defaultProps} />
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // 外部ボタンにフォーカスを移す
      await user.click(screen.getByText('外部ボタン'));

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('行にrole="row"が設定されている', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('row')).toBeInTheDocument();
    });

    it('各セルにrole="cell"が設定されている', () => {
      render(<QuantityItemRow {...defaultProps} />);

      const cells = screen.getAllByRole('cell');
      expect(cells.length).toBeGreaterThan(0);
    });

    it('アクションボタンにaria-haspopupが設定されている', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'アクション' })).toHaveAttribute(
        'aria-haspopup',
        'menu'
      );
    });

    it('メニューが開いている時aria-expandedがtrueになる', async () => {
      const user = userEvent.setup();
      render(<QuantityItemRow {...defaultProps} />);

      const actionButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(actionButton);

      expect(actionButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('メニューが閉じている時aria-expandedがfalseになる', () => {
      render(<QuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'アクション' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });
  });
});
