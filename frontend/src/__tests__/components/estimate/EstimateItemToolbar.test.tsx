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
 * - 55.1: 名称のみを持つ注記行を明細に追加可能とする
 * - 55.3: 注記行を任意の階層の任意の位置に配置可能とする
 * - 55.6: 注記行を通常の明細行と同様に削除・複写・並び替え・階層移動の対象とする
 *
 * @module __tests__/components/estimate/EstimateItemToolbar
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateItemToolbar } from '../../../components/estimate/EstimateItemToolbar';
import type { EstimateItemHierarchyEdit } from '../../../hooks/useEstimateEditor';
import type { EstimateViewMode } from '../../../hooks/useEstimateNavigation';

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
    onAddNoteItem: vi.fn(),
    canReorderUp: false,
    canReorderDown: false,
    // 階層表示モードの切替（45.1, 45.2 / Task 54.4）
    viewMode: 'tree' as EstimateViewMode,
    onViewModeChange: vi.fn(),
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

  // 55.1, 55.3, 55.6: 注記行（Task 53.8）
  describe('注記行追加ボタン（55.1, 55.3）', () => {
    it('「注記行追加」ボタンが未選択時も有効で表示されること (55.1)', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      const button = screen.getByTestId('add-note-button');
      expect(button).toHaveTextContent('注記行追加');
      expect(button).toBeEnabled();
    });

    it('注記行追加ボタンクリックでonAddNoteItemが呼ばれること (55.1)', async () => {
      const user = userEvent.setup();
      render(<EstimateItemToolbar {...defaultProps} />);

      await user.click(screen.getByTestId('add-note-button'));

      expect(defaultProps.onAddNoteItem).toHaveBeenCalledTimes(1);
    });

    it('注記行を選択中でも削除・複製・階層移動・並び替えのボタンが有効であること (55.6)', () => {
      const noteItem = createMockItem({
        id: 'note-1',
        parentId: 'item-parent',
        itemType: 'NOTE',
      });
      render(
        <EstimateItemToolbar
          {...defaultProps}
          selectedItemId="note-1"
          selectedItem={noteItem}
          hasPreviousSibling={true}
          canReorderUp={true}
          canReorderDown={true}
        />
      );

      expect(screen.getByRole('button', { name: '削除' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '複製' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '上の階層へ' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '下の階層へ' })).toBeEnabled();
      expect(screen.getByTestId('reorder-up-button')).toBeEnabled();
      expect(screen.getByTestId('reorder-down-button')).toBeEnabled();
    });

    it('注記行を選択中に削除・複製を押すと注記行のIDが渡されること (55.6)', async () => {
      const user = userEvent.setup();
      const noteItem = createMockItem({ id: 'note-1', itemType: 'NOTE' });
      render(
        <EstimateItemToolbar {...defaultProps} selectedItemId="note-1" selectedItem={noteItem} />
      );

      await user.click(screen.getByRole('button', { name: '複製' }));
      await user.click(screen.getByRole('button', { name: '削除' }));

      expect(defaultProps.onDuplicateItem).toHaveBeenCalledWith('note-1');
      expect(defaultProps.onDeleteItem).toHaveBeenCalledWith('note-1');
    });
  });

  // ==========================================================================
  // 階層表示モードの切替（Task 54.4 / 45.1, 45.2）
  //
  // design.md `#### File Structure Plan`:
  // `EstimateItemToolbar.tsx  # 改修: 範囲選択・モード切替・取り消しを追加`
  // に従い、切替操作はツールバー上に置く（範囲選択・取り消しの統合は 54.10 / 54.8）。
  // モードの所有者は `useEstimateNavigation` であり、本コンポーネントは
  // 表示中のモードを受け取って通知するだけで自前の state を持たない。
  // ==========================================================================
  describe('階層表示モードの切替 (45.1, 45.2)', () => {
    it('ツリー表示とドリルダウン表示の2つの選択肢を提供すること (45.1)', () => {
      render(<EstimateItemToolbar {...defaultProps} />);

      const group = screen.getByRole('radiogroup', { name: '階層表示モード' });
      expect(group).toBeInTheDocument();
      expect(within(group).getByRole('radio', { name: 'ツリー表示' })).toBeInTheDocument();
      expect(within(group).getByRole('radio', { name: 'ドリルダウン表示' })).toBeInTheDocument();
    });

    it('ツリー表示のときはツリー表示が選択済みとして示されること (45.2)', () => {
      render(<EstimateItemToolbar {...defaultProps} viewMode="tree" />);

      expect(screen.getByRole('radio', { name: 'ツリー表示' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      expect(screen.getByRole('radio', { name: 'ドリルダウン表示' })).toHaveAttribute(
        'aria-checked',
        'false'
      );
    });

    it('ドリルダウン表示のときはドリルダウン表示が選択済みとして示されること (45.1)', () => {
      render(<EstimateItemToolbar {...defaultProps} viewMode="drilldown" />);

      expect(screen.getByRole('radio', { name: 'ドリルダウン表示' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      expect(screen.getByRole('radio', { name: 'ツリー表示' })).toHaveAttribute(
        'aria-checked',
        'false'
      );
    });

    it('ドリルダウン表示を選ぶと切替が通知されること (45.1)', async () => {
      const user = userEvent.setup();
      const onViewModeChange = vi.fn();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          viewMode="tree"
          onViewModeChange={onViewModeChange}
        />
      );

      await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));

      expect(onViewModeChange).toHaveBeenCalledTimes(1);
      expect(onViewModeChange).toHaveBeenCalledWith('drilldown');
    });

    it('ツリー表示を選ぶと切替が通知されること (45.1)', async () => {
      const user = userEvent.setup();
      const onViewModeChange = vi.fn();
      render(
        <EstimateItemToolbar
          {...defaultProps}
          viewMode="drilldown"
          onViewModeChange={onViewModeChange}
        />
      );

      await user.click(screen.getByRole('radio', { name: 'ツリー表示' }));

      expect(onViewModeChange).toHaveBeenCalledTimes(1);
      expect(onViewModeChange).toHaveBeenCalledWith('tree');
    });

    it('モード切替は項目の選択状態に関わらず操作できること (45.1)', () => {
      render(<EstimateItemToolbar {...defaultProps} selectedItemId={null} selectedItem={null} />);

      expect(screen.getByRole('radio', { name: 'ツリー表示' })).toBeEnabled();
      expect(screen.getByRole('radio', { name: 'ドリルダウン表示' })).toBeEnabled();
    });
  });
});
