/**
 * @fileoverview EstimateItemRowコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateItemRow } from './EstimateItemRow';
import type { EstimateItemLineEdit } from '../../hooks/useEstimateEditor';

const mockEstimateLines: EstimateItemLineEdit[] = [
  {
    id: 'line-1',
    estimateItemId: 'item-1',
    lineType: 'ESTIMATE',
    name: '仮設工事',
    specification: '一式',
    unit: '式',
    quantity: '1',
    unitPrice: '500000',
    amount: '500000',
    remarks: null,
  },
];

const mockExecutionLines: EstimateItemLineEdit[] = [
  {
    id: 'line-2',
    estimateItemId: 'item-1',
    lineType: 'EXECUTION',
    name: '仮設工事',
    specification: '一式',
    unit: '式',
    quantity: '1',
    unitPrice: '450000',
    amount: '450000',
    remarks: '原価',
  },
];

const mockVendorLines: EstimateItemLineEdit[] = [
  {
    id: 'line-3',
    estimateItemId: 'item-1',
    lineType: 'VENDOR',
    name: '仮設工事',
    specification: '一式',
    unit: '式',
    quantity: '1',
    unitPrice: '400000',
    amount: '400000',
    remarks: null,
  },
];

const meta = {
  title: 'Estimate/EstimateItemRow',
  component: EstimateItemRow,
  decorators: [
    (Story) => (
      <div aria-label="見積項目テーブル">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '見積項目の1行を表示するコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onLineChange: fn(),
  },
} satisfies Meta<typeof EstimateItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 見積金額行のみ
 */
export const EstimateLineOnly: Story = {
  args: {
    itemId: 'item-1',
    lines: mockEstimateLines,
    indentLevel: 0,
    isSelected: false,
  },
};

/**
 * 選択状態
 */
export const Selected: Story = {
  args: {
    itemId: 'item-1',
    lines: mockEstimateLines,
    indentLevel: 0,
    isSelected: true,
  },
};

/**
 * インデントあり
 */
export const Indented: Story = {
  args: {
    itemId: 'item-2',
    lines: mockEstimateLines,
    indentLevel: 2,
    isSelected: false,
  },
};

/**
 * 複数行タイプ
 */
export const MultipleLineTypes: Story = {
  args: {
    itemId: 'item-3',
    lines: [...mockEstimateLines, ...mockExecutionLines, ...mockVendorLines],
    indentLevel: 0,
    isSelected: false,
  },
};
