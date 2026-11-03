/**
 * @fileoverview ClipboardCopyButtonコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.6: ClipboardCopyButtonコンポーネントを実装する
 * Task 107.1: 選択した項目の一覧のコピーを出力の記録の成功の後にだけ書き込む
 *   （Requirement 42.13・42.14。user-authentication の要件40.9〜40.11）
 *
 * Requirements:
 * - 5.1: 「クリップボードにコピー」ボタンをクリックすると見積依頼文全体をクリップボードにコピー
 * - 5.2: コピー成功時に「コピーしました」トースト表示
 *
 * 記録の要求（`POST /api/v1/audit-logs/exports`）は API クライアントの `post` を差し替えて模擬し、
 * 書き込みは上流の `runRecordedClipboardWrite` の実物が行う（jsdom には `ClipboardItem` が無いため、
 * 包みは記録の成功を待ってから `writeText` で書く）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ClipboardCopyButton } from './ClipboardCopyButton';
import { apiClient } from '../../api/client';
import type { ExportRecordInput } from '../../api/export-audit';

/** 記録の失敗の文言（Requirement 42.14） */
const RECORD_FAILED_EXACT = /^出力を記録できなかったため中止しました$/;

/** 選択した項目の一覧のコピーの記録の入力 */
const exportRecord: ExportRecordInput = {
  kind: 'estimate_request_items_clipboard',
  projectId: 'project-1',
  targetIds: ['eri-1', 'eri-2'],
  itemCount: 2,
};

/** 解決を外から決める記録の要求 */
function holdRecord() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const pending = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { pending, resolve, reject };
}

describe('ClipboardCopyButton', () => {
  const mockText = '見積依頼のテスト文章です。';
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // クリップボードAPIをモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    // 出力の記録の要求は成功（記録の ID を返す）を既定とする
    postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ recordId: 'record-1' });
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  describe('基本レンダリング', () => {
    it('ボタンを表示する', () => {
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      expect(screen.getByRole('button', { name: /クリップボードにコピー/ })).toBeInTheDocument();
    });

    it('コピーアイコンを表示する', () => {
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
    });
  });

  describe('コピー機能', () => {
    it('ボタンクリックでクリップボードにテキストをコピーする（Requirements: 5.1）', async () => {
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText);
      });
    });

    it('コピー成功時にボタンテキストが「コピーしました」に変わる（Requirements: 5.2）', async () => {
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/コピーしました/)).toBeInTheDocument();
      });
    });

    it('コピー成功時にチェックアイコンが表示される', async () => {
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('check-icon')).toBeInTheDocument();
      });
    });
  });

  describe('無効状態', () => {
    it('disabled=trueの場合はボタンが無効になる', () => {
      render(<ClipboardCopyButton text={mockText} disabled exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      expect(button).toBeDisabled();
    });

    it('テキストが空の場合はボタンが無効になる', () => {
      render(<ClipboardCopyButton text="" exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      expect(button).toBeDisabled();
    });
  });

  describe('エラーハンドリング', () => {
    it('コピー失敗時にエラーメッセージを表示する', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
        },
      });

      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/コピーに失敗しました/)).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('ボタンに適切なaria-labelを持つ', () => {
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label');
    });
  });

  // ==========================================================================
  // Task 107.1: 出力の記録の成功の後にだけ書き込む（Requirement 42.13・42.14）
  // ==========================================================================
  describe('出力の記録（Task 107.1, Requirement 42.13, 42.14）', () => {
    it('記録の入力（種別・案件・選択した項目の ID・件数）で記録を 1 回だけ要求する（Requirement 42.13）', async () => {
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      fireEvent.click(screen.getByRole('button', { name: /クリップボードにコピー/ }));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText);
      });
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/audit-logs/exports',
        {
          kind: 'estimate_request_items_clipboard',
          projectId: 'project-1',
          targetIds: ['eri-1', 'eri-2'],
          itemCount: 2,
        },
        { disableRetry: true }
      );
    });

    it('クリックの処理の中で await を挟まずに記録を要求する（Safari の操作の猶予）（Requirement 42.13）', () => {
      postSpy.mockReturnValue(new Promise(() => {}));
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /クリップボードにコピー/ }));
        // クリックのイベントの配送が同期で戻った時点で、記録の要求が既に送られている
        expect(postSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('記録の応答より前にクリップボードへ書かず、成功の後に中身を書く（Requirement 42.13）', async () => {
      const record = holdRecord();
      postSpy.mockReturnValue(record.pending);
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /クリップボードにコピー/ }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText);
      });
      expect(await screen.findByText(/コピーしました/)).toBeInTheDocument();
    });

    it('記録の要求中はボタンを止め、押し直しても記録は 1 回だけ（Requirement 42.13）', async () => {
      const record = holdRecord();
      postSpy.mockReturnValue(record.pending);
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      act(() => {
        fireEvent.click(button);
      });
      expect(button).toBeDisabled();
      act(() => {
        fireEvent.click(button);
      });
      expect(postSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      await waitFor(() => {
        expect(button).toBeEnabled();
      });
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    it('記録の失敗ではクリップボードへ何も書かず、記録の失敗の文言を表示する（Requirement 42.14）', async () => {
      postSpy.mockRejectedValue(new Error('500'));
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      // 記録の失敗はコピーの成功・書き込みの失敗の表示にしない
      expect(screen.queryByText(/コピーしました/)).not.toBeInTheDocument();
      expect(screen.queryByText(/コピーに失敗しました/)).not.toBeInTheDocument();
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(button).toBeEnabled();
    });

    it('記録の失敗の後のコピーの成功で記録の失敗の文言を消す（Requirement 42.14）', async () => {
      postSpy.mockRejectedValueOnce(new Error('500'));
      render(<ClipboardCopyButton text={mockText} exportRecord={exportRecord} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);

      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText);
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
