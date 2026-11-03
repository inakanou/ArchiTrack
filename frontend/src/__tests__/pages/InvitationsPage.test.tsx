/**
 * 招待管理ページのテスト
 *
 * 要件1: 管理者によるユーザー招待
 * 要件13: 管理者ユーザー招待画面のUI/UX
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvitationsPage } from '../../pages/InvitationsPage';
import type {
  Invitation,
  IssuedInvitation,
  CreateInvitationInput,
  CreateInvitationResult,
  CancelInvitationResult,
  ResendInvitationResult,
} from '../../types/invitation.types';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '../../api/client';

// InvitationManagerコンポーネントをモック（画面に渡されたコールバックを試験から直接呼ぶ）
const captured: {
  onCreateInvitation?: (input: CreateInvitationInput) => Promise<CreateInvitationResult>;
  onCancelInvitation?: (id: string) => Promise<CancelInvitationResult>;
  onResendInvitation?: (id: string) => Promise<ResendInvitationResult>;
} = {};

vi.mock('../../components/InvitationManager', () => ({
  default: ({
    invitations,
    onCreateInvitation,
    onCancelInvitation,
    onResendInvitation,
    loading,
    error,
  }: {
    invitations: Invitation[];
    onCreateInvitation: (input: CreateInvitationInput) => Promise<CreateInvitationResult>;
    onCancelInvitation: (id: string) => Promise<CancelInvitationResult>;
    onResendInvitation: (id: string) => Promise<ResendInvitationResult>;
    loading: boolean;
    error: string;
  }) => {
    captured.onCreateInvitation = onCreateInvitation;
    captured.onCancelInvitation = onCancelInvitation;
    captured.onResendInvitation = onResendInvitation;
    return (
      <div data-testid="invitation-manager">
        {loading && <div data-testid="loading">読み込み中...</div>}
        {error && <div data-testid="error">{error}</div>}
        <div data-testid="invitation-count">{invitations.length}</div>
        {invitations.map((inv) => (
          <div key={inv.id} data-testid={`invitation-${inv.id}`}>
            {inv.email}
          </div>
        ))}
      </div>
    );
  },
}));

// window.location.originをモック
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, origin: 'http://localhost:3000' },
    writable: true,
  });
});

afterAll(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
  });
});

const ADMIN = { id: 'admin-1', displayName: 'Admin' };

const mockInvitations: Invitation[] = [
  {
    id: 'inv-1',
    email: 'user1@example.com',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    inviter: ADMIN,
  },
  {
    id: 'inv-2',
    email: 'user2@example.com',
    status: 'accepted',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    inviter: ADMIN,
  },
];

/** 画面が描画されコールバックが渡るまで待つ */
async function renderPage() {
  render(<InvitationsPage />);
  await waitFor(() => {
    expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
  });
}

describe('InvitationsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(mockInvitations);
  });

  describe('初期表示', () => {
    it('ページロード時に招待一覧を取得する', async () => {
      render(<InvitationsPage />);

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/invitations');
      });
    });

    it('招待一覧を表示する', async () => {
      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-count')).toHaveTextContent('2');
      });
    });

    it('招待取得エラー時にエラーメッセージを表示する', async () => {
      // エラーログを抑制（テストで意図的にエラーを発生させるため）
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Failed'));

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('招待一覧を取得できませんでした');
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('招待作成', () => {
    /**
     * @requirement user-authentication/REQ-37.2
     */
    it('招待作成が成功した場合、サーバーが返した招待 URL をそのまま結果に載せ、一覧を取り直す', async () => {
      const issued: IssuedInvitation = {
        id: 'inv-3',
        email: 'new@example.com',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        inviter: ADMIN,
        invitationUrl: 'https://app.example.com/register?token=server-built-token',
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(issued);

      await renderPage();
      let result: CreateInvitationResult | undefined;
      await act(async () => {
        result = await captured.onCreateInvitation!({ email: 'new@example.com' });
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/invitations', {
        email: 'new@example.com',
      });
      // 画面でトークンから URL を組み立てない（window.location.origin を使わない）
      expect(result).toEqual({
        success: true,
        invitation: issued,
        invitationUrl: 'https://app.example.com/register?token=server-built-token',
      });
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('招待作成が失敗した場合、エラーを返す', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Create failed'));

      await renderPage();
      let result: CreateInvitationResult | undefined;
      await act(async () => {
        result = await captured.onCreateInvitation!({ email: 'new@example.com' });
      });

      expect(result).toEqual({ success: false, error: '招待の作成に失敗しました' });
      consoleErrorSpy.mockRestore();
    });

    it('既存メールアドレスの場合、適切なエラーメッセージを返す', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiClient.post).mockRejectedValueOnce({
        response: { error: 'Email already registered' },
        message: 'already registered',
      });

      await renderPage();
      let result: CreateInvitationResult | undefined;
      await act(async () => {
        result = await captured.onCreateInvitation!({ email: 'new@example.com' });
      });

      expect(result).toEqual({
        success: false,
        error: 'このメールアドレスは既に登録されています',
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('招待取消', () => {
    it('招待取消が成功した場合、一覧を更新する', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce({});

      await renderPage();
      let result: CancelInvitationResult | undefined;
      await act(async () => {
        result = await captured.onCancelInvitation!('inv-1');
      });

      expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/invitations/inv-1');
      expect(result).toEqual({ success: true });
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('招待取消が失敗した場合、エラーを返す', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiClient.delete).mockRejectedValueOnce(new Error('Cancel failed'));

      await renderPage();
      let result: CancelInvitationResult | undefined;
      await act(async () => {
        result = await captured.onCancelInvitation!('inv-1');
      });

      expect(result).toEqual({ success: false, error: '招待の取り消しに失敗しました' });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('招待再送信', () => {
    /**
     * @requirement user-authentication/REQ-37.1
     */
    it('再送信の経路を呼び、取り消しと作成を組み合わせず、サーバーが返した新しい招待 URL を返す', async () => {
      const resent: IssuedInvitation = {
        ...(mockInvitations[0] as Invitation),
        invitationUrl: 'https://app.example.com/register?token=resent-token',
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(resent);

      await renderPage();
      let result: ResendInvitationResult | undefined;
      await act(async () => {
        result = await captured.onResendInvitation!('inv-1');
      });

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/invitations/inv-1/resend');
      expect(apiClient.delete).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        invitationUrl: 'https://app.example.com/register?token=resent-token',
      });
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('再送信が失敗した場合、エラーを返す', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Resend failed'));

      await renderPage();
      let result: ResendInvitationResult | undefined;
      await act(async () => {
        result = await captured.onResendInvitation!('inv-1');
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/invitations/inv-1/resend');
      expect(result).toEqual({ success: false, error: '招待の再送信に失敗しました' });
      consoleErrorSpy.mockRestore();
    });
  });
});
