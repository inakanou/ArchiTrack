/**
 * 監査ログ画面
 *
 * 要件22: 監査ログとコンプライアンス
 */

import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { AuditLog, AuditLogAction } from '../types/audit-log.types';

export function AuditLogs() {
  // 監査ログ一覧
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // フィルター状態
  const [actionFilter, setActionFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // ページネーション
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // モバイル判定
  const isMobile = window.innerWidth < 768;

  /**
   * 監査ログ一覧を取得
   */
  const fetchLogs = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.append('skip', String(page * pageSize));
      params.append('take', String(pageSize));

      if (actionFilter) {
        params.append('action', actionFilter);
      }
      if (startDate) {
        params.append('startDate', new Date(startDate).toISOString());
      }
      if (endDate) {
        params.append('endDate', new Date(endDate).toISOString());
      }

      const data = await apiClient.get<{ logs: AuditLog[] }>(
        `/api/v1/audit-logs?${params.toString()}`
      );
      setLogs(data.logs);
    } catch {
      setError('監査ログを取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, startDate, endDate]);

  /**
   * JSONエクスポート
   */
  const handleExport = async () => {
    setMessage('');

    try {
      const params = new URLSearchParams();
      if (actionFilter) {
        params.append('action', actionFilter);
      }
      if (startDate) {
        params.append('startDate', new Date(startDate).toISOString());
      }
      if (endDate) {
        params.append('endDate', new Date(endDate).toISOString());
      }

      const data = await apiClient.get<string>(`/api/v1/audit-logs/export?${params.toString()}`);

      // JSONダウンロード
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setMessage('エクスポートが完了しました');
    } catch {
      setMessage('エクスポートに失敗しました');
    }
  };

  /**
   * アクション種別の日本語表示
   */
  const getActionLabel = (action: AuditLogAction): string => {
    const labels: Record<AuditLogAction, string> = {
      ROLE_CREATED: 'ロール作成',
      ROLE_UPDATED: 'ロール更新',
      ROLE_DELETED: 'ロール削除',
      PERMISSION_ASSIGNED: '権限割り当て',
      PERMISSION_REVOKED: '権限削除',
      USER_ROLE_ASSIGNED: 'ユーザーロール割り当て',
      USER_ROLE_REVOKED: 'ユーザーロール削除',
      PERMISSION_CHECK_FAILED: '権限チェック失敗',
      LOGIN_SUCCESS: 'ログイン成功',
      LOGIN_FAILED: 'ログイン失敗',
      LOGOUT: 'ログアウト',
      PASSWORD_CHANGED: 'パスワード変更',
      TWO_FACTOR_ENABLED: '2FA有効化',
      TWO_FACTOR_DISABLED: '2FA無効化',
    };
    return labels[action] || action;
  };

  return (
    <div
      data-testid="audit-logs-container"
      className={isMobile ? 'mobile-optimized' : ''}
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: isMobile ? '1rem' : '2rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>監査ログ</h1>

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

      {/* フィルター */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '1rem',
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ flex: 1 }}>
          <label
            htmlFor="action-filter"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
          >
            イベント種別
          </label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
            }}
          >
            <option value="">全て</option>
            <option value="TWO_FACTOR_ENABLED">2FA有効化</option>
            <option value="TWO_FACTOR_DISABLED">2FA無効化</option>
            <option value="ROLE_CREATED">ロール作成</option>
            <option value="ROLE_UPDATED">ロール更新</option>
            <option value="ROLE_DELETED">ロール削除</option>
            <option value="USER_ROLE_ASSIGNED">ユーザーロール割り当て</option>
            <option value="USER_ROLE_REVOKED">ユーザーロール削除</option>
            <option value="LOGIN_SUCCESS">ログイン成功</option>
            <option value="LOGIN_FAILED">ログイン失敗</option>
            <option value="LOGOUT">ログアウト</option>
            <option value="PASSWORD_CHANGED">パスワード変更</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label
            htmlFor="start-date"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
          >
            開始日時
          </label>
          <input
            type="datetime-local"
            id="start-date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(0);
            }}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label
            htmlFor="end-date"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
          >
            終了日時
          </label>
          <input
            type="datetime-local"
            id="end-date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(0);
            }}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
            }}
          />
        </div>

        <div style={{ flex: 0, display: 'flex', alignItems: 'flex-end' }}>
          <button
            onClick={handleExport}
            aria-label="JSONエクスポート"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            JSONエクスポート
          </button>
        </div>
      </div>

      {/* ローディング */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>読み込み中...</div>
      )}

      {/* 監査ログ一覧 */}
      {!loading && logs.length > 0 && (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                overflow: 'hidden',
              }}
            >
              <thead style={{ backgroundColor: '#f3f4f6' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>日時</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>
                    イベント種別
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>実行者</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>対象</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>詳細</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    style={{
                      borderTop: '1px solid #e5e7eb',
                    }}
                  >
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {new Date(log.createdAt).toLocaleString('ja-JP')}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {getActionLabel(log.action)}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {log.actorEmail || log.actorId}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {log.targetName || log.targetId || '-'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {log.ipAddress && <div>IP: {log.ipAddress}</div>}
                      {log.before && <div>変更前: {JSON.stringify(log.before)}</div>}
                      {log.after && <div>変更後: {JSON.stringify(log.after)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '1rem',
              marginTop: '2rem',
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: page === 0 ? '#e5e7eb' : '#3b82f6',
                color: page === 0 ? '#9ca3af' : 'white',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              前へ
            </button>
            <span style={{ display: 'flex', alignItems: 'center', fontWeight: 500 }}>
              ページ {page + 1}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={logs.length < pageSize}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: logs.length < pageSize ? '#e5e7eb' : '#3b82f6',
                color: logs.length < pageSize ? '#9ca3af' : 'white',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: logs.length < pageSize ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {/* ログがない場合 */}
      {!loading && logs.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#6b7280',
            fontSize: '1rem',
          }}
        >
          監査ログがありません
        </div>
      )}
    </div>
  );
}
