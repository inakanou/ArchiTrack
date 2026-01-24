/**
 * @fileoverview StatusTransitionButtonコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 15.2: StatusTransitionButtonコンポーネントを実装する
 *
 * Requirements:
 * - 12.5: 「依頼前」ステータスのとき「依頼済にする」ボタンを表示
 * - 12.6: 「依頼済」ステータスのとき「見積受領済にする」ボタンを表示
 * - 12.7: 「依頼前」へ戻すボタンは表示しない
 * - 12.8: 「見積受領済」ステータスのとき「依頼済に戻す」ボタンを表示
 * - 12.9: ステータス遷移ボタンをクリックするとステータスを変更
 * - 12.10: ステータス変更完了後にトースト通知を表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusTransitionButton } from './StatusTransitionButton';

// モック設定
const mockOnTransition = vi.fn();
const mockOnSuccess = vi.fn();

describe('StatusTransitionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnTransition.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('依頼前ステータスの場合（Requirements: 12.5）', () => {
    it('「依頼済にする」ボタンを表示する', () => {
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      // ボタンテキストで検索
      expect(screen.getByText('依頼済にする')).toBeInTheDocument();
    });

    it('「依頼済にする」ボタンのみを表示する（戻すボタンなし）', () => {
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.queryByText(/戻す/)).not.toBeInTheDocument();
    });

    it('「依頼済にする」ボタンにブルー系のスタイルを適用する', () => {
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      expect(button).toHaveClass('bg-blue-600');
    });
  });

  describe('依頼済ステータスの場合（Requirements: 12.6, 12.7）', () => {
    it('「見積受領済にする」ボタンを表示する', () => {
      render(
        <StatusTransitionButton
          status="REQUESTED"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByText('見積受領済にする')).toBeInTheDocument();
    });

    it('「依頼前に戻す」ボタンは表示しない（Requirements: 12.7）', () => {
      render(
        <StatusTransitionButton
          status="REQUESTED"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.queryByText(/依頼前に戻す/)).not.toBeInTheDocument();
    });

    it('「見積受領済にする」ボタンにグリーン系のスタイルを適用する', () => {
      render(
        <StatusTransitionButton
          status="REQUESTED"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('見積受領済にする').closest('button');
      expect(button).toHaveClass('bg-green-600');
    });
  });

  describe('見積受領済ステータスの場合（Requirements: 12.8）', () => {
    it('「依頼済に戻す」ボタンを表示する', () => {
      render(
        <StatusTransitionButton
          status="QUOTATION_RECEIVED"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByText('依頼済に戻す')).toBeInTheDocument();
    });

    it('「依頼済に戻す」ボタンにオレンジ系のスタイルを適用する', () => {
      render(
        <StatusTransitionButton
          status="QUOTATION_RECEIVED"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済に戻す').closest('button');
      expect(button).toHaveClass('bg-orange-600');
    });
  });

  describe('ステータス遷移実行（Requirements: 12.9）', () => {
    it('「依頼済にする」ボタンクリックでonTransitionを呼び出す', async () => {
      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      await user.click(button!);

      expect(mockOnTransition).toHaveBeenCalledWith('REQUESTED');
    });

    it('「見積受領済にする」ボタンクリックでonTransitionを呼び出す', async () => {
      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="REQUESTED"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('見積受領済にする').closest('button');
      await user.click(button!);

      expect(mockOnTransition).toHaveBeenCalledWith('QUOTATION_RECEIVED');
    });

    it('「依頼済に戻す」ボタンクリックでonTransitionを呼び出す', async () => {
      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="QUOTATION_RECEIVED"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済に戻す').closest('button');
      await user.click(button!);

      expect(mockOnTransition).toHaveBeenCalledWith('REQUESTED');
    });

    it('ステータス遷移成功時にonSuccessを呼び出す（Requirements: 12.10）', async () => {
      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      await user.click(button!);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith(expect.stringContaining('ステータスを'));
      });
    });
  });

  describe('ローディング状態', () => {
    it('isLoading=trueの場合はボタンを無効化する', () => {
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
          isLoading={true}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      expect(button).toBeDisabled();
    });

    it('API呼び出し中はローディングスピナーを表示する', async () => {
      let resolveTransition: () => void = () => {};
      mockOnTransition.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveTransition = resolve;
          })
      );

      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      await user.click(button!);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      // クリーンアップ
      resolveTransition();
    });

    it('API呼び出し中はボタンを無効化する', async () => {
      let resolveTransition: () => void = () => {};
      mockOnTransition.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveTransition = resolve;
          })
      );

      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      await user.click(button!);

      expect(button).toBeDisabled();

      // クリーンアップ
      resolveTransition();
    });
  });

  describe('エラーハンドリング', () => {
    it('API呼び出しエラー時にonErrorを呼び出す', async () => {
      const mockOnError = vi.fn();
      mockOnTransition.mockRejectedValue(new Error('API Error'));

      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
          onError={mockOnError}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      await user.click(button!);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('ステータスの変更に失敗しました');
      });
    });

    it('エラー時でもボタンは再度クリック可能になる', async () => {
      mockOnTransition.mockRejectedValue(new Error('API Error'));

      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      await user.click(button!);

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('ボタンにaria-label属性を持つ', () => {
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      expect(button).toHaveAttribute('aria-label');
    });

    it('ローディング中はaria-busy=trueを設定する', async () => {
      let resolveTransition: () => void = () => {};
      mockOnTransition.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveTransition = resolve;
          })
      );

      const user = userEvent.setup();
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      await user.click(button!);

      expect(button).toHaveAttribute('aria-busy', 'true');

      // クリーンアップ
      resolveTransition();
    });
  });

  describe('disabled状態', () => {
    it('disabled=trueの場合はすべてのボタンを無効化する', () => {
      render(
        <StatusTransitionButton
          status="BEFORE_REQUEST"
          onTransition={mockOnTransition}
          onSuccess={mockOnSuccess}
          disabled={true}
        />
      );

      const button = screen.getByText('依頼済にする').closest('button');
      expect(button).toBeDisabled();
    });
  });
});
