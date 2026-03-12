import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SortOrderButtons from './SortOrderButtons';

/**
 * SortOrderButtons コンポーネントのストーリー
 *
 * 並び順変更ボタン。上へ移動（▲）と下へ移動（▼）を縦に配置する共通UIコンポーネント。
 * currentIndexとtotalCountに基づくボタン有効/無効制御を実装。
 */

const meta = {
  title: 'Components/QuantityTable/SortOrderButtons',
  component: SortOrderButtons,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onMoveUp: fn(),
    onMoveDown: fn(),
  },
} satisfies Meta<typeof SortOrderButtons>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 中間位置にあるアイテム（上下両方移動可能）
 */
export const Default: Story = {
  args: {
    currentIndex: 1,
    totalCount: 3,
  },
};

/**
 * 先頭アイテム
 * 上へ移動ボタンが無効
 */
export const FirstItem: Story = {
  args: {
    currentIndex: 0,
    totalCount: 3,
  },
};

/**
 * 末尾アイテム
 * 下へ移動ボタンが無効
 */
export const LastItem: Story = {
  args: {
    currentIndex: 2,
    totalCount: 3,
  },
};

/**
 * 単一アイテム
 * 上下両方のボタンが無効
 */
export const SingleItem: Story = {
  args: {
    currentIndex: 0,
    totalCount: 1,
  },
};

/**
 * 無効化状態
 * disabled=trueで全ボタン操作不可
 */
export const Disabled: Story = {
  args: {
    currentIndex: 1,
    totalCount: 3,
    disabled: true,
  },
};
