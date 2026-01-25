/**
 * @fileoverview ClipboardCopyButtonコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.6: ClipboardCopyButtonコンポーネントを実装する
 *
 * Requirements:
 * - 5.1: 「クリップボードにコピー」ボタンをクリックすると見積依頼文全体をクリップボードにコピー
 * - 5.2: コピー成功時に「コピーしました」トースト表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClipboardCopyButton } from './ClipboardCopyButton';

describe('ClipboardCopyButton', () => {
  const mockText = '見積依頼のテスト文章です。';

  beforeEach(() => {
    vi.clearAllMocks();
    // クリップボードAPIをモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('基本レンダリング', () => {
    it('ボタンを表示する', () => {
      render(<ClipboardCopyButton text={mockText} />);

      expect(screen.getByRole('button', { name: /クリップボードにコピー/ })).toBeInTheDocument();
    });

    it('コピーアイコンを表示する', () => {
      render(<ClipboardCopyButton text={mockText} />);

      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
    });
  });

  describe('コピー機能', () => {
    it('ボタンクリックでクリップボードにテキストをコピーする（Requirements: 5.1）', async () => {
      render(<ClipboardCopyButton text={mockText} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText);
      });
    });

    it('コピー成功時にボタンテキストが「コピーしました」に変わる（Requirements: 5.2）', async () => {
      render(<ClipboardCopyButton text={mockText} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/コピーしました/)).toBeInTheDocument();
      });
    });

    it('コピー成功時にチェックアイコンが表示される', async () => {
      render(<ClipboardCopyButton text={mockText} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByTestId('check-icon')).toBeInTheDocument();
      });
    });
  });

  describe('無効状態', () => {
    it('disabled=trueの場合はボタンが無効になる', () => {
      render(<ClipboardCopyButton text={mockText} disabled />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      expect(button).toBeDisabled();
    });

    it('テキストが空の場合はボタンが無効になる', () => {
      render(<ClipboardCopyButton text="" />);

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

      render(<ClipboardCopyButton text={mockText} />);

      const button = screen.getByRole('button', { name: /クリップボードにコピー/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/コピーに失敗しました/)).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('ボタンに適切なaria-labelを持つ', () => {
      render(<ClipboardCopyButton text={mockText} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label');
    });
  });
});
