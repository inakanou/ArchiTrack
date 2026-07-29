/**
 * @fileoverview PhotoUploader のストーリー
 *
 * 3系統アップローダ（ローカルファイル/カメラ撮影/現場調査写真の参照）。
 * 通常状態と非活性状態を確認する。
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { PhotoUploader } from './PhotoUploader';

const meta = {
  title: 'ConstructionPhotos/PhotoUploader',
  component: PhotoUploader,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    albumId: 'album-1',
    projectId: 'project-1',
    onPhotosAdded: fn(),
    onNotify: fn(),
  },
} satisfies Meta<typeof PhotoUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * ローカル/カメラのドロップゾーンと現調写真参照ボタンを表示
 */
export const Default: Story = {
  args: {},
};

/**
 * 非活性状態
 * アップロード操作を受け付けない状態
 */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
