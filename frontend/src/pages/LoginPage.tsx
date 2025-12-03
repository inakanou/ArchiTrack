import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import LoginForm from '../components/LoginForm';
import TwoFactorVerificationForm from '../components/TwoFactorVerificationForm';
import type { LoginFormData, LoginResult } from '../types/auth.types';
import { ApiError } from '../api/client';

/**
 * ログインページ
 *
 * LoginFormコンポーネントをAuthContextと統合し、ログイン機能を提供します。
 *
 * ## 機能
 * - ログインフォーム表示
 * - 2FA検証画面表示（2FA有効ユーザーの場合）
 * - ログイン成功時にリダイレクトURLまたはダッシュボードへ遷移
 * - パスワード忘れた場合のリンク（パスワードリセットページへ遷移）
 *
 * ## 要件
 * - Requirement 16: セッション有効期限切れ時のリダイレクトURL保存機能
 * - Requirement 27A: 2FA検証
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, twoFactorState, verify2FA, verifyBackupCode, cancel2FA, isAuthenticated } =
    useAuth();
  const [loginError, setLoginError] = useState<ApiError | null>(null);

  // location.stateから成功メッセージを取得（例：登録完了後のメッセージ）
  const successMessage = (location.state as { message?: string })?.message;
  // location.stateからセッション期限切れフラグを取得（要件16.8）
  const sessionExpired = (location.state as { sessionExpired?: boolean })?.sessionExpired;

  // 2FA認証成功後のリダイレクト
  // 要件28.5: state.fromが存在する場合、そのパスにリダイレクト
  // 要件28.6: state.fromが存在しない場合、デフォルトで/dashboardにリダイレクト
  useEffect(() => {
    if (isAuthenticated && !twoFactorState) {
      const from = (location.state as { from?: string })?.from || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, twoFactorState, navigate, location.state]);

  /**
   * ログイン処理
   */
  const handleLogin = async (data: LoginFormData): Promise<LoginResult> => {
    // エラーをクリア
    setLoginError(null);

    try {
      // AuthContextのlogin()を呼び出し
      await login(data.email, data.password);

      // 2FA要求時は画面遷移しない（AuthContextがtwoFactorStateを設定する）
      // 通常ログイン成功時は useEffect でリダイレクト

      return {
        type: 'SUCCESS',
      };
    } catch (error) {
      // エラーを状態に保存（LoginForm は error prop で受け取る）
      if (error instanceof ApiError) {
        setLoginError(error);
      }
      // LoginResult error typeを返す（throwしない）
      return {
        type: 'ERROR',
        error: error instanceof ApiError ? error : undefined,
      };
    }
  };

  /**
   * TOTP検証処理
   */
  const handleVerifyTOTP = async (code: string) => {
    try {
      await verify2FA(code);
      return { success: true as const };
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : '認証コードの検証に失敗しました';
      return { success: false as const, error: errorMessage };
    }
  };

  /**
   * バックアップコード検証処理
   */
  const handleVerifyBackupCode = async (code: string) => {
    try {
      await verifyBackupCode(code);
      return { success: true as const };
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : 'バックアップコードの検証に失敗しました';
      return { success: false as const, error: errorMessage };
    }
  };

  /**
   * 2FA認証キャンセル処理
   */
  const handleCancel2FA = () => {
    cancel2FA();
  };

  // 2FA検証画面表示
  if (twoFactorState?.required) {
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
          <TwoFactorVerificationForm
            onVerifyTOTP={handleVerifyTOTP}
            onVerifyBackupCode={handleVerifyBackupCode}
            onCancel={handleCancel2FA}
          />
        </div>
      </div>
    );
  }

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

        {/* セッション期限切れメッセージ（要件16.8、要件16.15） */}
        {sessionExpired && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              padding: '0.75rem',
              marginBottom: '1.5rem',
              backgroundColor: '#fef3c7',
              borderRadius: '0.375rem',
              border: '1px solid #fcd34d',
              color: '#92400e',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}
          >
            セッションの有効期限が切れました。再度ログインしてください。
          </div>
        )}

        {/* 成功メッセージ（登録完了後など） */}
        {successMessage && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              padding: '0.75rem',
              marginBottom: '1.5rem',
              backgroundColor: '#d1fae5',
              borderRadius: '0.375rem',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}
          >
            {successMessage}
          </div>
        )}

        <LoginForm onLogin={handleLogin} error={loginError} />

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
