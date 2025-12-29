/**
 * AuditLogViewer コンポーネント
 *
 * 監査ログ閲覧機能を提供します。
 * - 監査ログ一覧表示
 * - フィルタリング機能
 * - JSONエクスポート機能
 */

import React, { useState } from 'react';
import type { AuditLog, AuditLogFilter, AuditLogAction } from '../types/audit-log.types';

interface AuditLogViewerProps {
  /** 監査ログリスト */
  logs: AuditLog[];
  /** ローディング状態 */
  loading: boolean;
  /** エラーメッセージ */
  error?: string;
  /** エクスポートコールバック */
  onExport?: (filter: AuditLogFilter) => Promise<void>;
}

const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs, loading, error, onExport }) => {
  const [filter, setFilter] = useState<AuditLogFilter>({});
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!onExport) return;
    setExporting(true);
    try {
      await onExport(filter);
    } catch (err) {
      console.error('エクスポートに失敗しました', err);
    } finally {
      setExporting(false);
    }
  };

  // アクション種別のローカライズ
  const getActionText = (action: AuditLogAction): string => {
    const actionTexts: Record<AuditLogAction, string> = {
      ROLE_CREATED: 'ロール作成',
      ROLE_UPDATED: 'ロール更新',
      ROLE_DELETED: 'ロール削除',
      PERMISSION_ASSIGNED: '権限割り当て',
      PERMISSION_REVOKED: '権限取り消し',
      USER_ROLE_ASSIGNED: 'ユーザーロール割り当て',
      USER_ROLE_REVOKED: 'ユーザーロール取り消し',
      PERMISSION_CHECK_FAILED: '権限チェック失敗',
      LOGIN_SUCCESS: 'ログイン成功',
      LOGIN_FAILED: 'ログイン失敗',
      LOGOUT: 'ログアウト',
      PASSWORD_CHANGED: 'パスワード変更',
      TWO_FACTOR_ENABLED: '2FA有効化',
      TWO_FACTOR_DISABLED: '2FA無効化',
    };
    return actionTexts[action] || action;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>監査ログ</h1>

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '12px 16px',
            borderRadius: '4px',
            marginBottom: '20px',
          }}
        >
          {error}
        </div>
      )}

      {/* フィルター */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr auto',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <div>
            <label
              htmlFor="filter-actor"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}
            >
              実行者ID
            </label>
            <input
              id="filter-actor"
              type="text"
              aria-label="実行者IDフィルター"
              value={filter.actorId || ''}
              onChange={(e) => setFilter({ ...filter, actorId: e.target.value || undefined })}
              placeholder="ユーザーID"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label
              htmlFor="filter-start-date"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}
            >
              開始日時
            </label>
            <input
              id="filter-start-date"
              type="date"
              aria-label="開始日時フィルター"
              value={filter.startDate || ''}
              onChange={(e) => setFilter({ ...filter, startDate: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label
              htmlFor="filter-end-date"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}
            >
              終了日時
            </label>
            <input
              id="filter-end-date"
              type="date"
              aria-label="終了日時フィルター"
              value={filter.endDate || ''}
              onChange={(e) => setFilter({ ...filter, endDate: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              backgroundColor: exporting ? '#ccc' : '#1565c0',
              color: '#fff',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: exporting ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {exporting ? 'エクスポート中...' : 'JSONエクスポート'}
          </button>
        </div>
      </div>

      {/* 監査ログ一覧 */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'auto',
        }}
      >
        {loading ? (
          <div
            style={{ padding: '40px', textAlign: 'center' }}
            role="status"
            aria-label="読み込み中"
          >
            読み込み中...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#5c5c5c' }}>
            監査ログがありません
          </div>
        ) : (
          <table role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                >
                  日時
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                >
                  実行者
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                >
                  アクション
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                >
                  対象リソース
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                >
                  IPアドレス
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    {new Date(log.createdAt).toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    {log.actorEmail || log.actorId}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <span
                      style={{
                        backgroundColor: '#e3f2fd',
                        color: '#1565c0',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      {getActionText(log.action)}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    {log.targetType && log.targetId ? (
                      <div>
                        <div style={{ fontWeight: '500' }}>{log.targetType}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {log.targetName || log.targetId}
                        </div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#666' }}>
                    {log.ipAddress || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditLogViewer;
