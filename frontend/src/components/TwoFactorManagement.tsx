import { useState, FormEvent } from 'react';
import type {
  BackupCodeInfo,
  RegenerateBackupCodesResultType,
  DisableTwoFactorResult,
} from '../types/two-factor.types';

interface TwoFactorManagementProps {
  backupCodes: BackupCodeInfo[];
  onRegenerateBackupCodes: () => Promise<RegenerateBackupCodesResultType>;
  onDisableTwoFactor: (password: string) => Promise<DisableTwoFactorResult>;
  onDisableSuccess: () => void;
}

/**
 * 二要素認証（2FA）管理コンポーネント
 *
 * バックアップコードの表示・再生成、2FAの無効化を行います。
 */
function TwoFactorManagement({
  backupCodes,
  onRegenerateBackupCodes,
  onDisableTwoFactor,
  onDisableSuccess,
}: TwoFactorManagementProps) {
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showNewCodes, setShowNewCodes] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 残りのバックアップコード数
  const remainingCount = backupCodes.filter((code) => !code.isUsed).length;

  // 再生成確認ダイアログを開く
  const handleOpenRegenerateDialog = () => {
    setShowRegenerateDialog(true);
    setError('');
  };

  // 再生成確認
  const handleConfirmRegenerate = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await onRegenerateBackupCodes();
      if (result.success) {
        setNewBackupCodes(result.data.backupCodes);
        setShowRegenerateDialog(false);
        setShowNewCodes(true);
      } else {
        setError(result.error);
      }
    } catch {
      setError('バックアップコードの再生成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 新しいバックアップコードをダウンロード
  const handleDownloadNewCodes = () => {
    const content = newBackupCodes.join('\n');
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

  // 新しいバックアップコードをコピー
  const handleCopyNewCodes = async () => {
    try {
      await navigator.clipboard.writeText(newBackupCodes.join('\n'));
    } catch {
      setError('クリップボードへのコピーに失敗しました');
    }
  };

  // 無効化確認ダイアログを開く
  const handleOpenDisableDialog = () => {
    setShowDisableDialog(true);
    setPassword('');
    setError('');
  };

  // 無効化実行
  const handleConfirmDisable = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password) {
      setError('パスワードを入力してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await onDisableTwoFactor(password);
      if (result.success) {
        setShowDisableDialog(false);
        onDisableSuccess();
      } else {
        setError(result.error);
      }
    } catch {
      setError('2FAの無効化に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
        二要素認証（2FA）管理
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

      {/* バックアップコード一覧 */}
      {!showNewCodes && (
        <>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
              バックアップコード（残り{remainingCount}個）
            </h3>

            {/* 警告メッセージ（残り3個以下） */}
            {remainingCount <= 3 && (
              <div
                style={{
                  padding: '12px',
                  marginBottom: '12px',
                  backgroundColor: '#fff3cd',
                  color: '#856404',
                  border: '1px solid #ffeeba',
                  borderRadius: '4px',
                }}
              >
                バックアップコードの残りが少なくなっています。再生成をお勧めします。
              </div>
            )}

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
                  <div
                    key={index}
                    style={{
                      padding: '4px',
                      textDecoration: code.isUsed ? 'line-through' : 'none',
                      color: code.isUsed ? '#525b6a' : '#000', // WCAG 2.1 AA準拠 (5.5:1 on #f5f5f5)
                    }}
                    aria-label={code.isUsed ? '使用済み' : undefined}
                  >
                    {code.code}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenRegenerateDialog}
              style={{
                padding: '10px 20px',
                backgroundColor: '#0056b3', // WCAG 2.1 AA準拠 (4.6:1 on #fff)
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                marginBottom: '20px',
              }}
            >
              バックアップコードを再生成
            </button>
          </div>

          {/* 2FA無効化 */}
          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
              二要素認証を無効化
            </h3>
            <p style={{ marginBottom: '12px', color: '#5c5c5c', fontSize: '14px' }}>
              無効化すると、すべてのデバイスからログアウトされます。
            </p>
            <button
              type="button"
              onClick={handleOpenDisableDialog}
              style={{
                padding: '10px 20px',
                backgroundColor: '#dc3545',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              2FAを無効化
            </button>
          </div>
        </>
      )}

      {/* 新しいバックアップコード表示 */}
      {showNewCodes && (
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
            新しいバックアップコード
          </h3>
          <p style={{ marginBottom: '20px', color: '#5c5c5c' }}>
            新しいバックアップコードが生成されました。安全な場所に保存してください。
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
              {newBackupCodes.map((code, index) => (
                <div key={index} style={{ padding: '4px' }}>
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <button
              type="button"
              onClick={handleDownloadNewCodes}
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
              onClick={handleCopyNewCodes}
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

          <button
            type="button"
            onClick={() => setShowNewCodes(false)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0056b3', // WCAG 2.1 AA準拠 (4.6:1 on #fff)
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            閉じる
          </button>
        </div>
      )}

      {/* 再生成確認ダイアログ */}
      {showRegenerateDialog && (
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
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
              バックアップコード再生成の確認
            </h3>
            <p style={{ marginBottom: '20px', color: '#5c5c5c' }}>
              既存のバックアップコードはすべて無効になります。新しいコードを生成しますか？
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowRegenerateDialog(false)}
                disabled={isLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#fff',
                  color: '#333',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerate}
                disabled={isLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isLoading ? '#ccc' : '#0056b3', // WCAG 2.1 AA準拠 (4.6:1 on #fff)
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {isLoading ? '生成中...' : '確認'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 無効化確認ダイアログ */}
      {showDisableDialog && (
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
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
              2FA無効化の確認
            </h3>
            <form onSubmit={handleConfirmDisable}>
              <p style={{ marginBottom: '16px', color: '#5c5c5c' }}>
                本人確認のため、パスワードを入力してください。
              </p>
              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="password-input"
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                  }}
                >
                  パスワード
                </label>
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '16px',
                    border: '2px solid #ccc',
                    borderRadius: '4px',
                  }}
                  aria-label="パスワード"
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowDisableDialog(false)}
                  disabled={isLoading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#fff',
                    color: '#333',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !password}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: isLoading || !password ? '#ccc' : '#dc3545',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading || !password ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  {isLoading ? '無効化中...' : '無効化する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TwoFactorManagement;
