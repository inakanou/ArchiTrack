import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ExportSettingsForm, { type ExportSettings } from './ExportSettingsForm';

/**
 * ExportSettingsForm コンポーネントのストーリー
 *
 * 個別/一括エクスポートで共有するエクスポート設定フォーム。
 * - 形式選択（JPEG / PNG）
 * - 解像度選択（低 / 中 / 高）
 * - 注釈モード選択（含める / 含めない / 元画像そのまま）
 */

const DEFAULT_SETTINGS: ExportSettings = {
  format: 'jpeg',
  resolution: 'medium',
  annotationMode: 'include',
};

const meta = {
  title: 'SiteSurveys/ExportSettingsForm',
  component: ExportSettingsForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '420px', padding: '24px', backgroundColor: '#ffffff' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExportSettingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 既定値（JPEG / 中 / 注釈を含める）
 */
export const Default: Story = {
  args: {
    value: DEFAULT_SETTINGS,
  },
};

/**
 * PNG / 高解像度 / 注釈を含めない
 */
export const PngHighExclude: Story = {
  args: {
    value: {
      format: 'png',
      resolution: 'high',
      annotationMode: 'exclude',
    },
  },
};

/**
 * 元画像そのまま（再レンダリングなし）
 */
export const OriginalOnly: Story = {
  args: {
    value: {
      format: 'jpeg',
      resolution: 'low',
      annotationMode: 'original-only',
    },
  },
};

/**
 * 非活性状態
 * disabled=true により全てのラジオボタンが操作不可となる。
 */
export const Disabled: Story = {
  args: {
    value: DEFAULT_SETTINGS,
    disabled: true,
  },
};
