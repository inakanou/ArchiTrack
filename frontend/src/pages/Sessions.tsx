/**
 * セッション管理画面
 *
 * 要件8: セッション管理
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../api/client';
import type { SessionInfo } from '../types/auth.types';

export function Sessions() {
  const { logout, isInitialized, isAuthenticated } = useAuth();

  // セッション一覧
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // 確認ダイアログ
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showLogoutAllDialog, setShowLogoutAllDialog] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // モバイル判定
  const isMobile = window.innerWidth < 768;

  // 現在のセッションID（最初のセッションと仮定）
  const currentSessionId = sessions?.length > 0 ? sessions[0]?.id : null;

  /**
   * セッション一覧を取得
   */
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await apiClient.get<{ sessions: SessionInfo[] }>('/api/v1/auth/sessions');
      setSessions(data.sessions);
    } catch {
      setError('セッション情報を取得できませんでした');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 認証状態の初期化が完了し、認証されている場合のみセッション一覧を取得
    if (isInitialized && isAuthenticated) {
      fetchSessions();
    } else if (isInitialized && !isAuthenticated) {
      // 認証されていない場合はローディングを解除
      setLoading(false);
    }
  }, [isInitialized, isAuthenticated, fetchSessions]);

  /**
   * 個別デバイスログアウトダイアログを表示
   */
  const handleLogoutClick = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setShowLogoutDialog(true);
  };

  /**
   * 個別デバイスログアウトを実行
   */
  const handleConfirmLogout = async () => {
    if (!selectedSessionId) return;

    setShowLogoutDialog(false);
    setMessage('');

    try {
      await apiClient.delete(`/api/v1/auth/sessions/${selectedSessionId}`);
      setMessage('デバイスをログアウトしました');

      // セッション一覧を再取得
      await fetchSessions();
      setSelectedSessionId(null);
    } catch {
      setMessage('ログアウトに失敗しました');
      setSelectedSessionId(null);
    }
  };

  /**
   * 全デバイスログアウトダイアログを表示
   */
  const handleLogoutAllClick = () => {
    setShowLogoutAllDialog(true);
  };

  /**
   * 全デバイスログアウトを実行
   */
  const handleConfirmLogoutAll = async () => {
    setShowLogoutAllDialog(false);
    setMessage('');

    try {
      await apiClient.post('/api/v1/auth/logout-all');

      // ログアウト処理
      logout();
    } catch {
      setMessage('全デバイスログアウトに失敗しました');
    }
  };

  return (
    <div
      data-testid="sessions-container"
      className={isMobile ? 'mobile-optimized' : ''}
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: isMobile ? '1rem' : '2rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>セッション管理</h1>

      {/* 戻るリンク - 要件28.35 */}
      <a
        href="/profile"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#3b82f6',
          textDecoration: 'underline',
          marginBottom: '1.5rem',
        }}
      >
        ← プロフィールに戻る
      </a>

      {/* エラーメッセージ */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {/* メッセージ */}
      {message && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: message.includes('失敗') ? '#fee2e2' : '#d1fae5',
            color: message.includes('失敗') ? '#991b1b' : '#065f46',
            marginBottom: '1rem',
          }}
        >
          {message}
        </div>
      )}

      {/* 全デバイスログアウトボタン */}
      {!loading && sessions?.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={handleLogoutAllClick}
            aria-label="全デバイスからログアウト"
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
            全デバイスからログアウト
          </button>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>読み込み中...</div>
      )}

      {/* セッション一覧 */}
      {!loading && sessions?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sessions.map((session) => {
            const isCurrentDevice = session.id === currentSessionId;

            return (
              <div
                key={session.id}
                style={{
                  padding: '1.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  backgroundColor: isCurrentDevice ? '#eff6ff' : 'white',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div>
                    {/* デバイス情報 */}
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      {session.deviceInfo || 'Unknown Device'}
                    </h3>

                    {/* 現在のデバイスバッジ */}
                    {isCurrentDevice && (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#2563eb',
                          color: 'white',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          marginBottom: '0.5rem',
                        }}
                      >
                        現在のデバイス
                      </span>
                    )}

                    {/* 作成日時 */}
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      作成日時: {new Date(session.createdAt).toLocaleString('ja-JP')}
                    </p>

                    {/* 有効期限 */}
                    <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      有効期限: {new Date(session.expiresAt).toLocaleString('ja-JP')}
                    </p>
                  </div>

                  {/* ログアウトボタン（現在のデバイス以外） */}
                  {!isCurrentDevice && (
                    <button
                      onClick={() => handleLogoutClick(session.id)}
                      aria-label="ログアウト"
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                      }}
                    >
                      ログアウト
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* セッションがない場合 */}
      {!loading && sessions?.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#6b7280',
            fontSize: '1rem',
          }}
        >
          アクティブなセッションがありません
        </div>
      )}

      {/* 個別ログアウト確認ダイアログ */}
      {showLogoutDialog && (
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
            aria-labelledby="logout-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="logout-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              ログアウト確認
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              このデバイスをログアウトしますか？
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowLogoutDialog(false)}
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
                onClick={handleConfirmLogout}
                aria-label="はい"
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
                はい、ログアウト
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全デバイスログアウト確認ダイアログ */}
      {showLogoutAllDialog && (
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
            aria-labelledby="logout-all-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="logout-all-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              全デバイスログアウト確認
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              全てのデバイスからログアウトしますか？ログイン画面に戻ります。
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowLogoutAllDialog(false)}
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
                onClick={handleConfirmLogoutAll}
                aria-label="はい、全デバイスからログアウト"
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
                はい、全デバイスからログアウト
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
