/**
 * @fileoverview EstimateItemToolbarコンポーネントの単体テスト
 *
 * Task 28.1: EstimateItemToolbar単体テスト
 *
 * Requirements (estimate-creation):
 * - REQ-23.1: 見積項目テーブルの上部に項目操作ツールバーを表示する
 * - REQ-23.2: 「項目追加」ボタンを提供し、クリック時にルートレベルに新規3行1セットを追加する
 * - REQ-23.3: 選択項目に対する操作ボタン（子項目追加・削除・複製）を有効化する
 * - REQ-23.4: 「子項目追加」ボタンを提供し、選択中の項目の子として新規3行1セットを追加する
 * - REQ-23.5: 「削除」ボタンを提供し、選択中の項目を削除する
 * - REQ-23.6: 「複製」ボタンを提供し、選択中の項目を複製する
 * - REQ-23.8: 未選択時は選択必須ボタンをdisabled状態で表示する
 * - REQ-23.9: 「上の階層へ移動」ボタンを提供する
 * - REQ-23.10: 「下の階層へ移動」ボタンを提供する
 * - REQ-41.1: 見積項目操作ツールバーに「値引き行追加」ボタンを提供する
 * - REQ-41.7: 値引き行は自動計算を持たず、手入力のみ（専用ダイアログなし）
 *
 * @module __tests__/components/estimate/EstimateItemToolbar
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateItemToolbar } from '../../../components/estimate/EstimateItemToolbar';
import type { EstimateItemHierarchyEdit } from '../../../hooks/useEstimateEditor';

// ============================================================================
// テストデータ
// ============================================================================

const createMockItem = (
  overrides: Partial<EstimateItemHierarchyEdit> = {}
): EstimateItemHierarchyEdit => ({
  id: 'item-1',
  estimateId: 'est-1',
  parentId: null,
  displayOrder: 0,
  lines: [
    {
      id: 'line-1',
      estimateItemId: 'item-1',
      lineType: 'ESTIMATE',
      name: null,
      specification: null,
      unit: null,
      quantity: null,
      unitPrice: null,
      amount: null,
      remarks: null,
    },
    {
      id: 'line-2',
      estimateItemId: 'item-1',
      lineType: 'EXECUTION',
      name: null,
      specification: null,
      unit: null,
      quantity: null,
      unitPrice: null,
      amount: null,
      remarks: null,
    },
    {
      id: 'line-3',
      estimateItemId: 'item-1',
      lineType: 'VENDOR',
      name: null,
      specification: null,
      unit: null,
      quantity: null,
      unitPrice: null,
      amount: null,
      remarks: null,
    },
  ],
  children: [],
  isExpanded: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

// ============================================================================
// テスト
// ============================================================================

describe('EstimateItemToolbar', () => {
  const defaultProps = {
    selectedItemId: null as string | null,
    selectedItem: null as EstimateItemHierarchyEdit | null,
    hasPreviousSibling: false,
    onAddItem: vi.fn(),
    onAddChildItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onDuplicateItem: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onReorderUp: vi.fn(),
    onReorderDown: vi.fn(),
    onAddDiscountItem: vi.fn(),
    canReorderUp: false,
    canReorderDown: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-23.1: ツールバー表示確認
  describe('ツールバー表示', () => {
    it('全てのボタンがレンダリングされること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /^\+\s*項目追加$/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /子項目追加/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /複製/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /上の階層へ/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /下の階層へ/ })).toBeInTheDocument();
    });

    it('ツールバーのdata-testidが設定されていること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByTestId('estimate-item-toolbar')).toBeInTheDocument();
    });
  });

  // REQ-23.8: 未選択時のdisabled状態
  describe('未選択時のdisabled状態', () => {
    it('項目追加ボタンは常に有効であること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /^\+\s*項目追加$/ })).toBeEnabled();
    });

    it('子項目追加ボタンは無効であること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /子項目追加/ })).toBeDisabled();
    });

    it('複製ボタンは無効であること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /複製/ })).toBeDisabled();
    });

    it('削除ボタンは無効であること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /削除/ })).toBeDisabled();
    });

    it('上の階層へボタンは無効であること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /上の階層へ/ })).toBeDisabled();
    });

    it('下の階層へボタンは無効であること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /下の階層へ/ })).toBeDisabled();
    });
  });

  // REQ-23.3: 選択時のenabled状態
  describe('選択時のenabled状態', () => {
    const selectedItem = createMockItem();
    const selectedProps = {
      ...defaultProps,
      selectedItemId: 'item-1',
      selectedItem,
    };

    it('子項目追加ボタンが有効になること', () => {
      render(<EstimateItemToolbar {...selectedProps} />);

      expect(screen.getByRole('button', { name: /子項目追加/ })).toBeEnabled();
    });

    it('複製ボタンが有効になること', () => {
      render(<EstimateItemToolbar {...selectedProps} />);

      expect(screen.getByRole('button', { name: /複製/ })).toBeEnabled();
    });

    it('削除ボタンが有効になること', () => {
      render(<EstimateItemToolbar {...selectedProps} />);

      expect(screen.getByRole('button', { name: /削除/ })).toBeEnabled();
    });
  });

  // REQ-23.9: 上の階層へボタンの有効/無効条件
  describe('上の階層へボタンの有効/無効', () => {
    it('parentIdがnullの場合は無効であること（ルートレベル）', () => {
      const selectedItem = createMockItem({ parentId: null });
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
        />
      );

      expect(screen.getByRole('button', { name: /上の階層へ/ })).toBeDisabled();
    });

    it('parentIdがある場合は有効であること', () => {
      const selectedItem = createMockItem({ parentId: 'parent-1' });
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
        />
      );

      expect(screen.getByRole('button', { name: /上の階層へ/ })).toBeEnabled();
    });
  });

  // REQ-23.10: 下の階層へボタンの有効/無効条件
  describe('下の階層へボタンの有効/無効', () => {
    it('直前の兄弟項目が存在しない場合は無効であること', () => {
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
          hasPreviousSibling={false}
        />
      );

      expect(screen.getByRole('button', { name: /下の階層へ/ })).toBeDisabled();
    });

    it('直前の兄弟項目が存在する場合は有効であること', () => {
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
          hasPreviousSibling={true}
        />
      );

      expect(screen.getByRole('button', { name: /下の階層へ/ })).toBeEnabled();
    });
  });

  // ボタンクリック時のコールバック呼び出し
  describe('ボタンクリック時のコールバック', () => {
    it('項目追加ボタンクリックでonAddItemが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EstimateItemToolbar {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /^\+\s*項目追加$/ }));

      expect(defaultProps.onAddItem).toHaveBeenCalledTimes(1);
    });

    it('子項目追加ボタンクリックでonAddChildItemが呼ばれること', async () => {
      const user = userEvent.setup();
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
        />
      );

      await user.click(screen.getByRole('button', { name: /子項目追加/ }));

      expect(defaultProps.onAddChildItem).toHaveBeenCalledWith('item-1');
    });

    it('複製ボタンクリックでonDuplicateItemが呼ばれること', async () => {
      const user = userEvent.setup();
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
        />
      );

      await user.click(screen.getByRole('button', { name: /複製/ }));

      expect(defaultProps.onDuplicateItem).toHaveBeenCalledWith('item-1');
    });

    it('削除ボタンクリックでonDeleteItemが呼ばれること', async () => {
      const user = userEvent.setup();
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
        />
      );

      await user.click(screen.getByRole('button', { name: /削除/ }));

      expect(defaultProps.onDeleteItem).toHaveBeenCalledWith('item-1');
    });

    it('上の階層へボタンクリックでonMoveUpが呼ばれること', async () => {
      const user = userEvent.setup();
      const selectedItem = createMockItem({ parentId: 'parent-1' });
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
        />
      );

      await user.click(screen.getByRole('button', { name: /上の階層へ/ }));

      expect(defaultProps.onMoveUp).toHaveBeenCalledWith('item-1');
    });

    it('下の階層へボタンクリックでonMoveDownが呼ばれること', async () => {
      const user = userEvent.setup();
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
          hasPreviousSibling={true}
        />
      );

      await user.click(screen.getByRole('button', { name: /下の階層へ/ }));

      expect(defaultProps.onMoveDown).toHaveBeenCalledWith('item-1');
    });
  });

  // REQ-12.2: 表示順序の並び替え（↑/↓ボタン）
  describe('表示順序の並び替え（↑/↓ボタン）', () => {
    it('未選択時は↑移動・↓移動ボタンがdisabledであること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByTestId('reorder-up-button')).toBeDisabled();
      expect(screen.getByTestId('reorder-down-button')).toBeDisabled();
    });

    it('canReorderUpがtrueの場合に↑移動ボタンが有効になること', () => {
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
          canReorderUp={true}
          canReorderDown={false}
        />
      );

      expect(screen.getByTestId('reorder-up-button')).toBeEnabled();
      expect(screen.getByTestId('reorder-down-button')).toBeDisabled();
    });

    it('canReorderDownがtrueの場合に↓移動ボタンが有効になること', () => {
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
          canReorderUp={false}
          canReorderDown={true}
        />
      );

      expect(screen.getByTestId('reorder-down-button')).toBeEnabled();
      expect(screen.getByTestId('reorder-up-button')).toBeDisabled();
    });

    it('↑移動ボタンクリックでonReorderUpが呼ばれること', async () => {
      const user = userEvent.setup();
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
          canReorderUp={true}
        />
      );

      await user.click(screen.getByTestId('reorder-up-button'));

      expect(defaultProps.onReorderUp).toHaveBeenCalledWith('item-1');
    });

    it('↓移動ボタンクリックでonReorderDownが呼ばれること', async () => {
      const user = userEvent.setup();
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
          canReorderDown={true}
        />
      );

      await user.click(screen.getByTestId('reorder-down-button'));

      expect(defaultProps.onReorderDown).toHaveBeenCalledWith('item-1');
    });
  });

  // REQ-41.1 / REQ-41.7: 値引き行追加ボタン
  describe('値引き行追加ボタン（REQ-41.1, REQ-41.7）', () => {
    it('値引き行追加ボタンがレンダリングされること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByTestId('add-discount-button')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /値引き行追加/ })).toBeInTheDocument();
    });

    it('未選択時でも値引き行追加ボタンは常に有効であること', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      expect(screen.getByTestId('add-discount-button')).toBeEnabled();
    });

    it('項目選択中でも値引き行追加ボタンは有効であること', () => {
      const selectedItem = createMockItem();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="item-1"
          selectedItem={selectedItem}
        />
      );

      expect(screen.getByTestId('add-discount-button')).toBeEnabled();
    });

    it('値引き行追加ボタンクリックでonAddDiscountItemが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EstimateItemToolbar {...defaultProps} />);

      await user.click(screen.getByTestId('add-discount-button'));

      expect(defaultProps.onAddDiscountItem).toHaveBeenCalledTimes(1);
    });
  });
});
