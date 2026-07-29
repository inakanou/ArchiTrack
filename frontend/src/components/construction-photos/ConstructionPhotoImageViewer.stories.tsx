/**
 * @fileoverview 工事写真 閲覧専用画像ビューアのStorybook
 *
 * フルスクリーンのオーバーレイで原本画像を表示する閲覧専用ビューア。
 * 画像表示・読み込み中・エラーの各分岐と、画像名なしのフォールバック表示を網羅する。
 * ズーム/回転/パン操作はキャンバス基盤に委譲される（Story では初期表示を確認する）。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ConstructionPhotoImageViewer from './ConstructionPhotoImageViewer';

const meta = {
  title: 'ConstructionPhotos/ConstructionPhotoImageViewer',
  component: ConstructionPhotoImageViewer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    imageUrl: 'https://example.com/photo1.jpg',
    imageName: '基礎配筋_001.jpg',
    isLoading: false,
    error: null,
    onClose: fn(),
  },
} satisfies Meta<typeof ConstructionPhotoImageViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 原本画像を表示し、ズーム/回転コントロールを含む通常の閲覧状態。
 */
export const Default: Story = {
  args: {},
};

/**
 * 読み込み中
 * 原本取得中（R14.6）はスピナーとメッセージを表示する。
 */
export const Loading: Story = {
  args: {
    imageUrl: null,
    isLoading: true,
  },
};

/**
 * エラー状態
 * 原本取得に失敗した場合、エラーメッセージを表示する。
 */
export const WithError: Story = {
  args: {
    imageUrl: null,
    isLoading: false,
    error: '画像の読み込みに失敗しました',
  },
};

/**
 * 画像名なし
 * imageName 未指定時のフォールバックタイトル（「画像ビューア」）表示。
 */
export const WithoutImageName: Story = {
  args: {
    imageName: undefined,
  },
};
