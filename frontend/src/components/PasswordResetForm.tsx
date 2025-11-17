import { useState, FormEvent } from 'react';
import type { PasswordResetRequestFormData, PasswordResetFormData } from '../types/auth.types';

interface PasswordResetFormProps {
  resetToken?: string;
  onRequestReset?: (data: PasswordResetRequestFormData) => Promise<void>;
  onResetPassword?: (data: PasswordResetFormData) => Promise<void>;
}

/**
 * パスワードリセットフォーム
 *
 * resetTokenの有無でモードを切り替えます：
 * - resetToken未指定: リセット要求モード（メールアドレス入力）
 * - resetToken指定: リセット実行モード（新パスワード入力）
 */
function PasswordResetForm({
  resetToken,
  onRequestReset,
  onResetPassword,
}: PasswordResetFormProps) {
  // リセット要求モードの状態
  const [email, setEmail] = useState('');

  // リセット実行モードの状態
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // 共通状態
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // メールアドレスバリデーション
  const validateEmail = (value: string): string => {
    if (!value) {
      return 'メールアドレスは必須です';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return '有効なメールアドレスを入力してください';
    }
    return '';
  };

  // パスワード確認のblurイベント
  const handlePasswordConfirmBlur = () => {
    if (passwordConfirm && password !== passwordConfirm) {
      setErrors((prev) => ({
        ...prev,
        passwordConfirm: 'パスワードが一致しません',
      }));
    } else {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.passwordConfirm;
        return newErrors;
      });
    }
  };

  // メールアドレスのblurイベント
  const handleEmailBlur = () => {
    const error = validateEmail(email);
    setErrors((prev) => ({ ...prev, email: error }));
  };

  // リセット要求フォーム送信
  const handleRequestReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // バリデーション
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }

    setErrors({});
    setIsLoading(true);
    setSuccessMessage('');

    try {
      await onRequestReset?.({ email });
      setSuccessMessage('パスワードリセットリンクを送信しました。メールをご確認ください。');
      setEmail('');
    } catch {
      setErrors({
        general: 'リセットリンクの送信に失敗しました。もう一度お試しください。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // パスワードリセットフォーム送信
  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // バリデーション
    const newErrors: Record<string, string> = {};

    if (!password) {
      newErrors.password = 'パスワードは必須です';
    }
    if (!passwordConfirm) {
      newErrors.passwordConfirm = 'パスワード確認は必須です';
    }
    if (password !== passwordConfirm) {
      newErrors.passwordConfirm = 'パスワードが一致しません';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    setSuccessMessage('');

    try {
      await onResetPassword?.({
        resetToken: resetToken!,
        password,
        passwordConfirm,
      });
      setSuccessMessage('パスワードをリセットしました。新しいパスワードでログインできます。');
      setPassword('');
      setPasswordConfirm('');
    } catch {
      setErrors({
        general: 'パスワードのリセットに失敗しました。もう一度お試しください。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // リセット要求モード
  if (!resetToken) {
    return (
      <form onSubmit={handleRequestReset} style={{ maxWidth: '400px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
          パスワードリセット
        </h2>

        {/* 成功メッセージ */}
        {successMessage && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#d1fae5',
              borderRadius: '0.375rem',
              border: '1px solid #a7f3d0',
              color: '#065f46',
            }}
          >
            {successMessage}
          </div>
        )}

        {/* エラーメッセージ */}
        {errors.general && (
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
            {errors.general}
          </div>
        )}

        {/* メールアドレスフィールド */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="email"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
          >
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={handleEmailBlur}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: errors.email ? '2px solid #dc2626' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              outline: 'none',
            }}
          />
          {errors.email && (
            <p
              id="email-error"
              style={{
                marginTop: '0.25rem',
                fontSize: '0.875rem',
                color: '#dc2626',
              }}
            >
              {errors.email}
            </p>
          )}
        </div>

        {/* リセットリンク送信ボタン */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: isLoading ? '#9ca3af' : '#1d4ed8',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {isLoading && (
            <span
              role="status"
              aria-label="ローディング中"
              style={{
                display: 'inline-block',
                width: '1rem',
                height: '1rem',
                border: '2px solid white',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          )}
          {isLoading ? '送信中...' : 'リセットリンクを送信'}
        </button>

        {/* アニメーション定義 */}
        <style>
          {`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </form>
    );
  }

  // リセット実行モード
  return (
    <form onSubmit={handleResetPassword} style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
        新しいパスワードを設定
      </h2>

      {/* 成功メッセージ */}
      {successMessage && (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: '#d1fae5',
            borderRadius: '0.375rem',
            border: '1px solid #a7f3d0',
            color: '#065f46',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* エラーメッセージ */}
      {errors.general && (
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
          {errors.general}
        </div>
      )}

      {/* 新パスワードフィールド */}
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: errors.password ? '2px solid #dc2626' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        {errors.password && (
          <p
            id="password-error"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: '#dc2626',
            }}
          >
            {errors.password}
          </p>
        )}
      </div>

      {/* パスワード確認フィールド */}
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
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          onBlur={handlePasswordConfirmBlur}
          aria-invalid={!!errors.passwordConfirm}
          aria-describedby={errors.passwordConfirm ? 'passwordConfirm-error' : undefined}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: errors.passwordConfirm ? '2px solid #dc2626' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        {errors.passwordConfirm && (
          <p
            id="passwordConfirm-error"
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: '#dc2626',
            }}
          >
            {errors.passwordConfirm}
          </p>
        )}
      </div>

      {/* パスワードリセットボタン */}
      <button
        type="submit"
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '0.75rem',
          backgroundColor: isLoading ? '#9ca3af' : '#1d4ed8',
          color: 'white',
          border: 'none',
          borderRadius: '0.375rem',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}
      >
        {isLoading && (
          <span
            role="status"
            aria-label="ローディング中"
            style={{
              display: 'inline-block',
              width: '1rem',
              height: '1rem',
              border: '2px solid white',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        )}
        {isLoading ? 'リセット中...' : 'パスワードをリセット'}
      </button>

      {/* アニメーション定義 */}
      <style>
        {`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </form>
  );
}

export default PasswordResetForm;
