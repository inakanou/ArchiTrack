import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ZoomControls from './ZoomControls';

/**
 * ZoomControls コンポーネントのストーリー
 *
 * 注釈編集モードに、ズームイン・ズームアウト・全体表示（フィット）のボタンと
 * 現在のズーム倍率バッジを提供する表示専用コンポーネント。
 * 画面下部右端に固定配置され、各タップ領域は44x44論理ピクセル以上を満たす。
 */
const meta = {
  title: 'SiteSurveys/ZoomControls',
  component: ZoomControls,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onZoomIn: fn(),
    onZoomOut: fn(),
    onFit: fn(),
  },
} satisfies Meta<typeof ZoomControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * ズーム倍率100%の初期状態
 */
export const Default: Story = {
  args: {
    zoom: 1,
  },
};

/**
 * ズームイン状態
 * 150%に拡大した状態
 */
export const ZoomedIn: Story = {
  args: {
    zoom: 1.5,
  },
};

/**
 * ズームアウト状態
 * 50%に縮小した状態
 */
export const ZoomedOut: Story = {
  args: {
    zoom: 0.5,
  },
};

/**
 * 無効状態
 * すべての操作が無効化された状態
 */
export const Disabled: Story = {
  args: {
    zoom: 1,
    disabled: true,
  },
};
