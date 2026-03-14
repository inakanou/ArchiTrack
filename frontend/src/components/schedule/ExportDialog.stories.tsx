/**
 * @fileoverview ExportDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { ExportDialog } from './ExportDialog';

const meta = {
  title: 'Schedule/ExportDialog',
  component: ExportDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '工程表出力ダイアログ。Excel/PDF形式を選択してエクスポートする。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ExportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ダイアログ表示
 */
export const Open: Story = {
  args: {
    isOpen: true,
    scheduleId: 'schedule-1',
    scheduleName: '〇〇ビル新築工事 工程表',
    onClose: () => {},
  },
};

/**
 * ダイアログ非表示
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    scheduleId: 'schedule-1',
    scheduleName: '〇〇ビル新築工事 工程表',
    onClose: () => {},
  },
};
