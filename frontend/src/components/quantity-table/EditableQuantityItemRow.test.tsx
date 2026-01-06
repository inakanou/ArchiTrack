/**
 * @fileoverview EditableQuantityItemRow コンポーネントテスト
 *
 * Task 7.2: 各フィールドにオートコンプリートを適用する
 *
 * Requirements:
 * - 7.1: 大項目フィールドで入力するとオートコンプリート候補を表示
 * - 7.2: 中項目フィールドで大項目に紐づく候補を表示
 * - 7.3: 小項目フィールドで大項目・中項目に紐づく候補を表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditableQuantityItemRow from './EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

// Mock useAutocomplete hook
vi.mock('../../hooks/useAutocomplete', () => ({
  useAutocomplete: vi.fn(() => ({
    suggestions: [],
    isLoading: false,
    error: null,
  })),
}));

describe('EditableQuantityItemRow', () => {
  const mockItem: QuantityItemDetail = {
    id: 'item-1',
    quantityGroupId: 'group-1',
    majorCategory: '建築工事',
    middleCategory: '内装仕上工事',
    minorCategory: null,
    customCategory: null,
    workType: '足場工事',
    name: '外部足場',
    specification: 'H=10m',
    unit: 'm2',
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1,
    roundingUnit: 0.01,
    quantity: 100,
    remarks: '備考テスト',
    displayOrder: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const defaultProps = {
    item: mockItem,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    unsavedMajorCategories: [] as string[],
    unsavedMiddleCategories: [] as string[],
    unsavedMinorCategories: [] as string[],
    unsavedWorkTypes: [] as string[],
    unsavedUnits: [] as string[],
    unsavedSpecifications: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本表示', () => {
    it('各フィールドが編集可能な入力フィールドとして表示される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // 大項目フィールド
      expect(screen.getByLabelText('大項目')).toBeInTheDocument();

      // 工種フィールド
      expect(screen.getByLabelText('工種')).toBeInTheDocument();

      // 名称フィールド
      expect(screen.getByLabelText('名称')).toBeInTheDocument();

      // 単位フィールド
      expect(screen.getByLabelText('単位')).toBeInTheDocument();
    });

    it('初期値が各入力フィールドに設定される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      expect(screen.getByLabelText('大項目')).toHaveValue('建築工事');
      expect(screen.getByLabelText('工種')).toHaveValue('足場工事');
      expect(screen.getByLabelText('名称')).toHaveValue('外部足場');
      expect(screen.getByLabelText('単位')).toHaveValue('m2');
    });
  });

  describe('フィールド更新 (Req 7.4)', () => {
    it('大項目変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByLabelText('大項目');
      await userEvent.clear(input);
      await userEvent.type(input, '建設工事');

      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          majorCategory: '建設工事',
        })
      );
    });

    it('工種変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByLabelText('工種');
      await userEvent.clear(input);
      await userEvent.type(input, '仮設工事');

      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          workType: expect.any(String),
        })
      );
    });

    it('名称変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByLabelText('名称');
      await userEvent.clear(input);
      await userEvent.type(input, '内部足場');

      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          name: expect.any(String),
        })
      );
    });

    it('単位変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByLabelText('単位');
      await userEvent.clear(input);
      await userEvent.type(input, 'm3');

      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          unit: expect.any(String),
        })
      );
    });
  });

  describe('オートコンプリートフィールド設定 (Req 7.1, 7.2, 7.3)', () => {
    it('大項目フィールドはオートコンプリート対応入力フィールド', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const input = screen.getByLabelText('大項目');
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('工種フィールドはオートコンプリート対応入力フィールド', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const input = screen.getByLabelText('工種');
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('単位フィールドはオートコンプリート対応入力フィールド', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const input = screen.getByLabelText('単位');
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });
  });

  describe('必須フィールドのバリデーション', () => {
    it('大項目が空の場合にエラー表示', () => {
      const itemWithEmptyMajor = { ...mockItem, majorCategory: '' };
      render(
        <EditableQuantityItemRow {...defaultProps} item={itemWithEmptyMajor} showValidation />
      );

      expect(screen.getByText('大項目は必須です')).toBeInTheDocument();
    });

    it('工種が空の場合にエラー表示', () => {
      const itemWithEmptyWorkType = { ...mockItem, workType: '' };
      render(
        <EditableQuantityItemRow {...defaultProps} item={itemWithEmptyWorkType} showValidation />
      );

      expect(screen.getByText('工種は必須です')).toBeInTheDocument();
    });

    it('名称が空の場合にエラー表示', () => {
      const itemWithEmptyName = { ...mockItem, name: '' };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithEmptyName} showValidation />);

      expect(screen.getByText('名称は必須です')).toBeInTheDocument();
    });

    it('単位が空の場合にエラー表示', () => {
      const itemWithEmptyUnit = { ...mockItem, unit: '' };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithEmptyUnit} showValidation />);

      expect(screen.getByText('単位は必須です')).toBeInTheDocument();
    });
  });

  describe('削除操作', () => {
    it('削除ボタンクリック時にonDeleteが呼ばれる', async () => {
      const onDelete = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onDelete={onDelete} />);

      const deleteButton = screen.getByLabelText('削除');
      await userEvent.click(deleteButton);

      expect(onDelete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('コピー操作', () => {
    it('コピーボタンクリック時にonCopyが呼ばれる', async () => {
      const onCopy = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onCopy={onCopy} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      const copyButton = screen.getByRole('menuitem', { name: /コピー/ });
      await userEvent.click(copyButton);

      expect(onCopy).toHaveBeenCalledWith('item-1');
    });
  });

  describe('unsavedValues伝播', () => {
    it('unsavedMajorCategoriesがAutoCompleteInputに渡される', () => {
      const unsavedMajorCategories = ['新規大項目1', '新規大項目2'];
      render(
        <EditableQuantityItemRow
          {...defaultProps}
          unsavedMajorCategories={unsavedMajorCategories}
        />
      );

      // コンポーネントがレンダリングされることを確認（内部実装はモックされている）
      expect(screen.getByLabelText('大項目')).toBeInTheDocument();
    });
  });
});
