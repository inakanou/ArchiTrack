import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PhotoManagementPanel from './PhotoManagementPanel';
import type { SurveyImageInfo } from '../../types/site-survey.types';

/**
 * PhotoManagementPanel コンポーネントのストーリー
 *
 * 現場調査の写真管理パネル。
 * 画像一覧表示、メタデータ編集、ドラッグ＆ドロップによる順序変更機能を提供。
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
    comment: i % 2 === 0 ? `写真${i + 1}のコメント` : null,
    includeInReport: i % 3 !== 0,
  }));
};

const meta = {
  title: 'SiteSurveys/PhotoManagementPanel',
  component: PhotoManagementPanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onImageMetadataChange: fn(),
    onImageClick: fn(),
    onOrderChange: fn(),
  },
} satisfies Meta<typeof PhotoManagementPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 複数の画像を表示
 */
export const Default: Story = {
  args: {
    images: createMockImages(6),
  },
};

/**
 * 画像なし
 * 空の状態表示
 */
export const Empty: Story = {
  args: {
    images: [],
  },
};

/**
 * 単一画像
 * 1枚のみの表示
 */
export const SingleImage: Story = {
  args: {
    images: createMockImages(1),
  },
};

/**
 * 多数の画像
 * スクロールが必要な量の画像
 */
export const ManyImages: Story = {
  args: {
    images: createMockImages(20),
  },
};

/**
 * ローディング中
 * データ読み込み中の状態
 */
export const Loading: Story = {
  args: {
    images: [],
    isLoading: true,
  },
};

/**
 * 読み取り専用
 * 編集不可の状態
 */
export const ReadOnly: Story = {
  args: {
    images: createMockImages(6),
    readOnly: true,
  },
};

/**
 * 順序番号表示
 * 表示順序番号を表示
 */
export const WithOrderNumbers: Story = {
  args: {
    images: createMockImages(6),
    showOrderNumbers: true,
  },
};

/**
 * 読み取り専用＆順序番号
 * 編集不可で順序番号を表示
 */
export const ReadOnlyWithOrderNumbers: Story = {
  args: {
    images: createMockImages(6),
    readOnly: true,
    showOrderNumbers: true,
  },
};

/**
 * コメント付き画像
 * 全ての画像にコメントがある状態
 */
export const WithComments: Story = {
  args: {
    images: createMockImages(6).map((img, i) => ({
      ...img,
      comment: `これは写真${i + 1}の説明コメントです。建物の${['正面', '側面', '背面', '内装', '外構', '詳細'][i]}を撮影しました。`,
    })),
  },
};

/**
 * 報告書出力フラグ混在
 * includeInReportが混在している状態
 */
export const MixedReportInclusion: Story = {
  args: {
    images: createMockImages(8).map((img, i) => ({
      ...img,
      includeInReport: i % 2 === 0,
    })),
  },
};
