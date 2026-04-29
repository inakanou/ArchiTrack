import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import { apiClient } from '../api/client';
import { logger } from '../utils/logger';

/**
 * SessionExpiredModalコンポーネントのプロパティ
 * 要件30: セッション切れ時のモーダル再認証
 */
export interface SessionExpiredModalProps {
  /** モーダルの表示状態 */
  isOpen: boolean;
  /** 前回ログインメールアドレス（自動入力用） */
  userEmail: string;
  /** 再認証成功時コールバック */
  onReauthSuccess: () => void;
  /** ログイン画面遷移時コールバック */
  onNavigateToLogin: () => void;
}

/**
 * ネットワークエラーかどうかを判定
 */
function isNetworkError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode === 0;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || msg.includes('fetch') || msg.includes('timeout');
  }
  return false;
}

/**
 * フォーカス可能な要素のセレクタ
 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * SessionExpiredModalコンポーネント
 *
 * 操作中にセッションが切れた場合にインプレース再認証を行うモーダルダイアログ。
 * フォーム入力データの損失を防ぎ、ユーザーは再認証後にシームレスに作業を続行できる。
 *
 * @requirement user-authentication/REQ-30: セッション切れ時のモーダル再認証
 */
export function SessionExpiredModal({
  isOpen,
  userEmail,
  onReauthSuccess,
  onNavigateToLogin,
}: SessionExpiredModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const [isNetworkErr, setIsNetworkErr] = useState(false);

  // 2FA関連
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [loginEmail, setLoginEmail] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // モーダルが開いたとき/閉じたときの状態リセット
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setFailureCount(0);
      setIsNetworkErr(false);
      setRequires2FA(false);
      setTotpCode('');
      setLoginEmail('');
    }
  }, [isOpen]);

  /**
   * 要件30.18: フォーカストラップ（Tab/Shift+Tab循環）
   * 要件30.6: Escキー無効化
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 要件30.6: Escキーでモーダルを閉じない
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 要件30.18: フォーカストラップ
      if (e.key === 'Tab') {
        const focusableElements = dialogRef.current
          ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
          : [];
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const currentElement = document.activeElement as HTMLElement;

        if (e.shiftKey) {
          if (currentElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (currentElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  /**
   * 再認証フォーム送信ハンドラー
   * 要件30.8, 30.9, 30.10, 30.11
   */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      // 2FAモードの場合
      if (requires2FA) {
        if (!totpCode.trim()) {
          setError('認証コードを入力してください');
          return;
        }

        setIsSubmitting(true);
        setError(null);
        setIsNetworkErr(false);

        try {
          await apiClient.post('/api/v1/auth/verify-2fa', {
            token: totpCode,
            email: loginEmail,
          });

          onReauthSuccess();
        } catch (err) {
          if (isNetworkError(err)) {
            setError('ネットワーク接続を確認してください');
            setIsNetworkErr(true);
          } else {
            setError(err instanceof Error ? err.message : '認証に失敗しました');
          }
          setFailureCount((prev) => prev + 1);
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      // 通常のパスワード認証
      if (!password.trim()) {
        setError('パスワードを入力してください');
        return;
      }

      setIsSubmitting(true);
      setError(null);
      setIsNetworkErr(false);

      try {
        const response = await apiClient.post<{
          requires2FA?: boolean;
          accessToken?: string;
          refreshToken?: string;
          user?: unknown;
        }>('/api/v1/auth/login', {
          email: userEmail,
          password,
        });

        // 要件30.12: 2FA要求時
        if (response.requires2FA) {
          setRequires2FA(true);
          setLoginEmail(userEmail);
          return;
        }

        // 要件30.9: 再認証成功でトークン更新
        if (response.accessToken) {
          apiClient.setAccessToken(response.accessToken);
          localStorage.setItem('accessToken', response.accessToken);
        }
        if (response.refreshToken) {
          localStorage.setItem('refreshToken', response.refreshToken);
        }

        // 再認証成功
        onReauthSuccess();
      } catch (err) {
        if (isNetworkError(err)) {
          setError('ネットワーク接続を確認してください');
          setIsNetworkErr(true);
        } else {
          setError(err instanceof Error ? err.message : '認証に失敗しました');
        }
        setFailureCount((prev) => prev + 1);
      } finally {
        setIsSubmitting(false);
      }
    },
    [password, userEmail, onReauthSuccess, requires2FA, totpCode, loginEmail]
  );

  // 非表示時はレンダリングしない
  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* 要件30.5: オーバーレイ（クリック無効） */}
      {/* 操作中の業務ダイアログ（zIndex: 1000 等）より前面に表示するため、
          inline style で zIndex: 2147483646 を指定（最大値 - 1） */}
      <div
        className="fixed inset-0 bg-black/50"
        style={{ zIndex: 2147483646 }}
        aria-hidden="true"
      />

      {/* 要件30.19: role="dialog", aria-modal="true", aria-labelledby */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 2147483647 }}
      >
        {/* 要件30.21: レスポンシブ対応 - デスクトップmax-w-md、モバイルフルスクリーン */}
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md md:mx-auto max-md:min-h-[80vh] max-md:flex max-md:flex-col max-md:justify-center p-6">
          {/* 要件30.20: aria-live="assertive" */}
          <div aria-live="assertive">
            <h2
              id="session-expired-title"
              className="text-xl font-bold text-gray-900 mb-2 text-center"
            >
              セッションの有効期限が切れました
            </h2>
          </div>

          <p className="text-sm text-gray-600 mb-6 text-center">
            セキュリティのため、再度ログインしてください。
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* メールアドレスフィールド（読み取り専用） */}
            <div className="mb-4">
              <label
                htmlFor="session-expired-email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                メールアドレス
              </label>
              <input
                id="session-expired-email"
                type="email"
                value={userEmail}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed"
                autoComplete="username"
                tabIndex={-1}
              />
            </div>

            {/* パスワード入力フィールド */}
            {!requires2FA && (
              <div className="mb-4">
                <label
                  htmlFor="session-expired-password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  パスワード
                </label>
                <input
                  ref={passwordInputRef}
                  id="session-expired-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="current-password"
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>
            )}

            {/* 要件30.12: 2FAフィールド */}
            {requires2FA && (
              <div className="mb-4">
                <label
                  htmlFor="session-expired-totp"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  認証コード
                </label>
                <input
                  id="session-expired-totp"
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="6桁のコードを入力"
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-gray-500">
                  認証アプリに表示されている6桁のコードを入力してください
                </p>
              </div>
            )}

            {/* エラーメッセージ */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md" role="alert">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* 再ログインボタン */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  認証中...
                </span>
              ) : (
                '再ログイン'
              )}
            </button>

            {/* 要件30.16: 3回連続失敗後に「ログイン画面へ移動」ボタン表示 */}
            {failureCount >= 3 && (
              <button
                type="button"
                onClick={() => {
                  logger.debug('User chose to navigate to login page after consecutive failures');
                  onNavigateToLogin();
                }}
                className="w-full mt-3 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors"
              >
                ログイン画面へ移動
              </button>
            )}

            {/* 要件30.17: ネットワークエラー時のリトライボタン */}
            {isNetworkErr && failureCount < 3 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsNetworkErr(false);
                }}
                className="w-full mt-3 text-blue-600 py-2 px-4 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors"
              >
                リトライ
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
