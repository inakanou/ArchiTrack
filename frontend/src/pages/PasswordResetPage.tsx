import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient, ApiError } from '../api/client';
import PasswordResetForm from '../components/PasswordResetForm';
import type { PasswordResetRequestFormData, PasswordResetFormData } from '../types/auth.types';

/**
 * パスワードリセットページ
 *
 * PasswordResetFormコンポーネントをAPIと統合し、パスワードリセット機能を提供します。
 *
 * ## モード
 * - リセット要求モード（resetTokenなし）: メールアドレスを入力してリセットリンクを送信
 * - リセット実行モード（resetTokenあり）: 新しいパスワードを設定
 *
 * ## 要件
 * - Requirement 7: パスワードリセット機能
 */
export function PasswordResetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // URLクエリパラメータからリセットトークンを取得
  const resetToken = searchParams.get('token') || undefined;

  // トークン検証状態
  const [tokenError, setTokenError] = useState<string>('');
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // トークン検証（ページロード時）
  useEffect(() => {
    const validateToken = async () => {
      if (!resetToken) {
        setIsTokenValid(true); // トークンがない場合はリセット要求モード
        return;
      }

      setIsValidating(true);
      try {
        // トークン検証API呼び出し（GETエンドポイント使用）
        await apiClient.get(
          `/api/v1/auth/password/verify-reset?token=${encodeURIComponent(resetToken)}`
        );
        setIsTokenValid(true);
        setTokenError('');
      } catch (error) {
        setIsTokenValid(false);
        // エラーコードに基づいてメッセージを設定
        if (error instanceof ApiError) {
          const errorData = error.response as { code?: string };
          if (errorData?.code === 'TOKEN_EXPIRED') {
            setTokenError(
              'リセットリンクの有効期限が切れています。再度リセットを要求してください。'
            );
          } else if (
            errorData?.code === 'INVALID_RESET_TOKEN' ||
            errorData?.code === 'TOKEN_USED'
          ) {
            setTokenError('無効なリセットリンクです。再度リセットを要求してください。');
          } else {
            setTokenError('リセットリンクの検証に失敗しました。再度リセットを要求してください。');
          }
        } else {
          setTokenError('リセットリンクの検証に失敗しました。再度リセットを要求してください。');
        }
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [resetToken]);

  /**
   * パスワードリセット要求処理
   */
  const handleRequestReset = async (data: PasswordResetRequestFormData): Promise<void> => {
    try {
      // パスワードリセット要求API呼び出し
      await apiClient.post('/api/v1/auth/password/reset-request', {
        email: data.email,
      });

      // 成功時はPasswordResetFormが成功メッセージを表示する
      // （この関数がエラーをスローしなければ成功と判断される）
    } catch (error) {
      // エラーをPasswordResetFormに伝播させる
      throw error;
    }
  };

  /**
   * パスワードリセット実行処理
   */
  const handleResetPassword = async (data: PasswordResetFormData): Promise<void> => {
    try {
      // パスワードリセット実行API呼び出し
      await apiClient.post('/api/v1/auth/password/reset', {
        token: data.resetToken,
        newPassword: data.password,
      });

      // リセット成功時、ログインページへ遷移
      navigate('/login', {
        state: {
          message: 'パスワードがリセットされました。新しいパスワードでログインしてください。',
        },
      });
    } catch (error) {
      // エラーをPasswordResetFormに伝播させる
      throw error;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '28rem',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            textAlign: 'center',
          }}
        >
          {resetToken ? 'パスワードリセット' : 'パスワードリセット要求'}
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '2rem',
            textAlign: 'center',
          }}
        >
          {resetToken
            ? '新しいパスワードを入力してください'
            : 'パスワードリセット用のリンクをメールで送信します'}
        </p>

        {/* 検証中のローディング表示 */}
        {isValidating && (
          <div
            style={{
              textAlign: 'center',
              padding: '2rem',
              color: '#6b7280',
            }}
          >
            リセットリンクを検証中...
          </div>
        )}

        {/* トークン検証エラー */}
        {tokenError && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#fee2e2',
              borderRadius: '0.375rem',
              border: '1px solid #fecaca',
              color: '#991b1b',
            }}
          >
            {tokenError}
          </div>
        )}

        {/* トークンが無効な場合は無効化されたフォームを表示 */}
        {resetToken && isTokenValid === false && (
          <form style={{ maxWidth: '400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="password"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
              >
                新しいパスワード
              </label>
              <input
                id="password"
                type="password"
                disabled
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  backgroundColor: '#f9fafb',
                  cursor: 'not-allowed',
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="passwordConfirm"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
              >
                パスワード (確認)
              </label>
              <input
                id="passwordConfirm"
                type="password"
                disabled
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  backgroundColor: '#f9fafb',
                  cursor: 'not-allowed',
                }}
              />
            </div>
          </form>
        )}

        {/* 正常な場合のフォーム */}
        {!isValidating && isTokenValid !== false && (
          <PasswordResetForm
            resetToken={resetToken}
            onRequestReset={handleRequestReset}
            onResetPassword={handleResetPassword}
          />
        )}

        <div
          style={{
            marginTop: '1.5rem',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#6b7280',
          }}
        >
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              navigate('/login');
            }}
            style={{
              color: '#3b82f6',
              textDecoration: 'none',
            }}
          >
            ログインページに戻る
          </a>
        </div>
      </div>
    </div>
  );
}
