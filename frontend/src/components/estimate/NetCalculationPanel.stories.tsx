/**
 * @fileoverview NetCalculationPanelコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NetCalculationPanel, type VendorLineInfoExtended } from './NetCalculationPanel';

const mockVendorLines: VendorLineInfoExtended[] = [
  {
    id: 'vendor-1',
    amount: '400000',
    name: '仮設工事',
    vendorName: '株式会社A工業',
  },
  {
    id: 'vendor-2',
    amount: '1000000',
    name: '基礎工事',
    vendorName: '株式会社B建設',
  },
];

const meta = {
  title: 'Estimate/NetCalculationPanel',
  component: NetCalculationPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'NET金額計算パネルコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onCalculationComplete: fn(),
  },
} satisfies Meta<typeof NetCalculationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 業者見積行あり
 */
export const WithVendorLines: Story = {
  args: {
    estimateId: 'estimate-1',
    vendorLines: mockVendorLines,
  },
};

/**
 * 業者見積行なし
 */
export const Empty: Story = {
  args: {
    estimateId: 'estimate-1',
    vendorLines: [],
  },
};
