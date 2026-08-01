/**
 * @fileoverview EstimateItemTableコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateItemTable } from './EstimateItemTable';
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

const mockItems: EstimateItemHierarchyEdit[] = [
  {
    id: 'item-1',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 1,
    lines: [createLine('line-1', 'item-1', 'ESTIMATE', '仮設工事', '500000')],
    children: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'item-2',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 2,
    lines: [createLine('line-2', 'item-2', 'ESTIMATE', '基礎工事', '1200000')],
    children: [
      {
        id: 'item-2-1',
        estimateId: 'estimate-1',
        parentId: 'item-2',
        displayOrder: 1,
        lines: [createLine('line-2-1', 'item-2-1', 'ESTIMATE', 'コンクリート工事', '800000')],
        children: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'item-2-2',
        estimateId: 'estimate-1',
        parentId: 'item-2',
        displayOrder: 2,
        lines: [createLine('line-2-2', 'item-2-2', 'ESTIMATE', '鉄筋工事', '400000')],
        children: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const meta = {
  title: 'Estimate/EstimateItemTable',
  component: EstimateItemTable,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '見積項目を階層的なテーブル形式で表示するコンポーネント',
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
} satisfies Meta<typeof EstimateItemTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基本的な表示
 */
export const Default: Story = {
  args: {
    items: mockItems,
    selectedKeys: [],
    draggable: false,
  },
};

/**
 * 項目選択状態
 */
export const WithSelectedItem: Story = {
  args: {
    items: mockItems,
    selectedKeys: ['item-2'],
    draggable: false,
  },
};

/**
 * ドラッグ&ドロップ有効
 */
export const DraggableEnabled: Story = {
  args: {
    items: mockItems,
    selectedKeys: [],
    draggable: true,
  },
};

/**
 * 空の状態
 */
export const Empty: Story = {
  args: {
    items: [],
    selectedKeys: [],
    draggable: false,
  },
};
