/**
 * @fileoverview ReceivedQuotationListコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ReceivedQuotationList } from './ReceivedQuotationList';
import type { ReceivedQuotationInfo } from '../../api/received-quotations';

const mockQuotations: ReceivedQuotationInfo[] = [
  {
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
        name: '鉄筋工事',
        specification: 'D10',
        unit: 'kg',
        quantity: 1500,
        unitPrice: 120,
        amount: 180000,
        remarks: null,
        sortOrder: 0,
      },
    ],
    totalAmount: 180000,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
  },
  {
    id: 'rq-2',
    estimateRequestId: 'er-1',
    name: '株式会社B建設 見積書',
    submittedAt: new Date('2025-01-18'),
    fileName: 'quotation_b.xlsx',
    fileSize: 102400,
    fileMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lineItems: [
      {
        id: 'li-2',
        receivedQuotationId: 'rq-2',
        name: '基礎工事',
        specification: '一式',
        unit: '式',
        quantity: 1,
        unitPrice: 1200000,
        amount: 1200000,
        remarks: null,
        sortOrder: 0,
      },
      {
        id: 'li-3',
        receivedQuotationId: 'rq-2',
        name: '配筋工事',
        specification: '一式',
        unit: '式',
        quantity: 1,
        unitPrice: 500000,
        amount: 500000,
        remarks: null,
        sortOrder: 1,
      },
    ],
    totalAmount: 1700000,
    createdAt: new Date('2025-01-18'),
    updatedAt: new Date('2025-01-18'),
  },
  {
    id: 'rq-3',
    estimateRequestId: 'er-1',
    name: 'C電気商会 見積書',
    submittedAt: new Date('2025-01-20'),
    fileName: null,
    fileSize: null,
    fileMimeType: null,
    lineItems: [
      {
        id: 'li-4',
        receivedQuotationId: 'rq-3',
        name: '電気工事',
        specification: '一式',
        unit: '式',
        quantity: 1,
        unitPrice: 800000,
        amount: 800000,
        remarks: '照明込み',
        sortOrder: 0,
      },
    ],
    totalAmount: 800000,
    createdAt: new Date('2025-01-20'),
    updatedAt: new Date('2025-01-20'),
  },
];

const meta = {
  title: 'EstimateRequests/ReceivedQuotationList',
  component: ReceivedQuotationList,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '受領見積書一覧コンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onAddClick: fn(),
    onEditClick: fn(),
    onDeleteClick: fn(),
    onPreviewClick: fn(),
  },
} satisfies Meta<typeof ReceivedQuotationList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * データあり
 */
export const WithData: Story = {
  args: {
    estimateRequestId: 'er-1',
    quotations: mockQuotations,
    disabled: false,
  },
};

/**
 * 空の状態
 */
export const Empty: Story = {
  args: {
    estimateRequestId: 'er-1',
    quotations: [],
    disabled: false,
  },
};

/**
 * 無効状態
 */
export const Disabled: Story = {
  args: {
    estimateRequestId: 'er-1',
    quotations: mockQuotations,
    disabled: true,
  },
};
