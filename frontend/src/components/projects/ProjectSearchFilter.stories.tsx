import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ProjectSearchFilter from './ProjectSearchFilter';

/**
 * ProjectSearchFilter コンポーネントのストーリー
 *
 * プロジェクト検索・フィルタUI。
 * キーワード検索、ステータスフィルタをサポート。
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
    },
  },
};
