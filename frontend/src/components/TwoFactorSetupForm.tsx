import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import type {
  TwoFactorSetupResult,
  TwoFactorEnableResult,
  TwoFactorSetupStep,
} from '../types/two-factor.types';

interface TwoFactorSetupFormProps {
  onSetupStart: () => Promise<TwoFactorSetupResult>;
  onEnable: (totpCode: string) => Promise<TwoFactorEnableResult>;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * 二要素認証（2FA）設定フォーム
 *
 * 3ステップのウィザード形式で2FAを設定します：
 * 1. QRコード表示
 * 2. TOTP検証
 * 3. バックアップコード保存
 */
function TwoFactorSetupForm({
  onSetupStart,
  onEnable,
  onComplete,
  onCancel,
}: TwoFactorSetupFormProps) {
  const [currentStep, setCurrentStep] = useState<TwoFactorSetupStep>('qr-code');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesSaved, setBackupCodesSaved] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // セットアップ開始
  useEffect(() => {
    const initSetup = async () => {
      setIsLoading(true);
      setError('');
      try {
        const result = await onSetupStart();
        if (result.success) {
          setQrCodeDataUrl(result.data.qrCodeDataUrl);
          setSecret(result.data.secret);
        } else {
          setError(result.error);
        }
      } catch {
        setError('セットアップの初期化に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    initSetup();
  }, [onSetupStart]);

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

  // TOTP検証
  const handleVerifyTotp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = totpCode.join('');
    if (code.length !== 6) return;

    setIsLoading(true);
    setError('');
    try {
      const result = await onEnable(code);
      if (result.success) {
        setBackupCodes(result.data.backupCodes);
        setCurrentStep('backup-codes');
      } else {
        setError(result.error);
      }
    } catch {
      setError('検証に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // バックアップコードダウンロード
  const handleDownloadBackupCodes = () => {
    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'architrack-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // バックアップコードコピー
  const handleCopyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
    } catch {
      setError('クリップボードへのコピーに失敗しました');
    }
  };

  // 完了処理
  const handleComplete = () => {
    onComplete();
  };

  // ステップ番号取得
  const getStepNumber = (): number => {
    switch (currentStep) {
      case 'qr-code':
        return 1;
      case 'verify-totp':
        return 2;
      case 'backup-codes':
        return 3;
      default:
        return 1;
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      {/* プログレスバー */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: '#666' }}>ステップ {getStepNumber()}/3</p>
        <div
          style={{
            width: '100%',
            height: '4px',
            backgroundColor: '#e0e0e0',
            borderRadius: '2px',
          }}
        >
          <div
            style={{
              width: `${(getStepNumber() / 3) * 100}%`,
              height: '100%',
              backgroundColor: '#007bff',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

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

      {/* ローディング表示 */}
      {isLoading && currentStep === 'qr-code' && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #007bff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto',
            }}
          />
          <p style={{ marginTop: '16px', color: '#666' }}>初期化中...</p>
        </div>
      )}

      {/* Step 1: QRコード表示と検証 */}
      {currentStep === 'qr-code' && !isLoading && qrCodeDataUrl && (
        <form onSubmit={handleVerifyTotp}>
          <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
            認証アプリでQRコードをスキャン
          </h2>
          <p style={{ marginBottom: '20px', color: '#666' }}>
            Google AuthenticatorまたはAuthy等の認証アプリで、以下のQRコードをスキャンしてください。
          </p>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <img
              src={qrCodeDataUrl}
              alt="二要素認証用QRコード"
              style={{ maxWidth: '250px', width: '100%' }}
            />
          </div>

          <p style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
            秘密鍵（手動入力用）：
          </p>
          <div
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '14px',
              wordBreak: 'break-all',
              marginBottom: '20px',
            }}
          >
            {secret}
          </div>

          {/* 認証コード入力エリア */}
          <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
            認証コードを入力
          </h3>
          <p style={{ marginBottom: '12px', color: '#666', fontSize: '14px' }}>
            認証アプリに表示されている6桁のコードを入力してください。
          </p>

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
                  width: '40px',
                  height: '48px',
                  textAlign: 'center',
                  fontSize: '20px',
                  border: '2px solid #ccc',
                  borderRadius: '4px',
                  outline: 'none',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
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
              disabled={isLoading || totpCode.join('').length !== 6}
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                opacity: isLoading || totpCode.join('').length !== 6 ? 0.5 : 1,
              }}
            >
              {isLoading ? '検証中...' : '検証'}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: TOTP検証 */}
      {currentStep === 'verify-totp' && (
        <form onSubmit={handleVerifyTotp}>
          <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
            認証コードを入力
          </h2>
          <p style={{ marginBottom: '20px', color: '#666' }}>
            認証アプリに表示されている6桁のコードを入力してください。
          </p>

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

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setCurrentStep('qr-code')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#fff',
                color: '#333',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              戻る
            </button>
            <button
              type="submit"
              disabled={totpCode.join('').length !== 6 || isLoading}
              style={{
                padding: '10px 20px',
                backgroundColor: totpCode.join('').length === 6 && !isLoading ? '#007bff' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: totpCode.join('').length === 6 && !isLoading ? 'pointer' : 'not-allowed',
                fontSize: '14px',
              }}
            >
              {isLoading ? '検証中...' : '検証'}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: バックアップコード表示 */}
      {currentStep === 'backup-codes' && (
        <div>
          <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
            バックアップコードを保存
          </h2>
          <p style={{ marginBottom: '20px', color: '#666' }}>
            認証アプリにアクセスできない場合に使用できるバックアップコードです。安全な場所に保存してください。
          </p>

          <div
            style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                fontFamily: 'monospace',
                fontSize: '14px',
              }}
            >
              {backupCodes.map((code, index) => (
                <div key={index} style={{ padding: '4px' }}>
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <button
              type="button"
              onClick={handleDownloadBackupCodes}
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
              ダウンロード
            </button>
            <button
              type="button"
              onClick={handleCopyBackupCodes}
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
              コピー
            </button>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={backupCodesSaved}
              onChange={(e) => setBackupCodesSaved(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px' }}>バックアップコードを安全な場所に保存しました</span>
          </label>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleComplete}
              disabled={!backupCodesSaved}
              style={{
                padding: '10px 20px',
                backgroundColor: backupCodesSaved ? '#28a745' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: backupCodesSaved ? 'pointer' : 'not-allowed',
                fontSize: '14px',
              }}
            >
              完了
            </button>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default TwoFactorSetupForm;
