/**
 * @fileoverview CopyQuantityTableDialogコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import CopyQuantityTableDialog from './CopyQuantityTableDialog';

const meta = {
  title: 'Components/QuantityTable/CopyQuantityTableDialog',
  component: CopyQuantityTableDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '数量表コピーダイアログ。コピー先の数量表名を入力し、コピーを実行する。デフォルト名は「{元の数量表名}のコピー」。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onCopyComplete: fn(),
  },
} satisfies Meta<typeof CopyQuantityTableDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 表示状態（デフォルト名）
 */
export const Default: Story = {
  args: {
    isOpen: true,
    sourceTable: {
      id: 'table-1',
      name: '基礎工事数量表',
    },
  },
};

/**
 * 長い名前の数量表
 */
export const LongName: Story = {
  args: {
    isOpen: true,
    sourceTable: {
      id: 'table-2',
      name: '第1期改修工事 建築本体工事 数量表（確定版）',
    },
  },
};

/**
 * 閉じた状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    sourceTable: {
      id: 'table-1',
      name: '基礎工事数量表',
    },
  },
};
