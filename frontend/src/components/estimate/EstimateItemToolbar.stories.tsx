/**
 * @fileoverview EstimateItemToolbarコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateItemToolbar } from './EstimateItemToolbar';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';

const createSelectedItem = (parentId: string | null): EstimateItemHierarchyEdit => ({
  id: 'item-1',
  estimateId: 'estimate-1',
  parentId,
  displayOrder: 1,
  lines: [],
  children: [],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
});

const meta = {
  title: 'Estimate/EstimateItemToolbar',
  component: EstimateItemToolbar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '見積項目操作ツールバー。項目の追加・削除・複製・階層移動操作を提供する。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onAddItem: fn(),
    onAddChildItem: fn(),
    onAddDiscountItem: fn(),
    onAddNoteItem: fn(),
    onDeleteItems: fn(),
    onDuplicateItems: fn(),
    onMoveUpItems: fn(),
    onMoveDownItems: fn(),
    onReorderUp: fn(),
    onReorderDown: fn(),
    canReorderUp: false,
    canReorderDown: false,
    // 階層表示モードの切替（45.1, 45.2）
    viewMode: 'tree',
    onViewModeChange: fn(),
    // 取り消し・やり直し（48.1, 48.2, 48.4）
    canUndo: false,
    canRedo: false,
    onUndo: fn(),
    onRedo: fn(),
  },
} satisfies Meta<typeof EstimateItemToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 未選択状態（デフォルト）
 * 項目追加ボタンのみ有効、他は全てdisabled
 */
export const NoSelection: Story = {
  args: {
    selectedKeys: [],
    selectedItem: null,
    hasPreviousSibling: false,
  },
};

/**
 * ルートレベル項目選択
 * 上の階層へ移動はdisabled（parentIdがnull）
 */
export const RootItemSelected: Story = {
  args: {
    selectedKeys: ['item-1'],
    selectedItem: createSelectedItem(null),
    hasPreviousSibling: false,
  },
};

/**
 * 子項目選択（上の階層へ移動が有効）
 */
export const ChildItemSelected: Story = {
  args: {
    selectedKeys: ['item-1'],
    selectedItem: createSelectedItem('parent-1'),
    hasPreviousSibling: false,
  },
};

/**
 * 子項目選択かつ直前の兄弟あり（全ボタン有効）
 */
export const AllButtonsEnabled: Story = {
  args: {
    selectedKeys: ['item-1'],
    selectedItem: createSelectedItem('parent-1'),
    hasPreviousSibling: true,
  },
};

/**
 * ルートレベル項目選択かつ直前の兄弟あり
 * 下の階層へ移動のみ有効
 */
export const RootWithPreviousSibling: Story = {
  args: {
    selectedKeys: ['item-1'],
    selectedItem: createSelectedItem(null),
    hasPreviousSibling: true,
  },
};

/**
 * 範囲選択中（44.3, 44.8）
 *
 * 選択中の行数が表示され、削除・複製・階層の上げ下げは選択範囲全体が対象になる。
 * 「下の階層へ」は先頭行を親へ昇格させる規則（44.4）のため、先頭行に直前の兄弟が
 * 無くても操作できる。
 */
export const RangeSelected: Story = {
  args: {
    selectedKeys: ['item-1', 'item-2', 'item-3'],
    selectedItem: createSelectedItem('parent-1'),
    hasPreviousSibling: false,
  },
};

/**
 * ドリルダウン表示を選択中（45.1）
 * 階層表示モードの切替はいずれのボタンも項目の選択状態に依存せず常に操作できる
 */
export const DrilldownViewMode: Story = {
  args: {
    selectedKeys: [],
    selectedItem: null,
    hasPreviousSibling: false,
    viewMode: 'drilldown',
  },
};
