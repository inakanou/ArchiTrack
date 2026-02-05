/**
 * @fileoverview EstimateExportDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateExportDialog } from './EstimateExportDialog';

const meta = {
  title: 'Estimate/EstimateExportDialog',
  component: EstimateExportDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '見積書をPDFまたはExcel形式で出力するダイアログコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
  },
} satisfies Meta<typeof EstimateExportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 表示状態
 */
export const Default: Story = {
  args: {
    isOpen: true,
    estimateId: 'estimate-1',
    estimateName: '〇〇ビル新築工事見積書',
  },
};

/**
 * 長い見積書名
 */
export const LongEstimateName: Story = {
  args: {
    isOpen: true,
    estimateId: 'estimate-2',
    estimateName: '株式会社サンプル本社ビル新築工事に伴う電気設備工事見積書（第3回改訂版）',
  },
};

/**
 * 閉じた状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    estimateId: 'estimate-1',
    estimateName: '見積書',
  },
};
