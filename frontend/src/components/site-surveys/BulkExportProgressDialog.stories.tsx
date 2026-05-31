import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import BulkExportProgressDialog from './BulkExportProgressDialog';
import type { BulkExportFailure, BulkExportResult } from '../../services/export/bulkExportService';

/**
 * BulkExportProgressDialog コンポーネントのストーリー
 *
 * 一括エクスポート処理の進捗を可視化し、キャンセル操作および部分失敗時の
 * ユーザー選択（成功分のみダウンロード / 中止）を取得するダイアログ。
 */

/**
 * Storybook 用に解決しない promise を生成する。
 * 進捗表示状態を維持するため使用。
 */
const createPendingPromise = (): Promise<BulkExportResult> => new Promise(() => undefined);

/**
 * 部分失敗 result を即時 resolve する promise。
 * 部分失敗サブダイアログ表示用。
 */
const createPartialResultPromise = (): Promise<BulkExportResult> => {
  const failures: BulkExportFailure[] = [
    { imageId: 'image-3', imageName: 'photo-003.jpg', reason: 'render', message: 'render failed' },
    { imageId: 'image-7', imageName: 'photo-007.jpg', reason: 'fetch', message: 'network error' },
  ];
  const result: BulkExportResult = {
    status: 'partial',
    zipBlob: new Blob([], { type: 'application/zip' }),
    zipFileName: '○○マンション現地調査.zip',
    failures,
  };
  return Promise.resolve(result);
};

const meta = {
  title: 'SiteSurveys/BulkExportProgressDialog',
  component: BulkExportProgressDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onComplete: fn(),
  },
} satisfies Meta<typeof BulkExportProgressDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 非表示状態
 */
export const Closed: Story = {
  args: {
    open: false,
    surveyName: '○○マンション現地調査',
    progress: null,
    promise: createPendingPromise(),
    controller: new AbortController(),
  },
};

/**
 * 準備中（進捗未受信）
 */
export const Preparing: Story = {
  args: {
    open: true,
    surveyName: '○○マンション現地調査',
    progress: null,
    promise: createPendingPromise(),
    controller: new AbortController(),
  },
};

/**
 * 処理開始直後（0% 進捗）
 */
export const Start: Story = {
  args: {
    open: true,
    surveyName: '○○マンション現地調査',
    progress: { done: 0, total: 20, failedSoFar: 0 },
    promise: createPendingPromise(),
    controller: new AbortController(),
  },
};

/**
 * 進行中（半分完了）
 */
export const Halfway: Story = {
  args: {
    open: true,
    surveyName: '○○マンション現地調査',
    progress: { done: 10, total: 20, failedSoFar: 0 },
    promise: createPendingPromise(),
    controller: new AbortController(),
  },
};

/**
 * 進行中（失敗を含む）
 */
export const InProgressWithFailures: Story = {
  args: {
    open: true,
    surveyName: '○○マンション現地調査',
    progress: { done: 15, total: 20, failedSoFar: 2 },
    promise: createPendingPromise(),
    controller: new AbortController(),
  },
};

/**
 * ほぼ完了（19/20）
 */
export const AlmostComplete: Story = {
  args: {
    open: true,
    surveyName: '○○マンション現地調査',
    progress: { done: 19, total: 20, failedSoFar: 0 },
    promise: createPendingPromise(),
    controller: new AbortController(),
  },
};

/**
 * 部分失敗サブダイアログ表示
 * promise が partial result で解決した直後に表示される確認ダイアログ。
 */
export const PartialFailure: Story = {
  args: {
    open: true,
    surveyName: '○○マンション現地調査',
    progress: { done: 20, total: 20, failedSoFar: 2 },
    promise: createPartialResultPromise(),
    controller: new AbortController(),
  },
};
