/**
 * @fileoverview ProfitRateDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ProfitRateDialog } from './ProfitRateDialog';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
} from '../../hooks/useEstimateEditor';

const createExecutionLine = (
  id: string,
  itemId: string,
  name: string,
  unitPrice: string
): EstimateItemLineEdit => ({
  id,
  estimateItemId: itemId,
  lineType: 'EXECUTION',
  name,
  specification: '一式',
  unit: '式',
  quantity: '1',
  unitPrice,
  amount: unitPrice,
  remarks: null,
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

const createVendorLine = (id: string, itemId: string): EstimateItemLineEdit => ({
  id: `vnd-${id}`,
  estimateItemId: itemId,
  lineType: 'VENDOR',
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
      createExecutionLine('exec-1', 'item-1', '仮設工事', '450000'),
      createVendorLine('1', 'item-1'),
    ],
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
    lines: [
      createEstimateLine('2', 'item-2'),
      createExecutionLine('exec-2', 'item-2', '基礎工事', '1100000'),
      createVendorLine('2', 'item-2'),
    ],
    children: [],
    isExpanded: true,
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
      createExecutionLine('exec-3', 'item-3', '電気設備工事', '750000'),
      createVendorLine('3', 'item-3'),
    ],
    children: [],
    isExpanded: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const meta = {
  title: 'Estimate/ProfitRateDialog',
  component: ProfitRateDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '実行金額を見積金額に転記する利益率適用ダイアログ。利益率入力、上書きオプション、適用プレビュー機能を提供する。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onComplete: fn(),
  },
} satisfies Meta<typeof ProfitRateDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 表示状態（実行金額行あり）
 */
export const Default: Story = {
  args: {
    isOpen: true,
    estimateId: 'estimate-1',
    items: mockItems,
  },
};

/**
 * 実行金額行なし
 */
export const NoExecutionLines: Story = {
  args: {
    isOpen: true,
    estimateId: 'estimate-1',
    items: [],
  },
};

/**
 * 閉じた状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    estimateId: 'estimate-1',
    items: mockItems,
  },
};
