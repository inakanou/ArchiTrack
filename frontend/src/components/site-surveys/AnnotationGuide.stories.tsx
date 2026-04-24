import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { AnnotationGuide } from './AnnotationGuide';

/**
 * AnnotationGuide コンポーネントのストーリー
 *
 * 注釈ツール選択後一定時間（GUIDE_IDLE_MS=3000）操作が無い場合に、
 * 選択中ツール向けの簡易ガイド文言を画像領域に非侵襲的に表示するオーバーレイ。
 * タップで即 dismiss 可能。
 */

const meta = {
  title: 'SiteSurveys/AnnotationGuide',
  component: AnnotationGuide,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onDismiss: fn(),
  },
  decorators: [
    (Story) => (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '240px',
          backgroundColor: '#1f2937',
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnnotationGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 選択ツール向けガイド
 * 「タップで選択」。
 */
export const SelectTool: Story = {
  args: {
    visible: true,
    toolKind: 'select',
  },
};

/**
 * 矢印ツール向けガイド
 * ドラッグ系ツール共通文言「ドラッグで描画」。
 */
export const ArrowTool: Story = {
  args: {
    visible: true,
    toolKind: 'arrow',
  },
};

/**
 * 多角形ツール向けガイド
 * 頂点クリック系ツール共通文言「クリックで頂点追加」。
 */
export const PolygonTool: Story = {
  args: {
    visible: true,
    toolKind: 'polygon',
  },
};

/**
 * テキストツール向けガイド
 * 「タップでテキスト入力」。
 */
export const TextTool: Story = {
  args: {
    visible: true,
    toolKind: 'text',
  },
};

/**
 * 寸法線ツール向けガイド
 * 「2点クリックで寸法線」。
 */
export const DimensionTool: Story = {
  args: {
    visible: true,
    toolKind: 'dimension',
  },
};

/**
 * 非表示状態
 * visible=false の場合は何もレンダリングしない。
 */
export const Hidden: Story = {
  args: {
    visible: false,
    toolKind: 'arrow',
  },
};
