/**
 * InvitationManager コンポーネント
 *
 * ユーザー招待管理機能を提供します。
 * - 招待フォーム
 * - 招待一覧表示
 * - ステータスフィルタリング
 * - 招待URL コピー機能
 * - 招待取り消し・再送信機能
 */

import React, { useState, useMemo, useEffect } from 'react';
import type {
  Invitation,
  InvitationStatus,
  CreateInvitationInput,
  CreateInvitationResult,
  CancelInvitationResult,
  ResendInvitationResult,
} from '../types/invitation.types';

interface InvitationManagerProps {
  /** 招待リスト */
  invitations: Invitation[];
  /** 招待作成コールバック */
  onCreateInvitation: (input: CreateInvitationInput) => Promise<CreateInvitationResult>;
  /** 招待取り消しコールバック */
  onCancelInvitation: (id: string) => Promise<CancelInvitationResult>;
  /** 招待再送信コールバック */
  onResendInvitation: (id: string) => Promise<ResendInvitationResult>;
  /** ローディング状態 */
  loading: boolean;
  /** エラーメッセージ */
  error?: string;
}

const InvitationManager: React.FC<InvitationManagerProps> = ({
  invitations,
  onCreateInvitation,
  onCancelInvitation,
  onResendInvitation,
  loading,
  error,
}) => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createError, setCreateError] = useState('');
  const [invitationUrl, setInvitationUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<InvitationStatus | 'all'>('all');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);

  // メールアドレスのバリデーション
  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value) {
      setEmailError('メールアドレスを入力してください');
      return false;
    }
    if (!emailRegex.test(value)) {
      setEmailError('有効なメールアドレスを入力してください');
      return false;
    }
    setEmailError('');
    return true;
  };

  // 招待作成ハンドラー
  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSuccess(false);
    setCreateError('');
    setInvitationUrl('');

    if (!validateEmail(email)) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await onCreateInvitation({ email });
      if (result.success) {
        setCreateSuccess(true);
        setInvitationUrl(result.invitationUrl || '');
        setEmail('');
      } else {
        setCreateError(result.error || '招待の作成に失敗しました');
      }
    } catch {
      setCreateError('招待の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 招待URLコピーハンドラー
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (err) {
      console.error('クリップボードへのコピーに失敗しました', err);
    }
  };

  // 取り消し確認ダイアログを開く
  const handleOpenCancelDialog = (id: string) => {
    setSelectedInvitationId(id);
    setCancelDialogOpen(true);
  };

  // 取り消し確認ダイアログを閉じる
  const handleCloseCancelDialog = () => {
    setCancelDialogOpen(false);
    setSelectedInvitationId(null);
  };

  // 招待取り消しハンドラー
  const handleCancelInvitation = async () => {
    if (!selectedInvitationId) return;

    try {
      await onCancelInvitation(selectedInvitationId);
      handleCloseCancelDialog();
    } catch (err) {
      console.error('招待の取り消しに失敗しました', err);
    }
  };

  // 招待再送信ハンドラー
  const handleResendInvitation = async (id: string) => {
    try {
      const result = await onResendInvitation(id);
      if (result.success) {
        setInvitationUrl(result.invitationUrl || '');
        setCreateSuccess(true);
      }
    } catch (err) {
      console.error('招待の再送信に失敗しました', err);
    }
  };

  // フィルタリングされた招待リスト
  const filteredInvitations = useMemo(() => {
    if (selectedFilter === 'all') {
      return invitations;
    }
    return invitations.filter((inv) => inv.status === selectedFilter);
  }, [invitations, selectedFilter]);

  // Escapeキーでダイアログを閉じる
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && cancelDialogOpen) {
        handleCloseCancelDialog();
      }
    };

    if (cancelDialogOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [cancelDialogOpen]);

  // ステータスバッジのスタイル
  const getStatusBadgeStyle = (status: InvitationStatus): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: 'bold',
      display: 'inline-block',
    };

    switch (status) {
      case 'pending':
        return { ...baseStyle, backgroundColor: '#e3f2fd', color: '#1976d2' };
      case 'accepted':
        return { ...baseStyle, backgroundColor: '#e8f5e9', color: '#388e3c' };
      case 'expired':
        return { ...baseStyle, backgroundColor: '#ffebee', color: '#d32f2f' };
      case 'cancelled':
        return { ...baseStyle, backgroundColor: '#fafafa', color: '#757575' };
      default:
        return baseStyle;
    }
  };

  // ステータステキスト
  const getStatusText = (status: InvitationStatus): string => {
    switch (status) {
      case 'pending':
        return '未使用';
      case 'accepted':
        return '使用済み';
      case 'expired':
        return '期限切れ';
      case 'cancelled':
        return '取り消し済み';
      default:
        return status;
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        ユーザー招待管理
      </h1>

      {/* エラーメッセージ */}
      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#ffebee',
            color: '#d32f2f',
            padding: '12px 16px',
            borderRadius: '4px',
            marginBottom: '20px',
          }}
        >
          {error}
        </div>
      )}

      {/* 招待フォーム */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
          新規ユーザー招待
        </h2>
        <form role="form" onSubmit={handleCreateInvitation}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="invitation-email"
              style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
            >
              メールアドレス
            </label>
            <input
              id="invitation-email"
              type="email"
              aria-label="メールアドレス"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: emailError ? '2px solid #d32f2f' : '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px',
              }}
            />
            {emailError && (
              <div style={{ color: '#d32f2f', fontSize: '14px', marginTop: '4px' }}>
                {emailError}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              backgroundColor: submitting ? '#ccc' : '#1976d2',
              color: '#fff',
              padding: '10px 24px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '送信中...' : '招待を送信'}
          </button>
        </form>

        {/* 成功メッセージと招待URLコピー */}
        {createSuccess && invitationUrl && (
          <div
            style={{
              marginTop: '16px',
              backgroundColor: '#e8f5e9',
              padding: '12px 16px',
              borderRadius: '4px',
            }}
          >
            <div style={{ color: '#388e3c', fontWeight: 'bold', marginBottom: '8px' }}>
              招待を送信しました
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={invitationUrl}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: '#fafafa',
                }}
              />
              <button
                onClick={handleCopyUrl}
                style={{
                  backgroundColor: '#388e3c',
                  color: '#fff',
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {copySuccess ? 'コピーしました' : 'URLをコピー'}
              </button>
            </div>
          </div>
        )}

        {/* エラーメッセージ */}
        {createError && (
          <div
            role="alert"
            style={{
              marginTop: '16px',
              backgroundColor: '#ffebee',
              color: '#d32f2f',
              padding: '12px 16px',
              borderRadius: '4px',
            }}
          >
            {createError}
          </div>
        )}
      </div>

      {/* ステータスフィルター */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['all', 'pending', 'accepted', 'expired'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            style={{
              padding: '8px 16px',
              border: selectedFilter === filter ? '2px solid #1976d2' : '1px solid #ddd',
              borderRadius: '20px',
              backgroundColor: selectedFilter === filter ? '#e3f2fd' : '#fff',
              color: selectedFilter === filter ? '#1976d2' : '#333',
              fontSize: '14px',
              fontWeight: selectedFilter === filter ? 'bold' : 'normal',
              cursor: 'pointer',
            }}
          >
            {filter === 'all' ? '全て' : getStatusText(filter)}
          </button>
        ))}
      </div>

      {/* 招待一覧テーブル */}
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
            <div>読み込み中...</div>
          </div>
        ) : filteredInvitations.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#757575' }}>
            招待がありません
          </div>
        ) : (
          <table role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                  メールアドレス
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>招待日時</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                  ステータス
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>有効期限</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                  アクション
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredInvitations.map((invitation) => (
                <tr key={invitation.id} role="row" style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px' }}>{invitation.email}</td>
                  <td style={{ padding: '12px' }}>
                    {new Date(invitation.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span data-testid="status-badge" style={getStatusBadgeStyle(invitation.status)}>
                      {getStatusText(invitation.status)}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {new Date(invitation.expiresAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {invitation.status === 'pending' && (
                      <button
                        onClick={() => handleOpenCancelDialog(invitation.id)}
                        style={{
                          backgroundColor: '#fff',
                          color: '#d32f2f',
                          padding: '6px 12px',
                          border: '1px solid #d32f2f',
                          borderRadius: '4px',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        取り消し
                      </button>
                    )}
                    {invitation.status === 'expired' && (
                      <button
                        onClick={() => handleResendInvitation(invitation.id)}
                        style={{
                          backgroundColor: '#fff',
                          color: '#1976d2',
                          padding: '6px 12px',
                          border: '1px solid #1976d2',
                          borderRadius: '4px',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        再送信
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 取り消し確認ダイアログ */}
      {cancelDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
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
          onClick={handleCloseCancelDialog}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="cancel-dialog-title"
              style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}
            >
              招待を取り消しますか？
            </h2>
            <p style={{ marginBottom: '24px', color: '#666' }}>
              この操作は取り消せません。招待トークンは無効化されます。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCloseCancelDialog}
                style={{
                  backgroundColor: '#fff',
                  color: '#333',
                  padding: '10px 20px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleCancelInvitation}
                style={{
                  backgroundColor: '#d32f2f',
                  color: '#fff',
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                はい、取り消します
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvitationManager;
