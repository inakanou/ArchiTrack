/**
 * 招待管理ページ
 *
 * 要件1: 管理者によるユーザー招待
 * 要件13: 管理者ユーザー招待画面のUI/UX
 *
 * 管理者が新規ユーザーを招待し、招待状況を管理できるページです。
 */

import { useState, useEffect } from 'react';
import InvitationManager from '../components/InvitationManager';
import { apiClient } from '../api/client';
import type {
  Invitation,
  IssuedInvitation,
  CreateInvitationInput,
  CreateInvitationResult,
  CancelInvitationResult,
  ResendInvitationResult,
} from '../types/invitation.types';

export function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /**
   * 招待一覧を取得
   */
  const fetchInvitations = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await apiClient.get<Invitation[]>('/api/v1/invitations');
      setInvitations(data);
    } catch (err) {
      setError('招待一覧を取得できませんでした');
      console.error('Failed to fetch invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 招待を作成
   */
  const handleCreateInvitation = async (
    input: CreateInvitationInput
  ): Promise<CreateInvitationResult> => {
    try {
      const response = await apiClient.post<IssuedInvitation>('/api/v1/invitations', input);

      // 招待リストを更新
      await fetchInvitations();

      // 招待URLはサーバーが組み立てた値をそのまま使う（画面でトークンから組み立てない）
      return {
        success: true,
        invitation: response,
        invitationUrl: response.invitationUrl,
      };
    } catch (err: unknown) {
      console.error('Failed to create invitation:', err);

      // エラーメッセージを抽出
      let errorMessage = '招待の作成に失敗しました';
      if (err && typeof err === 'object') {
        // ApiError.response をチェック
        if ('response' in err && err.response && typeof err.response === 'object') {
          const response = err.response as Record<string, unknown>;
          if ('error' in response && typeof response.error === 'string') {
            const apiError = response.error;
            if (apiError.includes('already registered') || apiError.includes('already exists')) {
              errorMessage = 'このメールアドレスは既に登録されています';
            }
          }
        }
        // フォールバック: err.message もチェック
        if (errorMessage === '招待の作成に失敗しました' && 'message' in err) {
          const message = (err as { message: string }).message;
          if (message.includes('already registered') || message.includes('既に登録')) {
            errorMessage = 'このメールアドレスは既に登録されています';
          }
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * 招待を取り消す
   */
  const handleCancelInvitation = async (id: string): Promise<CancelInvitationResult> => {
    try {
      await apiClient.delete(`/api/v1/invitations/${id}`);

      // 招待リストを更新
      await fetchInvitations();

      return { success: true };
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      return {
        success: false,
        error: '招待の取り消しに失敗しました',
      };
    }
  };

  /**
   * 招待を再送信（同じ招待を新しいトークンで送り直す。サーバーが同じ行のトークンと期限を置き換える）
   */
  const handleResendInvitation = async (id: string): Promise<ResendInvitationResult> => {
    try {
      const response = await apiClient.post<IssuedInvitation>(`/api/v1/invitations/${id}/resend`);

      // 招待リストを更新
      await fetchInvitations();

      return {
        success: true,
        invitationUrl: response.invitationUrl,
      };
    } catch (err) {
      console.error('Failed to resend invitation:', err);
      return {
        success: false,
        error: '招待の再送信に失敗しました',
      };
    }
  };

  // 初期データ取得
  useEffect(() => {
    fetchInvitations();
  }, []);

  return (
    <InvitationManager
      invitations={invitations}
      onCreateInvitation={handleCreateInvitation}
      onCancelInvitation={handleCancelInvitation}
      onResendInvitation={handleResendInvitation}
      loading={loading}
      error={error}
    />
  );
}
