import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TradingPartnerSearchFilter from './TradingPartnerSearchFilter';

/**
 * TradingPartnerSearchFilter コンポーネントのストーリー
 *
 * 取引先検索・フィルタUIコンポーネント。
 * 検索フィールドと種別フィルタを提供します。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerSearchFilter',
  component: TradingPartnerSearchFilter,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '取引先検索・フィルタコンポーネント。取引先名・フリガナによる部分一致検索と、取引先種別（顧客/協力業者）でのフィルタリングを提供します。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onFilterChange: fn(),
  },
} satisfies Meta<typeof TradingPartnerSearchFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * フィルタなしの初期状態
 */
export const Default: Story = {
  args: {
    filter: {
      search: '',
      type: [],
    },
  },
};

/**
 * 検索キーワード入力済み
 * 検索キーワードが入力された状態
 */
export const WithSearchKeyword: Story = {
  args: {
    filter: {
      search: 'テスト',
      type: [],
    },
  },
};

/**
 * 顧客のみフィルタ
 * 顧客のみを絞り込んでいる状態
 */
export const FilterCustomerOnly: Story = {
  args: {
    filter: {
      search: '',
      type: ['CUSTOMER'],
    },
  },
};

/**
 * 協力業者のみフィルタ
 * 協力業者のみを絞り込んでいる状態
 */
export const FilterSubcontractorOnly: Story = {
  args: {
    filter: {
      search: '',
      type: ['SUBCONTRACTOR'],
    },
  },
};

/**
 * 両方の種別を選択
 * 顧客と協力業者の両方が選択されている状態
 */
export const FilterBothTypes: Story = {
  args: {
    filter: {
      search: '',
      type: ['CUSTOMER', 'SUBCONTRACTOR'],
    },
  },
};

/**
 * 検索キーワードと種別の組み合わせ
 * 検索キーワードと種別フィルタの両方が設定された状態
 */
export const WithSearchAndFilter: Story = {
  args: {
    filter: {
      search: '株式会社',
      type: ['CUSTOMER'],
    },
  },
};

/**
 * 長い検索キーワード
 * 長い検索キーワードが入力された状態
 */
export const LongSearchKeyword: Story = {
  args: {
    filter: {
      search: 'アーキテクチャデザインアンドコンサルティング',
      type: [],
    },
  },
};
