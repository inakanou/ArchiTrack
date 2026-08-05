/**
 * @fileoverview NetAllocationDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NetAllocationDialog } from './NetAllocationDialog';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
} from '../../hooks/useEstimateEditor';

const createVendorLine = (
  id: string,
  itemId: string,
  name: string,
  amount: string,
  vendorName: string
): EstimateItemLineEdit => ({
  id,
  estimateItemId: itemId,
  lineType: 'VENDOR',
  name,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount,
  remarks: null,
  sourceVendorName: vendorName,
});

const createEstimateLine = (id: string, itemId: string): EstimateItemLineEdit => ({
  id: `est-${id}`,
  estimateItemId: itemId,
  lineType: 'ESTIMATE',
  name: null,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: null,
  remarks: null,
});

const createExecutionLine = (id: string, itemId: string): EstimateItemLineEdit => ({
  id: `exec-${id}`,
  estimateItemId: itemId,
  lineType: 'EXECUTION',
  name: null,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: null,
  remarks: null,
});

const mockItems: EstimateItemHierarchyEdit[] = [
  {
    id: 'item-1',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 1,
    lines: [
      createEstimateLine('1', 'item-1'),
      createExecutionLine('1', 'item-1'),
      createVendorLine('v-1', 'item-1', '仮設工事', '500000', 'A建設'),
    ],
    children: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'item-2',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 2,
    lines: [
      createEstimateLine('2', 'item-2'),
      createExecutionLine('2', 'item-2'),
      createVendorLine('v-2', 'item-2', '基礎工事', '1200000', 'A建設'),
    ],
    children: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'item-3',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 3,
    lines: [
      createEstimateLine('3', 'item-3'),
      createExecutionLine('3', 'item-3'),
      createVendorLine('v-3', 'item-3', '電気設備工事', '800000', 'B電工'),
    ],
    children: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const meta = {
  title: 'Estimate/NetAllocationDialog',
  component: NetAllocationDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '業者金額を実行金額に転記するNET金額案分ダイアログ。対象業者の選択、除外行の指定、NET金額入力、案分プレビュー機能を提供する。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onApply: fn(),
  },
} satisfies Meta<typeof NetAllocationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 表示状態（業者あり）
 */
export const Default: Story = {
  args: {
    isOpen: true,
    projectId: 'project-1',
    items: mockItems,
  },
};

/**
 * 業者行なし
 */
export const NoVendorLines: Story = {
  args: {
    isOpen: true,
    projectId: 'project-1',
    items: [],
  },
};

/**
 * 閉じた状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    projectId: 'project-1',
    items: mockItems,
  },
};
