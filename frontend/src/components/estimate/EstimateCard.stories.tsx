/**
 * @fileoverview EstimateCardコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { EstimateCard } from './EstimateCard';

const meta = {
  title: 'Estimate/EstimateCard',
  component: EstimateCard,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <div style={{ width: '400px' }}>
          <Story />
        </div>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '見積書情報をカード形式で表示するコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EstimateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基本的な表示
 */
export const Default: Story = {
  args: {
    id: 'estimate-1',
    name: '〇〇ビル新築工事見積書',
    createdAt: '2025-01-15T10:30:00Z',
    totalAmount: '12500000',
  },
};

/**
 * 金額なし
 */
export const WithoutAmount: Story = {
  args: {
    id: 'estimate-2',
    name: '△△マンション改修工事見積書',
    createdAt: '2025-02-01T14:00:00Z',
    totalAmount: null,
  },
};

/**
 * 長い名称
 */
export const LongName: Story = {
  args: {
    id: 'estimate-3',
    name: '株式会社サンプル本社ビル新築工事に伴う電気設備工事見積書（第3回改訂版）',
    createdAt: '2025-01-20T09:00:00Z',
    totalAmount: '89750000',
  },
};
