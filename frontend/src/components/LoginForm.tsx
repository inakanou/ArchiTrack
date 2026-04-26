import { useState, useRef, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { LoginFormData, LoginResult } from '../types/auth.types';
import { ApiError } from '../api/client';

interface LoginFormProps {
  onLogin: (data: LoginFormData) => Promise<LoginResult>;
  error?: ApiError | null;
}

/**
 * ログインフォーム
 *
 * ユーザーがメールアドレスとパスワードでログインするためのフォームです。
 */
function LoginForm({ onLogin, error }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);

  // error prop の変更を監視してロック時間を設定
  const [generalError, setGeneralError] = useState('');

  // Deriving state from error prop is a valid use case for setting state in useEffect
  useEffect(() => {
    if (error) {
      const errorResponse = error.response as { code?: string; unlockAt?: string } | undefined;

      if (errorResponse?.code === 'ACCOUNT_LOCKED') {
        const unlockAtStr = errorResponse.unlockAt;
        if (unlockAtStr) {
          const lockUntil = new Date(unlockAtStr);
          const remainingSeconds = Math.floor((lockUntil.getTime() - Date.now()) / 1000);
          setLockTimeRemaining(remainingSeconds);
          setGeneralError(
            `アカウントがロックされています。${Math.ceil(remainingSeconds / 60)}分後に再試行できます。`
          );
        } else {
          setGeneralError('アカウントがロックされています。');
        }
      } else {
        setGeneralError('メールアドレスまたはパスワードが正しくありません');
      }
    } else {
      setGeneralError('');
      setLockTimeRemaining(0);
    }
  }, [error]);

  // 自動フォーカス
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // アカウントロック時のカウントダウン
  useEffect(() => {
    if (lockTimeRemaining > 0) {
      const timer = setInterval(() => {
        setLockTimeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
    return undefined;
  }, [lockTimeRemaining]);

  // メールアドレスバリデーション
  const validateEmail = (value: string): string => {
    if (!value) {
      return 'メールアドレスは必須';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return '有効なメールアドレスを入力してください';
    }
    return '';
  };

  // パスワードバリデーション
  const validatePassword = (value: string): string => {
    if (!value) {
      return 'パスワードは必須';
    }
    return '';
  };

  // メールアドレスのblurイベント
  const handleEmailBlur = () => {
    const error = validateEmail(email);
    setErrors((prev) => ({ ...prev, email: error }));
  };

  // フォーム送信
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // バリデーション
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (emailError || passwordError) {
      setErrors({
        email: emailError,
        password: passwordError,
      });
      // 最初のエラーフィールドにフォーカス（WCAG 2.1 AA要件）
      if (emailError) {
        emailRef.current?.focus();
      }
      return;
    }

    setErrors({});
    setIsLoading(true);

    await onLogin({ email, password });

    setIsLoading(false);
  };

  const formattedLockTime = () => {
    const minutes = Math.floor(lockTimeRemaining / 60);
    const seconds = lockTimeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto' }}>
      <form onSubmit={handleSubmit} role="form">
        {/* 汎用エラーメッセージ */}
        {generalError && (
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
            {generalError}
            {lockTimeRemaining > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                残り時間: {formattedLockTime()}
              </div>
            )}
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
            ref={emailRef}
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
              role="alert"
              aria-live="polite"
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

        {/* パスワードフィールド */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="password"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
          >
            パスワード
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              style={{
                width: '100%',
                padding: '0.5rem',
                paddingRight: '3rem',
                border: errors.password ? '2px solid #dc2626' : '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'パスワードを非表示' : 'パスワードを表示'}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '0.25rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#6b7280',
              }}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {errors.password && (
            <p
              id="password-error"
              role="alert"
              aria-live="polite"
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

        {/* ログインボタン */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: isLoading ? '#6b7280' : '#1d4ed8',
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
          {isLoading ? 'ログイン中...' : 'ログイン'}
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

      {/* 「パスワードを忘れた場合」リンク */}
      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <Link
          to="/password-reset"
          style={{
            fontSize: '0.875rem',
            color: '#1d4ed8',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          パスワードを忘れた
        </Link>
      </div>
    </div>
  );
}

export default LoginForm;
