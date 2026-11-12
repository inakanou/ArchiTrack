/**
 * @fileoverview ReceivedQuotationSectionCard の Storybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { ReceivedQuotationSectionCard } from './ReceivedQuotationSectionCard';
import type { ReceivedQuotationSectionItem } from './ReceivedQuotationSectionCard';

const mockReceivedQuotations: ReceivedQuotationSectionItem[] = [
  {
    id: 'rq-1',
    name: '電気設備工事 見積',
    vendorName: '株式会社電設',
    submittedAt: '2026-10-05T00:00:00.000Z',
    netAmount: 1234567,
    createdAt: '2026-10-06T09:00:00.000Z',
  },
  {
    id: 'rq-2',
    name: '空調工事 見積',
    vendorName: '空調サービス株式会社',
    submittedAt: '2026-09-20T00:00:00.000Z',
    netAmount: null,
    createdAt: '2026-09-21T09:00:00.000Z',
  },
  {
    id: 'rq-3',
    name: '内装工事 見積',
    vendorName: '内装工房',
    submittedAt: '2026-09-01T00:00:00.000Z',
    netAmount: 850000,
    createdAt: '2026-09-02T09:00:00.000Z',
  },
];

const meta = {
  title: 'Projects/ReceivedQuotationSectionCard',
  component: ReceivedQuotationSectionCard,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <div style={{ maxWidth: '800px' }}>
          <Story />
        </div>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'プロジェクト詳細画面の受領見積書セクションカード',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ReceivedQuotationSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** データあり（登録の権限あり） */
export const WithData: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 5,
    latestReceivedQuotations: mockReceivedQuotations,
    isLoading: false,
    canRegister: true,
  },
};

/** データあり（登録の権限なし） */
export const WithDataWithoutRegisterPermission: Story = {
  args: {
    ...WithData.args,
    canRegister: false,
  },
};

/** 空（登録の権限あり） */
export const Empty: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 0,
    latestReceivedQuotations: [],
    isLoading: false,
    canRegister: true,
  },
};

/** 空（登録の権限なし） */
export const EmptyWithoutRegisterPermission: Story = {
  args: {
    ...Empty.args,
    canRegister: false,
  },
};

/** ロード中 */
export const Loading: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 0,
    latestReceivedQuotations: [],
    isLoading: true,
    canRegister: true,
  },
};
