import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PaginationUI from './PaginationUI';

/**
 * PaginationUI コンポーネントのストーリー
 *
 * プロジェクト一覧のページネーションコントロール。
 * ページ番号表示、表示件数変更、前後ページ移動をサポート。
 */
const meta = {
  title: 'Components/Projects/PaginationUI',
  component: PaginationUI,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onPageChange: fn(),
    onLimitChange: fn(),
  },
} satisfies Meta<typeof PaginationUI>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 最初のページ
 * 100件中最初の20件を表示
 */
export const FirstPage: Story = {
  args: {
    pagination: {
      page: 1,
      limit: 20,
      total: 100,
      totalPages: 5,
    },
  },
};

/**
 * 中間のページ
 * 100件中3ページ目を表示
 */
export const MiddlePage: Story = {
  args: {
    pagination: {
      page: 3,
      limit: 20,
      total: 100,
      totalPages: 5,
    },
  },
};

/**
 * 最後のページ
 * 100件中最後のページを表示
 */
export const LastPage: Story = {
  args: {
    pagination: {
      page: 5,
      limit: 20,
      total: 100,
      totalPages: 5,
    },
  },
};

/**
 * 表示件数10件
 * 1ページあたり10件表示
 */
export const TenItemsPerPage: Story = {
  args: {
    pagination: {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10,
    },
  },
};

/**
 * 表示件数50件
 * 1ページあたり50件表示
 */
export const FiftyItemsPerPage: Story = {
  args: {
    pagination: {
      page: 1,
      limit: 50,
      total: 100,
      totalPages: 2,
    },
  },
};

/**
 * 多数のページ
 * 省略記号（...）が表示される大量ページ
 */
export const ManyPages: Story = {
  args: {
    pagination: {
      page: 10,
      limit: 20,
      total: 500,
      totalPages: 25,
    },
  },
};

/**
 * 少数のページ
 * ページ数が少ない場合（省略なし）
 */
export const FewPages: Story = {
  args: {
    pagination: {
      page: 2,
      limit: 20,
      total: 60,
      totalPages: 3,
    },
  },
};

/**
 * 1ページのみ
 * 総件数が少なく1ページのみ
 */
export const SinglePage: Story = {
  args: {
    pagination: {
      page: 1,
      limit: 20,
      total: 15,
      totalPages: 1,
    },
  },
};

/**
 * 大量のデータ
 * 数千件のデータがある場合
 */
export const LargeDataset: Story = {
  args: {
    pagination: {
      page: 50,
      limit: 20,
      total: 2000,
      totalPages: 100,
    },
  },
};
