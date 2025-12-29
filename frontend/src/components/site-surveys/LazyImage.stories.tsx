import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { LazyImage } from './LazyImage';

/**
 * LazyImage コンポーネントのストーリー
 *
 * IntersectionObserverを使用して画像を遅延読み込みし、
 * サムネイル優先表示でユーザー体験を向上させるコンポーネント。
 */
const meta = {
  title: 'SiteSurveys/LazyImage',
  component: LazyImage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onLoadComplete: fn(),
    onError: fn(),
  },
} satisfies Meta<typeof LazyImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 基本的な遅延読み込み画像
 */
export const Default: Story = {
  args: {
    src: 'https://picsum.photos/400/300',
    alt: 'サンプル画像',
    width: 300,
    height: 200,
  },
};

/**
 * サムネイル付き
 * サムネイル優先表示後にオリジナルを読み込む
 */
export const WithThumbnail: Story = {
  args: {
    src: 'https://picsum.photos/800/600',
    thumbnailSrc: 'https://picsum.photos/80/60',
    alt: 'サムネイル付き画像',
    width: 400,
    height: 300,
  },
};

/**
 * 角丸表示
 * borderRadiusを設定した画像
 */
export const Rounded: Story = {
  args: {
    src: 'https://picsum.photos/300/300',
    alt: '角丸画像',
    width: 200,
    height: 200,
    borderRadius: '12px',
  },
};

/**
 * 円形表示
 * 完全な円形で表示
 */
export const Circle: Story = {
  args: {
    src: 'https://picsum.photos/300/300',
    alt: '円形画像',
    width: 200,
    height: 200,
    borderRadius: '50%',
  },
};

/**
 * contain モード
 * アスペクト比を維持してコンテナ内に収める
 */
export const ObjectFitContain: Story = {
  args: {
    src: 'https://picsum.photos/800/400',
    alt: 'contain画像',
    width: 300,
    height: 300,
    objectFit: 'contain',
  },
};

/**
 * fill モード
 * コンテナを完全に埋める（アスペクト比変更）
 */
export const ObjectFitFill: Story = {
  args: {
    src: 'https://picsum.photos/800/400',
    alt: 'fill画像',
    width: 300,
    height: 300,
    objectFit: 'fill',
  },
};

/**
 * カスタムrootMargin
 * 事前読み込みのマージンを設定
 */
export const CustomRootMargin: Story = {
  args: {
    src: 'https://picsum.photos/400/300',
    alt: 'カスタムマージン画像',
    width: 300,
    height: 200,
    rootMargin: '200px',
  },
};

/**
 * カスタムクラス
 * CSSクラスを適用した画像
 */
export const WithCustomClass: Story = {
  args: {
    src: 'https://picsum.photos/400/300',
    alt: 'カスタムクラス画像',
    width: 300,
    height: 200,
    className: 'shadow-lg',
  },
};

/**
 * 小さい画像
 * 小さなサイズでの表示
 */
export const SmallImage: Story = {
  args: {
    src: 'https://picsum.photos/150/100',
    alt: '小さい画像',
    width: 100,
    height: 75,
  },
};

/**
 * 大きい画像
 * 大きなサイズでの表示
 */
export const LargeImage: Story = {
  args: {
    src: 'https://picsum.photos/1200/800',
    alt: '大きい画像',
    width: 600,
    height: 400,
  },
};

/**
 * ワイド画像
 * 16:9アスペクト比
 */
export const WideImage: Story = {
  args: {
    src: 'https://picsum.photos/640/360',
    alt: 'ワイド画像',
    width: 480,
    height: 270,
  },
};

/**
 * 縦長画像
 * ポートレートアスペクト比
 */
export const PortraitImage: Story = {
  args: {
    src: 'https://picsum.photos/300/500',
    alt: '縦長画像',
    width: 180,
    height: 300,
  },
};

/**
 * 正方形画像
 * 1:1アスペクト比
 */
export const SquareImage: Story = {
  args: {
    src: 'https://picsum.photos/400/400',
    alt: '正方形画像',
    width: 250,
    height: 250,
  },
};
