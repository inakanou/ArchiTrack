import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import BulkExportDialog from './BulkExportDialog';
import type {
  BulkExportInput,
  BulkExportProgress,
  BulkExportResult,
  BulkExportService,
  SurveyImageMetadata,
} from '../../services/export/bulkExportService';

/**
 * BulkExportDialog コンポーネントのストーリー
 *
 * 全件 / 選択画像 モードを切替で受け、ExportSettingsForm を使ってエクスポート設定を確定し
 * `bulkExportService.execute` を起動するダイアログ。対象 0 件時は親に通知して自動クローズ。
 */

/**
 * モック対象画像（最小情報のみ。Storybook上では execute は呼ばれない）
 */
const mockImages: SurveyImageMetadata[] = Array.from({ length: 5 }, (_, idx) => ({
  id: `image-${idx + 1}`,
  surveyId: 'survey-1',
  originalPath: `/storage/original/image-${idx + 1}.jpg`,
  thumbnailPath: `/storage/thumbnail/image-${idx + 1}.jpg`,
  originalUrl: `https://example.com/image-${idx + 1}.jpg`,
  thumbnailUrl: `https://example.com/thumbnail-${idx + 1}.jpg`,
  fileName: `sample-photo-${String(idx + 1).padStart(3, '0')}.jpg`,
  fileSize: 2048576,
  width: 4032,
  height: 3024,
  displayOrder: idx + 1,
  createdAt: '2025-12-28T10:00:00.000Z',
  comment: null,
  includeInReport: true,
}));

/**
 * Storybook 用ダミーサービス。
 * 実行されても副作用を起こさない（pending Promise を返すのみ）。
 */
const noopService: BulkExportService = {
  execute: (
    _input: BulkExportInput,
    _onProgress: (progress: BulkExportProgress) => void,
    _signal: AbortSignal
  ): Promise<BulkExportResult> => new Promise(() => undefined),
};

const meta = {
  title: 'SiteSurveys/BulkExportDialog',
  component: BulkExportDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onStart: fn(),
    onProgress: fn(),
    onEmptyTarget: fn(),
    service: noopService,
  },
} satisfies Meta<typeof BulkExportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 非表示状態
 */
export const Closed: Story = {
  args: {
    open: false,
    mode: 'all',
    surveyId: 'survey-1',
    surveyName: '○○マンション現地調査',
    images: mockImages,
  },
};

/**
 * 全件一括エクスポート
 */
export const AllMode: Story = {
  args: {
    open: true,
    mode: 'all',
    surveyId: 'survey-1',
    surveyName: '○○マンション現地調査',
    images: mockImages,
  },
};

/**
 * 選択画像エクスポート（3 件選択中）
 */
export const SelectedMode: Story = {
  args: {
    open: true,
    mode: 'selected',
    surveyId: 'survey-1',
    surveyName: '○○マンション現地調査',
    images: mockImages.slice(0, 3),
  },
};

/**
 * 選択画像エクスポート（1 件のみ選択）
 */
export const SelectedSingle: Story = {
  args: {
    open: true,
    mode: 'selected',
    surveyId: 'survey-1',
    surveyName: '○○マンション現地調査',
    images: mockImages.slice(0, 1),
  },
};

/**
 * 長い現場調査名
 */
export const LongSurveyName: Story = {
  args: {
    open: true,
    mode: 'all',
    surveyId: 'survey-1',
    surveyName: '東京都千代田区丸の内一丁目○○ビル外壁改修工事に伴う現地調査 (2025年12月実施分)',
    images: mockImages,
  },
};
