import type { Meta, StoryObj } from '@storybook/react';
import UnsavedChangesBadge from './UnsavedChangesBadge';

/**
 * UnsavedChangesBadge コンポーネントのストーリー
 *
 * 数量表編集画面で未保存の変更があることを視覚的に示すインジケーター。
 * `isUnsaved` が true の間のみ表示し、false の場合は何も描画しない。
 */

const meta = {
  title: 'Components/QuantityTable/UnsavedChangesBadge',
  component: UnsavedChangesBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    isUnsaved: true,
  },
} satisfies Meta<typeof UnsavedChangesBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 未保存状態
 * 未保存の変更があるため、インジケーターを表示する（REQ-44.1）
 */
export const Unsaved: Story = {
  args: {
    isUnsaved: true,
  },
};

/**
 * 保存済み状態
 * 未保存の変更がないため、何も描画しない（REQ-44.2）
 */
export const Saved: Story = {
  args: {
    isUnsaved: false,
  },
};
