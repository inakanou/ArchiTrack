import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import QuantityItemActionMenu from './QuantityItemActionMenu';

/**
 * QuantityItemActionMenu コンポーネントのストーリー
 *
 * 数量項目の行アクション（上へ移動・下へ移動・コピー・削除）を
 * 単一のドロップダウンメニューに統合するアクションメニュー。
 */

const meta = {
  title: 'Components/QuantityTable/QuantityItemActionMenu',
  component: QuantityItemActionMenu,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    isOpen: false,
    onToggle: fn(),
    onClose: fn(),
    onMoveUp: fn(),
    onMoveDown: fn(),
    onCopy: fn(),
    onDelete: fn(),
    canMoveUp: true,
    canMoveDown: true,
  },
} satisfies Meta<typeof QuantityItemActionMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト（閉じた状態）
 * 三点メニューボタンのみ表示
 */
export const Default: Story = {};

/**
 * メニュー展開状態
 * 全アクションが利用可能
 */
export const Open: Story = {
  args: {
    isOpen: true,
  },
};

/**
 * 先頭項目（上へ移動が無効）
 * 最上位の項目では「上へ移動」がdisabled
 */
export const FirstItem: Story = {
  args: {
    isOpen: true,
    canMoveUp: false,
  },
};

/**
 * 末尾項目（下へ移動が無効）
 * 最下位の項目では「下へ移動」がdisabled
 */
export const LastItem: Story = {
  args: {
    isOpen: true,
    canMoveDown: false,
  },
};

/**
 * 単一項目（上下移動どちらも無効）
 * 項目が1つしかない場合は上下移動ともdisabled
 */
export const SingleItem: Story = {
  args: {
    isOpen: true,
    canMoveUp: false,
    canMoveDown: false,
  },
};
