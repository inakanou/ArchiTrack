import { useState, useEffect } from 'react';
import type { SessionInfo } from '../types/auth.types';

interface SessionManagementProps {
  onFetchSessions: () => Promise<SessionInfo[]>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onDeleteAllSessions: () => Promise<void>;
}

/**
 * セッション管理コンポーネント
 *
 * アクティブなセッション（デバイス）の一覧表示、個別ログアウト、全デバイスログアウト機能を提供します。
 *
 * 要件8: セッション管理
 */
function SessionManagement({
  onFetchSessions,
  onDeleteSession,
  onDeleteAllSessions,
}: SessionManagementProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // セッション一覧を取得
  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoading(true);
      setError('');

      try {
        const data = await onFetchSessions();
        setSessions(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'セッション一覧の取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSessions();
  }, [onFetchSessions]);

  // 個別セッション削除
  const handleDeleteSession = async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    setError('');
    setSuccess('');

    try {
      await onDeleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSuccess('セッションを削除しました');

      // 成功メッセージを3秒後に非表示
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'セッションの削除に失敗しました');
    } finally {
      setDeletingSessionId(null);
    }
  };

  // 全デバイスログアウトボタンクリック
  const handleDeleteAllClick = () => {
    setShowDeleteAllDialog(true);
  };

  // 全デバイスログアウト確定
  const handleDeleteAllConfirm = async () => {
    setShowDeleteAllDialog(false);
    setError('');
    setIsLoading(true);

    try {
      await onDeleteAllSessions();
      // 全デバイスログアウト成功後、親コンポーネントがログイン画面へリダイレクト
    } catch (err) {
      setError(err instanceof Error ? err.message : '全デバイスログアウトに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 全デバイスログアウトキャンセル
  const handleDeleteAllCancel = () => {
    setShowDeleteAllDialog(false);
  };

  // デバイス情報の整形
  const formatDeviceInfo = (deviceInfo?: string): string => {
    if (!deviceInfo) return '不明なデバイス';

    // User-Agentから簡易的にデバイス情報を抽出
    // Note: iPhone, iPad, Androidのチェックを先に行う（これらのUser-Agentには'Mac'や'Linux'が含まれる場合がある）
    if (deviceInfo.includes('iPhone')) return 'iPhone';
    if (deviceInfo.includes('iPad')) return 'iPad';
    if (deviceInfo.includes('Android')) return 'Android';
    if (deviceInfo.includes('Windows')) return 'Windows PC';
    if (deviceInfo.includes('Mac')) return 'Mac';
    if (deviceInfo.includes('Linux')) return 'Linux PC';

    return deviceInfo.substring(0, 50) + (deviceInfo.length > 50 ? '...' : '');
  };

  // 日時の整形
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>セッション管理</h1>

      {/* エラー・成功メッセージ */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '12px',
            marginBottom: '16px',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            borderRadius: '4px',
            border: '1px solid #fecaca',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '12px',
            marginBottom: '16px',
            backgroundColor: '#f0fdf4',
            color: '#166534',
            borderRadius: '4px',
            border: '1px solid #bbf7d0',
          }}
        >
          {success}
        </div>
      )}

      {/* 全デバイスログアウトボタン */}
      <div style={{ marginBottom: '24px', textAlign: 'right' }}>
        <button
          onClick={handleDeleteAllClick}
          disabled={isLoading || sessions.length === 0}
          style={{
            padding: '10px 20px',
            backgroundColor: isLoading || sessions.length === 0 ? '#9ca3af' : '#dc2626',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: isLoading || sessions.length === 0 ? 'not-allowed' : 'pointer',
          }}
          aria-label="全デバイスからログアウト"
        >
          全デバイスからログアウト
        </button>
      </div>

      {/* ローディング表示 */}
      {isLoading && sessions.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            color: '#6b7280',
          }}
          role="status"
          aria-live="polite"
        >
          <div
            role="status"
            style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #2563eb',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <p style={{ marginTop: '16px' }}>セッション一覧を読み込み中...</p>
        </div>
      )}

      {/* セッション一覧 */}
      {!isLoading && sessions.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            color: '#6b7280',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
          }}
        >
          アクティブなセッションがありません
        </div>
      )}

      {!isLoading && sessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1 }}>
                  {/* デバイス情報 */}
                  <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                    {formatDeviceInfo(session.deviceInfo)}
                  </div>

                  {/* 作成日時 */}
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                    作成: {formatDate(session.createdAt)}
                  </div>

                  {/* 有効期限 */}
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    有効期限: {formatDate(session.expiresAt)}
                  </div>
                </div>

                {/* 削除ボタン */}
                <button
                  onClick={() => handleDeleteSession(session.id)}
                  disabled={deletingSessionId === session.id}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: deletingSessionId === session.id ? '#9ca3af' : '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: deletingSessionId === session.id ? 'not-allowed' : 'pointer',
                    marginLeft: '16px',
                  }}
                  aria-label={`${formatDeviceInfo(session.deviceInfo)}のセッションを削除`}
                >
                  {deletingSessionId === session.id ? '削除中...' : 'ログアウト'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 全デバイスログアウト確認ダイアログ */}
      {showDeleteAllDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-dialog-title"
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
            }}
          >
            <h3
              id="delete-all-dialog-title"
              style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}
            >
              全デバイスログアウトの確認
            </h3>
            <p style={{ marginBottom: '16px', color: '#4b5563' }}>
              全てのデバイスからログアウトします。続行してもよろしいですか？
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleDeleteAllCancel}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleDeleteAllConfirm}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      )}

      {/* アニメーション定義 */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default SessionManagement;
