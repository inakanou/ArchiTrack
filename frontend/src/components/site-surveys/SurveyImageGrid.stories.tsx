import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SurveyImageGrid from './SurveyImageGrid';
import type { SurveyImageInfo } from '../../types/site-survey.types';

/**
 * SurveyImageGrid コンポーネントのストーリー
 *
 * 現場調査の画像グリッド表示。
 * サムネイルグリッド、ドラッグ＆ドロップによる順序変更機能を提供。
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

const meta = {
  title: 'SiteSurveys/SurveyImageGrid',
  component: SurveyImageGrid,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onImageClick: fn(),
    onOrderChange: fn(),
  },
} satisfies Meta<typeof SurveyImageGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 複数の画像をグリッド表示
 */
export const Default: Story = {
  args: {
    images: createMockImages(12),
  },
};

/**
 * 単一画像
 * 1枚のみ表示
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
    images: createMockImages(30),
  },
};

/**
 * 空の状態
 * 画像がない場合のメッセージ表示
 */
export const Empty: Story = {
  args: {
    images: [],
  },
};

/**
 * ローディング中
 * データ読み込み中のスケルトン表示
 */
export const Loading: Story = {
  args: {
    images: [],
    isLoading: true,
  },
};

/**
 * 読み取り専用
 * ドラッグ＆ドロップ無効
 */
export const ReadOnly: Story = {
  args: {
    images: createMockImages(9),
    readOnly: true,
  },
};

/**
 * 順序番号表示
 * 表示順序番号を表示
 */
export const WithOrderNumbers: Story = {
  args: {
    images: createMockImages(12),
    showOrderNumbers: true,
  },
};

/**
 * 読み取り専用＆順序番号
 * 編集不可で順序番号を表示
 */
export const ReadOnlyWithOrderNumbers: Story = {
  args: {
    images: createMockImages(9),
    readOnly: true,
    showOrderNumbers: true,
  },
};

/**
 * 4カラムグリッド
 * 4列のグリッド表示
 */
export const FourColumns: Story = {
  args: {
    images: createMockImages(16),
    columns: 4,
  },
};

/**
 * 3カラムグリッド
 * 3列のグリッド表示
 */
export const ThreeColumns: Story = {
  args: {
    images: createMockImages(12),
    columns: 3,
  },
};

/**
 * 2カラムグリッド
 * 2列のグリッド表示
 */
export const TwoColumns: Story = {
  args: {
    images: createMockImages(8),
    columns: 2,
  },
};

/**
 * 6カラムグリッド
 * 6列のグリッド表示
 */
export const SixColumns: Story = {
  args: {
    images: createMockImages(18),
    columns: 6,
  },
};

/**
 * モバイル表示
 * 狭い画面での自動レスポンシブ表示
 */
export const MobileView: Story = {
  args: {
    images: createMockImages(8),
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
    images: createMockImages(12),
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};
