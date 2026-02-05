/**
 * @fileoverview UnsavedChangesDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import UnsavedChangesDialog from './UnsavedChangesDialog';

const meta = {
  title: 'Common/UnsavedChangesDialog',
  component: UnsavedChangesDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '未保存の変更がある場合にページ離脱を確認するダイアログコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onLeave: fn(),
    onStay: fn(),
  },
} satisfies Meta<typeof UnsavedChangesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（表示）
 */
export const Default: Story = {
  args: {
    isOpen: true,
  },
};

/**
 * 閉じた状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};
