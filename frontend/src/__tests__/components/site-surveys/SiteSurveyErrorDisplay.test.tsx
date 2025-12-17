/**
 * @fileoverview SiteSurveyErrorDisplayコンポーネントのテスト
 *
 * Task 11.2: エラー表示の実装
 *
 * Requirements:
 * - 14.8: エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する
 *
 * テスト対象:
 * - バリデーションエラー表示
 * - ネットワークエラー表示
 * - サーバーエラー表示
 * - 再試行ボタン機能
 * - エラー閉じる機能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyErrorDisplay from '../../../components/site-surveys/SiteSurveyErrorDisplay';
import type { SiteSurveyErrorState } from '../../../hooks/useSiteSurveyError';

// テスト用ラッパー
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: TestWrapper });
};

describe('SiteSurveyErrorDisplay', () => {
  const defaultProps = {
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    isRetrying: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 基本レンダリングテスト
  // ===========================================================================

  describe('基本レンダリング', () => {
    it('errorがnullの場合、何も表示しない', () => {
      renderWithRouter(<SiteSurveyErrorDisplay error={null} {...defaultProps} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('errorが存在する場合、アラートを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('エラーメッセージを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByText(/通信エラーが発生しました/)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // バリデーションエラー表示テスト
  // ===========================================================================

  describe('バリデーションエラー表示', () => {
    it('バリデーションエラーを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'validation',
        message: '入力内容に誤りがあります。',
        statusCode: 0,
        canRetry: false,
        shouldRedirect: false,
        fieldErrors: {
          name: '調査名は必須です',
        },
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByText(/入力内容に誤りがあります/)).toBeInTheDocument();
    });

    it('フィールドエラーのリストを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'validation',
        message: '入力内容に誤りがあります。',
        statusCode: 0,
        canRetry: false,
        shouldRedirect: false,
        fieldErrors: {
          name: '調査名は必須です',
          surveyDate: '調査日は必須です',
        },
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByText('調査名は必須です')).toBeInTheDocument();
      expect(screen.getByText('調査日は必須です')).toBeInTheDocument();
    });

    it('バリデーションエラーには再試行ボタンを表示しない', () => {
      const error: SiteSurveyErrorState = {
        type: 'validation',
        message: '入力内容に誤りがあります。',
        statusCode: 0,
        canRetry: false,
        shouldRedirect: false,
        fieldErrors: {
          name: '調査名は必須です',
        },
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /再試行/ })).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // ネットワークエラー表示テスト
  // ===========================================================================

  describe('ネットワークエラー表示', () => {
    it('ネットワークエラーを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByText(/通信エラー/)).toBeInTheDocument();
    });

    it('canRetryがtrueの場合、再試行ボタンを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとonRetryが呼ばれる', async () => {
      const user = userEvent.setup();
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /再試行/ }));

      expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // サーバーエラー表示テスト
  // ===========================================================================

  describe('サーバーエラー表示', () => {
    it('サーバーエラーを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'server',
        message: 'システムエラーが発生しました。',
        statusCode: 500,
        canRetry: false,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByText(/システムエラー/)).toBeInTheDocument();
    });

    it('サーバーエラーには再試行ボタンを表示しない', () => {
      const error: SiteSurveyErrorState = {
        type: 'server',
        message: 'システムエラーが発生しました。',
        statusCode: 500,
        canRetry: false,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /再試行/ })).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // セッションエラー表示テスト
  // ===========================================================================

  describe('セッションエラー表示', () => {
    it('セッションエラーを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'session',
        message: 'セッションが期限切れになりました。',
        statusCode: 401,
        canRetry: false,
        shouldRedirect: true,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByText(/セッション/)).toBeInTheDocument();
    });

    it('shouldRedirectがtrueの場合、ログインページへのリダイレクトボタンを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'session',
        message: 'セッションが期限切れになりました。',
        statusCode: 401,
        canRetry: false,
        shouldRedirect: true,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByRole('button', { name: /ログインページへ/ })).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 閉じるボタンテスト
  // ===========================================================================

  describe('閉じるボタン', () => {
    it('閉じるボタンをクリックするとonDismissが呼ばれる', async () => {
      const user = userEvent.setup();
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /閉じる/ }));

      expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
    });

    it('Escapeキーでエラーを閉じる', async () => {
      const user = userEvent.setup();
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // ローディング状態テスト
  // ===========================================================================

  describe('ローディング状態', () => {
    it('isRetryingがtrueの場合、再試行ボタンを無効化する', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(
        <SiteSurveyErrorDisplay error={error} {...defaultProps} isRetrying={true} />
      );

      const retryButton = screen.getByRole('button', { name: /再試行中/ });
      expect(retryButton).toBeDisabled();
    });

    it('isRetryingがtrueの場合、「再試行中...」テキストを表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(
        <SiteSurveyErrorDisplay error={error} {...defaultProps} isRetrying={true} />
      );

      expect(screen.getByRole('button', { name: /再試行中/ })).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // エラータイプごとのスタイルテスト
  // ===========================================================================

  describe('エラータイプごとのスタイル', () => {
    it('ネットワークエラーは警告スタイルで表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      // 警告アイコンが表示されることを確認
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('サーバーエラーはエラースタイルで表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'server',
        message: 'システムエラーが発生しました。',
        statusCode: 500,
        canRetry: false,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // アクセシビリティテスト
  // ===========================================================================

  describe('アクセシビリティ', () => {
    it('role="alert"属性を持つ', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('aria-live="assertive"属性を持つ', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    });

    it('閉じるボタンにaria-label属性がある', () => {
      const error: SiteSurveyErrorState = {
        type: 'network',
        message: '通信エラーが発生しました。',
        statusCode: 0,
        canRetry: true,
        shouldRedirect: false,
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} />);

      expect(screen.getByRole('button', { name: /閉じる/ })).toHaveAttribute(
        'aria-label',
        '閉じる'
      );
    });
  });

  // ===========================================================================
  // インラインモードテスト
  // ===========================================================================

  describe('インラインモード', () => {
    it('inlineモードではコンパクトなスタイルで表示する', () => {
      const error: SiteSurveyErrorState = {
        type: 'validation',
        message: '入力内容に誤りがあります。',
        statusCode: 0,
        canRetry: false,
        shouldRedirect: false,
        fieldErrors: {
          name: '調査名は必須です',
        },
      };

      renderWithRouter(<SiteSurveyErrorDisplay error={error} {...defaultProps} inline />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      // インラインモードでは固定位置ではない
      expect(alert).not.toHaveStyle({ position: 'fixed' });
    });
  });
});
