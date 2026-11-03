import { useState, type Ref } from 'react';

interface TwoFactorBackupCodesProps {
  /** 表示するバックアップコード（この表示が最後の確認の機会） */
  backupCodes: string[];
  /** 保存の確認の後の「完了」 */
  onComplete: () => void;
  /** クリップボードへのコピーの失敗（表示は呼び出し元のエラーの領域が担う） */
  onCopyError: (message: string) => void;
  /** 段階の切り替えで見出しへフォーカスを移すときの参照（指定したときだけ見出しをフォーカス可能にする） */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** 操作の釦の共通の見た目（タップの的を 44px 以上にする） */
const actionButtonStyle = {
  flex: '1 1 auto',
  minHeight: '44px',
  padding: '10px 20px',
  backgroundColor: '#fff',
  color: '#333',
  border: '1px solid #ccc',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
} as const;

/**
 * 2FA のバックアップコードの表示と保存（ダウンロード・印刷・コピー）
 *
 * 2FA の新規の設定（TwoFactorSetupForm）と認証アプリの変更（TwoFactorReenrollForm、要件34.11）の
 * 最後の段階で共通に使う。保存したことの確認の後に「完了」を押せる。
 */
function TwoFactorBackupCodes({
  backupCodes,
  onComplete,
  onCopyError,
  headingRef,
}: TwoFactorBackupCodesProps) {
  const [backupCodesSaved, setBackupCodesSaved] = useState(false);

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
      onCopyError('クリップボードへのコピーに失敗しました');
    }
  };

  // バックアップコード印刷
  const handlePrintBackupCodes = () => {
    const printContent = `
      <html>
        <head>
          <title>ArchiTrack バックアップコード</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 20px; }
            .code { padding: 8px 0; font-size: 16px; }
            .warning { color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>ArchiTrack バックアップコード</h1>
          ${backupCodes.map((code) => `<div class="code">${code}</div>`).join('')}
          <p class="warning">※ このコードは安全な場所に保管してください。</p>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div>
      <h2
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        style={{ marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}
      >
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
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '8px',
            fontFamily: 'monospace',
            fontSize: '14px',
          }}
        >
          {backupCodes.map((code, index) => (
            <div
              key={index}
              data-testid="backup-code-item"
              style={{ padding: '4px', fontFamily: 'monospace', overflowWrap: 'anywhere' }}
            >
              {code}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <button type="button" onClick={handleDownloadBackupCodes} style={actionButtonStyle}>
          ダウンロード
        </button>
        <button type="button" onClick={handlePrintBackupCodes} style={actionButtonStyle}>
          印刷
        </button>
        <button type="button" onClick={handleCopyBackupCodes} style={actionButtonStyle}>
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
          onClick={onComplete}
          disabled={!backupCodesSaved}
          style={{
            minHeight: '44px',
            padding: '10px 20px',
            backgroundColor: backupCodesSaved ? '#1e7e34' : '#ccc', // WCAG 2.1 AA準拠
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
  );
}

export default TwoFactorBackupCodes;
