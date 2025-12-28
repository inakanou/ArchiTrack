import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SiteSurveyResponsiveView from './SiteSurveyResponsiveView';
import type { SiteSurveyInfo } from '../../types/site-survey.types';

/**
 * SiteSurveyResponsiveView コンポーネントのストーリー
 *
 * 現場調査一覧のレスポンシブビューコンポーネント。
 * テーブル、グリッド、リスト表示を切り替え可能。
 * モバイルではカード表示のみ。
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
    memo: i % 2 === 0 ? `調査${i + 1}のメモ。建物外観の確認。` : null,
    thumbnailUrl: `https://picsum.photos/200/200?random=${i + 1}`,
    imageCount: (i + 1) * 5,
    createdAt: `2025-12-${String((i % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
    updatedAt: `2025-12-${String((i % 28) + 5).padStart(2, '0')}T14:30:00.000Z`,
  }));
};

const meta = {
  title: 'SiteSurveys/SiteSurveyResponsiveView',
  component: SiteSurveyResponsiveView,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSort: fn(),
    onRowClick: fn(),
    onViewModeChange: fn(),
  },
} satisfies Meta<typeof SiteSurveyResponsiveView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * テーブル表示（デスクトップ）
 */
export const Default: Story = {
  args: {
    surveys: createMockSurveys(10),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * テーブル表示
 * 初期表示がテーブルモード
 */
export const TableMode: Story = {
  args: {
    surveys: createMockSurveys(10),
    sortField: 'surveyDate',
    sortOrder: 'desc',
    initialViewMode: 'table',
  },
};

/**
 * グリッド表示
 * 初期表示がグリッドモード
 */
export const GridMode: Story = {
  args: {
    surveys: createMockSurveys(12),
    sortField: 'surveyDate',
    sortOrder: 'desc',
    initialViewMode: 'grid',
  },
};

/**
 * リスト表示
 * 初期表示がリストモード（カード表示）
 */
export const ListMode: Story = {
  args: {
    surveys: createMockSurveys(10),
    sortField: 'surveyDate',
    sortOrder: 'desc',
    initialViewMode: 'list',
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
 * 多数の調査 - グリッド
 * グリッド表示で多数の調査
 */
export const ManyGridItems: Story = {
  args: {
    surveys: createMockSurveys(24),
    sortField: 'surveyDate',
    sortOrder: 'desc',
    initialViewMode: 'grid',
  },
};

/**
 * モバイル表示
 * モバイルではカード表示のみ（切り替えボタンなし）
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
 * タブレットではデフォルトでグリッド表示
 */
export const TabletView: Story = {
  args: {
    surveys: createMockSurveys(9),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};

/**
 * サムネイルなし - グリッド
 * グリッド表示でサムネイルがプレースホルダー
 */
export const GridWithoutThumbnails: Story = {
  args: {
    surveys: createMockSurveys(12).map((s) => ({ ...s, thumbnailUrl: null })),
    sortField: 'surveyDate',
    sortOrder: 'desc',
    initialViewMode: 'grid',
  },
};

/**
 * 昇順ソート
 * 調査日昇順でソート
 */
export const SortAscending: Story = {
  args: {
    surveys: createMockSurveys(10),
    sortField: 'surveyDate',
    sortOrder: 'asc',
  },
};

/**
 * 更新日ソート
 * 更新日降順でソート
 */
export const SortByUpdatedAt: Story = {
  args: {
    surveys: createMockSurveys(10),
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};
