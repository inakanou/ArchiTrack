import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionExpiredModal } from '../../components/SessionExpiredModal';

// loggerをモック
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

// apiClientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    statusCode: number;
    response?: unknown;
    constructor(statusCode: number, message: string, response?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.response = response;
    }
  },
}));

import { apiClient } from '../../api/client';

const mockApiClientPost = vi.mocked(apiClient.post);

describe('SessionExpiredModal', () => {
  const defaultProps = {
    isOpen: true,
    userEmail: 'test@example.com',
    onReauthSuccess: vi.fn(),
    onNavigateToLogin: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 要件30.2: isOpen=falseの場合モーダルが表示されない
   */
  describe('表示/非表示', () => {
    it('isOpen=falseの場合モーダルが表示されないこと', () => {
      render(<SessionExpiredModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('isOpen=trueの場合モーダルが表示されること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('セッションの有効期限が切れました')).toBeInTheDocument();
    });
  });

  /**
   * 要件30.4: メールアドレス自動入力
   */
  describe('フォーム構成', () => {
    it('メールアドレスが自動入力されていること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const emailInput = screen.getByDisplayValue('test@example.com');
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('readOnly');
    });

    it('パスワード入力フィールドが存在すること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });

    it('再ログインボタンが存在すること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: '再ログイン' })).toBeInTheDocument();
    });
  });

  /**
   * 要件30.8, 30.9: 再認証成功フロー
   */
  describe('再認証フロー', () => {
    it('パスワード入力→再ログインボタンクリック→成功時にコールバックが呼ばれること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockResolvedValueOnce({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        user: { id: '1', email: 'test@example.com', displayName: 'Test' },
      });

      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      await user.type(passwordInput, 'correct-password');

      const loginButton = screen.getByRole('button', { name: '再ログイン' });
      await user.click(loginButton);

      await waitFor(() => {
        expect(defaultProps.onReauthSuccess).toHaveBeenCalledTimes(1);
      });
    });

    /**
     * 要件30.11: 認証失敗時のエラーメッセージ表示
     */
    it('認証失敗時にエラーメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockRejectedValueOnce(
        new Error('メールアドレスまたはパスワードが正しくありません')
      );

      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      await user.type(passwordInput, 'wrong-password');

      const loginButton = screen.getByRole('button', { name: '再ログイン' });
      await user.click(loginButton);

      await waitFor(() => {
        expect(
          screen.getByText('メールアドレスまたはパスワードが正しくありません')
        ).toBeInTheDocument();
      });
    });

    /**
     * 要件30.16: 3回連続失敗後に「ログイン画面へ移動」ボタン表示
     */
    it('3回連続失敗後に「ログイン画面へ移動」ボタンが表示されること', async () => {
      const user = userEvent.setup();
      mockApiClientPost
        .mockRejectedValueOnce(new Error('認証失敗'))
        .mockRejectedValueOnce(new Error('認証失敗'))
        .mockRejectedValueOnce(new Error('認証失敗'));

      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      const loginButton = screen.getByRole('button', { name: '再ログイン' });

      // 1回目の失敗
      await user.type(passwordInput, 'wrong1');
      await user.click(loginButton);
      await waitFor(() => {
        expect(screen.getByText('認証失敗')).toBeInTheDocument();
      });

      // 2回目の失敗
      await user.clear(passwordInput);
      await user.type(passwordInput, 'wrong2');
      await user.click(loginButton);

      // 3回目の失敗
      await user.clear(passwordInput);
      await user.type(passwordInput, 'wrong3');
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ログイン画面へ移動' })).toBeInTheDocument();
      });
    });

    /**
     * 要件30.17: ネットワークエラー時のメッセージとリトライボタン
     */
    it('ネットワークエラー時にメッセージとリトライボタンが表示されること', async () => {
      const user = userEvent.setup();
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      // ApiErrorのstatusCode=0はネットワークエラー
      const apiError = Object.assign(networkError, { statusCode: 0 });
      mockApiClientPost.mockRejectedValueOnce(apiError);

      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      await user.type(passwordInput, 'password');

      const loginButton = screen.getByRole('button', { name: '再ログイン' });
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText('ネットワーク接続を確認してください')).toBeInTheDocument();
      });
    });
  });

  /**
   * 要件30.12: 2FA対応
   */
  describe('2FA対応', () => {
    it('2FA要求時にTOTPフィールドが表示されること', async () => {
      const user = userEvent.setup();
      // ログインレスポンスでrequires2FAを返す
      mockApiClientPost.mockResolvedValueOnce({
        requires2FA: true,
      });

      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      await user.type(passwordInput, 'correct-password');

      const loginButton = screen.getByRole('button', { name: '再ログイン' });
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
      });
    });
  });

  /**
   * 要件30.6, 30.18, 30.19, 30.20: アクセシビリティ
   */
  describe('アクセシビリティ', () => {
    it('Escキーでモーダルが閉じないこと', async () => {
      const user = userEvent.setup();
      render(<SessionExpiredModal {...defaultProps} />);

      await user.keyboard('{Escape}');

      // モーダルは閉じない
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('aria属性が正しく設定されていること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'session-expired-title');
    });

    it('aria-live="assertive"でセッション切れメッセージが通知されること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const liveRegion = screen.getByText('セッションの有効期限が切れました');
      const container = liveRegion.closest('[aria-live]');
      expect(container).toHaveAttribute('aria-live', 'assertive');
    });

    /**
     * 要件30.18: フォーカストラップ（Tab/Shift+Tab循環）
     */
    it('フォーカストラップが機能すること（フォーカス可能な要素が存在すること）', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      // フォーカス可能な要素が存在すること（パスワード入力、再ログインボタン）
      const focusableElements = dialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      expect(focusableElements.length).toBeGreaterThanOrEqual(2);
    });

    it('最後の要素でTabを押すと最初の要素にフォーカスが戻ること', async () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      expect(focusableElements.length).toBeGreaterThanOrEqual(2);

      const lastElement = focusableElements[focusableElements.length - 1]!;
      lastElement.focus();
      expect(document.activeElement).toBe(lastElement);

      // Tab keydown event をdispatch (capture phase)
      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(tabEvent);

      // 最初の要素にフォーカスが移ることを確認
      expect(document.activeElement).toBe(focusableElements[0]);
    });

    it('最初の要素でShift+Tabを押すと最後の要素にフォーカスが戻ること', async () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      expect(focusableElements.length).toBeGreaterThanOrEqual(2);

      const firstElement = focusableElements[0]!;
      firstElement.focus();
      expect(document.activeElement).toBe(firstElement);

      // Shift+Tab keydown event をdispatch (capture phase)
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(shiftTabEvent);

      // 最後の要素にフォーカスが移ることを確認
      const lastElement = focusableElements[focusableElements.length - 1]!;
      expect(document.activeElement).toBe(lastElement);
    });
  });

  /**
   * 要件30.21: レスポンシブ対応
   */
  describe('レスポンシブ対応', () => {
    it('モーダルカードにレスポンシブクラスが適用されていること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      // max-w-mdクラスはdialog内のカードdivに含まれる
      const card = dialog.querySelector('.max-w-md');
      expect(card).toBeInTheDocument();
    });
  });

  /**
   * 要件30.7: パスワードフィールドの自動フォーカス
   */
  describe('自動フォーカス', () => {
    it('パスワードフィールドが存在しフォーカス可能であること', () => {
      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      // パスワードフィールドがdisabledでないこと（フォーカス可能）
      expect(passwordInput).not.toBeDisabled();
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  /**
   * 要件30.8: パスワード必須バリデーション
   */
  describe('バリデーション', () => {
    it('パスワード未入力で再ログインボタンクリック時にバリデーションエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<SessionExpiredModal {...defaultProps} />);

      const loginButton = screen.getByRole('button', { name: '再ログイン' });
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText('パスワードを入力してください')).toBeInTheDocument();
      });
    });
  });

  /**
   * 要件30.12: 2FA完全フロー
   */
  describe('2FA完全フロー', () => {
    it('2FA要求後にTOTPコード送信で認証成功すること', async () => {
      const user = userEvent.setup();
      // ログインで2FA要求
      mockApiClientPost.mockResolvedValueOnce({ requires2FA: true });
      // 2FA検証で成功
      mockApiClientPost.mockResolvedValueOnce({ accessToken: 'token' });

      render(<SessionExpiredModal {...defaultProps} />);

      // パスワード入力→ログイン
      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      // TOTPフィールドが表示される
      await waitFor(() => {
        expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
      });

      // TOTPコード入力→送信
      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(defaultProps.onReauthSuccess).toHaveBeenCalled();
      });

      expect(mockApiClientPost).toHaveBeenCalledWith('/api/v1/auth/verify-2fa', {
        token: '123456',
        email: 'test@example.com',
      });
    });

    it('2FA認証コード未入力でエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockResolvedValueOnce({ requires2FA: true });

      render(<SessionExpiredModal {...defaultProps} />);

      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
      });

      // 空のまま送信
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByText('認証コードを入力してください')).toBeInTheDocument();
      });
    });

    it('2FA認証失敗時にエラーメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockResolvedValueOnce({ requires2FA: true });
      mockApiClientPost.mockRejectedValueOnce(new Error('認証コードが無効です'));

      render(<SessionExpiredModal {...defaultProps} />);

      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('認証コード'), '000000');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByText('認証コードが無効です')).toBeInTheDocument();
      });
    });

    it('2FAネットワークエラー時にメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockResolvedValueOnce({ requires2FA: true });
      mockApiClientPost.mockRejectedValueOnce(
        Object.assign(new Error('Network'), { statusCode: 0 })
      );

      render(<SessionExpiredModal {...defaultProps} />);

      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByText('ネットワーク接続を確認してください')).toBeInTheDocument();
      });
    });
  });

  /**
   * 要件30.16: ログイン画面遷移ボタン
   */
  describe('ログイン画面遷移', () => {
    it('ログイン画面へ移動ボタンクリックでonNavigateToLoginが呼ばれること', async () => {
      const user = userEvent.setup();
      mockApiClientPost
        .mockRejectedValueOnce(new Error('失敗'))
        .mockRejectedValueOnce(new Error('失敗'))
        .mockRejectedValueOnce(new Error('失敗'));

      render(<SessionExpiredModal {...defaultProps} />);

      const passwordInput = screen.getByLabelText('パスワード');
      const loginButton = screen.getByRole('button', { name: '再ログイン' });

      for (let i = 0; i < 3; i++) {
        await user.clear(passwordInput);
        await user.type(passwordInput, `wrong${i}`);
        await user.click(loginButton);
      }

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ログイン画面へ移動' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'ログイン画面へ移動' }));
      expect(defaultProps.onNavigateToLogin).toHaveBeenCalled();
    });
  });

  /**
   * 要件30.17: ネットワークエラーリトライ
   */
  describe('ネットワークエラーリトライ', () => {
    it('リトライボタンクリックでエラー状態がクリアされること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockRejectedValueOnce(
        Object.assign(new Error('Network'), { statusCode: 0 })
      );

      render(<SessionExpiredModal {...defaultProps} />);

      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByText('ネットワーク接続を確認してください')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'リトライ' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'リトライ' }));

      // エラーメッセージがクリアされること
      expect(screen.queryByText('ネットワーク接続を確認してください')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'リトライ' })).not.toBeInTheDocument();
    });
  });

  /**
   * 送信中の状態テスト
   */
  describe('送信中の状態', () => {
    it('送信中は「認証中...」と表示されボタンが無効になること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockImplementation(() => new Promise(() => {}));

      render(<SessionExpiredModal {...defaultProps} />);

      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByText('認証中...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /認証中/ })).toBeDisabled();
      });
    });

    it('送信中はパスワードフィールドが無効になること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockImplementation(() => new Promise(() => {}));

      render(<SessionExpiredModal {...defaultProps} />);

      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByLabelText('パスワード')).toBeDisabled();
      });
    });
  });

  /**
   * エラーが非Errorオブジェクトの場合
   */
  describe('エラーハンドリング', () => {
    it('非Errorオブジェクトのエラーでも「認証に失敗しました」と表示されること', async () => {
      const user = userEvent.setup();
      mockApiClientPost.mockRejectedValueOnce('string error');

      render(<SessionExpiredModal {...defaultProps} />);

      await user.type(screen.getByLabelText('パスワード'), 'password');
      await user.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(screen.getByText('認証に失敗しました')).toBeInTheDocument();
      });
    });
  });
});
