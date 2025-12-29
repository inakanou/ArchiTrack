import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SiteSurveySearchFilter from './SiteSurveySearchFilter';

/**
 * SiteSurveySearchFilter コンポーネントのストーリー
 *
 * 現場調査の検索・フィルタリングUI。
 * キーワード検索、調査日範囲フィルタ、ソート選択を提供。
 */
const meta = {
  title: 'SiteSurveys/SiteSurveySearchFilter',
  component: SiteSurveySearchFilter,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onFilterChange: fn(),
    onSortChange: fn(),
  },
} satisfies Meta<typeof SiteSurveySearchFilter>;

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
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 検索キーワードあり
 * キーワード検索が入力されている状態
 */
export const WithSearchKeyword: Story = {
  args: {
    filter: {
      search: '外観調査',
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 日付フィルタあり
 * 調査日範囲が設定されている状態
 */
export const WithDateFilter: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: '2025-01-01',
      surveyDateTo: '2025-12-31',
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 開始日のみ
 * 開始日のみ設定されている状態
 */
export const WithStartDateOnly: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: '2025-06-01',
      surveyDateTo: undefined,
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 終了日のみ
 * 終了日のみ設定されている状態
 */
export const WithEndDateOnly: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: undefined,
      surveyDateTo: '2025-12-31',
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 全フィルタ設定
 * 全てのフィルタが設定されている状態
 */
export const AllFiltersSet: Story = {
  args: {
    filter: {
      search: '建物',
      surveyDateFrom: '2025-06-01',
      surveyDateTo: '2025-12-31',
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 調査日昇順
 * 調査日で昇順ソート
 */
export const SortAscending: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    },
    sortField: 'surveyDate',
    sortOrder: 'asc',
  },
};

/**
 * 更新日でソート
 * 更新日降順でソート
 */
export const SortByUpdatedAt: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    },
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};

/**
 * 作成日でソート
 * 作成日降順でソート
 */
export const SortByCreatedAt: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    },
    sortField: 'createdAt',
    sortOrder: 'desc',
  },
};

/**
 * モバイル表示
 * 狭い画面での表示
 */
export const MobileView: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

/**
 * タブレット表示
 * 中程度の画面での表示
 */
export const TabletView: Story = {
  args: {
    filter: {
      search: '',
      surveyDateFrom: undefined,
      surveyDateTo: undefined,
    },
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};
