import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import AssigneeSelfRemovalDialog from './AssigneeSelfRemovalDialog';

/**
 * AssigneeSelfRemovalDialog のストーリー
 *
 * 担当者の変更で自分がプロジェクトを閲覧できなくなるとき、保存の前に確かめるダイアログ。
 */
const meta = {
  title: 'Components/Projects/AssigneeSelfRemovalDialog',
  component: AssigneeSelfRemovalDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    isOpen: true,
    isSaving: false,
    onConfirm: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof AssigneeSelfRemovalDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 閉じている状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

/**
 * 開いている状態
 */
export const Default: Story = {};

/**
 * 保存中（ボタンが押せない）
 */
export const Saving: Story = {
  args: {
    isSaving: true,
  },
};
