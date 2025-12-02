import React, { useState } from 'react';
import type { Session, DeleteSessionResult, DeleteAllSessionsResult } from '../types/session.types';

interface SessionManagerProps {
  sessions: Session[];
  onDeleteSession: (sessionId: string) => Promise<DeleteSessionResult>;
  onDeleteAllSessions: () => Promise<DeleteAllSessionsResult>;
  isLoading?: boolean;
}

const SessionManager: React.FC<SessionManagerProps> = ({
  sessions,
  onDeleteSession,
  onDeleteAllSessions,
  isLoading = false,
}) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [isAllSessionsDelete, setIsAllSessionsDelete] = useState(false);
  const [message, setMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteSessionClick = (session: Session) => {
    setSessionToDelete(session);
    setIsAllSessionsDelete(false);
    setShowConfirmDialog(true);
  };

  const handleDeleteAllSessionsClick = () => {
    setSessionToDelete(null);
    setIsAllSessionsDelete(true);
    setShowConfirmDialog(true);
  };

  const handleConfirmDelete = async () => {
    setShowConfirmDialog(false);
    setIsDeleting(true);
    setMessage('');

    try {
      if (isAllSessionsDelete) {
        const result = await onDeleteAllSessions();
        setMessage(result.message);
      } else if (sessionToDelete) {
        const result = await onDeleteSession(sessionToDelete.id);
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'セッション削除に失敗しました');
    } finally {
      setIsDeleting(false);
      setSessionToDelete(null);
      setIsAllSessionsDelete(false);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmDialog(false);
    setSessionToDelete(null);
    setIsAllSessionsDelete(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <span aria-label="読み込み中">読み込み中...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h2>セッション管理</h2>

      {message && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            marginBottom: '20px',
            padding: '10px',
            backgroundColor: message.includes('失敗') ? '#f44336' : '#4caf50',
            color: 'white',
            borderRadius: '4px',
          }}
        >
          {message}
        </div>
      )}

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          アクティブなセッションはありません
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '15px',
                  backgroundColor: session.isCurrent ? '#e3f2fd' : 'white',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <strong>{session.deviceInfo}</strong>
                    {session.isCurrent && (
                      <span
                        style={{
                          marginLeft: '10px',
                          padding: '3px 8px',
                          backgroundColor: '#2196f3',
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        現在のセッション
                      </span>
                    )}
                  </div>
                  {!session.isCurrent && (
                    <button
                      aria-label={`${session.deviceInfo}からログアウト`}
                      onClick={() => handleDeleteSessionClick(session)}
                      disabled={isDeleting}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isDeleting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      ログアウト
                    </button>
                  )}
                </div>

                <div style={{ fontSize: '14px', color: '#666' }}>
                  <div>IP: {session.ipAddress || '不明'}</div>
                  <div>作成日時: {formatDate(session.createdAt)}</div>
                  {session.lastActivityAt && (
                    <div>最終アクティビティ: {formatDate(session.lastActivityAt)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            aria-label="全デバイスからログアウト"
            onClick={handleDeleteAllSessionsClick}
            disabled={isDeleting}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
          >
            全デバイスログアウト
          </button>
        </>
      )}

      {/* 削除確認ダイアログ */}
      {showConfirmDialog && (
        <>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              minWidth: '300px',
            }}
          >
            <h3 id="dialog-title">
              {isAllSessionsDelete ? '全デバイスログアウトの確認' : 'ログアウトの確認'}
            </h3>
            <p>
              {isAllSessionsDelete
                ? '全てのデバイスからログアウトしますか？'
                : `このデバイス（${sessionToDelete?.deviceInfo}）をログアウトしますか？`}
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleConfirmDelete}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                確認
              </button>
              <button
                onClick={handleCancelDelete}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#9e9e9e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>

          {/* モーダル背景 */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999,
            }}
            onClick={handleCancelDelete}
          />
        </>
      )}
    </div>
  );
};

export default SessionManager;
