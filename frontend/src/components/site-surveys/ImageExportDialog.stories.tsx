import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ImageExportDialog from './ImageExportDialog';
import type { SurveyImageInfo } from '../../types/site-survey.types';

/**
 * ImageExportDialog コンポーネントのストーリー
 *
 * 個別画像のエクスポートダイアログ。
 * エクスポート形式選択（JPEG/PNG）、品質選択、注釈あり/なしオプションを提供。
 */

/**
 * モック画像情報
 */
const mockImageInfo: SurveyImageInfo = {
  id: 'image-1',
  surveyId: 'survey-1',
  originalPath: '/storage/original/image.jpg',
  thumbnailPath: '/storage/thumbnail/image.jpg',
  originalUrl: 'https://example.com/image.jpg',
  thumbnailUrl: 'https://example.com/thumbnail.jpg',
  fileName: 'sample-photo-001.jpg',
  fileSize: 2048576, // 約2MB
  width: 4032,
  height: 3024,
  displayOrder: 1,
  createdAt: '2025-12-28T10:00:00.000Z',
  comment: null,
  includeInReport: true,
};

const meta = {
  title: 'SiteSurveys/ImageExportDialog',
  component: ImageExportDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onExport: fn(),
    onClose: fn(),
    onDownloadOriginal: fn(),
  },
} satisfies Meta<typeof ImageExportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（非表示）
 * openがfalseの場合、ダイアログは表示されない
 */
export const Closed: Story = {
  args: {
    open: false,
    imageInfo: mockImageInfo,
  },
};

/**
 * 開いた状態
 * 通常のエクスポートダイアログ表示
 */
export const Open: Story = {
  args: {
    open: true,
    imageInfo: mockImageInfo,
  },
};

/**
 * エクスポート中
 * エクスポート処理中のローディング表示
 */
export const Exporting: Story = {
  args: {
    open: true,
    imageInfo: mockImageInfo,
    exporting: true,
  },
};

/**
 * ダウンロード中
 * 元画像ダウンロード処理中のローディング表示
 */
export const Downloading: Story = {
  args: {
    open: true,
    imageInfo: mockImageInfo,
    downloading: true,
  },
};

/**
 * 元画像ダウンロードなし
 * onDownloadOriginalが設定されていない場合、ダウンロードボタンは表示されない
 */
export const WithoutDownloadOriginal: Story = {
  args: {
    open: true,
    imageInfo: mockImageInfo,
    onDownloadOriginal: undefined,
  },
};

/**
 * 大きなファイル
 * ファイルサイズが大きい画像の場合
 */
export const LargeFile: Story = {
  args: {
    open: true,
    imageInfo: {
      ...mockImageInfo,
      fileName: 'high-resolution-photo.jpg',
      fileSize: 15728640, // 約15MB
      width: 8192,
      height: 6144,
    },
  },
};

/**
 * 小さなファイル
 * ファイルサイズが小さい画像の場合
 */
export const SmallFile: Story = {
  args: {
    open: true,
    imageInfo: {
      ...mockImageInfo,
      fileName: 'thumbnail.jpg',
      fileSize: 51200, // 約50KB
      width: 640,
      height: 480,
    },
  },
};

/**
 * 長いファイル名
 * ファイル名が長い場合の表示確認
 */
export const LongFileName: Story = {
  args: {
    open: true,
    imageInfo: {
      ...mockImageInfo,
      fileName:
        'very-long-file-name-with-many-details-site-survey-2025-12-28-photo-001-annotated.jpg',
    },
  },
};
