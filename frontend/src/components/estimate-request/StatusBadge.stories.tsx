/**
 * @fileoverview StatusBadgeコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './StatusBadge';

const meta = {
  title: 'EstimateRequest/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '見積依頼のステータスをバッジ形式で表示するコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 依頼前ステータス
 */
export const BeforeRequest: Story = {
  args: {
    status: 'BEFORE_REQUEST',
    size: 'md',
  },
};

/**
 * 依頼済ステータス
 */
export const Requested: Story = {
  args: {
    status: 'REQUESTED',
    size: 'md',
  },
};

/**
 * 見積受領済ステータス
 */
export const QuotationReceived: Story = {
  args: {
    status: 'QUOTATION_RECEIVED',
    size: 'md',
  },
};

/**
 * 小サイズ
 */
export const SmallSize: Story = {
  args: {
    status: 'REQUESTED',
    size: 'sm',
  },
};

/**
 * 大サイズ
 */
export const LargeSize: Story = {
  args: {
    status: 'REQUESTED',
    size: 'lg',
  },
};

/**
 * 全ステータス一覧
 */
export const AllStatuses: Story = {
  args: {
    status: 'BEFORE_REQUEST',
    size: 'md',
  },
  render: () => (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      <StatusBadge status="BEFORE_REQUEST" size="md" />
      <StatusBadge status="REQUESTED" size="md" />
      <StatusBadge status="QUOTATION_RECEIVED" size="md" />
    </div>
  ),
};
