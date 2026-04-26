import type { Meta, StoryObj } from '@storybook/react';
import type { FabricObject } from 'fabric';
import { fn } from 'storybook/test';
import AnnotationContextMenu from './AnnotationContextMenu';

/**
 * AnnotationContextMenu コンポーネントのストーリー
 *
 * 注釈オブジェクト長押し/右クリック時に編集・複製・削除アクションを提示するコンテキストメニュー。
 * - 編集アクションはテキスト系オブジェクト（type === 'text' | 'i-text' | 'textAnnotation'）でのみ有効
 * - メニュー外タップを検知する透明オーバーレイを背景に配置
 */

const createTarget = (type: string): FabricObject => ({ type }) as unknown as FabricObject;

const meta = {
  title: 'SiteSurveys/AnnotationContextMenu',
  component: AnnotationContextMenu,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onAction: fn(),
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100%', height: '320px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnnotationContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 矢印オブジェクト選択時
 * テキスト系ではないため編集ボタンは無効、複製・削除は有効。
 */
export const ArrowTarget: Story = {
  args: {
    visible: true,
    position: { x: 40, y: 40 },
    targetObject: createTarget('arrow'),
  },
};

/**
 * テキスト注釈選択時
 * 全アクション（編集・複製・削除）が有効。
 */
export const TextAnnotationTarget: Story = {
  args: {
    visible: true,
    position: { x: 40, y: 40 },
    targetObject: createTarget('textAnnotation'),
  },
};

/**
 * Fabric IText 選択時
 * Fabric 標準の IText も編集可能として扱われる。
 */
export const ITextTarget: Story = {
  args: {
    visible: true,
    position: { x: 40, y: 40 },
    targetObject: createTarget('i-text'),
  },
};

/**
 * 図形系オブジェクト選択時
 * 円・四角形などは編集ボタンが無効化される。
 */
export const ShapeTarget: Story = {
  args: {
    visible: true,
    position: { x: 40, y: 40 },
    targetObject: createTarget('circle'),
  },
};

/**
 * 非表示状態
 * visible=false の場合は何もレンダリングしない。
 */
export const Hidden: Story = {
  args: {
    visible: false,
    position: { x: 40, y: 40 },
    targetObject: createTarget('textAnnotation'),
  },
};
