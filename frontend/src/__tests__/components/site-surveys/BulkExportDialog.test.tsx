/**
 * BulkExportDialog コンポーネントのテスト
 *
 * Task 87.1: BulkExportDialog 本体実装
 *
 * - 「全件」または「選択画像」モード起動を受け、ExportSettingsForm をマウントして設定を確定する
 * - 対象 0 件時はダイアログを閉じて通知する
 * - 「開始」押下時に AbortController を生成し、bulkExportService.execute を起動して
 *   onStart に promise/controller/surveyName を引き継ぐ
 * - AbortController がダイアログ間で共有される（execute へ渡した signal と
 *   onStart に渡す controller が同じインスタンスである）ことが確認できる
 *
 * @see requirements.md - 要件31.1, 31.2, 31.4, 31.5, 31.15
 * @see design.md - BulkExportDialog (5271-5294)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkExportDialog from '../../../components/site-surveys/BulkExportDialog';
import type {
  BulkExportService,
  BulkExportInput,
  BulkExportProgress,
  BulkExportResult,
  SurveyImageMetadata,
} from '../../../services/export/bulkExportService';
import type { SurveyImageInfo } from '../../../types/site-survey.types';

// ============================================================================
// テスト用ヘルパー
// ============================================================================

/**
 * 解決可能な promise を生成するヘルパー
 */
const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeImage = (id: string, fileName: string = `${id}.jpg`): SurveyImageInfo => ({
  id,
  surveyId: 'survey-1',
  fileName,
  originalPath: `images/${fileName}`,
  thumbnailPath: `thumbnails/${fileName}`,
  originalUrl: `https://example.com/${fileName}`,
  thumbnailUrl: `https://example.com/thumb-${fileName}`,
  fileSize: 1024,
  width: 1920,
  height: 1080,
  displayOrder: 1,
  createdAt: new Date().toISOString(),
});

const SUCCESS_RESULT: BulkExportResult = {
  status: 'success',
  zipBlob: new Blob(['zip'], { type: 'application/zip' }),
  zipFileName: 'survey_2026-05-30.zip',
  failures: [],
};

/**
 * `BulkExportService` のスパイ実装
 *
 * `execute` が呼ばれたときに引数（input, onProgress, signal）と
 * 返却する promise を制御可能にする。
 */
const makeServiceSpy = (resultPromise?: Promise<BulkExportResult>) => {
  let capturedInput: BulkExportInput | null = null;
  let capturedOnProgress: ((p: BulkExportProgress) => void) | null = null;
  let capturedSignal: AbortSignal | null = null;
  const executeFn = vi.fn(
    (
      input: BulkExportInput,
      onProgress: (p: BulkExportProgress) => void,
      signal: AbortSignal
    ): Promise<BulkExportResult> => {
      capturedInput = input;
      capturedOnProgress = onProgress;
      capturedSignal = signal;
      return resultPromise ?? Promise.resolve(SUCCESS_RESULT);
    }
  );
  const service: BulkExportService = { execute: executeFn };
  return {
    service,
    executeFn,
    getInput: () => capturedInput,
    getOnProgress: () => capturedOnProgress,
    getSignal: () => capturedSignal,
  };
};

// ============================================================================
// テスト
// ============================================================================

describe('BulkExportDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnStart = vi.fn();
  const mockOnProgress = vi.fn();
  const mockOnEmptyTarget = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 基本レンダリング
  // ==========================================================================

  describe('基本レンダリング', () => {
    it('open=false のときレンダリングされない', () => {
      const { service } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1')];

      render(
        <BulkExportDialog
          open={false}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('mode="all" のとき「全件一括エクスポート」タイトルが表示される', () => {
      const { service } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1'), makeImage('img-2')];

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      expect(screen.getByText(/全件一括エクスポート/)).toBeInTheDocument();
    });

    it('mode="selected" のとき件数付き「N 件選択画像エクスポート」が表示される', () => {
      const { service } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [
        makeImage('img-1'),
        makeImage('img-2'),
        makeImage('img-3'),
      ];

      render(
        <BulkExportDialog
          open={true}
          mode="selected"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      // タイトルに件数 (3) が表示される
      expect(screen.getByText(/3.*件.*選択.*エクスポート/)).toBeInTheDocument();
    });

    it('ExportSettingsForm がマウントされる（形式・解像度・注釈モードの radiogroup）', () => {
      const { service } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1')];

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      // ExportSettingsForm 内の 3 つの radiogroup（形式・解像度・注釈モード）
      const radioGroups = screen.getAllByRole('radiogroup');
      expect(radioGroups.length).toBe(3);
    });
  });

  // ==========================================================================
  // 対象 0 件時のクローズ通知（要件 31.15）
  // ==========================================================================

  describe('対象 0 件', () => {
    it('open=true かつ images=[] のとき onClose が即時呼ばれる', () => {
      const { service, executeFn } = makeServiceSpy();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={[]}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onEmptyTarget={mockOnEmptyTarget}
        />
      );

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      // 通知コールバックが呼ばれる
      expect(mockOnEmptyTarget).toHaveBeenCalledTimes(1);
      // execute は呼ばれない
      expect(executeFn).not.toHaveBeenCalled();
    });

    it('open=false かつ images=[] のときは onClose を呼ばない', () => {
      const { service } = makeServiceSpy();

      render(
        <BulkExportDialog
          open={false}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={[]}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // キャンセル（ダイアログを閉じる）
  // ==========================================================================

  describe('キャンセル', () => {
    it('キャンセルボタンクリックで onClose が呼ばれる', async () => {
      const { service, executeFn } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1')];
      const user = userEvent.setup();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(executeFn).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 開始（要件 31.4, 31.5）
  // ==========================================================================

  describe('開始ボタン', () => {
    it('開始ボタンクリックで bulkExportService.execute が呼ばれる', async () => {
      const { service, executeFn } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1'), makeImage('img-2')];
      const user = userEvent.setup();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      const startButton = screen.getByRole('button', { name: /開始/ });
      await user.click(startButton);

      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it('execute に渡される BulkExportInput が images と surveyId/surveyName を含む', async () => {
      const { service, getInput } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1'), makeImage('img-2')];
      const user = userEvent.setup();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      const startButton = screen.getByRole('button', { name: /開始/ });
      await user.click(startButton);

      const input = getInput();
      expect(input).not.toBeNull();
      expect(input?.surveyId).toBe('survey-1');
      expect(input?.surveyName).toBe('現場A');
      expect(input?.images).toHaveLength(2);
      expect(input?.images.map((i) => i.id)).toEqual(['img-1', 'img-2']);
      // デフォルト設定が含まれる
      expect(input?.settings.format).toBe('jpeg');
      expect(input?.settings.resolution).toBe('medium');
      expect(input?.settings.annotationMode).toBe('include');
    });

    it('onStart に渡される controller の signal が execute に渡された signal と一致する', async () => {
      const { service, getSignal } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1')];
      const user = userEvent.setup();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      const startButton = screen.getByRole('button', { name: /開始/ });
      await user.click(startButton);

      expect(mockOnStart).toHaveBeenCalledTimes(1);
      const arg = mockOnStart.mock.calls[0]?.[0] as {
        promise: Promise<BulkExportResult>;
        controller: AbortController;
        surveyName: string;
      };

      // controller の signal と execute に渡された signal が同一インスタンス
      expect(arg.controller).toBeInstanceOf(AbortController);
      expect(arg.controller.signal).toBe(getSignal());
      // controller.abort() を呼ぶと execute 側の signal も aborted となる
      arg.controller.abort();
      expect(getSignal()?.aborted).toBe(true);
    });

    it('onStart に渡される promise が execute の返却 promise と同じ', async () => {
      const deferred = createDeferred<BulkExportResult>();
      const { service } = makeServiceSpy(deferred.promise);
      const images: SurveyImageMetadata[] = [makeImage('img-1')];
      const user = userEvent.setup();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      const startButton = screen.getByRole('button', { name: /開始/ });
      await user.click(startButton);

      const arg = mockOnStart.mock.calls[0]?.[0] as {
        promise: Promise<BulkExportResult>;
        controller: AbortController;
        surveyName: string;
      };

      // promise を resolve すれば onStart に渡された promise も同じ値で解決する
      deferred.resolve(SUCCESS_RESULT);
      await expect(arg.promise).resolves.toEqual(SUCCESS_RESULT);
    });

    it('開始押下後に onClose が呼ばれて自身は閉じる', async () => {
      const { service } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1')];
      const user = userEvent.setup();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      const startButton = screen.getByRole('button', { name: /開始/ });
      await user.click(startButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('onProgress prop が指定されていると execute の onProgress 経由で呼ばれる', async () => {
      const { service, getOnProgress } = makeServiceSpy();
      const images: SurveyImageMetadata[] = [makeImage('img-1')];
      const user = userEvent.setup();

      render(
        <BulkExportDialog
          open={true}
          mode="all"
          surveyId="survey-1"
          surveyName="現場A"
          images={images}
          service={service}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onProgress={mockOnProgress}
        />
      );

      const startButton = screen.getByRole('button', { name: /開始/ });
      await user.click(startButton);

      // 親から渡した onProgress が execute 経由で呼び出される
      const onProgressCb = getOnProgress();
      expect(onProgressCb).not.toBeNull();
      const progress: BulkExportProgress = { done: 1, total: 1, failedSoFar: 0 };
      onProgressCb?.(progress);

      await waitFor(() => {
        expect(mockOnProgress).toHaveBeenCalledWith(progress);
      });
    });
  });
});
