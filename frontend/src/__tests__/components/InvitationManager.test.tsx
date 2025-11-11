/**
 * InvitationManager 単体テスト
 *
 * ユーザー招待管理コンポーネントのテストを提供します。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitationManager from '../../components/InvitationManager';
import type { Invitation } from '../../types/invitation.types';

// モックデータ
const mockInvitations: Invitation[] = [
  {
    id: '1',
    email: 'user1@example.com',
    token: 'token1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedBy: 'admin',
    inviterEmail: 'admin@example.com',
  },
  {
    id: '2',
    email: 'user2@example.com',
    token: 'token2',
    status: 'accepted',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedBy: 'admin',
    inviterEmail: 'admin@example.com',
  },
  {
    id: '3',
    email: 'user3@example.com',
    token: 'token3',
    status: 'expired',
    expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedBy: 'admin',
    inviterEmail: 'admin@example.com',
  },
];

describe('InvitationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('招待フォームと招待一覧テーブルを表示する', () => {
    const mockOnCreateInvitation = vi.fn();
    const mockOnCancelInvitation = vi.fn();
    const mockOnResendInvitation = vi.fn();

    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={mockOnCreateInvitation}
        onCancelInvitation={mockOnCancelInvitation}
        onResendInvitation={mockOnResendInvitation}
        loading={false}
      />
    );

    // 招待フォームの確認
    expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /招待/i })).toBeInTheDocument();

    // 招待一覧テーブルの確認
    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    expect(screen.getByText('user2@example.com')).toBeInTheDocument();
    expect(screen.getByText('user3@example.com')).toBeInTheDocument();
  });

  it('招待フォームにメールアドレスを入力できる', async () => {
    const user = userEvent.setup();
    const mockOnCreateInvitation = vi.fn();

    render(
      <InvitationManager
        invitations={[]}
        onCreateInvitation={mockOnCreateInvitation}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const emailInput = screen.getByLabelText(/メールアドレス/i);
    await user.type(emailInput, 'newuser@example.com');

    expect(emailInput).toHaveValue('newuser@example.com');
  });

  it('招待ボタンをクリックすると招待作成コールバックが呼ばれる', async () => {
    const user = userEvent.setup();
    const mockOnCreateInvitation = vi.fn().mockResolvedValue({
      success: true,
      invitation: mockInvitations[0],
      invitationUrl: 'http://localhost:5173/register?token=token1',
    });

    render(
      <InvitationManager
        invitations={[]}
        onCreateInvitation={mockOnCreateInvitation}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const emailInput = screen.getByLabelText(/メールアドレス/i);
    const inviteButton = screen.getByRole('button', { name: /招待/i });

    await user.type(emailInput, 'newuser@example.com');
    await user.click(inviteButton);

    await waitFor(() => {
      expect(mockOnCreateInvitation).toHaveBeenCalledWith({
        email: 'newuser@example.com',
      });
    });
  });

  it('招待作成成功時に成功メッセージと招待URLコピーボタンを表示する', async () => {
    const user = userEvent.setup();
    const mockOnCreateInvitation = vi.fn().mockResolvedValue({
      success: true,
      invitation: mockInvitations[0],
      invitationUrl: 'http://localhost:5173/register?token=token1',
    });

    render(
      <InvitationManager
        invitations={[]}
        onCreateInvitation={mockOnCreateInvitation}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const emailInput = screen.getByLabelText(/メールアドレス/i);
    const inviteButton = screen.getByRole('button', { name: /招待/i });

    await user.type(emailInput, 'newuser@example.com');
    await user.click(inviteButton);

    await waitFor(() => {
      expect(screen.getByText(/招待を送信しました/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /URLをコピー/i })).toBeInTheDocument();
    });
  });

  it('招待作成エラー時にエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    const mockOnCreateInvitation = vi.fn().mockResolvedValue({
      success: false,
      error: 'このメールアドレスは既に登録されています',
    });

    render(
      <InvitationManager
        invitations={[]}
        onCreateInvitation={mockOnCreateInvitation}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const emailInput = screen.getByLabelText(/メールアドレス/i);
    const inviteButton = screen.getByRole('button', { name: /招待/i });

    await user.type(emailInput, 'existing@example.com');
    await user.click(inviteButton);

    await waitFor(() => {
      expect(screen.getByText(/このメールアドレスは既に登録されています/i)).toBeInTheDocument();
    });
  });

  it('招待ステータスを色とアイコンで視覚的に区別する', () => {
    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    // ステータスバッジの存在確認
    const pendingBadges = screen.getAllByText(/未使用/i);
    const acceptedBadges = screen.getAllByText(/使用済み/i);
    const expiredBadges = screen.getAllByText(/期限切れ/i);

    expect(pendingBadges.length).toBeGreaterThan(0);
    expect(acceptedBadges.length).toBeGreaterThan(0);
    expect(expiredBadges.length).toBeGreaterThan(0);
  });

  it('ステータスフィルタリングが動作する', async () => {
    const user = userEvent.setup();

    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    // 「未使用」フィルターを選択
    const pendingFilter = screen.getByRole('button', { name: /未使用/i });
    await user.click(pendingFilter);

    await waitFor(() => {
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      expect(screen.queryByText('user2@example.com')).not.toBeInTheDocument();
      expect(screen.queryByText('user3@example.com')).not.toBeInTheDocument();
    });
  });

  it('招待URLコピーボタンをクリックするとクリップボードにコピーされる', async () => {
    const user = userEvent.setup();
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });

    const mockOnCreateInvitation = vi.fn().mockResolvedValue({
      success: true,
      invitation: mockInvitations[0],
      invitationUrl: 'http://localhost:5173/register?token=token1',
    });

    render(
      <InvitationManager
        invitations={[]}
        onCreateInvitation={mockOnCreateInvitation}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const emailInput = screen.getByLabelText(/メールアドレス/i);
    const inviteButton = screen.getByRole('button', { name: /招待/i });

    await user.type(emailInput, 'newuser@example.com');
    await user.click(inviteButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /URLをコピー/i })).toBeInTheDocument();
    });

    const copyButton = screen.getByRole('button', { name: /URLをコピー/i });
    await user.click(copyButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('http://localhost:5173/register?token=token1');
      expect(screen.getByText(/コピーしました/i)).toBeInTheDocument();
    });
  });

  it('未使用の招待に「取り消し」ボタンを表示する', () => {
    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const invitationRows = screen.getAllByRole('row');
    const pendingRow = invitationRows.find((row) => within(row).queryByText('user1@example.com'));

    expect(pendingRow).toBeDefined();
    if (pendingRow) {
      expect(within(pendingRow).getByRole('button', { name: /取り消し/i })).toBeInTheDocument();
    }
  });

  it('期限切れの招待に「再送信」ボタンを表示する', () => {
    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const invitationRows = screen.getAllByRole('row');
    const expiredRow = invitationRows.find((row) => within(row).queryByText('user3@example.com'));

    expect(expiredRow).toBeDefined();
    if (expiredRow) {
      expect(within(expiredRow).getByRole('button', { name: /再送信/i })).toBeInTheDocument();
    }
  });

  it('取り消しボタンをクリックすると確認ダイアログを表示する', async () => {
    const user = userEvent.setup();

    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const invitationRows = screen.getAllByRole('row');
    const pendingRow = invitationRows.find((row) => within(row).queryByText('user1@example.com'));

    if (pendingRow) {
      const cancelButton = within(pendingRow).getByRole('button', { name: /取り消し/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/招待を取り消しますか/i)).toBeInTheDocument();
      });
    }
  });

  it('取り消し確認ダイアログで「取り消し」を実行する', async () => {
    const user = userEvent.setup();
    const mockOnCancelInvitation = vi.fn().mockResolvedValue({
      success: true,
    });

    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={mockOnCancelInvitation}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    const invitationRows = screen.getAllByRole('row');
    const pendingRow = invitationRows.find((row) => within(row).queryByText('user1@example.com'));

    if (pendingRow) {
      const cancelButton = within(pendingRow).getByRole('button', { name: /取り消し/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /はい、取り消します/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnCancelInvitation).toHaveBeenCalledWith('1');
      });
    }
  });

  it('再送信ボタンをクリックすると招待を再送信する', async () => {
    const user = userEvent.setup();
    const mockOnResendInvitation = vi.fn().mockResolvedValue({
      success: true,
      invitationUrl: 'http://localhost:5173/register?token=newtoken',
    });

    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={mockOnResendInvitation}
        loading={false}
      />
    );

    const invitationRows = screen.getAllByRole('row');
    const expiredRow = invitationRows.find((row) => within(row).queryByText('user3@example.com'));

    if (expiredRow) {
      const resendButton = within(expiredRow).getByRole('button', { name: /再送信/i });
      await user.click(resendButton);

      await waitFor(() => {
        expect(mockOnResendInvitation).toHaveBeenCalledWith('3');
      });
    }
  });

  it('ローディング中にスピナーを表示する', () => {
    render(
      <InvitationManager
        invitations={[]}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={true}
      />
    );

    expect(screen.getByLabelText(/読み込み中/i)).toBeInTheDocument();
  });

  it('エラー時にエラーメッセージを表示する', () => {
    render(
      <InvitationManager
        invitations={[]}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
        error="招待一覧の取得に失敗しました"
      />
    );

    expect(screen.getByText(/招待一覧の取得に失敗しました/i)).toBeInTheDocument();
  });

  it('アクセシビリティ属性が設定されている', () => {
    render(
      <InvitationManager
        invitations={mockInvitations}
        onCreateInvitation={vi.fn()}
        onCancelInvitation={vi.fn()}
        onResendInvitation={vi.fn()}
        loading={false}
      />
    );

    // フォームのaria-label
    const emailInput = screen.getByLabelText(/メールアドレス/i);
    expect(emailInput).toHaveAttribute('aria-label');

    // テーブルのrole
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
