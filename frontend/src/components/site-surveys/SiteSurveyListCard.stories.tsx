import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SiteSurveyListCard from './SiteSurveyListCard';
import type { SiteSurveyInfo } from '../../types/site-survey.types';

/**
 * SiteSurveyListCard コンポーネントのストーリー
 *
 * 現場調査一覧のカード表示（モバイル用）。
 * サムネイル、調査名、メモ、調査日、画像数を表示。
 */

/**
 * モック現場調査データを生成するヘルパー関数
 */
const createMockSurveys = (count: number): SiteSurveyInfo[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `survey-${i + 1}`,
    projectId: 'project-1',
    name: `第${i + 1}回現場調査`,
    surveyDate: `2025-12-${String(i + 10).padStart(2, '0')}`,
    memo: i % 2 === 0 ? `調査${i + 1}のメモ。建物外観の確認を行った。` : null,
    thumbnailUrl: i % 3 === 0 ? null : `https://picsum.photos/200/200?random=${i + 1}`,
    imageCount: (i + 1) * 5,
    createdAt: `2025-12-${String(i + 10).padStart(2, '0')}T09:00:00.000Z`,
    updatedAt: `2025-12-${String(i + 15).padStart(2, '0')}T14:30:00.000Z`,
  }));
};

const meta = {
  title: 'SiteSurveys/SiteSurveyListCard',
  component: SiteSurveyListCard,
  parameters: {
    layout: 'padded',
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  tags: ['autodocs'],
  args: {
    onCardClick: fn(),
  },
} satisfies Meta<typeof SiteSurveyListCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 複数のカードを表示
 */
export const Default: Story = {
  args: {
    surveys: createMockSurveys(5),
  },
};

/**
 * 単一カード
 * 1件のみ表示
 */
export const SingleCard: Story = {
  args: {
    surveys: createMockSurveys(1),
  },
};

/**
 * 多数のカード
 * スクロールが必要な量のカード
 */
export const ManyCards: Story = {
  args: {
    surveys: createMockSurveys(20),
  },
};

/**
 * サムネイルなし
 * 全てのカードでサムネイルがプレースホルダー表示
 */
export const WithoutThumbnails: Story = {
  args: {
    surveys: createMockSurveys(5).map((s) => ({ ...s, thumbnailUrl: null })),
  },
};

/**
 * メモなし
 * 全てのカードでメモが未設定
 */
export const WithoutMemos: Story = {
  args: {
    surveys: createMockSurveys(5).map((s) => ({ ...s, memo: null })),
  },
};

/**
 * 長いメモ
 * メモが長い場合のtruncate表示確認
 */
export const WithLongMemos: Story = {
  args: {
    surveys: createMockSurveys(3).map((s, i) => ({
      ...s,
      memo: `これは非常に長いメモのサンプルです。建物の外観調査を実施し、多くの詳細な情報を記録しました。サンプル${i + 1}`,
    })),
  },
};

/**
 * 画像0枚
 * 画像が登録されていない調査
 */
export const ZeroImages: Story = {
  args: {
    surveys: createMockSurveys(3).map((s) => ({ ...s, imageCount: 0 })),
  },
};

/**
 * 多数の画像
 * 画像が多数登録されている調査
 */
export const ManyImages: Story = {
  args: {
    surveys: createMockSurveys(3).map((s, i) => ({ ...s, imageCount: 100 + i * 50 })),
  },
};

/**
 * 長い調査名
 * 調査名が長い場合のtruncate表示確認
 */
export const LongSurveyNames: Story = {
  args: {
    surveys: createMockSurveys(3).map((s, i) => ({
      ...s,
      name: `2025年${12 - i}月実施 建物外観および内装詳細調査 第${i + 1}回中間報告用`,
    })),
  },
};

/**
 * 空のリスト
 * 現場調査が存在しない場合（親コンポーネントで空状態を処理するため、空配列を渡した例）
 */
export const EmptyList: Story = {
  args: {
    surveys: [],
  },
};
