import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SiteSurveyListTable from './SiteSurveyListTable';
import type { SiteSurveyInfo } from '../../types/site-survey.types';

/**
 * SiteSurveyListTable コンポーネントのストーリー
 *
 * 現場調査一覧のテーブル表示（デスクトップ用）。
 * サムネイル、調査名、メモ、調査日、画像数、更新日を列で表示。
 * ソート機能付き。
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
  title: 'SiteSurveys/SiteSurveyListTable',
  component: SiteSurveyListTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSort: fn(),
    onRowClick: fn(),
  },
} satisfies Meta<typeof SiteSurveyListTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 調査日降順でソート
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
export const SortBySurveyDateAsc: Story = {
  args: {
    surveys: createMockSurveys(10),
    sortField: 'surveyDate',
    sortOrder: 'asc',
  },
};

/**
 * 更新日降順
 * 更新日で降順ソート
 */
export const SortByUpdatedAtDesc: Story = {
  args: {
    surveys: createMockSurveys(10),
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};

/**
 * 単一行
 * 1件のみ表示
 */
export const SingleRow: Story = {
  args: {
    surveys: createMockSurveys(1),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 多数の行
 * スクロールが必要な量の行
 */
export const ManyRows: Story = {
  args: {
    surveys: createMockSurveys(50),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * サムネイルなし
 * 全ての行でサムネイルがプレースホルダー表示
 */
export const WithoutThumbnails: Story = {
  args: {
    surveys: createMockSurveys(5).map((s) => ({ ...s, thumbnailUrl: null })),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * メモなし
 * 全ての行でメモが未設定
 */
export const WithoutMemos: Story = {
  args: {
    surveys: createMockSurveys(5).map((s) => ({ ...s, memo: null })),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 長いメモ
 * メモが長い場合のtruncate表示確認
 */
export const WithLongMemos: Story = {
  args: {
    surveys: createMockSurveys(5).map((s, i) => ({
      ...s,
      memo: `これは非常に長いメモのサンプルです。建物の外観調査を実施し、多くの詳細な情報を記録しました。サンプル${i + 1}`,
    })),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 長い調査名
 * 調査名が長い場合の表示確認
 */
export const LongSurveyNames: Story = {
  args: {
    surveys: createMockSurveys(5).map((s, i) => ({
      ...s,
      name: `2025年${12 - i}月実施 建物外観および内装詳細調査 第${i + 1}回中間報告用現場調査`,
    })),
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};

/**
 * 空のテーブル
 * 現場調査が存在しない場合（親コンポーネントで空状態を処理するため、空配列を渡した例）
 */
export const EmptyTable: Story = {
  args: {
    surveys: [],
    sortField: 'surveyDate',
    sortOrder: 'desc',
  },
};
