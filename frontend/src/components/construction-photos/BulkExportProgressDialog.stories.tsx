/**
 * @fileoverview BulkExportProgressDialog（一括エクスポート進捗ダイアログ）のStorybook
 *
 * 一括ZIPエクスポートの進捗（完了件数・総件数・失敗件数）を可視化し、中断操作を受け付ける
 * ダイアログの状態を提示する。
 * 非表示（Closed）／準備中（Preparing）／実行中（Running）／完了・部分失敗（CompletedWithFailures）を用意する。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { BulkExportProgressDialog } from './BulkExportProgressDialog';

const meta = {
  title: 'ConstructionPhotos/BulkExportProgressDialog',
  component: BulkExportProgressDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onCancel: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BulkExportProgressDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ダイアログ非表示
 */
export const Closed: Story = {
  args: {
    open: false,
    progress: null,
    isRunning: false,
  },
};

/**
 * 準備中（進捗未受信・中断可能）
 */
export const Preparing: Story = {
  args: {
    open: true,
    progress: null,
    isRunning: true,
  },
};

/**
 * 実行中（進捗バー表示・中断可能）
 */
export const Running: Story = {
  args: {
    open: true,
    progress: { completed: 5, total: 20, failed: 0 },
    isRunning: true,
  },
};

/**
 * 完了（部分失敗あり・閉じる可能）
 */
export const CompletedWithFailures: Story = {
  args: {
    open: true,
    progress: { completed: 18, total: 20, failed: 2 },
    isRunning: false,
  },
};
