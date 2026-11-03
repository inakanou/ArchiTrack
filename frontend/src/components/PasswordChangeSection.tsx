/**
 * パスワード変更の区画（user-authentication 要件7・14、タスク47.6）
 *
 * プロフィール画面（`/profile`）と初回のパスワード変更の画面（`/setup/password`）が同じ区画を使う。
 * 区画はパスワード変更の API（`POST /api/v1/auth/password/change`）だけを呼ぶ。変更の完了の後の処理
 * （全デバイスからのログアウトとログイン画面への遷移）は呼び出し元が `onPasswordChanged` で決める。
 */

import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import { TAP_TARGET_MIN_PX } from '../utils/tap-target';
import type {
  ChangePasswordFormData,
  PasswordStrengthResult,
  PasswordRequirements,
} from '../types/auth.types';

/**
 * パスワード強度を評価する関数
 */
function evaluatePasswordStrength(password: string): {
  result: PasswordStrengthResult;
  requirements: PasswordRequirements;
} {
  const requirements: PasswordRequirements = {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    complexity: false,
  };

  // 複雑性: 3種類以上の文字種を含む
  const complexityCount =
    (requirements.hasUppercase ? 1 : 0) +
    (requirements.hasLowercase ? 1 : 0) +
    (requirements.hasNumber ? 1 : 0) +
    (requirements.hasSpecialChar ? 1 : 0);
  requirements.complexity = complexityCount >= 3;

  // スコア計算（0-4）
  let score = 0;
  if (requirements.minLength) score++;
  if (requirements.complexity) score += 2;
  if (password.length >= 16) score++;

  // 強度レベル判定
  let strength: PasswordStrengthResult['strength'] = 'weak';
  if (score >= 4) strength = 'very-strong';
  else if (score >= 3) strength = 'strong';
  else if (score >= 2) strength = 'good';
  else if (score >= 1) strength = 'fair';

  // フィードバック生成
  const feedback: string[] = [];
  if (!requirements.minLength) feedback.push('12文字以上にしてください');
  if (!requirements.complexity)
    feedback.push('大文字、小文字、数字、特殊文字のうち3種類以上を含めてください');
  if (password.length < 16) feedback.push('16文字以上にするとより強固になります');

  return {
    result: {
      strength,
      score,
      feedback,
    },
    requirements,
  };
}

export interface PasswordChangeSectionProps {
  /** パスワード変更の完了の後に呼ぶ（変更で全てのリフレッシュトークンが失効する） */
  onPasswordChanged: () => void | Promise<void>;
}

export function PasswordChangeSection({ onPasswordChanged }: PasswordChangeSectionProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<{
    result: PasswordStrengthResult;
    requirements: PasswordRequirements;
  } | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  // 新しいパスワードの強度評価
  useEffect(() => {
    if (newPassword) {
      setPasswordStrength(evaluatePasswordStrength(newPassword));
    } else {
      setPasswordStrength(null);
    }
  }, [newPassword]);

  // Escキーでダイアログを閉じる（WCAG 2.1 AA要件: キーボードアクセシビリティ）
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPasswordDialog(false);
      }
    };

    if (showPasswordDialog) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showPasswordDialog]);

  /**
   * パスワードの複雑性要件をチェックし、エラーメッセージを返す
   */
  const validatePasswordComplexity = (password: string): string | null => {
    // 12文字以上
    if (password.length < 12) {
      return 'パスワードは12文字以上である必要があります';
    }
    // 大文字を含む
    if (!/[A-Z]/.test(password)) {
      return 'パスワードは大文字を1文字以上含む必要があります';
    }
    // 小文字を含む
    if (!/[a-z]/.test(password)) {
      return 'パスワードは小文字を1文字以上含む必要があります';
    }
    // 数字を含む
    if (!/[0-9]/.test(password)) {
      return 'パスワードは数字を1文字以上含む必要があります';
    }
    // 記号を含む
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return 'パスワードは記号を1文字以上含む必要があります';
    }
    // 連続した同一文字のチェック（3文字以上）
    if (/(.)\1\1/.test(password)) {
      return 'パスワードに3文字以上の連続した同一文字を含めることはできません';
    }
    return null;
  };

  /**
   * パスワード変更確認ダイアログを表示
   */
  const handleChangePasswordClick = () => {
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      setPasswordMessage('全てのフィールドを入力してください');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordMessage('新しいパスワードが一致しません');
      return;
    }

    // パスワードの複雑性要件をチェック
    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) {
      setPasswordMessage(complexityError);
      return;
    }

    setShowPasswordDialog(true);
  };

  /**
   * パスワード変更を実行
   */
  const handleConfirmPasswordChange = async () => {
    setPasswordLoading(true);
    setPasswordMessage('');
    setShowPasswordDialog(false);

    try {
      await apiClient.post('/api/v1/auth/password/change', {
        currentPassword,
        newPassword,
        newPasswordConfirm,
      } as ChangePasswordFormData);

      setPasswordMessage('パスワードを変更しました');

      // 変更の完了の後の処理（全デバイスからのログアウトなど）は呼び出し元が決める
      await onPasswordChanged();
    } catch (error) {
      console.error('Password change error:', error);
      // エラーレスポンスから詳細メッセージを取得
      const err = error as {
        response?: {
          detail?: string;
          details?: Array<{ path: string; message: string }>;
          error?: string;
        };
      };

      // RFC 7807 Problem Details形式のエラー処理
      if (err?.response?.details && err.response.details.length > 0) {
        const passwordError = err.response.details.find(
          (d) => d.path === 'newPassword' || d.path.includes('password')
        );
        if (passwordError) {
          setPasswordMessage(passwordError.message);
        } else {
          const firstError = err.response.details[0];
          if (firstError) {
            setPasswordMessage(firstError.message);
          }
        }
      } else if (err?.response?.detail) {
        setPasswordMessage(err.response.detail);
      } else if (err?.response?.error) {
        setPasswordMessage(err.response.error);
      } else {
        setPasswordMessage('パスワード変更に失敗しました');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <>
      {/* パスワード変更セクション */}
      <section aria-labelledby="password-change-heading">
        <h2
          id="password-change-heading"
          style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}
        >
          パスワード変更
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 現在のパスワード */}
          <div>
            <label
              htmlFor="currentPassword"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              現在のパスワード
            </label>
            <input
              type="password"
              id="currentPassword"
              aria-label="現在のパスワード"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                // 入力は 16px（モバイルのフォーカス時の自動拡大を抑える。steering「モバイルの下限値」）
                fontSize: '16px',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          {/* 新しいパスワード */}
          <div>
            <label
              htmlFor="newPassword"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              新しいパスワード
            </label>
            <input
              type="password"
              id="newPassword"
              aria-label="新しいパスワード"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                // 入力は 16px（モバイルのフォーカス時の自動拡大を抑える。steering「モバイルの下限値」）
                fontSize: '16px',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />

            {/* パスワード強度インジケーター */}
            {passwordStrength && (
              <PasswordStrengthIndicator
                result={passwordStrength.result}
                requirements={passwordStrength.requirements}
              />
            )}
          </div>

          {/* パスワード確認 */}
          <div>
            <label
              htmlFor="confirmPassword"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              id="confirmPassword"
              aria-label="パスワード確認"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                // 入力は 16px（モバイルのフォーカス時の自動拡大を抑える。steering「モバイルの下限値」）
                fontSize: '16px',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          {/* パスワード変更ボタン */}
          <button
            onClick={handleChangePasswordClick}
            disabled={passwordLoading}
            aria-label="パスワードを変更"
            style={{
              minHeight: `${TAP_TARGET_MIN_PX}px`,
              padding: '0.5rem 1rem',
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {passwordLoading ? 'パスワード変更中...' : 'パスワードを変更'}
          </button>

          {/* パスワード変更メッセージ */}
          {passwordMessage && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                padding: '0.75rem',
                borderRadius: '0.375rem',
                backgroundColor: passwordMessage.includes('失敗') ? '#fee2e2' : '#d1fae5',
                color: passwordMessage.includes('失敗') ? '#991b1b' : '#065f46',
              }}
            >
              {passwordMessage}
            </div>
          )}
        </div>
      </section>

      {/* パスワード変更確認ダイアログ */}
      {showPasswordDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-labelledby="password-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="password-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              パスワード変更の確認
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
              パスワードを変更すると、全デバイスからログアウトされます。続行しますか？
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPasswordDialog(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmPasswordChange}
                aria-label="はい、変更する"
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                はい、変更する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
