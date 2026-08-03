/**
 * @fileoverview EstimateExportDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateExportDialog } from './EstimateExportDialog';
import type { EditableItem } from '../../domain/estimate/estimateEditReducer.types';

const line = (lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR', amount: string) => ({
  id: null,
  lineType,
  name: '内装工事',
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice: amount,
  amount,
  remarks: null,
  sourceVendorName: null,
});

const items: readonly EditableItem[] = [
  {
    id: 'item-1',
    tempId: null,
    itemType: 'STANDARD',
    lines: [line('ESTIMATE', '1000000'), line('EXECUTION', '800000'), line('VENDOR', '700000')],
    children: [],
  },
];

const reportFields = {
  submissionDate: '2026-08-03',
  validityPeriod: '提出日より1ヶ月間',
  separateWorks: ['電気設備工事'],
};

const meta = {
  title: 'Estimate/EstimateExportDialog',
  component: EstimateExportDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '編集中の見積明細から帳票（PDF）または表計算（Excel）を生成する出力ダイアログ。未保存の変更もそのまま出力される。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    projectId: 'project-1',
    items,
    reportFields,
    hasUnsavedChanges: false,
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
    estimateName: '〇〇ビル新築工事見積書',
  },
};

/**
 * 未保存の変更がある状態（REQ-56.4: 帳票が未保存の内容を含むことを示す）
 */
export const WithUnsavedChanges: Story = {
  args: {
    isOpen: true,
    estimateName: '〇〇ビル新築工事見積書',
    hasUnsavedChanges: true,
  },
};

/**
 * 長い見積書名
 */
export const LongEstimateName: Story = {
  args: {
    isOpen: true,
    estimateName: '株式会社サンプル本社ビル新築工事に伴う電気設備工事見積書（第3回改訂版）',
  },
};

/**
 * 閉じた状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    estimateName: '見積書',
  },
};
