/**
 * @fileoverview DeleteConfirmDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

const meta = {
  title: 'Contracts/DeleteConfirmDialog',
  component: DeleteConfirmDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    contractId: 'contract-1',
    onClose: fn(),
    onDeleteSuccess: fn(),
    onDeleteError: fn(),
  },
} satisfies Meta<typeof DeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ダイアログ非表示
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

/**
 * 基本的な削除確認
 */
export const Open: Story = {
  args: {
    isOpen: true,
  },
};
