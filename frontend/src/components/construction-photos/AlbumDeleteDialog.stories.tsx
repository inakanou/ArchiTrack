/**
 * @fileoverview AlbumDeleteDialog（アルバム削除確認ダイアログ）のStorybook
 *
 * 工事写真アルバムの削除実行時に確認を求めるモーダルダイアログの状態を提示する。
 * 非表示（Closed）／表示（Open）／削除処理中（Deleting）の3状態を用意する。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import AlbumDeleteDialog from './AlbumDeleteDialog';

const meta = {
  title: 'ConstructionPhotos/AlbumDeleteDialog',
  component: AlbumDeleteDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    albumName: '外壁工事アルバム',
    onConfirm: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof AlbumDeleteDialog>;

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
 * 削除確認の表示
 */
export const Open: Story = {
  args: {
    isOpen: true,
  },
};

/**
 * 削除処理中（ボタン非活性・「削除中...」表示）
 */
export const Deleting: Story = {
  args: {
    isOpen: true,
    isDeleting: true,
  },
};
