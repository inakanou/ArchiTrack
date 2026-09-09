import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PhotoPreviewDialog from './PhotoPreviewDialog';
import type { SurveyImageSummary } from '../../types/quantity-table.types';

/**
 * PhotoPreviewDialog コンポーネントのストーリー
 *
 * 数量グループに紐づけられた写真を拡大プレビューするモーダルダイアログ。
 * 表示元は原本画像で、注釈は共有表示部品がクライアント側で合成する
 * （Requirement 49.7。合成済みサムネイルは縮小解像度のため拡大表示には用いない）。
 */

// サンプル画像データ
const sampleImageWithAnnotation: SurveyImageSummary = {
  id: 'img-1',
  thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Thumbnail',
  originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Original',
  fileName: 'survey_photo_001.jpg',
  hasAnnotations: true,
  annotatedThumbnailUrl: 'https://placehold.co/800x600/dbeafe/1e40af?text=Annotated+Preview',
};

const sampleImageWithoutAnnotation: SurveyImageSummary = {
  id: 'img-2',
  thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Thumbnail',
  originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Original+Image',
  fileName: 'survey_photo_002.jpg',
  hasAnnotations: false,
};

const meta = {
  title: 'Components/QuantityTable/PhotoPreviewDialog',
  component: PhotoPreviewDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    isOpen: true,
    onClose: fn(),
    image: sampleImageWithAnnotation,
  },
} satisfies Meta<typeof PhotoPreviewDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 注釈付き画像のプレビュー
 */
export const Default: Story = {};

/**
 * 注釈なし画像
 * 注釈が無い場合も表示元は原本画像（合成が行われないだけで経路は同じ）
 */
export const WithoutAnnotation: Story = {
  args: {
    image: sampleImageWithoutAnnotation,
  },
};

/**
 * ダイアログ非表示
 * isOpen=false の状態（何も表示されない）
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};
