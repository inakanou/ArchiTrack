import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import SiteSurveyDetailInfo from './SiteSurveyDetailInfo';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';

/**
 * SiteSurveyDetailInfo コンポーネントのストーリー
 *
 * 現場調査詳細ページの基本情報表示セクション。
 * 調査名、調査日、メモ、プロジェクト情報、編集・削除ボタンを表示。
 */

/**
 * モック画像データを生成するヘルパー関数
 */
const createMockImages = (count: number): SurveyImageInfo[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `image-${i + 1}`,
    surveyId: 'survey-1',
    originalPath: `/storage/original/image-${i + 1}.jpg`,
    thumbnailPath: `/storage/thumbnail/image-${i + 1}.jpg`,
    originalUrl: `https://picsum.photos/800/600?random=${i + 1}`,
    thumbnailUrl: `https://picsum.photos/200/150?random=${i + 1}`,
    fileName: `site-photo-${String(i + 1).padStart(3, '0')}.jpg`,
    fileSize: 1024000 + i * 100000,
    width: 800,
    height: 600,
    displayOrder: i + 1,
    createdAt: `2025-12-28T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
    comment: null,
    includeInReport: true,
  }));
};

/**
 * モック現場調査詳細データ
 */
const mockSurveyDetail: SiteSurveyDetail = {
  id: 'survey-1',
  projectId: 'project-1',
  name: '第1回現場調査',
  surveyDate: '2025-12-15',
  memo: '建物外観と内装の初回調査。損傷箇所の確認を行い、詳細な記録を残す。',
  thumbnailUrl: 'https://picsum.photos/200/200',
  imageCount: 10,
  createdAt: '2025-12-15T09:00:00.000Z',
  updatedAt: '2025-12-20T14:30:00.000Z',
  project: {
    id: 'project-1',
    name: 'A社ビル改修プロジェクト',
  },
  images: createMockImages(10),
};

const meta = {
  title: 'SiteSurveys/SiteSurveyDetailInfo',
  component: SiteSurveyDetailInfo,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onEdit: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof SiteSurveyDetailInfo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 通常の詳細情報表示
 */
export const Default: Story = {
  args: {
    survey: mockSurveyDetail,
  },
};

/**
 * 編集権限あり
 * 編集・削除ボタンが表示される
 */
export const WithEditPermission: Story = {
  args: {
    survey: mockSurveyDetail,
    canEdit: true,
    canDelete: true,
  },
};

/**
 * 編集権限なし
 * 編集・削除ボタンが非表示
 */
export const WithoutEditPermission: Story = {
  args: {
    survey: mockSurveyDetail,
    canEdit: false,
    canDelete: false,
  },
};

/**
 * 編集のみ許可
 * 編集ボタンのみ表示、削除は不可
 */
export const EditOnlyPermission: Story = {
  args: {
    survey: mockSurveyDetail,
    canEdit: true,
    canDelete: false,
  },
};

/**
 * 削除中
 * 削除処理中のローディング状態
 */
export const Deleting: Story = {
  args: {
    survey: mockSurveyDetail,
    isDeleting: true,
    canEdit: true,
    canDelete: true,
  },
};

/**
 * メモなし
 * メモが未設定の場合
 */
export const WithoutMemo: Story = {
  args: {
    survey: {
      ...mockSurveyDetail,
      memo: null,
    },
  },
};

/**
 * 長いメモ
 * 長いメモが設定されている場合
 */
export const WithLongMemo: Story = {
  args: {
    survey: {
      ...mockSurveyDetail,
      memo: '建物外観と内装の初回調査を実施しました。北側立面には経年劣化による塗装の剥がれが見られ、詳細な記録を残しています。また、内装については2階廊下の床材に一部損傷が確認されました。次回調査時にはこれらの箇所の経過観察を行う予定です。なお、電気設備についても点検を行い、問題がないことを確認しました。',
    },
  },
};

/**
 * 画像なし
 * 画像が未登録の場合
 */
export const WithoutImages: Story = {
  args: {
    survey: {
      ...mockSurveyDetail,
      images: [],
      imageCount: 0,
      thumbnailUrl: null,
    },
  },
};

/**
 * 多数の画像
 * 多くの画像が登録されている場合
 */
export const ManyImages: Story = {
  args: {
    survey: {
      ...mockSurveyDetail,
      images: createMockImages(50),
      imageCount: 50,
    },
  },
};

/**
 * 長いプロジェクト名
 * プロジェクト名が長い場合の表示確認
 */
export const LongProjectName: Story = {
  args: {
    survey: {
      ...mockSurveyDetail,
      project: {
        id: 'project-1',
        name: '株式会社サンプルコーポレーション 本社ビル大規模改修プロジェクト 第1フェーズ',
      },
    },
  },
};

/**
 * 長い調査名
 * 調査名が長い場合の表示確認
 */
export const LongSurveyName: Story = {
  args: {
    survey: {
      ...mockSurveyDetail,
      name: '2025年12月実施 建物外観および内装詳細調査 第1回中間報告用現場調査',
    },
  },
};
