import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SiteSurveyListView from './SiteSurveyListView';
import type { SiteSurveyInfo } from '../../types/site-survey.types';

/**
 * SiteSurveyListView コンポーネントのストーリー
 *
 * 現場調査一覧のビューコンポーネント。
 * 画面幅に応じてテーブル表示（デスクトップ）とカード表示（モバイル）を自動切り替え。
 */

/**
 * モック現場調査データを生成するヘルパー関数
 */
const createMockSurveys = (count: number): SiteSurveyInfo[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `survey-${i + 1}`,
    projectId: 'project-1',
    name: `第${i + 1}回現場調査`,
    surveyDate: `2025-12-${String((i % 28) + 1).padStart(2, '0')}`,
    memo: i % 2 === 0 ? `調査${i + 1}のメモ。建物外観の確認を行った。` : null,
    thumbnailUrl: i % 3 === 0 ? null : `https://picsum.photos/200/200?random=${i + 1}`,
    imageCount: (i + 1) * 5,
    createdAt: `2025-12-${String((i % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
    updatedAt: `2025-12-${String((i % 28) + 5).padStart(2, '0')}T14:30:00.000Z`,
  }));
};

const meta = {
  title: 'SiteSurveys/SiteSurveyListView',
  component: SiteSurveyListView,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSort: fn(),
    onRowClick: fn(),
  },
} satisfies Meta<typeof SiteSurveyListView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 複数の調査を表示
 */
export const Default: Story = {
  args: {
    surveys: createMockSurveys(10),
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
    surveys: createMockSurveys(10),
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
    surveys: createMockSurveys(10),
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};

/**
 * 単一調査
 * 1件のみ表示
 */
export const SingleSurvey: Story = {
  args: {
    surveys: createMockSurveys(1),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 多数の調査
 * スクロールが必要な量の調査
 */
export const ManySurveys: Story = {
  args: {
    surveys: createMockSurveys(30),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 空の状態
 * 現場調査がない場合のメッセージ表示
 */
export const Empty: Story = {
  args: {
    surveys: [],
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * サムネイルなし
 * 全てサムネイルがプレースホルダー
 */
export const WithoutThumbnails: Story = {
  args: {
    surveys: createMockSurveys(5).map((s) => ({ ...s, thumbnailUrl: null })),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * モバイル表示（カード）
 * 画面幅768px未満の場合のカード表示
 */
export const MobileView: Story = {
  args: {
    surveys: createMockSurveys(5),
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
 * 画面幅768px以上の場合のテーブル表示
 */
export const TabletView: Story = {
  args: {
    surveys: createMockSurveys(5),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};
