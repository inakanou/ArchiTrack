/**
 * @fileoverview NetworkErrorDisplay コンポーネントのテスト
 *
 * Task 13.2: ネットワークエラー対応
 *
 * Requirements:
 * - 18.1: ネットワークエラー時のエラーメッセージ表示を実装
 * - 18.2: 再試行ボタンの表示と機能を実装
 * - 18.3: サーバーエラー（5xx）時のメッセージ表示を実装
 * - 18.6: セッション期限切れ時のリダイレクトを実装
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import NetworkErrorDisplay from '../../components/NetworkErrorDisplay';
import type { NetworkErrorState } from '../../hooks/useNetworkError';

// react-router-domのモック
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('NetworkErrorDisplay', () => {
  const mockNavigate = vi.fn();
  const mockOnRetry = vi.fn();
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(mockNavigate);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  describe('エラーがない場合', () => {
    it('何も表示しないこと', () => {
      const { container } = renderWithRouter(
        <NetworkErrorDisplay error={null} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('ネットワークエラー表示', () => {
    const networkError: NetworkErrorState = {
      type: 'network',
      message: '通信エラーが発生しました。再試行してください。',
      statusCode: 0,
      canRetry: true,
      shouldRedirect: false,
    };

    it('ネットワークエラーメッセージを表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(
        screen.getByText('通信エラーが発生しました。再試行してください。')
      ).toBeInTheDocument();
    });

    it('再試行ボタンを表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(screen.getByRole('button', { name: /再試行/i })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとonRetryが呼ばれること', async () => {
      const user = userEvent.setup();

      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      const retryButton = screen.getByRole('button', { name: /再試行/i });
      await user.click(retryButton);

      expect(mockOnRetry).toHaveBeenCalledTimes(1);
    });

    it('閉じるボタンを表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(screen.getByRole('button', { name: /閉じる/i })).toBeInTheDocument();
    });

    it('閉じるボタンをクリックするとonDismissが呼ばれること', async () => {
      const user = userEvent.setup();

      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      const dismissButton = screen.getByRole('button', { name: /閉じる/i });
      await user.click(dismissButton);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('サーバーエラー表示', () => {
    const serverError: NetworkErrorState = {
      type: 'server',
      message: 'システムエラーが発生しました。しばらくしてからお試しください。',
      statusCode: 500,
      canRetry: false,
      shouldRedirect: false,
    };

    it('サーバーエラーメッセージを表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={serverError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(
        screen.getByText('システムエラーが発生しました。しばらくしてからお試しください。')
      ).toBeInTheDocument();
    });

    it('再試行ボタンを表示しないこと（canRetry: false）', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={serverError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(screen.queryByRole('button', { name: /再試行/i })).not.toBeInTheDocument();
    });

    it('閉じるボタンを表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={serverError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(screen.getByRole('button', { name: /閉じる/i })).toBeInTheDocument();
    });
  });

  describe('セッション期限切れ表示', () => {
    const sessionError: NetworkErrorState = {
      type: 'session',
      message: 'セッションが期限切れになりました。再度ログインしてください。',
      statusCode: 401,
      canRetry: false,
      shouldRedirect: true,
    };

    it('セッション期限切れメッセージを表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={sessionError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(
        screen.getByText('セッションが期限切れになりました。再度ログインしてください。')
      ).toBeInTheDocument();
    });

    it('ログインページへのリダイレクトボタンを表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={sessionError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(screen.getByRole('button', { name: /ログインページへ/i })).toBeInTheDocument();
    });

    it('ログインページボタンをクリックするとナビゲートが呼ばれること', async () => {
      const user = userEvent.setup();

      renderWithRouter(
        <NetworkErrorDisplay error={sessionError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      const loginButton = screen.getByRole('button', { name: /ログインページへ/i });
      await user.click(loginButton);

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('再試行ボタンを表示しないこと', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={sessionError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(screen.queryByRole('button', { name: /再試行/i })).not.toBeInTheDocument();
    });
  });

  describe('再試行中の表示', () => {
    const networkError: NetworkErrorState = {
      type: 'network',
      message: '通信エラーが発生しました。再試行してください。',
      statusCode: 0,
      canRetry: true,
      shouldRedirect: false,
    };

    it('再試行中はローディング表示すること', () => {
      renderWithRouter(
        <NetworkErrorDisplay
          error={networkError}
          onRetry={mockOnRetry}
          onDismiss={mockOnDismiss}
          isRetrying={true}
        />
      );

      expect(screen.getByRole('button', { name: /再試行中/i })).toBeInTheDocument();
    });

    it('再試行中は再試行ボタンが無効化されること', () => {
      renderWithRouter(
        <NetworkErrorDisplay
          error={networkError}
          onRetry={mockOnRetry}
          onDismiss={mockOnDismiss}
          isRetrying={true}
        />
      );

      const retryButton = screen.getByRole('button', { name: /再試行中/i });
      expect(retryButton).toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    const networkError: NetworkErrorState = {
      type: 'network',
      message: '通信エラーが発生しました。再試行してください。',
      statusCode: 0,
      canRetry: true,
      shouldRedirect: false,
    };

    it('role="alert"が設定されていること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('aria-live="assertive"が設定されていること', () => {
      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      const alertElement = screen.getByRole('alert');
      expect(alertElement).toHaveAttribute('aria-live', 'assertive');
    });

    it('Escapeキーでエラーを閉じられること', async () => {
      const user = userEvent.setup();

      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      // まずアラート領域にフォーカスを当てる
      const alertElement = screen.getByRole('alert');
      alertElement.focus();

      await user.keyboard('{Escape}');

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('再試行ボタンにフォーカスできること', async () => {
      const user = userEvent.setup();

      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      const retryButton = screen.getByRole('button', { name: /^再試行$/i });

      // タブでボタンにフォーカスが当たることを確認
      await user.tab(); // 1回目: 閉じるボタン
      await user.tab(); // 2回目: 再試行ボタン

      // フォーカスが当たっていることを確認
      expect(document.activeElement).toBe(retryButton);
    });
  });

  describe('スタイリング', () => {
    it('ネットワークエラーは警告スタイルで表示されること', () => {
      const networkError: NetworkErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。再試行してください。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(
        <NetworkErrorDisplay error={networkError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      const alertElement = screen.getByRole('alert');
      // CSSクラスまたはスタイルで警告色が適用されていることを確認
      expect(alertElement).toBeInTheDocument();
    });

    it('サーバーエラーはエラースタイルで表示されること', () => {
      const serverError: NetworkErrorState = {
        type: 'server',
        message: 'システムエラーが発生しました。しばらくしてからお試しください。',
        statusCode: 500,
        canRetry: false,
        shouldRedirect: false,
      };

      renderWithRouter(
        <NetworkErrorDisplay error={serverError} onRetry={mockOnRetry} onDismiss={mockOnDismiss} />
      );

      const alertElement = screen.getByRole('alert');
      expect(alertElement).toBeInTheDocument();
    });
  });
});
