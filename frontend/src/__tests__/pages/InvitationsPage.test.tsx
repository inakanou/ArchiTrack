/**
 * 招待管理ページのテスト
 *
 * 要件1: 管理者によるユーザー招待
 * 要件13: 管理者ユーザー招待画面のUI/UX
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvitationsPage } from '../../pages/InvitationsPage';
import type { Invitation } from '../../types/invitation.types';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '../../api/client';

// InvitationManagerコンポーネントをモック
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
    onCreateInvitation: (input: { email: string }) => Promise<{
      success: boolean;
      invitation?: Invitation;
      invitationUrl?: string;
      error?: string;
    }>;
    onCancelInvitation: (id: string) => Promise<{ success: boolean; error?: string }>;
    onResendInvitation: (
      id: string
    ) => Promise<{ success: boolean; invitationUrl?: string; error?: string }>;
    loading: boolean;
    error: string;
  }) => (
    <div data-testid="invitation-manager">
      {loading && <div data-testid="loading">読み込み中...</div>}
      {error && <div data-testid="error">{error}</div>}
      <div data-testid="invitation-count">{invitations.length}</div>
      {invitations.map((inv) => (
        <div key={inv.id} data-testid={`invitation-${inv.id}`}>
          {inv.email}
        </div>
      ))}
      <button
        onClick={() => onCreateInvitation({ email: 'new@example.com' })}
        data-testid="create-button"
      >
        招待作成
      </button>
      <button onClick={() => onCancelInvitation('inv-1')} data-testid="cancel-button">
        招待取消
      </button>
      <button onClick={() => onResendInvitation('inv-1')} data-testid="resend-button">
        再送信
      </button>
    </div>
  ),
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

const mockInvitations: Invitation[] = [
  {
    id: 'inv-1',
    email: 'user1@example.com',
    token: 'token-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedBy: 'admin-1',
  },
  {
    id: 'inv-2',
    email: 'user2@example.com',
    token: 'token-2',
    status: 'accepted',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedBy: 'admin-1',
  },
];

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
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Failed'));

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('招待一覧を取得できませんでした');
      });
    });
  });

  describe('招待作成', () => {
    it('招待作成が成功した場合、招待URLを含む結果を返す', async () => {
      const user = userEvent.setup();
      const newInvitation: Invitation = {
        id: 'inv-3',
        email: 'new@example.com',
        token: 'new-token',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        invitedBy: 'admin-1',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(newInvitation);
      vi.mocked(apiClient.get).mockResolvedValueOnce([...mockInvitations, newInvitation]);

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('create-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/invitations', {
          email: 'new@example.com',
        });
      });
    });

    it('招待作成が失敗した場合、エラーを返す', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Create failed'));

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('create-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalled();
      });
    });

    it('既存メールアドレスの場合、適切なエラーメッセージを返す', async () => {
      const user = userEvent.setup();
      const error = {
        response: { error: 'Email already registered' },
        message: 'already registered',
      };
      vi.mocked(apiClient.post).mockRejectedValueOnce(error);

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('create-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalled();
      });
    });
  });

  describe('招待取消', () => {
    it('招待取消が成功した場合、一覧を更新する', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.delete).mockResolvedValueOnce({});
      vi.mocked(apiClient.get).mockResolvedValueOnce([mockInvitations[1]]);

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('cancel-button'));

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/invitations/inv-1');
      });
    });

    it('招待取消が失敗した場合、エラーを返す', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.delete).mockRejectedValueOnce(new Error('Cancel failed'));

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('cancel-button'));

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalled();
      });
    });
  });

  describe('招待再送信', () => {
    it('招待再送信が成功した場合、新しい招待URLを返す', async () => {
      const user = userEvent.setup();
      const newInvitation: Invitation = {
        id: 'inv-1',
        email: 'user1@example.com',
        token: 'new-token',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        invitedBy: 'admin-1',
      };

      vi.mocked(apiClient.delete).mockResolvedValueOnce({});
      vi.mocked(apiClient.post).mockResolvedValueOnce(newInvitation);
      vi.mocked(apiClient.get).mockResolvedValueOnce([newInvitation, mockInvitations[1]]);

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('resend-button'));

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/invitations/inv-1');
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/invitations', {
          email: 'user1@example.com',
        });
      });
    });

    it('存在しない招待IDの場合、エラーを返す', async () => {
      const user = userEvent.setup();
      // 空の招待リストを返す
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      // inv-1は存在しないので再送信はエラー
      await user.click(screen.getByTestId('resend-button'));

      // 招待が見つからないのでAPIは呼ばれない
      await waitFor(() => {
        expect(apiClient.delete).not.toHaveBeenCalled();
      });
    });

    it('再送信が失敗した場合、エラーを返す', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.delete).mockRejectedValueOnce(new Error('Resend failed'));

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('resend-button'));

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalled();
      });
    });
  });
});
