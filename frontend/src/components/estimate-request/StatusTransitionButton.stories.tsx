/**
 * @fileoverview StatusTransitionButtonコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { StatusTransitionButton } from './StatusTransitionButton';

const meta = {
  title: 'EstimateRequest/StatusTransitionButton',
  component: StatusTransitionButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '見積依頼のステータス遷移ボタンコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onTransition: fn(),
    onSuccess: fn(),
    onError: fn(),
  },
} satisfies Meta<typeof StatusTransitionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 依頼前から依頼済へ
 */
export const FromBeforeRequest: Story = {
  args: {
    status: 'BEFORE_REQUEST',
    isLoading: false,
    disabled: false,
  },
};

/**
 * 依頼済から見積受領済へ
 */
export const FromRequested: Story = {
  args: {
    status: 'REQUESTED',
    isLoading: false,
    disabled: false,
  },
};

/**
 * 見積受領済（最終ステータス）
 */
export const FromQuotationReceived: Story = {
  args: {
    status: 'QUOTATION_RECEIVED',
    isLoading: false,
    disabled: false,
  },
};

/**
 * ローディング中
 */
export const Loading: Story = {
  args: {
    status: 'BEFORE_REQUEST',
    isLoading: true,
    disabled: false,
  },
};

/**
 * 無効状態
 */
export const Disabled: Story = {
  args: {
    status: 'BEFORE_REQUEST',
    isLoading: false,
    disabled: true,
  },
};
