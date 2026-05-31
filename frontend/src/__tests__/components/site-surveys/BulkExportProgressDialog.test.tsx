/**
 * BulkExportProgressDialog コンポーネントのテスト
 *
 * Task 85: BulkExportProgressDialog 実装
 * - 進捗 callback の購読 → 件数/割合の表示
 * - キャンセルボタン押下で `controller.abort()` を呼ぶ
 * - 部分失敗発生時にサブダイアログで `'download-partial' | 'cancel'` を取得
 * - 選択結果を onComplete に伝搬する
 *
 * @see requirements.md - 要件31.10, 31.11, 31.13, 31.14
 * @see design.md - BulkExportProgressDialog (5296-5320)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkExportProgressDialog from '../../../components/site-surveys/BulkExportProgressDialog';
import type {
  BulkExportProgress,
  BulkExportResult,
} from '../../../services/export/bulkExportService';

// ============================================================================
// テスト用ヘルパー
// ============================================================================

/**
 * 解決可能な promise を生成するヘルパー
 *
 * テスト中に promise を任意のタイミングで resolve できるよう、
 * resolve 関数を外部から呼べる形に分解する。
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

const makeProgress = (done: number, total: number, failedSoFar = 0): BulkExportProgress => ({
  done,
  total,
  failedSoFar,
});

const SUCCESS_RESULT: BulkExportResult = {
  status: 'success',
  zipBlob: new Blob(['zip'], { type: 'application/zip' }),
  zipFileName: 'survey_2026-05-30.zip',
  failures: [],
};

const PARTIAL_RESULT: BulkExportResult = {
  status: 'partial',
  zipBlob: new Blob(['zip'], { type: 'application/zip' }),
  zipFileName: 'survey_2026-05-30.zip',
  failures: [
    {
      imageId: 'img-3',
      imageName: 'broken.jpg',
      reason: 'render',
      message: 'render failed',
    },
  ],
};

const CANCELLED_RESULT: BulkExportResult = {
  status: 'cancelled',
  failures: [],
};

describe('BulkExportProgressDialog', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 基本レンダリング
  // ==========================================================================

  describe('基本レンダリング', () => {
    it('open=false のときレンダリングされない', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={false}
          surveyName="現場A"
          progress={null}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('open=true のときダイアログが表示される', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={null}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('現場名がタイトル付近に表示される', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場ABC"
          progress={null}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/現場ABC/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 進捗表示 (要件 31.10)
  // ==========================================================================

  describe('進捗表示', () => {
    it('progress が null のとき準備中表示になる', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={null}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/準備中/)).toBeInTheDocument();
    });

    it('progress を渡すと done/total と割合が表示される', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(3, 10)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      // 「3/10」と「30%」のいずれも表示される
      expect(screen.getByText(/3\s*\/\s*10/)).toBeInTheDocument();
      expect(screen.getByText(/30\s*%/)).toBeInTheDocument();
    });

    it('progress が更新されると新しい件数が反映される', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      const { rerender } = render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(1, 5)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/1\s*\/\s*5/)).toBeInTheDocument();

      rerender(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(4, 5)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/4\s*\/\s*5/)).toBeInTheDocument();
      expect(screen.getByText(/80\s*%/)).toBeInTheDocument();
    });

    it('failedSoFar > 0 のとき失敗件数が表示される', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(5, 10, 2)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/失敗\s*2\s*件/)).toBeInTheDocument();
    });

    it('total=0 のとき 0% を表示する（NaN 防止）', () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(0, 0)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/0\s*%/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // キャンセル (要件 31.11)
  // ==========================================================================

  describe('キャンセル', () => {
    it('キャンセルボタンクリックで controller.abort() が呼ばれる', async () => {
      const { promise } = createDeferred<BulkExportResult>();
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');
      const user = userEvent.setup();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(2, 10)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      await user.click(cancelButton);

      expect(abortSpy).toHaveBeenCalledTimes(1);
    });

    it('promise が status=cancelled で解決されると onComplete(result) を呼ぶ', async () => {
      const { promise, resolve } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(3, 10)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      resolve(CANCELLED_RESULT);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith(CANCELLED_RESULT);
      });
    });
  });

  // ==========================================================================
  // 全件成功
  // ==========================================================================

  describe('全件成功', () => {
    it('status=success で onComplete(result) が呼ばれる（decision なし）', async () => {
      const { promise, resolve } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(10, 10)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      resolve(SUCCESS_RESULT);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith(SUCCESS_RESULT);
      });
      // 第二引数（decision）は渡されない
      const call = mockOnComplete.mock.calls[0];
      expect(call?.length).toBe(1);
    });
  });

  // ==========================================================================
  // 部分失敗（サブダイアログ）（要件 31.13, 31.14）
  // ==========================================================================

  describe('部分失敗サブダイアログ', () => {
    it('status=partial の解決時にサブダイアログが表示される', async () => {
      const { promise, resolve } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(10, 10, 1)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      resolve(PARTIAL_RESULT);

      await waitFor(() => {
        // サブダイアログのアラート要素（alertdialog）が表示される
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      // 失敗件数および成功件数の案内が含まれる
      expect(screen.getByText(/1\s*件\s*失敗/)).toBeInTheDocument();
      expect(screen.getByText(/9\s*件/)).toBeInTheDocument();
    });

    it('サブダイアログ表示中は onComplete をまだ呼ばない', async () => {
      const { promise, resolve } = createDeferred<BulkExportResult>();
      const controller = new AbortController();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(10, 10, 1)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      resolve(PARTIAL_RESULT);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      expect(mockOnComplete).not.toHaveBeenCalled();
    });

    it('「ダウンロード」を選ぶと onComplete(result, "download-partial") を呼ぶ', async () => {
      const { promise, resolve } = createDeferred<BulkExportResult>();
      const controller = new AbortController();
      const user = userEvent.setup();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(10, 10, 1)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      resolve(PARTIAL_RESULT);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /ダウンロード/ });
      await user.click(downloadButton);

      expect(mockOnComplete).toHaveBeenCalledWith(PARTIAL_RESULT, 'download-partial');
    });

    it('「中止」を選ぶと onComplete(result, "cancel") を呼ぶ', async () => {
      const { promise, resolve } = createDeferred<BulkExportResult>();
      const controller = new AbortController();
      const user = userEvent.setup();

      render(
        <BulkExportProgressDialog
          open={true}
          surveyName="現場A"
          progress={makeProgress(10, 10, 1)}
          promise={promise}
          controller={controller}
          onComplete={mockOnComplete}
        />
      );

      resolve(PARTIAL_RESULT);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /中止/ });
      await user.click(cancelButton);

      expect(mockOnComplete).toHaveBeenCalledWith(PARTIAL_RESULT, 'cancel');
    });
  });
});
