/**
 * @fileoverview EstimateItemTreeViewコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateItemTreeView } from './EstimateItemTreeView';
import type { NodeKey } from '../../domain/estimate/estimateTree';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
} from '../../hooks/useEstimateEditor';

const createLine = (
  id: string,
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string,
  amount: string
): EstimateItemLineEdit => ({
  id,
  estimateItemId: itemId,
  lineType,
  name,
  specification: '一式',
  unit: '式',
  quantity: '1',
  unitPrice: amount,
  amount,
  remarks: null,
});

const createItem = (
  id: string,
  parentId: string | null,
  displayOrder: number,
  name: string,
  amount: string,
  children: EstimateItemHierarchyEdit[] = []
): EstimateItemHierarchyEdit => ({
  id,
  estimateId: 'estimate-1',
  parentId,
  displayOrder,
  lines: [createLine(`line-${id}`, id, 'ESTIMATE', name, amount)],
  children,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
});

const mockItems: EstimateItemHierarchyEdit[] = [
  createItem('item-1', null, 1, '仮設工事', '500000'),
  createItem('item-2', null, 2, '基礎工事', '1200000', [
    createItem('item-2-1', 'item-2', 1, 'コンクリート工事', '800000', [
      createItem('item-2-1-1', 'item-2-1', 1, '生コン打設', '500000'),
    ]),
    createItem('item-2-2', 'item-2', 2, '鉄筋工事', '400000'),
  ]),
];

const meta = {
  title: 'Estimate/EstimateItemTreeView',
  component: EstimateItemTreeView,
  // 明細テーブルの枠内に置かれる想定のため、外枠だけを与える
  // （見出しやラベルは配置側の `EstimateItemTable` が持つ）
  decorators: [
    (Story) => (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '明細のツリー表示（45.3〜45.5）。全階層をインデント付きで一覧表示し、子項目を持つ項目に展開/折りたたみ操作を提供する。折りたたみ状態は保持せず `useEstimateNavigation` から受け取る。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onItemSelect: fn(),
    onToggleCollapsed: fn(),
    onLineChange: fn(),
    onDragStart: fn(),
    onDrop: fn(),
  },
} satisfies Meta<typeof EstimateItemTreeView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 全階層を展開した状態（45.3）
 */
export const Expanded: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(),
    selectedKeys: [],
    draggable: false,
  },
};

/**
 * 一部を折りたたんだ状態（45.5）
 * 折りたたんだ項目の子孫は描画されない
 */
export const Collapsed: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(['item-2']),
    selectedKeys: [],
    draggable: false,
  },
};

/**
 * 単一選択（23.7, 44.1）
 */
export const SingleSelection: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(),
    selectedKeys: ['item-2-1'],
    draggable: false,
  },
};

/**
 * 範囲選択（47.6）
 * 表示順に並んだ複数の行をハイライトする
 */
export const RangeSelection: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(),
    selectedKeys: ['item-2', 'item-2-1', 'item-2-1-1'],
    draggable: false,
  },
};

/**
 * ドラッグ&ドロップ有効（12.2）
 */
export const DraggableEnabled: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(),
    selectedKeys: [],
    draggable: true,
  },
};

/**
 * 見積項目が無い状態
 */
export const Empty: Story = {
  args: {
    items: [],
    collapsedKeys: new Set<NodeKey>(),
    selectedKeys: [],
    draggable: false,
  },
};
