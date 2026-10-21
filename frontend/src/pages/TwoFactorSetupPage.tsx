import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useCallback, useRef } from 'react';
import TwoFactorSetupForm from '../components/TwoFactorSetupForm';
import TwoFactorReenrollForm from '../components/TwoFactorReenrollForm';
import ToastNotification from '../components/ToastNotification';
import type {
  TwoFactorSetupResult,
  TwoFactorEnableResult,
  TwoFactorEnabledData,
  TwoFactorReenrollStartData,
  TwoFactorReenrollStartResult,
  TwoFactorReenrollConfirmResult,
} from '../types/two-factor.types';
import type { Toast } from '../types/toast.types';
import { apiClient, ApiError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { User } from '../contexts/AuthContext';
import { TWO_FACTOR_SETUP_NOTICE_KEY, isReturnablePath } from '../utils/user-restriction';

/** API の誤りの応答の本文の code（無ければ null） */
function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const response = error.response as { code?: unknown } | undefined;
  return typeof response?.code === 'string' ? response.code : null;
}

/**
 * 2要素認証セットアップページ
 *
 * ユーザーが自分のアカウントで2FAを有効化するためのページです。
 *
 * ## 機能
 * - QRコードの生成と表示
 * - TOTPコードの検証
 * - バックアップコードの生成と表示
 *
 * ## 要件
 * @requirement user-authentication/REQ-27: 2要素認証の設定と管理機能
 * - 要件34.4: 2FA 未登録の利用者が設定を完了したら、ProtectedRoute が保存した遷移先（無ければ
 *   ダッシュボード）へ戻す。2FA 登録済みの利用者（認証アプリの変更）はプロフィールへ戻す（要件28.32）
 * - 要件34.5: 招待経由の登録の直後の案内（sessionStorage の TWO_FACTOR_SETUP_NOTICE_KEY）を表示する
 * - 要件34.11: 2FA 登録済みの利用者には「認証アプリを変更する」の手順（現在のコード → 新しい QR →
 *   新しいコード → 新しいバックアップコード）を表示する。手順は画面を開いた時点の利用者の状態で決め、
 *   新規の設定の完了で利用者が更新されても切り替えない
 */
export function TwoFactorSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateUser } = useAuth();
  const routeState = (location.state ?? null) as { from?: unknown } | null;
  // 招待経由の登録の直後などの案内（表示の時点で一度だけ読み、消す。要件34.5）
  const [arrivalMessage] = useState<string | null>(() => {
    const notice = sessionStorage.getItem(TWO_FACTOR_SETUP_NOTICE_KEY);
    if (notice) {
      sessionStorage.removeItem(TWO_FACTOR_SETUP_NOTICE_KEY);
    }
    return notice;
  });
  // 画面を開いた時点で 2FA 未登録だったか（有効化で利用者が更新された後も完了後の遷移先の判断に使う）
  const wasNotEnrolledRef = useRef<boolean>(user?.twoFactorEnabled === false);
  // 画面を開いた時点で 2FA 登録済みなら、認証アプリの変更（再登録）の手順を表示する（要件34.11）
  const [isReenrollment] = useState<boolean>(() => user?.twoFactorEnabled === true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /**
   * 2FAセットアップ開始
   * QRコードと秘密鍵を取得
   *
   * 設定の部品は関数の参照が変わると設定をやり直す。この画面は利用者の状態の更新（有効化の完了など）で
   * 再描画されるため、参照を固定する（やり直すと登録済みの利用者の設定の開始が拒否される）
   */
  const handleSetupStart = useCallback(async (): Promise<TwoFactorSetupResult> => {
    setError(null);
    try {
      const response = await apiClient.post<{
        secret: string;
        qrCodeDataUrl: string;
      }>('/api/v1/auth/2fa/setup', {});

      return {
        success: true,
        data: {
          secret: response.secret,
          qrCodeDataUrl: response.qrCodeDataUrl,
        },
      };
    } catch {
      const errorMessage = '2FAセットアップの初期化に失敗しました';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  /**
   * 2FA有効化
   * TOTPコードを検証してバックアップコードを取得
   */
  const handleEnable = useCallback(
    async (totpCode: string): Promise<TwoFactorEnableResult> => {
      setError(null);
      try {
        const response = await apiClient.post<{
          backupCodes: string[];
          user?: User;
        }>('/api/v1/auth/2fa/enable', {
          totpCode,
        });

        // 2FA の登録で遷移の制限を解く（応答の利用者が無いときも登録済みとして更新する。要件34.4）
        updateUser(response.user ?? { twoFactorEnabled: true });

        return {
          success: true,
          data: {
            backupCodes: response.backupCodes,
          },
        };
      } catch {
        const errorMessage = '認証コードの検証に失敗しました';
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    [updateUser]
  );

  /**
   * 認証アプリの変更（再登録）の開始（要件34.11）
   * 現在の秘密鍵のコードを確かめ、新しい秘密鍵の QR コードと手入力用の値を受け取る
   *
   * この画面は利用者の状態の更新で再描画されるため、参照を固定する
   */
  const handleReenrollStart = useCallback(
    async (currentCode: string): Promise<TwoFactorReenrollStartResult> => {
      try {
        const response = await apiClient.post<TwoFactorReenrollStartData>(
          '/api/v1/auth/2fa/reenroll/start',
          { currentCode }
        );
        return {
          success: true,
          data: {
            qrCodeDataUrl: response.qrCodeDataUrl,
            secretForManualEntry: response.secretForManualEntry,
          },
        };
      } catch (err) {
        switch (apiErrorCode(err)) {
          case 'INVALID_TOTP_CODE':
            return {
              success: false,
              error:
                '認証コードが正しくありません。いま使っている認証アプリに表示されているコードを入力してください',
            };
          case 'TWO_FACTOR_NOT_ENABLED':
            return {
              success: false,
              error: '二要素認証が登録されていないため、認証アプリを変更できません',
            };
          default:
            return { success: false, error: '認証アプリの変更を開始できませんでした' };
        }
      }
    },
    []
  );

  /**
   * 認証アプリの変更（再登録）の確認（要件34.11）
   * 新しい秘密鍵のコードで置き換え、新しいバックアップコードを受け取る
   */
  const handleReenrollConfirm = useCallback(
    async (newCode: string): Promise<TwoFactorReenrollConfirmResult> => {
      try {
        const response = await apiClient.post<TwoFactorEnabledData>(
          '/api/v1/auth/2fa/reenroll/confirm',
          { newCode }
        );
        return { success: true, data: { backupCodes: response.backupCodes } };
      } catch (err) {
        switch (apiErrorCode(err)) {
          case 'INVALID_TOTP_CODE':
            return {
              success: false,
              error:
                '認証コードが正しくありません。新しい認証アプリに表示されているコードを入力してください',
            };
          case 'REENROLLMENT_NOT_STARTED':
            return {
              success: false,
              error:
                '認証アプリの変更が開始されていません。現在の認証コードの入力からやり直してください',
              restart: true,
            };
          default:
            return { success: false, error: '認証アプリの変更を確認できませんでした' };
        }
      }
    },
    []
  );

  /**
   * セットアップ完了
   */
  const handleComplete = () => {
    // 成功トーストを表示
    const newToast: Toast = {
      id: `toast-${Date.now()}`,
      type: 'success',
      message: isReenrollment ? '認証アプリを変更しました' : '二要素認証を有効化しました',
      createdAt: Date.now(),
      duration: 3000,
    };
    setToasts((prev) => [...prev, newToast]);

    // 要件34.4: 2FA 未登録だった利用者は保存された遷移先（無ければダッシュボード）へ、
    // 登録済みの利用者（認証アプリの変更）はプロフィールへ戻る（要件28.32）
    const savedFrom = routeState?.from;
    const savedDestination = isReturnablePath(savedFrom) ? savedFrom : null;
    const destination = savedDestination ?? (wasNotEnrolledRef.current ? '/dashboard' : '/profile');

    // トースト表示後に遷移する
    setTimeout(() => {
      navigate(destination, {
        replace: true,
      });
    }, 1000);
  };

  /**
   * キャンセル
   */
  const handleCancel = () => {
    navigate('/profile');
  };

  return (
    <>
      <ToastNotification toasts={toasts} onDismiss={handleDismissToast} />
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
          padding: '1rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '600px',
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
            2要素認証の設定
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '2rem',
              textAlign: 'center',
            }}
          >
            アカウントのセキュリティを強化します
          </p>

          {/* 招待経由の登録の直後などの案内（要件34.5） */}
          {arrivalMessage && (
            <div
              role="status"
              style={{
                padding: '0.75rem',
                marginBottom: '1.5rem',
                backgroundColor: '#d1fae5',
                borderRadius: '0.375rem',
                color: '#065f46',
                textAlign: 'center',
                fontSize: '0.875rem',
                overflowWrap: 'anywhere',
              }}
            >
              {arrivalMessage}
            </div>
          )}

          {/* エラーメッセージ */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                padding: '0.75rem',
                marginBottom: '1.5rem',
                backgroundColor: '#fee2e2',
                borderRadius: '0.375rem',
                border: '1px solid #fecaca',
                color: '#991b1b',
                textAlign: 'center',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          {isReenrollment ? (
            <TwoFactorReenrollForm
              onStart={handleReenrollStart}
              onConfirm={handleReenrollConfirm}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          ) : (
            <TwoFactorSetupForm
              onSetupStart={handleSetupStart}
              onEnable={handleEnable}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </>
  );
}
