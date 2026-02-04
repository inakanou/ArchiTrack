/**
 * @fileoverview LineItemEditorコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { LineItemEditor, createEmptyLineItem, type LineItemFormData } from './LineItemEditor';

const mockLineItems: LineItemFormData[] = [
  {
    id: 'line-1',
    name: '鉄筋',
    specification: 'D10',
    unit: 'kg',
    quantity: '1500',
    unitPrice: '120',
    amount: 180000,
    remarks: '',
  },
  {
    id: 'line-2',
    name: 'コンクリート',
    specification: 'C24-15',
    unit: 'm3',
    quantity: '50',
    unitPrice: '15000',
    amount: 750000,
    remarks: '打設費込み',
  },
  {
    id: 'line-3',
    name: '型枠',
    specification: 'コンパネ',
    unit: 'm2',
    quantity: '200',
    unitPrice: '3500',
    amount: 700000,
    remarks: '',
  },
];

const meta = {
  title: 'EstimateRequests/LineItemEditor',
  component: LineItemEditor,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '受領見積書の明細行入力エディタコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onLineItemsChange: fn(),
  },
} satisfies Meta<typeof LineItemEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 初期状態（空の1行）
 */
export const Empty: Story = {
  args: {
    lineItems: [createEmptyLineItem()],
    disabled: false,
  },
};

/**
 * データあり
 */
export const WithData: Story = {
  args: {
    lineItems: mockLineItems,
    disabled: false,
  },
};

/**
 * 無効状態
 */
export const Disabled: Story = {
  args: {
    lineItems: mockLineItems,
    disabled: true,
  },
};

/**
 * 1行のみ（削除ボタン非活性）
 */
export const SingleRow: Story = {
  args: {
    lineItems: [mockLineItems[0]!],
    disabled: false,
  },
};
