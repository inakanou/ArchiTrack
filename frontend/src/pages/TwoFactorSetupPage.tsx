import { useNavigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import TwoFactorSetupForm from '../components/TwoFactorSetupForm';
import ToastNotification from '../components/ToastNotification';
import type { TwoFactorSetupResult, TwoFactorEnableResult } from '../types/two-factor.types';
import type { Toast } from '../types/toast.types';
import { apiClient } from '../api/client';

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
 * - Requirement 17: 2要素認証の設定と管理機能
 */
export function TwoFactorSetupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /**
   * 2FAセットアップ開始
   * QRコードと秘密鍵を取得
   */
  const handleSetupStart = async (): Promise<TwoFactorSetupResult> => {
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
  };

  /**
   * 2FA有効化
   * TOTPコードを検証してバックアップコードを取得
   */
  const handleEnable = async (totpCode: string): Promise<TwoFactorEnableResult> => {
    setError(null);
    try {
      const response = await apiClient.post<{
        backupCodes: string[];
      }>('/api/v1/auth/2fa/enable', {
        totpCode,
      });

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
  };

  /**
   * セットアップ完了
   */
  const handleComplete = () => {
    // 成功トーストを表示
    const newToast: Toast = {
      id: `toast-${Date.now()}`,
      type: 'success',
      message: '二要素認証を有効化しました',
      createdAt: Date.now(),
      duration: 3000,
    };
    setToasts((prev) => [...prev, newToast]);

    // トースト表示後にプロフィールページに戻る
    setTimeout(() => {
      navigate('/profile', {
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

          <TwoFactorSetupForm
            onSetupStart={handleSetupStart}
            onEnable={handleEnable}
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </>
  );
}
