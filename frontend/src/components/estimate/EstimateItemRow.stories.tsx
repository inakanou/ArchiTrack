/**
 * @fileoverview EstimateItemRowコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateItemRow } from './EstimateItemRow';
import type { EstimateItemLine } from '../../api/estimates';

const mockEstimateLines: EstimateItemLine[] = [
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
    sourceReceivedQuotationLineItemId: null,
    sourceVendorName: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const mockExecutionLines: EstimateItemLine[] = [
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
    sourceReceivedQuotationLineItemId: null,
    sourceVendorName: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const mockVendorLines: EstimateItemLine[] = [
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
    sourceReceivedQuotationLineItemId: 'rq-line-1',
    sourceVendorName: '株式会社サンプル',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const meta = {
  title: 'Estimate/EstimateItemRow',
  component: EstimateItemRow,
  decorators: [
    (Story) => (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <Story />
        </tbody>
      </table>
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
