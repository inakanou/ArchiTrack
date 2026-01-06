import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import SiteSurveySectionCard from './SiteSurveySectionCard';
import type { SiteSurveyInfo } from '../../types/site-survey.types';

/**
 * SiteSurveySectionCard コンポーネントのストーリー
 *
 * プロジェクト詳細画面に表示する現場調査セクション。
 * 直近の現場調査一覧と総数を表示し、一覧・詳細画面への遷移リンクを提供。
 */

// サンプル現場調査データ
const sampleSurveys: SiteSurveyInfo[] = [
  {
    id: 'survey-1',
    projectId: 'project-123',
    name: '初回現場調査',
    surveyDate: '2024-01-15',
    memo: '外構工事の現況確認',
    thumbnailUrl: 'https://via.placeholder.com/64x48',
    imageCount: 12,
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T15:45:00Z',
  },
  {
    id: 'survey-2',
    projectId: 'project-123',
    name: '追加調査',
    surveyDate: '2024-01-20',
    memo: '電気設備の配置確認',
    thumbnailUrl: 'https://via.placeholder.com/64x48',
    imageCount: 8,
    createdAt: '2024-01-20T09:00:00Z',
    updatedAt: '2024-01-20T14:20:00Z',
  },
];

const meta = {
  title: 'Components/Projects/SiteSurveySectionCard',
  component: SiteSurveySectionCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: '600px' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof SiteSurveySectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 複数の現場調査がある場合
 */
export const Default: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 5,
    latestSurveys: sampleSurveys,
    isLoading: false,
  },
};

/**
 * 単一現場調査
 * 1件のみの表示
 */
export const SingleSurvey: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestSurveys: [sampleSurveys[0]!],
    isLoading: false,
  },
};

/**
 * 空状態
 * 現場調査がない場合
 */
export const Empty: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestSurveys: [],
    isLoading: false,
  },
};

/**
 * ローディング状態
 * データ取得中
 */
export const Loading: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestSurveys: [],
    isLoading: true,
  },
};

/**
 * サムネイルなし
 * サムネイル画像がない現場調査
 */
export const NoThumbnail: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestSurveys: [
      {
        ...sampleSurveys[0]!,
        thumbnailUrl: null,
      },
    ],
    isLoading: false,
  },
};

/**
 * 長い調査名
 * 名前が長い場合のレイアウト確認
 */
export const LongSurveyName: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestSurveys: [
      {
        ...sampleSurveys[0]!,
        name: 'これは非常に長い現場調査名で、カード内でのテキスト折り返しを確認するためのサンプル調査です',
      },
    ],
    isLoading: false,
  },
};

/**
 * 多数の画像
 * 画像数が多い場合
 */
export const ManyImages: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 3,
    latestSurveys: [
      {
        ...sampleSurveys[0]!,
        imageCount: 150,
      },
    ],
    isLoading: false,
  },
};
