/**
 * @fileoverview EstimateHierarchyPanelコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateHierarchyPanel } from './EstimateHierarchyPanel';
import type {
  EditableItem,
  EstimateEditItemType,
  NodeKey,
} from '../../domain/estimate/estimateTree';

/** 俯瞰パネルは見積金額行の名称のみを使うため、行は1本だけ持たせる */
const createItem = (
  id: string,
  name: string | null,
  children: EditableItem[] = [],
  itemType: EstimateEditItemType = 'STANDARD'
): EditableItem => ({
  id,
  tempId: null,
  itemType,
  lines: [
    {
      id: `line-${id}`,
      lineType: 'ESTIMATE',
      name,
      specification: '一式',
      unit: '式',
      quantity: '1',
      unitPrice: '100000',
      amount: '100000',
      remarks: null,
      sourceVendorName: null,
    },
  ],
  children,
});

const mockItems: EditableItem[] = [
  createItem('item-1', '仮設工事'),
  createItem('item-2', '基礎工事', [
    createItem('item-2-1', 'コンクリート工事'),
    createItem('item-2-2', '鉄筋工事', [createItem('item-2-2-1', '鉄筋加工')]),
  ]),
  createItem('item-3', null),
  createItem('item-4', '出精値引き', [], 'DISCOUNT'),
];

const meta = {
  title: 'Estimate/EstimateHierarchyPanel',
  component: EstimateHierarchyPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '階層構造の俯瞰パネル（46.2〜46.6）。明細の階層だけをツリー形式で俯瞰し、目的の項目への移動と展開/折りたたみを提供する。折りたたみ状態・選択状態は保持せず `useEstimateNavigation` から受け取る。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onToggleCollapsed: fn(),
    onExpandAll: fn(),
    onCollapseAll: fn(),
    onSelect: fn(),
  },
} satisfies Meta<typeof EstimateHierarchyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 全階層を展開した状態（46.2）
 */
export const Expanded: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(),
    selectedKey: null,
  },
};

/**
 * 一部を折りたたんだ状態（46.3）
 * 折りたたんだ項目の子孫は表示されない
 */
export const PartiallyCollapsed: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(['item-2']),
    selectedKey: null,
  },
};

/**
 * 項目を選択した状態（46.5）
 */
export const WithSelectedItem: Story = {
  args: {
    items: mockItems,
    collapsedKeys: new Set<NodeKey>(),
    selectedKey: 'item-2-1',
  },
};

/**
 * 見積項目が無い状態
 */
export const Empty: Story = {
  args: {
    items: [],
    collapsedKeys: new Set<NodeKey>(),
    selectedKey: null,
  },
};
