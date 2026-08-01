/**
 * @fileoverview EstimateHierarchyPanel のテスト
 *
 * Task 54.5: 階層構造の俯瞰パネル
 *
 * パネルは折りたたみ状態も選択状態も**自前で持たない**（所有者は
 * `useEstimateNavigation`）ため、本ファイルは「与えられた状態をツリー形式で
 * 描画すること」と「操作が正しい要求として外へ出ること」を検証します。
 *
 * Requirements (estimate-creation):
 * - 46.2: 見積項目の階層構造をツリー形式で表示する
 * - 46.3: 各項目の展開/折りたたみ操作を提供する
 * - 46.4: すべて展開・すべて折りたたむ操作を提供する
 * - 46.5: 項目を選択した場合、当該項目への移動を要求する
 * - 46.6: 明細の階層構造が編集で変化した場合、変化後の構造を反映する
 *
 * Design: design.md `EstimateHierarchyPanel.tsx  # 新規: 階層構造の俯瞰パネル`（:3725）、
 * 対応表「46.1〜46.7 | 階層構造の俯瞰パネル | EstimateHierarchyPanel, estimateTree |
 * `HierarchyNode[]`」（:3910）
 *
 * @module components/estimate/EstimateHierarchyPanel.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateHierarchyPanel } from './EstimateHierarchyPanel';
import type { NodeKey } from '../../domain/estimate/estimateTree';
import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
} from '../../domain/estimate/estimateEditReducer.types';

// ============================================================================
// テストデータ
// ============================================================================

const createLine = (lineType: EstimateLineType, name: string | null): EditableLine => ({
  id: `line-${name ?? 'none'}-${lineType}`,
  lineType,
  name,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: '1000',
  remarks: null,
  sourceVendorName: null,
});

const createItem = (
  id: string,
  name: string | null,
  children: readonly EditableItem[] = [],
  itemType: EstimateEditItemType = 'STANDARD'
): EditableItem => ({
  id,
  tempId: null,
  itemType,
  lines: [createLine('ESTIMATE', name), createLine('EXECUTION', name), createLine('VENDOR', name)],
  children,
});

/** 表示順（先行順）は item-a, item-a1, item-a1x, item-a2, item-b */
const createTree = (): readonly EditableItem[] => [
  createItem('item-a', '建築工事', [
    createItem('item-a1', '直接仮設工事', [createItem('item-a1x', '遣り方')]),
    createItem('item-a2', '土工事'),
  ]),
  createItem('item-b', '電気設備工事'),
];

const NO_COLLAPSED_KEYS: ReadonlySet<NodeKey> = new Set<NodeKey>();

interface RenderOptions {
  items?: readonly EditableItem[];
  collapsedKeys?: ReadonlySet<NodeKey>;
  selectedKey?: NodeKey | null;
}

const handlers = () => ({
  onToggleCollapsed: vi.fn(),
  onExpandAll: vi.fn(),
  onCollapseAll: vi.fn(),
  onSelect: vi.fn(),
});

const renderPanel = (options: RenderOptions = {}, spies = handlers()) => {
  const view = render(
    <EstimateHierarchyPanel
      items={options.items ?? createTree()}
      collapsedKeys={options.collapsedKeys ?? NO_COLLAPSED_KEYS}
      selectedKey={options.selectedKey ?? null}
      onToggleCollapsed={spies.onToggleCollapsed}
      onExpandAll={spies.onExpandAll}
      onCollapseAll={spies.onCollapseAll}
      onSelect={spies.onSelect}
    />
  );
  return { ...view, spies };
};

/** ツリー項目の見出し（アクセシブル名は項目の名称） */
const treeItemNames = (): string[] =>
  screen.getAllByRole('treeitem').map((element) => element.getAttribute('data-node-key') ?? '');

// ============================================================================
// テスト
// ============================================================================

describe('EstimateHierarchyPanel', () => {
  describe('ツリー形式の表示（46.2）', () => {
    /** @requirement estimate-creation/REQ-46.2 */
    it('見積項目の階層構造をツリー形式で表示する', () => {
      renderPanel();

      expect(screen.getByRole('tree')).toBeInTheDocument();
      expect(treeItemNames()).toEqual(['item-a', 'item-a1', 'item-a1x', 'item-a2', 'item-b']);
    });

    /** @requirement estimate-creation/REQ-46.2 */
    it('各項目の階層の深さを示す', () => {
      renderPanel();

      expect(screen.getByTestId('hierarchy-node-item-a')).toHaveAttribute('aria-level', '1');
      expect(screen.getByTestId('hierarchy-node-item-a1')).toHaveAttribute('aria-level', '2');
      expect(screen.getByTestId('hierarchy-node-item-a1x')).toHaveAttribute('aria-level', '3');
      expect(screen.getByTestId('hierarchy-node-item-b')).toHaveAttribute('aria-level', '1');
    });

    /** @requirement estimate-creation/REQ-46.2 */
    it('項目の名称を表示する', () => {
      renderPanel();

      expect(
        within(screen.getByTestId('hierarchy-node-item-a1x')).getByRole('button', {
          name: '遣り方',
        })
      ).toBeInTheDocument();
    });

    /** @requirement estimate-creation/REQ-46.2 */
    it('名称が未入力の項目も欠落させずに表示する', () => {
      renderPanel({ items: [createItem('item-empty', null)] });

      expect(screen.getAllByRole('treeitem')).toHaveLength(1);
      expect(screen.getByRole('button', { name: '（名称未設定）' })).toBeInTheDocument();
    });

    /**
     * 注記行・値引き行は明細側に専用の描画分岐があるため、俯瞰パネルでも
     * 取り違えずに種別を判別できることを固定する（41.2, 55.1）。
     *
     * @requirement estimate-creation/REQ-46.2
     */
    it('注記行・値引き行も種別を保ったまま表示する', () => {
      renderPanel({
        items: [
          createItem('item-note', '※現場条件による', [], 'NOTE'),
          createItem('item-discount', '値引き', [], 'DISCOUNT'),
        ],
      });

      expect(screen.getByTestId('hierarchy-node-item-note')).toHaveAttribute(
        'data-item-type',
        'NOTE'
      );
      expect(screen.getByTestId('hierarchy-node-item-discount')).toHaveAttribute(
        'data-item-type',
        'DISCOUNT'
      );
      expect(screen.getByRole('button', { name: '※現場条件による' })).toBeInTheDocument();
    });

    /** @requirement estimate-creation/REQ-46.2 */
    it('見積項目が無い場合は空であることを示す', () => {
      renderPanel({ items: [] });

      expect(screen.queryByRole('treeitem')).not.toBeInTheDocument();
      expect(screen.getByText('見積項目がありません')).toBeInTheDocument();
    });
  });

  describe('展開・折りたたみ（46.3）', () => {
    /** @requirement estimate-creation/REQ-46.3 */
    it('子を持つ項目にのみ展開/折りたたみ操作を提供する', () => {
      renderPanel();

      expect(screen.getByRole('button', { name: '建築工事 を折りたたむ' })).toBeInTheDocument();
      expect(
        within(screen.getByTestId('hierarchy-node-item-b')).queryByRole('button', {
          name: /折りたたむ|展開する/,
        })
      ).not.toBeInTheDocument();
    });

    /** @requirement estimate-creation/REQ-46.3 */
    it('折りたたみ操作を切り替え要求として通知する（自前では状態を持たない）', async () => {
      const user = userEvent.setup();
      const { spies } = renderPanel();

      await user.click(screen.getByRole('button', { name: '建築工事 を折りたたむ' }));

      expect(spies.onToggleCollapsed).toHaveBeenCalledTimes(1);
      expect(spies.onToggleCollapsed).toHaveBeenCalledWith('item-a');
      // 自前で状態を持たないため、押しただけでは子孫は消えない
      expect(screen.getByTestId('hierarchy-node-item-a1')).toBeInTheDocument();
    });

    /** @requirement estimate-creation/REQ-46.3 */
    it('折りたたまれた項目の子孫を表示しない', () => {
      renderPanel({ collapsedKeys: new Set<NodeKey>(['item-a1']) });

      expect(treeItemNames()).toEqual(['item-a', 'item-a1', 'item-a2', 'item-b']);
      expect(screen.getByTestId('hierarchy-node-item-a1')).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      expect(screen.getByTestId('hierarchy-node-item-a')).toHaveAttribute('aria-expanded', 'true');
    });

    /** @requirement estimate-creation/REQ-46.3 */
    it('折りたたみ中の項目には展開する操作を提供する', async () => {
      const user = userEvent.setup();
      const { spies } = renderPanel({ collapsedKeys: new Set<NodeKey>(['item-a']) });

      await user.click(screen.getByRole('button', { name: '建築工事 を展開する' }));

      expect(spies.onToggleCollapsed).toHaveBeenCalledTimes(1);
      expect(spies.onToggleCollapsed).toHaveBeenCalledWith('item-a');
    });
  });

  describe('すべて展開・すべて折りたたむ（46.4）', () => {
    /** @requirement estimate-creation/REQ-46.4 */
    it('すべて展開の操作を提供する', async () => {
      const user = userEvent.setup();
      const { spies } = renderPanel();

      await user.click(screen.getByRole('button', { name: 'すべて展開' }));

      expect(spies.onExpandAll).toHaveBeenCalledTimes(1);
      expect(spies.onCollapseAll).not.toHaveBeenCalled();
    });

    /** @requirement estimate-creation/REQ-46.4 */
    it('すべて折りたたむの操作を提供する', async () => {
      const user = userEvent.setup();
      const { spies } = renderPanel();

      await user.click(screen.getByRole('button', { name: 'すべて折りたたむ' }));

      expect(spies.onCollapseAll).toHaveBeenCalledTimes(1);
      expect(spies.onExpandAll).not.toHaveBeenCalled();
    });
  });

  describe('項目の選択（46.5）', () => {
    /** @requirement estimate-creation/REQ-46.5 */
    it('項目を選択すると当該項目のキーを通知する', async () => {
      const user = userEvent.setup();
      const { spies } = renderPanel();

      await user.click(screen.getByRole('button', { name: '遣り方' }));

      expect(spies.onSelect).toHaveBeenCalledTimes(1);
      expect(spies.onSelect).toHaveBeenCalledWith('item-a1x');
    });

    /** @requirement estimate-creation/REQ-46.5 */
    it('展開/折りたたみ操作では項目を選択しない', async () => {
      const user = userEvent.setup();
      const { spies } = renderPanel();

      await user.click(screen.getByRole('button', { name: '建築工事 を折りたたむ' }));

      expect(spies.onSelect).not.toHaveBeenCalled();
    });

    /** @requirement estimate-creation/REQ-46.5 */
    it('選択中の項目を選択状態として示す', () => {
      renderPanel({ selectedKey: 'item-a2' });

      expect(screen.getByTestId('hierarchy-node-item-a2')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('hierarchy-node-item-a')).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('構造変化への追従（46.6）', () => {
    /** @requirement estimate-creation/REQ-46.6 */
    it('項目が追加された明細ツリーを与えると追加後の構造を表示する', () => {
      const { rerender } = renderPanel();

      const nextTree: readonly EditableItem[] = [
        createItem('item-a', '建築工事', [
          createItem('item-a1', '直接仮設工事', [createItem('item-a1x', '遣り方')]),
          createItem('item-a2', '土工事'),
          createItem('item-a3', '躯体工事'),
        ]),
        createItem('item-b', '電気設備工事'),
      ];

      rerender(
        <EstimateHierarchyPanel
          items={nextTree}
          collapsedKeys={NO_COLLAPSED_KEYS}
          selectedKey={null}
          onToggleCollapsed={vi.fn()}
          onExpandAll={vi.fn()}
          onCollapseAll={vi.fn()}
          onSelect={vi.fn()}
        />
      );

      expect(treeItemNames()).toEqual([
        'item-a',
        'item-a1',
        'item-a1x',
        'item-a2',
        'item-a3',
        'item-b',
      ]);
    });

    /** @requirement estimate-creation/REQ-46.6 */
    it('階層が変わった明細ツリーを与えると変化後の深さを表示する', () => {
      const { rerender } = renderPanel();

      // item-b を item-a の子へネストした状態
      const nextTree: readonly EditableItem[] = [
        createItem('item-a', '建築工事', [
          createItem('item-a1', '直接仮設工事', [createItem('item-a1x', '遣り方')]),
          createItem('item-a2', '土工事'),
          createItem('item-b', '電気設備工事'),
        ]),
      ];

      rerender(
        <EstimateHierarchyPanel
          items={nextTree}
          collapsedKeys={NO_COLLAPSED_KEYS}
          selectedKey={null}
          onToggleCollapsed={vi.fn()}
          onExpandAll={vi.fn()}
          onCollapseAll={vi.fn()}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByTestId('hierarchy-node-item-b')).toHaveAttribute('aria-level', '2');
    });
  });
});
