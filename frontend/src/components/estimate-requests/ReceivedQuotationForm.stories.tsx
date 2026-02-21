/**
 * @fileoverview ReceivedQuotationFormコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ReceivedQuotationForm } from './ReceivedQuotationForm';

const mockInitialData = {
  id: 'rq-1',
  estimateRequestId: 'er-1',
  name: '株式会社A工業 見積書',
  submittedAt: new Date('2025-01-15'),
  fileName: 'quotation_a.pdf',
  fileSize: 524288,
  fileMimeType: 'application/pdf',
  lineItems: [
    {
      id: 'li-1',
      receivedQuotationId: 'rq-1',
      customCategory: null,
      workType: null,
      name: '鉄筋工事',
      specification: 'D10',
      unit: 'kg',
      quantity: 1500,
      unitPrice: 120,
      amount: 180000,
      remarks: null,
      sortOrder: 0,
      createdAt: new Date('2025-01-15'),
      updatedAt: new Date('2025-01-15'),
    },
    {
      id: 'li-2',
      receivedQuotationId: 'rq-1',
      customCategory: null,
      workType: null,
      name: 'コンクリート工事',
      specification: 'C24-15',
      unit: 'm3',
      quantity: 50,
      unitPrice: 15000,
      amount: 750000,
      remarks: '打設費込み',
      sortOrder: 1,
      createdAt: new Date('2025-01-15'),
      updatedAt: new Date('2025-01-15'),
    },
  ],
  totalAmount: 930000,
  netAmount: null,
  createdAt: new Date('2025-01-15'),
  updatedAt: new Date('2025-01-15'),
};

const meta = {
  title: 'EstimateRequests/ReceivedQuotationForm',
  component: ReceivedQuotationForm,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '受領見積書の登録・編集フォームコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof ReceivedQuotationForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 新規作成モード
 */
export const CreateMode: Story = {
  args: {
    mode: 'create',
    estimateRequestId: 'er-1',
    initialData: undefined,
    isSubmitting: false,
  },
};

/**
 * 編集モード
 */
export const EditMode: Story = {
  args: {
    mode: 'edit',
    estimateRequestId: 'er-1',
    initialData: mockInitialData,
    isSubmitting: false,
  },
};

/**
 * 送信中
 */
export const Submitting: Story = {
  args: {
    mode: 'create',
    estimateRequestId: 'er-1',
    initialData: undefined,
    isSubmitting: true,
  },
};
