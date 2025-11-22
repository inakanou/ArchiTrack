import { useState, useEffect, FormEvent } from 'react';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import type {
  RegisterFormData,
  InvitationVerificationResult,
  PasswordStrengthResult,
  PasswordRequirements,
} from '../types/auth.types';

interface RegisterFormProps {
  invitationToken: string;
  onRegister: (data: RegisterFormData) => Promise<void>;
  onVerifyInvitation: (token: string) => Promise<InvitationVerificationResult>;
}

/**
 * ユーザー登録フォーム
 *
 * 招待トークンを検証し、有効な場合はユーザー登録フォームを表示します。
 */
function RegisterForm({ invitationToken, onRegister, onVerifyInvitation }: RegisterFormProps) {
  const [verifying, setVerifying] = useState(true);
  const [verificationResult, setVerificationResult] = useState<InvitationVerificationResult | null>(
    null
  );

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // 招待トークン検証
  useEffect(() => {
    const verifyToken = async () => {
      setVerifying(true);
      try {
        const result = await onVerifyInvitation(invitationToken);
        setVerificationResult(result);
      } catch {
        setVerificationResult({
          valid: false,
          error: '招待トークンの検証に失敗しました',
        });
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [invitationToken, onVerifyInvitation]);

  // パスワード要件チェック
  const checkPasswordRequirements = (pwd: string): PasswordRequirements => {
    return {
      minLength: pwd.length >= 12,
      hasUppercase: /[A-Z]/.test(pwd),
      hasLowercase: /[a-z]/.test(pwd),
      hasNumber: /\d/.test(pwd),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
      complexity:
        [
          /[A-Z]/.test(pwd),
          /[a-z]/.test(pwd),
          /\d/.test(pwd),
          /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
        ].filter(Boolean).length >= 3,
    };
  };

  // パスワード強度評価（簡易実装）
  const evaluatePasswordStrength = (pwd: string): PasswordStrengthResult => {
    if (!pwd) {
      return { strength: 'weak', score: 0, feedback: [] };
    }

    const requirements = checkPasswordRequirements(pwd);
    const feedback: string[] = [];

    if (!requirements.minLength) {
      feedback.push('パスワードは12文字以上にしてください');
    }
    if (!requirements.hasUppercase) {
      feedback.push('大文字を含めてください');
    }
    if (!requirements.hasLowercase) {
      feedback.push('小文字を含めてください');
    }
    if (!requirements.hasNumber) {
      feedback.push('数字を含めてください');
    }
    if (!requirements.hasSpecialChar) {
      feedback.push('特殊文字を含めてください');
    }
    if (!requirements.complexity) {
      feedback.push('3種類以上の文字種を含めてください');
    }

    // スコア計算
    let score = 0;
    if (requirements.minLength) score += 1;
    if (requirements.complexity) score += 1;
    if (requirements.hasUppercase && requirements.hasLowercase) score += 1;
    if (requirements.hasNumber && requirements.hasSpecialChar) score += 1;

    // 強度レベル判定
    let strength: PasswordStrengthResult['strength'] = 'weak';
    if (score === 4) strength = 'very-strong';
    else if (score === 3) strength = 'strong';
    else if (score === 2) strength = 'good';
    else if (score === 1) strength = 'fair';

    return { strength, score, feedback };
  };

  const passwordStrengthResult = evaluatePasswordStrength(password);
  const passwordRequirements = checkPasswordRequirements(password);

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

  // フォーム送信
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // バリデーション
    const newErrors: Record<string, string> = {};

    if (!displayName) {
      newErrors.displayName = '表示名は必須です';
    }
    if (!password) {
      newErrors.password = 'パスワードは必須です';
    }
    if (!passwordConfirm) {
      newErrors.passwordConfirm = 'パスワード確認は必須です';
    }
    if (password !== passwordConfirm) {
      newErrors.passwordConfirm = 'パスワードが一致しません';
    }
    if (!agreedToTerms) {
      newErrors.terms = '利用規約に同意してください';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await onRegister({
        invitationToken,
        displayName,
        password,
        passwordConfirm,
        agreedToTerms,
      });
    } catch (err: unknown) {
      // エラーレスポンスから詳細メッセージを取得
      const error = err as { response?: { data?: { code?: string; message?: string } } };
      const errorCode = error?.response?.data?.code;
      const errorMessage = error?.response?.data?.message;

      if (errorCode === 'EMAIL_ALREADY_REGISTERED') {
        setErrors({
          general: 'このメールアドレスは既に登録されています',
        });
      } else if (errorMessage) {
        setErrors({
          general: errorMessage,
        });
      } else {
        setErrors({
          general: '登録に失敗しました。もう一度お試しください。',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 招待トークン検証中
  if (verifying) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>招待トークンを確認しています...</p>
      </div>
    );
  }

  // 招待トークンが無効
  if (!verificationResult?.valid) {
    return (
      <div style={{ maxWidth: '400px', margin: '0 auto', padding: '2rem' }}>
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            borderRadius: '0.375rem',
            border: '1px solid #fecaca',
            marginBottom: '1rem',
          }}
        >
          <p style={{ color: '#991b1b', fontWeight: 600 }}>
            {verificationResult?.error || '招待トークンが無効です'}
          </p>
        </div>
        <p style={{ textAlign: 'center', color: '#6b7280' }}>管理者に連絡してください。</p>
      </div>
    );
  }

  // 登録フォーム
  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '500px', margin: '0 auto' }}>
      {/* 汎用エラーメッセージ */}
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

      {/* メールアドレスフィールド（読み取り専用） */}
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
          value={verificationResult.email || ''}
          disabled
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            backgroundColor: '#f3f4f6',
            color: '#6b7280',
          }}
        />
      </div>

      {/* 表示名フィールド */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor="displayName"
          style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
        >
          表示名
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'displayName-error' : undefined}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: errors.displayName ? '2px solid #dc2626' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        {errors.displayName && (
          <p
            id="displayName-error"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: '#dc2626',
            }}
          >
            {errors.displayName}
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

        {/* パスワード強度インジケーター */}
        {password && (
          <PasswordStrengthIndicator
            result={passwordStrengthResult}
            requirements={passwordRequirements}
          />
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

      {/* 利用規約同意チェックボックス */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            aria-invalid={!!errors.terms}
            aria-describedby={errors.terms ? 'terms-error' : undefined}
            style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.875rem' }}>利用規約とプライバシーポリシーに同意します</span>
        </label>
        {errors.terms && (
          <p
            id="terms-error"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: '#dc2626',
            }}
          >
            {errors.terms}
          </p>
        )}
      </div>

      {/* 登録ボタン */}
      <button
        type="submit"
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '0.75rem',
          backgroundColor: isLoading ? '#9ca3af' : '#3b82f6',
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
        {isLoading ? '登録中...' : '登録'}
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

export default RegisterForm;
