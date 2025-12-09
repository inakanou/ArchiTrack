import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import RegisterForm from '../components/RegisterForm';
import type {
  RegisterFormData,
  InvitationVerificationResult,
  AuthResponse,
} from '../types/auth.types';

/**
 * ユーザー登録ページ
 *
 * RegisterFormコンポーネントをAPIと統合し、招待経由のユーザー登録機能を提供します。
 *
 * ## 機能
 * - 招待トークンの検証
 * - ユーザー登録フォーム表示
 * - 登録成功時にログインページへ遷移
 *
 * ## 要件
 * @requirement user-authentication/REQ-11: 招待経由のユーザー登録
 * @requirement user-authentication/REQ-12: パスワード強度要件
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // URLクエリパラメータから招待トークンを取得
  const invitationToken = searchParams.get('token') || '';

  /**
   * 招待トークン検証処理
   */
  const handleVerifyInvitation = async (token: string): Promise<InvitationVerificationResult> => {
    try {
      const response = await apiClient.get<{
        email: string;
      }>(`/api/v1/invitations/verify?token=${token}`);

      return {
        valid: true,
        email: response.email,
      };
    } catch {
      // エラー時は無効な招待として扱う
      return {
        valid: false,
        error: '招待トークンの検証に失敗しました',
      };
    }
  };

  /**
   * ユーザー登録処理
   */
  const handleRegister = async (data: RegisterFormData): Promise<void> => {
    try {
      // ユーザー登録API呼び出し
      await apiClient.post<AuthResponse>('/api/v1/auth/register', {
        invitationToken: data.invitationToken,
        displayName: data.displayName,
        password: data.password,
      });

      // 登録成功後、ログインページへ遷移
      navigate('/login', {
        state: {
          message: 'ユーザー登録が完了しました。ログインしてください。',
        },
      });
    } catch (error) {
      // エラーをRegisterFormに伝播させる（RegisterFormがエラーハンドリングを行う）
      throw error;
    }
  };

  // 招待トークンが存在しない場合
  if (!invitationToken) {
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
              marginBottom: '1rem',
              textAlign: 'center',
            }}
          >
            招待トークンが必要です
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '2rem',
              textAlign: 'center',
            }}
          >
            ユーザー登録には有効な招待URLが必要です。
            管理者から送信された招待メールのリンクをクリックしてください。
          </p>
          <button
            onClick={() => {
              navigate('/login');
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ログインページへ戻る
          </button>
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
          ユーザー登録
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

        <RegisterForm
          invitationToken={invitationToken}
          onRegister={handleRegister}
          onVerifyInvitation={handleVerifyInvitation}
        />

        <div
          style={{
            marginTop: '1.5rem',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#6b7280',
          }}
        >
          既にアカウントをお持ちの場合は{' '}
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              navigate('/login');
            }}
            style={{
              color: '#2563eb',
              textDecoration: 'underline',
            }}
          >
            ログイン
          </a>
        </div>
      </div>
    </div>
  );
}
