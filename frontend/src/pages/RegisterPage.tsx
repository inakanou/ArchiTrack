import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { User } from '../contexts/AuthContext';
import { TWO_FACTOR_SETUP_NOTICE_KEY } from '../utils/user-restriction';

/** 招待経由の登録の直後に 2FA 設定の画面に出す案内（要件34.5） */
const REGISTERED_NOTICE = 'ユーザー登録が完了しました。二要素認証を設定してください。';
import RegisterForm from '../components/RegisterForm';
import type { RegisterFormData, InvitationVerificationResult } from '../types/auth.types';

/**
 * ユーザー登録ページ
 *
 * RegisterFormコンポーネントをAPIと統合し、招待経由のユーザー登録機能を提供します。
 *
 * ## 機能
 * - 招待トークンの検証
 * - ユーザー登録フォーム表示
 * - 登録成功時は応答でセッションを始めてダッシュボードへ進める。2FA 未登録のため ProtectedRoute が
 *   2FA 設定の画面へ置き換え、設定の完了後にダッシュボードへ戻る（要件34.5・12.9・28.19）
 *
 * ## 要件
 * @requirement user-authentication/REQ-11: 招待経由のユーザー登録
 * @requirement user-authentication/REQ-12: パスワード強度要件
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const { establishSession } = useAuth();
  const [searchParams] = useSearchParams();

  // URLクエリパラメータから招待トークンを取得
  const invitationToken = searchParams.get('token') || '';

  /**
   * 招待トークン検証処理
   *
   * 登録フォームは関数の参照が変わると検証をやり直す（入力の途中で検証中の表示へ戻り、フォーカスを失う）。
   * この画面は認証の状態の変化（初期化の完了など）で再描画されるため、参照を固定する
   */
  const handleVerifyInvitation = useCallback(
    async (token: string): Promise<InvitationVerificationResult> => {
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
    },
    []
  );

  /**
   * ユーザー登録処理
   */
  const handleRegister = useCallback(
    async (data: RegisterFormData): Promise<void> => {
      try {
        // ユーザー登録API呼び出し
        const response = await apiClient.post<{
          accessToken?: string;
          expiresIn?: number;
          user?: User;
        }>('/api/v1/auth/register', {
          invitationToken: data.invitationToken,
          displayName: data.displayName,
          password: data.password,
        });

        // 要件34.5: 登録の応答でセッションを始め、利用開始の前に 2FA の設定へ進める
        // （リフレッシュトークンは応答の HttpOnly Cookie に置かれる）。2FA 未登録のため ProtectedRoute が
        // ダッシュボードを 2FA 設定の画面へ置き換える。完了の案内は 2FA 設定の画面が表示の時点で読む
        if (response?.accessToken && response.user) {
          sessionStorage.setItem(TWO_FACTOR_SETUP_NOTICE_KEY, REGISTERED_NOTICE);
          establishSession({
            accessToken: response.accessToken,
            expiresIn: response.expiresIn,
            user: response.user,
          });
          navigate('/dashboard', { replace: true });
          return;
        }

        // 応答にアクセストークンが無いときはログインページへ遷移する
        navigate('/login', {
          state: {
            message: 'ユーザー登録が完了しました。ログインしてください。',
          },
        });
      } catch (error) {
        // エラーをRegisterFormに伝播させる（RegisterFormがエラーハンドリングを行う）
        throw error;
      }
    },
    [establishSession, navigate]
  );

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
