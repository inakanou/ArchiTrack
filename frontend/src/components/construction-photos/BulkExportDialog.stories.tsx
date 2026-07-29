/**
 * @fileoverview BulkExportDialog（一括エクスポート設定ダイアログ）のStorybook
 *
 * 「全件」または「選択」モードで起動し、形式・解像度・看板重畳モードを確定して
 * エクスポートを開始する設定ダイアログの状態を提示する。
 * 非表示（Closed）／全件（AllMode）／選択（SelectedMode）／対象0件（EmptyTarget）を用意する。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { BulkExportDialog } from './BulkExportDialog';

const meta = {
  title: 'ConstructionPhotos/BulkExportDialog',
  component: BulkExportDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onStart: fn(),
    onEmptyTarget: fn(),
  },
} satisfies Meta<typeof BulkExportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ダイアログ非表示
 */
export const Closed: Story = {
  args: {
    open: false,
    mode: 'all',
    totalCount: 24,
    selectedCount: 0,
  },
};

/**
 * 全件エクスポート（アルバム内の全写真項目が対象）
 */
export const AllMode: Story = {
  args: {
    open: true,
    mode: 'all',
    totalCount: 24,
    selectedCount: 0,
  },
};

/**
 * 選択エクスポート（選択済みの写真項目のみが対象）
 */
export const SelectedMode: Story = {
  args: {
    open: true,
    mode: 'selected',
    totalCount: 24,
    selectedCount: 5,
  },
};

/**
 * 対象0件（開始ボタン非活性・通知コールバック発火）
 */
export const EmptyTarget: Story = {
  args: {
    open: true,
    mode: 'selected',
    totalCount: 24,
    selectedCount: 0,
  },
};
