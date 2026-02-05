/**
 * @fileoverview OverheadCostPanelコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { OverheadCostPanel } from './OverheadCostPanel';

const meta = {
  title: 'Estimate/OverheadCostPanel',
  component: OverheadCostPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '経費率計算パネルコンポーネント（諸経費の自動計算）',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onItemAdded: fn(),
    onCalculate: fn(),
  },
} satisfies Meta<typeof OverheadCostPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基本的な表示
 */
export const Default: Story = {
  args: {
    estimateId: 'estimate-1',
  },
};
