import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ImageViewer from './ImageViewer';
import type { SurveyImageInfo } from '../../types/site-survey.types';

/**
 * ImageViewer コンポーネントのストーリー
 *
 * 画像ビューア/エディタモーダルコンポーネント。
 * ズーム、パン、回転操作と注釈編集機能を提供。
 */

/**
 * モック画像情報
 */
const mockImageInfo: SurveyImageInfo = {
  id: 'image-1',
  surveyId: 'survey-1',
  originalPath: '/storage/original/image.jpg',
  thumbnailPath: '/storage/thumbnail/image.jpg',
  originalUrl: 'https://picsum.photos/1920/1080',
  thumbnailUrl: 'https://picsum.photos/200/112',
  fileName: 'site-survey-photo-001.jpg',
  fileSize: 2048576,
  width: 1920,
  height: 1080,
  displayOrder: 1,
  createdAt: '2025-12-28T10:00:00.000Z',
  comment: '建物外観の調査写真',
  includeInReport: true,
};

const meta = {
  title: 'SiteSurveys/ImageViewer',
  component: ImageViewer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onViewStateChange: fn(),
    onExport: fn(),
    onDownloadOriginal: fn(),
  },
} satisfies Meta<typeof ImageViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（非表示）
 * isOpenがfalseの場合、ビューアは表示されない
 */
export const Closed: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: false,
    imageName: 'sample-image.jpg',
    imageInfo: mockImageInfo,
  },
};

/**
 * 開いた状態
 * 通常のビューア表示
 */
export const Open: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: true,
    imageName: 'site-survey-photo-001.jpg',
    imageInfo: mockImageInfo,
  },
};

/**
 * 初期ズーム状態
 * ズームイン状態で開く
 */
export const WithInitialZoom: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: true,
    imageName: 'site-survey-photo-001.jpg',
    imageInfo: mockImageInfo,
    initialViewState: {
      zoom: 1.5,
      panX: 0,
      panY: 0,
      rotation: 0,
    },
  },
};

/**
 * 初期回転状態
 * 90度回転状態で開く
 */
export const WithInitialRotation: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: true,
    imageName: 'site-survey-photo-001.jpg',
    imageInfo: mockImageInfo,
    initialViewState: {
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 90,
    },
  },
};

/**
 * エクスポート中
 * エクスポート処理中の状態
 */
export const Exporting: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: true,
    imageName: 'site-survey-photo-001.jpg',
    imageInfo: mockImageInfo,
    exporting: true,
  },
};

/**
 * ダウンロード中
 * 元画像ダウンロード中の状態
 */
export const Downloading: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: true,
    imageName: 'site-survey-photo-001.jpg',
    imageInfo: mockImageInfo,
    downloading: true,
  },
};

/**
 * 縦長画像
 * ポートレート画像の表示
 */
export const PortraitImage: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1080/1920',
    isOpen: true,
    imageName: 'portrait-photo.jpg',
    imageInfo: {
      ...mockImageInfo,
      width: 1080,
      height: 1920,
      fileName: 'portrait-photo.jpg',
    },
  },
};

/**
 * 正方形画像
 * 1:1アスペクト比の画像
 */
export const SquareImage: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1200/1200',
    isOpen: true,
    imageName: 'square-photo.jpg',
    imageInfo: {
      ...mockImageInfo,
      width: 1200,
      height: 1200,
      fileName: 'square-photo.jpg',
    },
  },
};

/**
 * 画像情報なし
 * imageInfoが未設定の場合
 */
export const WithoutImageInfo: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: true,
    imageName: 'sample-image.jpg',
    imageInfo: undefined,
  },
};

/**
 * コメント付き画像
 * コメントが設定された画像
 */
export const WithComment: Story = {
  args: {
    imageUrl: 'https://picsum.photos/1920/1080',
    isOpen: true,
    imageName: 'commented-photo.jpg',
    imageInfo: {
      ...mockImageInfo,
      comment: '建物外観の調査写真。北側立面を撮影。損傷箇所あり要確認。',
    },
  },
};
