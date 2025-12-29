import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { AnnotatedImageThumbnail } from './AnnotatedImageThumbnail';
import type { SurveyImageInfo } from '../../types/site-survey.types';

/**
 * AnnotatedImageThumbnail コンポーネントのストーリー
 *
 * 画像一覧で注釈を含めた画像サムネイルを表示するためのコンポーネント。
 * 注釈データを取得し、Fabric.jsを使用して画像と注釈を重ねてレンダリングする。
 */

/**
 * モック画像情報を生成するヘルパー関数
 */
const createMockImage = (overrides?: Partial<SurveyImageInfo>): SurveyImageInfo => ({
  id: 'image-1',
  surveyId: 'survey-1',
  originalPath: '/storage/original/image.jpg',
  thumbnailPath: '/storage/thumbnail/image.jpg',
  originalUrl: 'https://picsum.photos/800/600',
  thumbnailUrl: 'https://picsum.photos/200/200',
  mediumUrl: 'https://picsum.photos/400/300',
  fileName: 'sample-image.jpg',
  fileSize: 1024000,
  width: 800,
  height: 600,
  displayOrder: 1,
  createdAt: '2025-12-28T10:00:00.000Z',
  comment: null,
  includeInReport: true,
  ...overrides,
});

const meta = {
  title: 'SiteSurveys/AnnotatedImageThumbnail',
  component: AnnotatedImageThumbnail,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof AnnotatedImageThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 通常のサムネイル表示
 */
export const Default: Story = {
  args: {
    image: createMockImage(),
    alt: 'サンプル画像',
    style: {
      width: '200px',
      height: '200px',
      objectFit: 'cover',
    },
  },
};

/**
 * 遅延読み込み
 * loading="lazy"の場合
 */
export const LazyLoading: Story = {
  args: {
    image: createMockImage(),
    alt: 'サンプル画像',
    loading: 'lazy',
    style: {
      width: '200px',
      height: '200px',
      objectFit: 'cover',
    },
  },
};

/**
 * 即時読み込み
 * loading="eager"の場合
 */
export const EagerLoading: Story = {
  args: {
    image: createMockImage(),
    alt: 'サンプル画像',
    loading: 'eager',
    style: {
      width: '200px',
      height: '200px',
      objectFit: 'cover',
    },
  },
};

/**
 * カスタムスタイル
 * 角丸やボーダーなどのカスタムスタイルを適用
 */
export const CustomStyled: Story = {
  args: {
    image: createMockImage(),
    alt: 'サンプル画像',
    style: {
      width: '250px',
      height: '180px',
      objectFit: 'cover',
      borderRadius: '12px',
      border: '2px solid #e5e7eb',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    },
  },
};

/**
 * サムネイルURLなし
 * thumbnailUrlがない場合、originalUrlにフォールバック
 */
export const NoThumbnailUrl: Story = {
  args: {
    image: createMockImage({
      thumbnailUrl: null,
      mediumUrl: 'https://picsum.photos/400/300',
    }),
    alt: 'サンプル画像',
    style: {
      width: '200px',
      height: '200px',
      objectFit: 'cover',
    },
  },
};

/**
 * 正方形サムネイル
 * 1:1のアスペクト比で表示
 */
export const SquareThumbnail: Story = {
  args: {
    image: createMockImage(),
    alt: 'サンプル画像',
    style: {
      width: '150px',
      height: '150px',
      objectFit: 'cover',
    },
  },
};

/**
 * ワイドサムネイル
 * 16:9のアスペクト比で表示
 */
export const WideThumbnail: Story = {
  args: {
    image: createMockImage(),
    alt: 'サンプル画像',
    style: {
      width: '320px',
      height: '180px',
      objectFit: 'cover',
    },
  },
};
