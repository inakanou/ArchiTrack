/**
 * @fileoverview EstimateItemDrilldownViewコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateItemDrilldownView } from './EstimateItemDrilldownView';
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
  title: 'Estimate/EstimateItemDrilldownView',
  component: EstimateItemDrilldownView,
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
          '明細のドリルダウン表示（45.6〜45.9）。現在の階層に属する項目のみを一覧表示し、ルートからの経路と階層下げ・階層上げを提供する。現在階層は保持せず `useEstimateNavigation` から受け取る。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onCurrentLevelChange: fn(),
    onItemSelect: fn(),
    onLineChange: fn(),
    onDragStart: fn(),
    onDrop: fn(),
  },
} satisfies Meta<typeof EstimateItemDrilldownView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ルート階層（45.6）
 * これ以上は上げられないため「一つ上の階層へ戻る」は出さない
 */
export const RootLevel: Story = {
  args: {
    items: mockItems,
    currentLevelKey: null,
    selectedKeys: [],
    draggable: false,
  },
};

/**
 * 子階層を表示中（45.8）
 * 経路の各段から上位階層へ戻れる（45.7）
 */
export const ChildLevel: Story = {
  args: {
    items: mockItems,
    currentLevelKey: 'item-2',
    selectedKeys: [],
    draggable: false,
  },
};

/**
 * 孫階層を表示中（経路が3段）
 */
export const GrandChildLevel: Story = {
  args: {
    items: mockItems,
    currentLevelKey: 'item-2-1',
    selectedKeys: [],
    draggable: false,
  },
};

/**
 * 項目を選択した状態（23.7, 44.1）
 */
export const WithSelectedItem: Story = {
  args: {
    items: mockItems,
    currentLevelKey: 'item-2',
    selectedKeys: ['item-2-1'],
    draggable: false,
  },
};

/**
 * 子を持たない項目の階層（この階層に項目がありません）
 */
export const EmptyLevel: Story = {
  args: {
    items: mockItems,
    currentLevelKey: 'item-1',
    selectedKeys: [],
    draggable: false,
  },
};

/**
 * ドラッグ&ドロップ有効（12.2）
 */
export const DraggableEnabled: Story = {
  args: {
    items: mockItems,
    currentLevelKey: null,
    selectedKeys: [],
    draggable: true,
  },
};
