/**
 * @fileoverview ExecutionBudgetSectionCardコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { ExecutionBudgetSectionCard } from './ExecutionBudgetSectionCard';
import type { ExecutionBudgetSectionInfo } from './ExecutionBudgetSectionCard';

const mockBudgetInfo: ExecutionBudgetSectionInfo = {
  id: 'budget-1',
  contractName: '新築工事請負契約',
  contractAmount: 13750000,
  createdAt: '2025-01-15T10:30:00Z',
  executionAmountTotal: '8500000',
  profitForecast: '5250000',
  orderProgressRate: '62',
};

const meta = {
  title: 'Projects/ExecutionBudgetSectionCard',
  component: ExecutionBudgetSectionCard,
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
        component: 'プロジェクト詳細画面の実行予算セクションカードコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ExecutionBudgetSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * データあり
 */
export const WithData: Story = {
  args: {
    projectId: 'project-1',
    budgetInfo: mockBudgetInfo,
    isLoading: false,
  },
};

/**
 * 空の状態（実行予算未作成）
 */
export const Empty: Story = {
  args: {
    projectId: 'project-1',
    budgetInfo: null,
    isLoading: false,
  },
};

/**
 * ローディング中
 */
export const Loading: Story = {
  args: {
    projectId: 'project-1',
    budgetInfo: null,
    isLoading: true,
  },
};
