import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ProjectSearchFilter from './ProjectSearchFilter';

/**
 * ProjectSearchFilter コンポーネントのストーリー
 *
 * プロジェクト検索・フィルタUI。
 * キーワード検索、ステータスフィルタ、期間フィルタをサポート。
 */
const meta = {
  title: 'Components/Projects/ProjectSearchFilter',
  component: ProjectSearchFilter,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onFilterChange: fn(),
  },
} satisfies Meta<typeof ProjectSearchFilter>;

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
      status: [],
      createdFrom: undefined,
      createdTo: undefined,
    },
  },
};

/**
 * キーワード検索中
 * 検索キーワードが入力された状態
 */
export const WithSearchKeyword: Story = {
  args: {
    filter: {
      search: '東京',
      status: [],
      createdFrom: undefined,
      createdTo: undefined,
    },
  },
};

/**
 * ステータスフィルタ適用
 * 特定のステータスでフィルタリング
 */
export const WithStatusFilter: Story = {
  args: {
    filter: {
      search: '',
      status: ['SURVEYING', 'ESTIMATING'],
      createdFrom: undefined,
      createdTo: undefined,
    },
  },
};

/**
 * 期間フィルタ適用
 * 作成日で期間フィルタリング
 */
export const WithDateFilter: Story = {
  args: {
    filter: {
      search: '',
      status: [],
      createdFrom: '2024-01-01',
      createdTo: '2024-01-31',
    },
  },
};

/**
 * 開始日のみ指定
 * 開始日のみで期間フィルタリング
 */
export const WithFromDateOnly: Story = {
  args: {
    filter: {
      search: '',
      status: [],
      createdFrom: '2024-01-01',
      createdTo: undefined,
    },
  },
};

/**
 * 終了日のみ指定
 * 終了日のみで期間フィルタリング
 */
export const WithToDateOnly: Story = {
  args: {
    filter: {
      search: '',
      status: [],
      createdFrom: undefined,
      createdTo: '2024-01-31',
    },
  },
};

/**
 * 複合フィルタ
 * 複数のフィルタを組み合わせた状態
 */
export const CombinedFilters: Story = {
  args: {
    filter: {
      search: 'オフィス',
      status: ['SURVEYING'],
      createdFrom: '2024-01-01',
      createdTo: '2024-03-31',
    },
  },
};

/**
 * すべてのフィルタ適用
 * 全てのフィルタオプションを使用
 */
export const AllFiltersApplied: Story = {
  args: {
    filter: {
      search: '工事',
      status: ['PREPARING', 'SURVEYING', 'ESTIMATING'],
      createdFrom: '2024-01-01',
      createdTo: '2024-12-31',
    },
  },
};

/**
 * 完了ステータスのみ
 * 完了・キャンセル・失注ステータスでフィルタ
 */
export const CompletedStatuses: Story = {
  args: {
    filter: {
      search: '',
      status: ['COMPLETED', 'CANCELLED', 'LOST'],
      createdFrom: undefined,
      createdTo: undefined,
    },
  },
};
