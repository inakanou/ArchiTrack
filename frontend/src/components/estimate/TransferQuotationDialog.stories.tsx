/**
 * @fileoverview TransferQuotationDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TransferQuotationDialog } from './TransferQuotationDialog';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
} from '../../hooks/useEstimateEditor';

const createLine = (
  id: string,
  itemId: string,
  name: string,
  amount: string
): EstimateItemLineEdit => ({
  id,
  estimateItemId: itemId,
  lineType: 'ESTIMATE',
  name,
  specification: '一式',
  unit: '式',
  quantity: '1',
  unitPrice: amount,
  amount,
  remarks: null,
});

const mockEstimateItems: EstimateItemHierarchyEdit[] = [
  {
    id: 'item-1',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 1,
    lines: [createLine('line-1', 'item-1', '仮設工事', '500000')],
    children: [],
    isExpanded: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'item-2',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 2,
    lines: [createLine('line-2', 'item-2', '基礎工事', '1200000')],
    children: [],
    isExpanded: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const meta = {
  title: 'Estimate/TransferQuotationDialog',
  component: TransferQuotationDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '受領見積書から見積書への転記ダイアログコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onTransferComplete: fn(),
  },
} satisfies Meta<typeof TransferQuotationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 表示状態
 */
export const Default: Story = {
  args: {
    isOpen: true,
    estimateId: 'estimate-1',
    projectId: 'project-1',
    estimateItems: mockEstimateItems,
  },
};

/**
 * 見積項目なし
 */
export const NoEstimateItems: Story = {
  args: {
    isOpen: true,
    estimateId: 'estimate-1',
    projectId: 'project-1',
    estimateItems: [],
  },
};

/**
 * 閉じた状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    estimateId: 'estimate-1',
    projectId: 'project-1',
    estimateItems: mockEstimateItems,
  },
};
