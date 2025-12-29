import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import AnnotationToolbar from './AnnotationToolbar';
import { DEFAULT_STYLE_OPTIONS } from './annotation-toolbar.constants';

/**
 * AnnotationToolbar コンポーネントのストーリー
 *
 * 注釈編集で使用する各種ツールの切り替えUIを提供。
 * 選択ツール、寸法線、矢印、円、四角形、多角形、折れ線、フリーハンド、テキストの切り替えが可能。
 */
const meta = {
  title: 'SiteSurveys/AnnotationToolbar',
  component: AnnotationToolbar,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onToolChange: fn(),
    onStyleChange: fn(),
    onUndo: fn(),
    onRedo: fn(),
    onSave: fn(),
    onExport: fn(),
  },
} satisfies Meta<typeof AnnotationToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 選択ツールがアクティブな初期状態
 */
export const Default: Story = {
  args: {
    activeTool: 'select',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * 寸法線ツール選択中
 * 寸法線ツールがアクティブな状態、スタイルパネルが表示される
 */
export const DimensionTool: Story = {
  args: {
    activeTool: 'dimension',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * 矢印ツール選択中
 * 矢印ツールがアクティブな状態
 */
export const ArrowTool: Story = {
  args: {
    activeTool: 'arrow',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * 円ツール選択中
 * 円ツールがアクティブな状態、塗りつぶしオプションが表示される
 */
export const CircleTool: Story = {
  args: {
    activeTool: 'circle',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * 四角形ツール選択中
 * 四角形ツールがアクティブな状態
 */
export const RectangleTool: Story = {
  args: {
    activeTool: 'rectangle',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * 多角形ツール選択中
 * 多角形ツールがアクティブな状態
 */
export const PolygonTool: Story = {
  args: {
    activeTool: 'polygon',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * テキストツール選択中
 * テキストツールがアクティブな状態、フォントオプションが表示される
 */
export const TextTool: Story = {
  args: {
    activeTool: 'text',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * フリーハンドツール選択中
 * フリーハンド描画ツールがアクティブな状態
 */
export const FreehandTool: Story = {
  args: {
    activeTool: 'freehand',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: true,
  },
};

/**
 * カスタムスタイル
 * カスタム色と線の太さを設定した状態
 */
export const CustomStyle: Story = {
  args: {
    activeTool: 'arrow',
    styleOptions: {
      strokeColor: '#ff0000',
      strokeWidth: 4,
      fillColor: '#ffff00',
      fontSize: 18,
    },
    canUndo: true,
    canRedo: true,
  },
};

/**
 * Undo不可状態
 * Undoできない状態（履歴の先頭）
 */
export const CannotUndo: Story = {
  args: {
    activeTool: 'select',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: false,
    canRedo: true,
  },
};

/**
 * Redo不可状態
 * Redoできない状態（履歴の末尾）
 */
export const CannotRedo: Story = {
  args: {
    activeTool: 'select',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: true,
    canRedo: false,
  },
};

/**
 * 操作履歴なし
 * UndoもRedoもできない状態
 */
export const NoHistory: Story = {
  args: {
    activeTool: 'select',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: false,
    canRedo: false,
  },
};

/**
 * 無効状態
 * ツールバー全体が無効化された状態
 */
export const Disabled: Story = {
  args: {
    activeTool: 'select',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    disabled: true,
    canUndo: true,
    canRedo: true,
  },
};
