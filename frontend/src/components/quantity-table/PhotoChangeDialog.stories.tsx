import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PhotoChangeDialog from './PhotoChangeDialog';
import type { SurveyImageSummary } from '../../types/quantity-table.types';

/**
 * PhotoChangeDialog コンポーネントのストーリー
 *
 * 数量グループに紐づけた写真を変更する際に表示されるモーダルダイアログ。
 * 同一プロジェクトの注釈付き現場調査写真一覧を表示し、新しい写真を選択する。
 */

// サンプル画像データ
const sampleImages: SurveyImageSummary[] = [
  {
    id: 'img-1',
    thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Photo+1',
    originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Photo+1',
    fileName: 'survey_photo_001.jpg',
    hasAnnotations: true,
    annotatedThumbnailUrl: 'https://placehold.co/150x150/dbeafe/1e40af?text=Annotated+1',
  },
  {
    id: 'img-2',
    thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Photo+2',
    originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Photo+2',
    fileName: 'survey_photo_002.jpg',
    hasAnnotations: false,
  },
  {
    id: 'img-3',
    thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Photo+3',
    originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Photo+3',
    fileName: 'survey_photo_003.jpg',
    hasAnnotations: true,
    annotatedThumbnailUrl: 'https://placehold.co/150x150/dbeafe/1e40af?text=Annotated+3',
  },
  {
    id: 'img-4',
    thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Photo+4',
    originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Photo+4',
    fileName: 'survey_photo_004.jpg',
    hasAnnotations: false,
  },
  {
    id: 'img-5',
    thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Photo+5',
    originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Photo+5',
    fileName: 'survey_photo_005.jpg',
    hasAnnotations: true,
    annotatedThumbnailUrl: 'https://placehold.co/150x150/dbeafe/1e40af?text=Annotated+5',
  },
  {
    id: 'img-6',
    thumbnailUrl: 'https://placehold.co/150x150/e2e8f0/475569?text=Photo+6',
    originalUrl: 'https://placehold.co/800x600/e2e8f0/475569?text=Photo+6',
    fileName: 'survey_photo_006.jpg',
    hasAnnotations: false,
  },
];

const meta = {
  title: 'Components/QuantityTable/PhotoChangeDialog',
  component: PhotoChangeDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    isOpen: true,
    onClose: fn(),
    onSelect: fn(),
    images: sampleImages,
    isLoading: false,
    currentImageId: null,
  },
} satisfies Meta<typeof PhotoChangeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 写真一覧が表示された状態
 */
export const Default: Story = {};

/**
 * 写真選択中
 * 現在選択中の写真がハイライト表示される
 */
export const WithSelectedPhoto: Story = {
  args: {
    currentImageId: 'img-1',
  },
};

/**
 * 読み込み中
 * 写真データを取得中の状態
 */
export const Loading: Story = {
  args: {
    isLoading: true,
    images: [],
  },
};

/**
 * 写真なし
 * 利用可能な写真がない状態
 */
export const Empty: Story = {
  args: {
    images: [],
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
