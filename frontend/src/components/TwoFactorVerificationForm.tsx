import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import type { VerifyTOTPResult, VerifyBackupCodeResult } from '../types/two-factor.types';

interface TwoFactorVerificationFormProps {
  onVerifyTOTP: (totpCode: string) => Promise<VerifyTOTPResult>;
  onVerifyBackupCode: (backupCode: string) => Promise<VerifyBackupCodeResult>;
  onCancel: () => void;
  disableTimer?: boolean; // テスト用: タイマーを無効化
}

/**
 * 二要素認証（2FA）ログイン検証フォーム
 *
 * TOTPコードまたはバックアップコードを入力して認証します。
 */
function TwoFactorVerificationForm({
  onVerifyTOTP,
  onVerifyBackupCode,
  onCancel,
  disableTimer = false,
}: TwoFactorVerificationFormProps) {
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const backupCodeRef = useRef<HTMLInputElement>(null);

  // 30秒カウントダウンタイマー
  useEffect(() => {
    if (disableTimer) return; // テスト時はタイマーを無効化

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          return 30; // リセット
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [disableTimer]);

  // モード切り替え時の初期化
  useEffect(() => {
    setError('');
    setTotpCode(['', '', '', '', '', '']);
    setBackupCode('');
    if (useBackupCode) {
      backupCodeRef.current?.focus();
    } else {
      inputRefs.current[0]?.focus();
    }
  }, [useBackupCode]);

  // TOTP入力の変更処理
  const handleTotpChange = (index: number, value: string) => {
    // 数字のみ許可
    const numericValue = value.replace(/\D/g, '');
    if (numericValue.length > 1) return;

    const newCode = [...totpCode];
    newCode[index] = numericValue;
    setTotpCode(newCode);

    // 自動タブ移動
    if (numericValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // ペースト処理
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '');
    if (pasteData.length !== 6) return;

    const newCode = pasteData.split('').slice(0, 6);
    setTotpCode(newCode);

    // 最後のフィールドにフォーカス
    inputRefs.current[5]?.focus();
  };

  // Backspaceキー処理
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !totpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // 検証処理
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (useBackupCode) {
        // バックアップコード検証
        if (!backupCode) {
          setError('バックアップコードを入力してください');
          setIsLoading(false);
          return;
        }

        const result = await onVerifyBackupCode(backupCode);
        if (!result.success) {
          setError(result.error || 'バックアップコードの検証に失敗しました');
        }
      } else {
        // TOTP検証
        const code = totpCode.join('');
        if (code.length !== 6) {
          setError('6桁の認証コードを入力してください');
          setIsLoading(false);
          return;
        }

        const result = await onVerifyTOTP(code);
        if (!result.success) {
          setError(result.error || '認証コードの検証に失敗しました');
        }
      }
    } catch {
      setError('検証に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // プログレスバーの幅（0-100%）
  const progressWidth = (timeRemaining / 30) * 100;

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
      <h2
        style={{ marginBottom: '20px', fontSize: '20px', fontWeight: 'bold', textAlign: 'center' }}
      >
        二要素認証
      </h2>

      {/* エラーメッセージ */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {!useBackupCode ? (
          <>
            {/* TOTPモード */}
            <p style={{ marginBottom: '12px', color: '#666', textAlign: 'center' }}>
              認証アプリに表示されている6桁のコードを入力してください。
            </p>

            {/* カウントダウンタイマー */}
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: timeRemaining <= 10 ? '#dc3545' : '#0056b3',
                  marginBottom: '8px',
                }}
              >
                {timeRemaining}秒
              </div>
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressWidth}%`,
                    height: '100%',
                    backgroundColor: timeRemaining <= 10 ? '#dc3545' : '#0056b3',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>

            {/* 6桁入力フィールド */}
            <div
              role="group"
              aria-label="認証コード入力"
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              {totpCode.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleTotpChange(index, e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  aria-label={`認証コード ${index + 1}桁目`}
                  style={{
                    width: '48px',
                    height: '56px',
                    textAlign: 'center',
                    fontSize: '24px',
                    border: '2px solid #ccc',
                    borderRadius: '4px',
                    outline: 'none',
                  }}
                />
              ))}
            </div>

            {/* バックアップコード切り替えリンク */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setUseBackupCode(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0056b3',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                バックアップコードを使用する
              </button>
            </div>
          </>
        ) : (
          <>
            {/* バックアップコードモード */}
            <p style={{ marginBottom: '12px', color: '#666' }}>
              8文字のバックアップコードを入力してください。
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="backup-code"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                バックアップコード
              </label>
              <input
                ref={backupCodeRef}
                id="backup-code"
                type="text"
                value={backupCode}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setBackupCode(e.target.value.toUpperCase())
                }
                maxLength={8}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '16px',
                  border: '2px solid #ccc',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                }}
                aria-label="バックアップコード"
              />
            </div>

            {/* TOTP切り替えリンク */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setUseBackupCode(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0056b3',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                認証コードを使用する
              </button>
            </div>
          </>
        )}

        {/* ボタン */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 20px',
              backgroundColor: '#fff',
              color: '#333',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={
              isLoading ||
              (!useBackupCode && totpCode.join('').length !== 6) ||
              (useBackupCode && !backupCode)
            }
            style={{
              flex: 1,
              padding: '10px 20px',
              backgroundColor:
                !isLoading &&
                ((!useBackupCode && totpCode.join('').length === 6) ||
                  (useBackupCode && backupCode))
                  ? '#0056b3'
                  : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor:
                !isLoading &&
                ((!useBackupCode && totpCode.join('').length === 6) ||
                  (useBackupCode && backupCode))
                  ? 'pointer'
                  : 'not-allowed',
              fontSize: '14px',
            }}
          >
            {isLoading ? '検証中...' : '検証'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default TwoFactorVerificationForm;
