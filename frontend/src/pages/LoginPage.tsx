import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoginForm from '../components/LoginForm';
import type { LoginFormData, LoginResult } from '../types/auth.types';

/**
 * ログインページ
 *
 * LoginFormコンポーネントをAuthContextと統合し、ログイン機能を提供します。
 *
 * ## 機能
 * - ログインフォーム表示
 * - ログイン成功時にリダイレクトURLまたはダッシュボードへ遷移
 * - パスワード忘れた場合のリンク（パスワードリセットページへ遷移）
 *
 * ## 要件
 * - Requirement 16: セッション有効期限切れ時のリダイレクトURL保存機能
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  /**
   * ログイン処理
   */
  const handleLogin = async (data: LoginFormData): Promise<LoginResult> => {
    try {
      // AuthContextのlogin()を呼び出し
      await login(data.email, data.password);

      // ログイン成功時、リダイレクトURLまたはダッシュボードへ遷移
      // ProtectedRouteが保存したリダイレクトURL（location.state.from）を取得
      const from = (location.state as { from?: string })?.from || '/';
      navigate(from, { replace: true });

      return {
        type: 'SUCCESS', // TODO: 2FA対応時に '2FA_REQUIRED' も処理
      };
    } catch (error) {
      // エラーをLoginFormに伝播させる（LoginFormがエラーハンドリングを行う）
      throw error;
    }
  };

  /**
   * パスワード忘れた場合のハンドラー
   */
  const handleForgotPassword = () => {
    navigate('/password-reset');
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
          ログイン
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '2rem',
            textAlign: 'center',
          }}
        >
          ArchiTrackへようこそ
        </p>

        <LoginForm onLogin={handleLogin} onForgotPassword={handleForgotPassword} />

        <div
          style={{
            marginTop: '1.5rem',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#6b7280',
          }}
        >
          アカウントをお持ちでない場合は、管理者に招待を依頼してください。
        </div>
      </div>
    </div>
  );
}
