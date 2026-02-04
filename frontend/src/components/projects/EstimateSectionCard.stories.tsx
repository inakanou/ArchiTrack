/**
 * @fileoverview EstimateSectionCardコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { EstimateSectionCard } from './EstimateSectionCard';
import type { EstimateInfo } from '../../api/estimates';

const mockEstimates: EstimateInfo[] = [
  {
    id: 'est-1',
    projectId: 'project-1',
    name: '〇〇ビル新築工事見積書',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-15T10:30:00Z',
    totalAmount: '12500000',
  },
  {
    id: 'est-2',
    projectId: 'project-1',
    name: '△△マンション改修工事見積書',
    sourceItemizedStatementId: 'is-1',
    sourceItemizedStatementName: '内訳書A',
    createdAt: '2025-01-20T14:00:00Z',
    updatedAt: '2025-01-20T14:00:00Z',
    totalAmount: '8750000',
  },
  {
    id: 'est-3',
    projectId: 'project-1',
    name: '電気設備工事見積書',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2025-01-25T09:15:00Z',
    updatedAt: '2025-01-25T09:15:00Z',
    totalAmount: null,
  },
];

const meta = {
  title: 'Projects/EstimateSectionCard',
  component: EstimateSectionCard,
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
        component: 'プロジェクト詳細画面の見積書セクションカードコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EstimateSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * データあり
 */
export const WithData: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 5,
    latestEstimates: mockEstimates,
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
    latestEstimates: [],
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
    latestEstimates: [],
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
    latestEstimates: [mockEstimates[0]!],
    isLoading: false,
  },
};
