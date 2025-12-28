import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TradingPartnerPaginationUI from './TradingPartnerPaginationUI';

/**
 * TradingPartnerPaginationUI コンポーネントのストーリー
 *
 * 取引先一覧のページネーションコントロール。
 * ページ番号と総ページ数の表示、表示件数の選択を提供します。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerPaginationUI',
  component: TradingPartnerPaginationUI,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '取引先一覧のページネーションコントロール。ページ番号と総ページ数の表示、1ページあたり表示件数の選択（10/20/50件）、ページ切り替え機能を提供します。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onPageChange: fn(),
    onLimitChange: fn(),
  },
} satisfies Meta<typeof TradingPartnerPaginationUI>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（1ページ目）
 * 最初のページを表示している状態
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
 * 中間のページを表示している状態
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
 * 最後のページを表示している状態
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
 * 1ページのみ
 * ページネーションが不要な少量データの場合
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
 * 多数のページ（省略記号表示）
 * 多数のページがあり省略記号が表示される場合
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
 * 多数のページ（先頭付近）
 * 多数のページで先頭付近を表示している場合
 */
export const ManyPagesNearStart: Story = {
  args: {
    pagination: {
      page: 2,
      limit: 20,
      total: 500,
      totalPages: 25,
    },
  },
};

/**
 * 多数のページ（末尾付近）
 * 多数のページで末尾付近を表示している場合
 */
export const ManyPagesNearEnd: Story = {
  args: {
    pagination: {
      page: 24,
      limit: 20,
      total: 500,
      totalPages: 25,
    },
  },
};

/**
 * 表示件数10件
 * 1ページあたり10件表示の場合
 */
export const Limit10: Story = {
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
 * 1ページあたり50件表示の場合
 */
export const Limit50: Story = {
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
 * 少量データ（端数あり）
 * 最後のページに端数がある場合
 */
export const PartialLastPage: Story = {
  args: {
    pagination: {
      page: 5,
      limit: 20,
      total: 87,
      totalPages: 5,
    },
  },
};
