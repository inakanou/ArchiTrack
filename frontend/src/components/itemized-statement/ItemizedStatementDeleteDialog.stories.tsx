import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ItemizedStatementDeleteDialog from './ItemizedStatementDeleteDialog';

/**
 * ItemizedStatementDeleteDialog コンポーネントのストーリー
 *
 * 内訳書削除時に確認を求めるモーダルダイアログ。
 * FocusManagerを使用したフォーカストラップとアクセシビリティを実装。
 */
const meta = {
  title: 'Components/ItemizedStatement/ItemizedStatementDeleteDialog',
  component: ItemizedStatementDeleteDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onConfirm: fn(),
    statementName: 'サンプル内訳書',
    isDeleting: false,
  },
} satisfies Meta<typeof ItemizedStatementDeleteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ダイアログ非表示
 * ダイアログが閉じている状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

/**
 * 基本的な削除確認
 * シンプルな削除確認ダイアログ
 */
export const Basic: Story = {
  args: {
    isOpen: true,
  },
};

/**
 * 削除処理中
 * 削除処理中でボタンが無効化された状態
 */
export const Deleting: Story = {
  args: {
    isOpen: true,
    isDeleting: true,
  },
};

/**
 * 長い内訳書名
 * 内訳書名が長い場合のレイアウト確認
 */
export const LongStatementName: Story = {
  args: {
    isOpen: true,
    statementName:
      'これは非常に長い内訳書名で、ダイアログ内でのテキスト折り返しを確認するためのサンプルです',
  },
};
