import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import TwoFactorBackupCodes from './TwoFactorBackupCodes';
import type {
  TwoFactorReenrollConfirmResult,
  TwoFactorReenrollStartResult,
  TwoFactorReenrollStep,
} from '../types/two-factor.types';

interface TwoFactorReenrollFormProps {
  /** 現在の認証アプリのコードで再登録を始め、新しい秘密鍵を受け取る */
  onStart: (currentCode: string) => Promise<TwoFactorReenrollStartResult>;
  /** 新しい認証アプリのコードで再登録を確かめ、新しいバックアップコードを受け取る */
  onConfirm: (newCode: string) => Promise<TwoFactorReenrollConfirmResult>;
  onComplete: () => void;
  onCancel: () => void;
}

/** 手順の総数（現在のコード → 新しい QR → 新しいコード → 新しいバックアップコード） */
const TOTAL_STEPS = 4;

const STEP_NUMBERS: Record<TwoFactorReenrollStep, number> = {
  'current-code': 1,
  'new-qr': 2,
  'new-code': 3,
  'backup-codes': 4,
};

/** TOTP コードの桁数 */
const CODE_LENGTH = 6;

const headingStyle = { marginBottom: '16px', fontSize: '20px', fontWeight: 'bold' } as const;

const descriptionStyle = { marginBottom: '16px', color: '#4b5563', fontSize: '14px' } as const;

/** 入力欄（16px 未満の文字は iOS で拡大を招くため 16px にする。高さは 44px 以上） */
const codeInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '48px',
  padding: '10px 12px',
  fontSize: '16px',
  fontFamily: 'monospace',
  letterSpacing: '0.3em',
  textAlign: 'center',
  border: '2px solid #ccc',
  borderRadius: '4px',
} as const;

const secondaryButtonStyle = {
  minHeight: '44px',
  padding: '10px 20px',
  backgroundColor: '#fff',
  color: '#333',
  border: '1px solid #ccc',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
} as const;

function primaryButtonStyle(disabled: boolean) {
  return {
    minHeight: '44px',
    padding: '10px 20px',
    backgroundColor: '#0056b3', // WCAG 2.1 AA準拠
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    opacity: disabled ? 0.5 : 1,
  } as const;
}

const buttonRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  justifyContent: 'flex-end',
} as const;

/** 入力から数字だけを残し、桁数で切る */
function normalizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

/**
 * 2FA の再登録（認証アプリの変更）のフォーム（要件34.11）
 *
 * 2FA 登録済みの利用者が、スマートフォンの機種変更などで認証アプリを移すための 4 段階の手順:
 * 1. 現在の認証アプリのコードを入力する（再登録の開始）
 * 2. 新しい QR コードと手入力用の秘密鍵を表示する
 * 3. 新しい認証アプリのコードを入力する（再登録の確認）
 * 4. 新しいバックアップコードを表示する
 *
 * 確認が成功するまでは、現在の認証アプリのコードとバックアップコードが有効のまま残る。
 * 段階が切り替わるたびに、その段階の見出しへフォーカスを移す。
 */
function TwoFactorReenrollForm({
  onStart,
  onConfirm,
  onComplete,
  onCancel,
}: TwoFactorReenrollFormProps) {
  const [step, setStep] = useState<TwoFactorReenrollStep>('current-code');
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  // 最初の表示ではフォーカスを動かさない（段階の切り替えのときだけ見出しへ移す）
  const hasMovedStepRef = useRef(false);
  const idPrefix = useId();
  const errorId = `${idPrefix}-error`;
  const currentCodeId = `${idPrefix}-current-code`;
  const newCodeId = `${idPrefix}-new-code`;

  useEffect(() => {
    if (!hasMovedStepRef.current) {
      hasMovedStepRef.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const moveTo = (next: TwoFactorReenrollStep) => {
    setError('');
    setStep(next);
  };

  // 1. 現在のコードで再登録を始める
  const handleStart = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentCode.length !== CODE_LENGTH || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    try {
      const result = await onStart(currentCode);
      if (result.success) {
        setQrCodeDataUrl(result.data.qrCodeDataUrl);
        setSecret(result.data.secretForManualEntry);
        setCurrentCode('');
        moveTo('new-qr');
      } else {
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. 新しいコードで再登録を確かめる
  const handleConfirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newCode.length !== CODE_LENGTH || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    try {
      const result = await onConfirm(newCode);
      if (result.success) {
        setBackupCodes(result.data.backupCodes);
        setNewCode('');
        moveTo('backup-codes');
      } else if (result.restart) {
        // 再登録が開始されていないため、現在のコードの入力からやり直す（エラーは残して理由を示す）
        setNewCode('');
        setQrCodeDataUrl('');
        setSecret('');
        setStep('current-code');
        setError(result.error);
      } else {
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepNumber = STEP_NUMBERS[step];

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', minWidth: 0 }}>
      <h2 style={{ marginBottom: '8px', fontSize: '22px', fontWeight: 'bold' }}>
        認証アプリを変更する
      </h2>

      {/* プログレスバー */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: '#4b5563' }}>
          ステップ {stepNumber}/{TOTAL_STEPS}
        </p>
        <div
          role="progressbar"
          aria-label="認証アプリの変更の進み具合"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={stepNumber}
          style={{ width: '100%', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}
        >
          <div
            style={{
              width: `${(stepNumber / TOTAL_STEPS) * 100}%`,
              height: '100%',
              backgroundColor: '#0056b3', // WCAG 2.1 AA準拠
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* エラーメッセージ（入力欄の説明としても結び付ける） */}
      {error && (
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          style={{
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            overflowWrap: 'anywhere',
          }}
        >
          {error}
        </div>
      )}

      {/* Step 1: 現在のコードの入力 */}
      {step === 'current-code' && (
        <form onSubmit={handleStart} noValidate>
          <h3 ref={headingRef} tabIndex={-1} style={headingStyle}>
            現在の認証コードを入力
          </h3>
          <p style={descriptionStyle}>
            本人の確認のため、いま使っている認証アプリに表示されている6桁のコードを入力してください。新しい認証アプリの登録が終わるまでは、いまの認証アプリとバックアップコードを引き続き使えます。
          </p>
          <label
            htmlFor={currentCodeId}
            style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}
          >
            現在の認証コード
          </label>
          <input
            id={currentCodeId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={currentCode}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setCurrentCode(normalizeCode(e.target.value))
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            style={{ ...codeInputStyle, marginBottom: '20px' }}
          />
          <div style={buttonRowStyle}>
            <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting || currentCode.length !== CODE_LENGTH}
              style={primaryButtonStyle(isSubmitting || currentCode.length !== CODE_LENGTH)}
            >
              {isSubmitting ? '確認中...' : '次へ'}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: 新しい QR コードの表示 */}
      {step === 'new-qr' && (
        <div>
          <h3 ref={headingRef} tabIndex={-1} style={headingStyle}>
            新しい認証アプリでQRコードをスキャン
          </h3>
          <p style={descriptionStyle}>
            新しい認証アプリで、以下のQRコードをスキャンしてください。スキャンできないときは、秘密鍵を手で入力してください。
          </p>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <img
              src={qrCodeDataUrl}
              alt="新しい認証アプリ用の二要素認証QRコード"
              style={{ maxWidth: '250px', width: '100%' }}
            />
          </div>
          <p style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
            秘密鍵（手動入力用）：
          </p>
          <div
            data-testid="reenroll-secret-key"
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '14px',
              overflowWrap: 'anywhere',
              wordBreak: 'break-all',
              marginBottom: '20px',
            }}
          >
            {secret}
          </div>
          <div style={buttonRowStyle}>
            <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => moveTo('new-code')}
              style={primaryButtonStyle(false)}
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 新しいコードの入力 */}
      {step === 'new-code' && (
        <form onSubmit={handleConfirm} noValidate>
          <h3 ref={headingRef} tabIndex={-1} style={headingStyle}>
            新しい認証コードを入力
          </h3>
          <p style={descriptionStyle}>
            新しい認証アプリに表示されている6桁のコードを入力してください。確認が終わると、いまの認証アプリと以前のバックアップコードは使えなくなります。
          </p>
          <label
            htmlFor={newCodeId}
            style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}
          >
            新しい認証アプリの認証コード
          </label>
          <input
            id={newCodeId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={newCode}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setNewCode(normalizeCode(e.target.value))
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            style={{ ...codeInputStyle, marginBottom: '20px' }}
          />
          <div style={buttonRowStyle}>
            <button type="button" onClick={() => moveTo('new-qr')} style={secondaryButtonStyle}>
              戻る
            </button>
            <button
              type="submit"
              disabled={isSubmitting || newCode.length !== CODE_LENGTH}
              style={primaryButtonStyle(isSubmitting || newCode.length !== CODE_LENGTH)}
            >
              {isSubmitting ? '確認中...' : '確認'}
            </button>
          </div>
        </form>
      )}

      {/* Step 4: 新しいバックアップコードの表示 */}
      {step === 'backup-codes' && (
        <div>
          <p
            role="status"
            style={{
              padding: '12px',
              marginBottom: '20px',
              backgroundColor: '#d1fae5',
              color: '#065f46',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            認証アプリを変更しました。以前のバックアップコードは使えなくなりました。
          </p>
          <TwoFactorBackupCodes
            backupCodes={backupCodes}
            onComplete={onComplete}
            onCopyError={setError}
            headingRef={headingRef}
          />
        </div>
      )}
    </div>
  );
}

export default TwoFactorReenrollForm;
