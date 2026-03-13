/**
 * @fileoverview ContractSectionCardコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { ContractSectionCard } from './ContractSectionCard';
import type { ContractSectionItem } from './ContractSectionCard';

const mockContracts: ContractSectionItem[] = [
  {
    id: 'contract-1',
    contractType: 'NEW',
    contractDate: '2025-01-20',
    status: 'CONTRACTED',
    contractAmount: 13750000,
    createdAt: '2025-01-15T10:30:00Z',
  },
  {
    id: 'contract-2',
    contractType: 'AMENDMENT',
    contractDate: '2025-03-01',
    status: 'BEFORE_CONTRACT',
    contractAmount: 9625000,
    createdAt: '2025-02-28T14:00:00Z',
  },
  {
    id: 'contract-3',
    contractType: 'NEW',
    contractDate: '2025-04-10',
    status: 'CONTRACTED',
    contractAmount: 25000000,
    createdAt: '2025-04-05T09:00:00Z',
  },
];

const meta = {
  title: 'Projects/ContractSectionCard',
  component: ContractSectionCard,
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
        component: 'プロジェクト詳細画面の契約書セクションカードコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ContractSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * データあり
 */
export const WithData: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 5,
    latestContracts: mockContracts,
    isLoading: false,
  },
};

/**
 * 空の状態
 */
export const Empty: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 0,
    latestContracts: [],
    isLoading: false,
  },
};

/**
 * ローディング中
 */
export const Loading: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 0,
    latestContracts: [],
    isLoading: true,
  },
};

/**
 * 1件のみ
 */
export const SingleItem: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 1,
    latestContracts: [mockContracts[0]!],
    isLoading: false,
  },
};
