/**
 * @fileoverview ProfitRatePanelコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ProfitRatePanel, type ExecutionLineInfoExtended } from './ProfitRatePanel';

const mockExecutionLines: ExecutionLineInfoExtended[] = [
  {
    lineId: 'exec-1',
    unitPrice: '450000',
    name: '仮設工事',
    specification: '一式',
    unit: '式',
    quantity: '1',
    amount: '450000',
  },
  {
    lineId: 'exec-2',
    unitPrice: '1100000',
    name: '基礎工事',
    specification: '一式',
    unit: '式',
    quantity: '1',
    amount: '1100000',
  },
];

const meta = {
  title: 'Estimate/ProfitRatePanel',
  component: ProfitRatePanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '利益率計算パネルコンポーネント（見積金額の自動計算）',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onApplyComplete: fn(),
  },
} satisfies Meta<typeof ProfitRatePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 実行金額行あり
 */
export const WithExecutionLines: Story = {
  args: {
    estimateId: 'estimate-1',
    executionLines: mockExecutionLines,
  },
};

/**
 * 実行金額行なし
 */
export const Empty: Story = {
  args: {
    estimateId: 'estimate-1',
    executionLines: [],
  },
};
