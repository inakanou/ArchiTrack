import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import StylePanel from './StylePanel';
import { DEFAULT_STYLE_OPTIONS } from './style-panel.constants';

/**
 * StylePanel コンポーネントのストーリー
 *
 * 注釈エディタのスタイル設定パネル。
 * 線色、塗りつぶし色、線の太さ、フォントサイズ、文字色を設定可能。
 */
const meta = {
  title: 'SiteSurveys/StylePanel',
  component: StylePanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onStyleChange: fn(),
  },
} satisfies Meta<typeof StylePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 初期設定のスタイル
 */
export const Default: Story = {
  args: {
    styleOptions: DEFAULT_STYLE_OPTIONS,
  },
};

/**
 * カスタム線色
 * 赤い線色を設定
 */
export const CustomStrokeColor: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      strokeColor: '#ff0000',
    },
  },
};

/**
 * 塗りつぶしあり
 * 塗りつぶし色を設定
 */
export const WithFill: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      fillColor: '#ffff00',
    },
  },
};

/**
 * 太い線
 * 線の太さを太く設定
 */
export const ThickStroke: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      strokeWidth: 8,
    },
  },
};

/**
 * 細い線
 * 線の太さを細く設定
 */
export const ThinStroke: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      strokeWidth: 1,
    },
  },
};

/**
 * 大きいフォント
 * フォントサイズを大きく設定
 */
export const LargeFont: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      fontSize: 32,
    },
  },
};

/**
 * 小さいフォント
 * フォントサイズを小さく設定
 */
export const SmallFont: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      fontSize: 12,
    },
  },
};

/**
 * カスタム文字色
 * 青い文字色を設定
 */
export const CustomFontColor: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      fontColor: '#0000ff',
    },
  },
};

/**
 * 全カスタム設定
 * 全てのオプションをカスタム設定
 */
export const AllCustom: Story = {
  args: {
    styleOptions: {
      strokeColor: '#ff6600',
      fillColor: '#fff3e0',
      strokeWidth: 4,
      fontSize: 24,
      fontColor: '#333333',
    },
  },
};

/**
 * 無効状態
 * 全ての入力が無効化された状態
 */
export const Disabled: Story = {
  args: {
    styleOptions: DEFAULT_STYLE_OPTIONS,
    disabled: true,
  },
};

/**
 * 青系カラースキーム
 * 青系の色でスタイル設定
 */
export const BlueScheme: Story = {
  args: {
    styleOptions: {
      strokeColor: '#1e40af',
      fillColor: '#dbeafe',
      strokeWidth: 3,
      fontSize: 18,
      fontColor: '#1e3a8a',
    },
  },
};

/**
 * 赤系カラースキーム
 * 赤系の色でスタイル設定
 */
export const RedScheme: Story = {
  args: {
    styleOptions: {
      strokeColor: '#dc2626',
      fillColor: '#fee2e2',
      strokeWidth: 3,
      fontSize: 18,
      fontColor: '#991b1b',
    },
  },
};

/**
 * 緑系カラースキーム
 * 緑系の色でスタイル設定
 */
export const GreenScheme: Story = {
  args: {
    styleOptions: {
      strokeColor: '#16a34a',
      fillColor: '#dcfce7',
      strokeWidth: 3,
      fontSize: 18,
      fontColor: '#166534',
    },
  },
};

/**
 * 最大値設定
 * 各オプションの最大値を設定
 */
export const MaxValues: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      strokeWidth: 20,
      fontSize: 72,
    },
  },
};

/**
 * 最小値設定
 * 各オプションの最小値を設定
 */
export const MinValues: Story = {
  args: {
    styleOptions: {
      ...DEFAULT_STYLE_OPTIONS,
      strokeWidth: 1,
      fontSize: 8,
    },
  },
};
