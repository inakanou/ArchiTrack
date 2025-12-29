import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

/**
 * DeleteConfirmationDialog コンポーネントのストーリー
 *
 * プロジェクト削除時に確認を求めるモーダルダイアログ。
 * 関連データが存在する場合は警告メッセージを表示。
 */
const meta = {
  title: 'Components/Projects/DeleteConfirmationDialog',
  component: DeleteConfirmationDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onConfirm: fn(),
    projectName: 'サンプルプロジェクト',
    hasRelatedData: false,
  },
} satisfies Meta<typeof DeleteConfirmationDialog>;

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
 * 関連データなしのシンプルな削除確認ダイアログ
 */
export const Basic: Story = {
  args: {
    isOpen: true,
    hasRelatedData: false,
  },
};

/**
 * 関連データあり
 * 関連データが存在する場合の警告表示
 */
export const WithRelatedData: Story = {
  args: {
    isOpen: true,
    hasRelatedData: true,
  },
};

/**
 * 関連データの件数表示
 * 現場調査と見積書の件数を表示
 */
export const WithRelatedDataCounts: Story = {
  args: {
    isOpen: true,
    hasRelatedData: true,
    relatedDataCounts: {
      surveys: 3,
      estimates: 2,
    },
  },
};

/**
 * 多数の関連データ
 * 大量の関連データがある場合
 */
export const WithManyRelatedData: Story = {
  args: {
    isOpen: true,
    projectName: '大規模プロジェクト',
    hasRelatedData: true,
    relatedDataCounts: {
      surveys: 15,
      estimates: 8,
    },
  },
};

/**
 * 削除処理中
 * 削除処理中でボタンが無効化された状態
 */
export const Deleting: Story = {
  args: {
    isOpen: true,
    hasRelatedData: true,
    isDeleting: true,
    relatedDataCounts: {
      surveys: 3,
      estimates: 2,
    },
  },
};

/**
 * 長いプロジェクト名
 * プロジェクト名が長い場合のレイアウト確認
 */
export const LongProjectName: Story = {
  args: {
    isOpen: true,
    projectName:
      'これは非常に長いプロジェクト名で、ダイアログ内でのテキスト折り返しを確認するためのサンプルです',
    hasRelatedData: false,
  },
};
