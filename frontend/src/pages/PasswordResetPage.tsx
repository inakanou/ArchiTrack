import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
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

  /**
   * パスワードリセット要求処理
   */
  const handleRequestReset = async (data: PasswordResetRequestFormData): Promise<void> => {
    try {
      // パスワードリセット要求API呼び出し
      await apiClient.post('/api/v1/auth/password-reset/request', {
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
      await apiClient.post('/api/v1/auth/password-reset/reset', {
        token: data.resetToken,
        newPassword: data.password,
      });

      // React Router v7との互換性のため、ナビゲーションを次のマイクロタスクで実行
      queueMicrotask(() => {
        // リセット成功時、ログインページへ遷移
        navigate('/login', {
          state: {
            message: 'パスワードがリセットされました。新しいパスワードでログインしてください。',
          },
        });
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

        <PasswordResetForm
          resetToken={resetToken}
          onRequestReset={handleRequestReset}
          onResetPassword={handleResetPassword}
        />

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
              // React Router v7との互換性のため、ナビゲーションを次のマイクロタスクで実行
              queueMicrotask(() => {
                navigate('/login');
              });
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
