import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ImageUploader } from './ImageUploader';

/**
 * ImageUploader コンポーネントのストーリー
 *
 * 画像アップロードUIコンポーネント。
 * ファイル選択、ドラッグ＆ドロップ、カメラ撮影による画像アップロードをサポート。
 */
const meta = {
  title: 'SiteSurveys/ImageUploader',
  component: ImageUploader,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onUpload: fn().mockResolvedValue(undefined),
    onValidationError: fn(),
    onError: fn(),
  },
} satisfies Meta<typeof ImageUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 通常のアップロードエリア表示
 */
export const Default: Story = {
  args: {},
};

/**
 * アップロード中
 * 進捗バーとスピナーを表示
 */
export const Uploading: Story = {
  args: {
    isUploading: true,
    uploadProgress: {
      completed: 2,
      total: 5,
      current: 2,
    },
  },
};

/**
 * アップロード完了間近
 * 進捗が80%の状態
 */
export const AlmostComplete: Story = {
  args: {
    isUploading: true,
    uploadProgress: {
      completed: 4,
      total: 5,
      current: 4,
    },
  },
};

/**
 * 無効状態
 * アップロードが無効化されている場合
 */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

/**
 * コンパクト表示
 * スペースが限られた場所での表示
 */
export const Compact: Story = {
  args: {
    compact: true,
  },
};

/**
 * コンパクト＆アップロード中
 * コンパクト表示でのアップロード状態
 */
export const CompactUploading: Story = {
  args: {
    compact: true,
    isUploading: true,
    uploadProgress: {
      completed: 1,
      total: 3,
      current: 1,
    },
  },
};

/**
 * カスタムクラス
 * カスタムCSSクラスを適用
 */
export const WithCustomClass: Story = {
  args: {
    className: 'max-w-md mx-auto',
  },
};

/**
 * アップロード開始時
 * 進捗が0%の状態
 */
export const UploadStarting: Story = {
  args: {
    isUploading: true,
    uploadProgress: {
      completed: 0,
      total: 3,
      current: 0,
    },
  },
};

/**
 * 単一ファイルアップロード
 * 1ファイルのみのアップロード
 */
export const SingleFileUpload: Story = {
  args: {
    isUploading: true,
    uploadProgress: {
      completed: 0,
      total: 1,
      current: 0,
    },
  },
};
