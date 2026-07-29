/**
 * @fileoverview ExportSettingsForm のストーリー
 *
 * 工事写真 ZIP一括エクスポートの設定フォーム。
 * 形式（JPEG/PNG）・解像度（低/中/高）・看板重畳モード（重畳/加工/原本）を選択する。
 * 新規設定・別設定・非活性の各状態を確認する。
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ExportSettingsForm } from './ExportSettingsForm';

const meta = {
  title: 'ConstructionPhotos/ExportSettingsForm',
  component: ExportSettingsForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof ExportSettingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * JPEG・中解像度・看板重畳モードの初期設定
 */
export const Default: Story = {
  args: {
    value: {
      format: 'jpeg',
      resolution: 'medium',
      signboardMode: 'composited',
    },
  },
};

/**
 * PNG・高解像度・原本そのまま
 * 別の設定値を選択した状態
 */
export const PngHighOriginal: Story = {
  args: {
    value: {
      format: 'png',
      resolution: 'high',
      signboardMode: 'original',
    },
  },
};

/**
 * 非活性状態
 * エクスポート対象が0件などで操作できない状態
 */
export const Disabled: Story = {
  args: {
    value: {
      format: 'jpeg',
      resolution: 'low',
      signboardMode: 'plain',
    },
    disabled: true,
  },
};
