/**
 * @fileoverview ダッシュボードページのテスト
 *
 * Task 10.2: Dashboardへのプロジェクト管理カード追加
 * Task 12.8: Dashboardへの取引先管理カード追加
 *
 * Requirements:
 * - 21.5: ダッシュボードにプロジェクト管理へのクイックアクセスカードが表示されている
 * - 21.6: プロジェクト管理カードをクリックするとプロジェクト一覧ページに遷移する
 * - 21.7: プロジェクト管理カードには「工事案件の作成・管理」という説明が表示される
 * - 21.8: プロジェクト管理カードはクイックアクセスセクションの先頭に配置される
 * - 12.5: ダッシュボードのクイックアクセスセクションに「取引先管理」カードを表示する
 * - 12.6: 取引先管理カードをクリックすると取引先一覧ページ（/trading-partners）に遷移する
 * - 12.7: 取引先管理カードには「顧客・協力業者の登録・管理」という説明を表示する
 * - 12.8: 取引先管理カードを「プロジェクト管理」カードの次に配置する
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import type { UserProfile } from '../../types/auth.types';

// useAuthモック
const mockUser: UserProfile = {
  id: 'test-user-id',
  email: 'test@example.com',
  displayName: 'テストユーザー',
  roles: ['user'],
  emailVerified: true,
  twoFactorEnabled: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const mockAdminUser: UserProfile = {
  id: 'admin-user-id',
  email: 'admin@example.com',
  displayName: '管理者ユーザー',
  roles: ['admin', 'user'],
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const useAuthMock = vi.fn(() => ({
  user: mockUser,
  isLoading: false,
  error: null,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトは一般ユーザー
    useAuthMock.mockReturnValue({
      user: mockUser,
      isLoading: false,
      error: null,
    });
  });

  // ヘルパー関数
  const renderWithRouter = () => {
    return render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/projects"
            element={<div data-testid="projects-page">プロジェクト一覧</div>}
          />
          <Route
            path="/trading-partners"
            element={<div data-testid="trading-partners-page">取引先一覧</div>}
          />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('クイックアクセスセクション', () => {
    it('ダッシュボードが表示される', () => {
      renderWithRouter();
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });

    it('クイックアクセスセクションが表示される', () => {
      renderWithRouter();
      expect(screen.getByText('クイックアクセス')).toBeInTheDocument();
    });
  });

  describe('プロジェクト管理カード - REQ 21.5, 21.7, 21.8', () => {
    it('プロジェクト管理カードが表示される (REQ 21.5)', () => {
      renderWithRouter();
      expect(screen.getByTestId('quick-link-projects')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト管理')).toBeInTheDocument();
    });

    it('プロジェクト管理カードに「工事案件の作成・管理」という説明文が表示される (REQ 21.7)', () => {
      renderWithRouter();
      const projectCard = screen.getByTestId('quick-link-projects');
      expect(within(projectCard).getByText('工事案件の作成・管理')).toBeInTheDocument();
    });

    it('プロジェクト管理カードはクイックアクセスセクションの先頭に配置される (REQ 21.8)', () => {
      renderWithRouter();
      // クイックアクセスセクション内のリンクカードを取得
      const quickAccessSection = screen.getByText('クイックアクセス').closest('section');
      expect(quickAccessSection).toBeInTheDocument();

      // セクション内のリンクカードを取得（data-testid="quick-link-*"を持つ要素）
      const linkCards = within(quickAccessSection!).getAllByRole('link');

      // 先頭のカードがプロジェクト管理であることを確認
      expect(linkCards[0]).toHaveAttribute('data-testid', 'quick-link-projects');
    });

    it('プロジェクト管理カードのリンク先が /projects に設定されている', () => {
      renderWithRouter();
      const projectCard = screen.getByTestId('quick-link-projects');
      expect(projectCard).toHaveAttribute('href', '/projects');
    });
  });

  describe('プロジェクト管理カードのナビゲーション - REQ 21.6', () => {
    it('プロジェクト管理カードをクリックするとプロジェクト一覧ページに遷移する (REQ 21.6)', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      const projectCard = screen.getByTestId('quick-link-projects');
      await user.click(projectCard);

      expect(screen.getByTestId('projects-page')).toBeInTheDocument();
    });
  });

  describe('既存のクイックアクセスカード', () => {
    it('プロフィールカードが表示される', () => {
      renderWithRouter();
      expect(screen.getByTestId('quick-link-profile')).toBeInTheDocument();
    });

    it('セッション管理カードが表示される', () => {
      renderWithRouter();
      expect(screen.getByTestId('quick-link-sessions')).toBeInTheDocument();
    });

    it('2FA設定カードが表示される', () => {
      renderWithRouter();
      expect(screen.getByTestId('quick-link-2fa')).toBeInTheDocument();
    });
  });

  describe('取引先管理カード - REQ 12.5, 12.7, 12.8', () => {
    it('取引先管理カードが表示される (REQ 12.5)', () => {
      renderWithRouter();
      expect(screen.getByTestId('quick-link-trading-partners')).toBeInTheDocument();
      expect(screen.getByText('取引先管理')).toBeInTheDocument();
    });

    it('取引先管理カードに「顧客・協力業者の登録・管理」という説明文が表示される (REQ 12.7)', () => {
      renderWithRouter();
      const tradingPartnerCard = screen.getByTestId('quick-link-trading-partners');
      expect(
        within(tradingPartnerCard).getByText('顧客・協力業者の登録・管理')
      ).toBeInTheDocument();
    });

    it('取引先管理カードは「プロジェクト管理」カードの次（2番目）に配置される (REQ 12.8)', () => {
      renderWithRouter();
      // クイックアクセスセクション内のリンクカードを取得
      const quickAccessSection = screen.getByText('クイックアクセス').closest('section');
      expect(quickAccessSection).toBeInTheDocument();

      // セクション内のリンクカードを取得（data-testid="quick-link-*"を持つ要素）
      const linkCards = within(quickAccessSection!).getAllByRole('link');

      // 1番目のカードがプロジェクト管理であることを確認
      expect(linkCards[0]).toHaveAttribute('data-testid', 'quick-link-projects');
      // 2番目のカードが取引先管理であることを確認
      expect(linkCards[1]).toHaveAttribute('data-testid', 'quick-link-trading-partners');
    });

    it('取引先管理カードのリンク先が /trading-partners に設定されている', () => {
      renderWithRouter();
      const tradingPartnerCard = screen.getByTestId('quick-link-trading-partners');
      expect(tradingPartnerCard).toHaveAttribute('href', '/trading-partners');
    });
  });

  describe('取引先管理カードのナビゲーション - REQ 12.6', () => {
    it('取引先管理カードをクリックすると取引先一覧ページに遷移する (REQ 12.6)', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      const tradingPartnerCard = screen.getByTestId('quick-link-trading-partners');
      await user.click(tradingPartnerCard);

      expect(screen.getByTestId('trading-partners-page')).toBeInTheDocument();
    });
  });

  describe('管理者セクション', () => {
    beforeEach(() => {
      useAuthMock.mockReturnValue({
        user: mockAdminUser,
        isLoading: false,
        error: null,
      });
    });

    it('管理者の場合、管理機能セクションが表示される', () => {
      renderWithRouter();

      expect(screen.getByText('管理機能')).toBeInTheDocument();
    });

    it('管理者の場合、ユーザー管理カードが表示される', () => {
      renderWithRouter();

      expect(screen.getByTestId('quick-link-admin-users')).toBeInTheDocument();
      expect(screen.getByText('ユーザー管理')).toBeInTheDocument();
      expect(screen.getByText('ユーザーアカウントの管理')).toBeInTheDocument();
    });

    it('管理者の場合、招待管理カードが表示される', () => {
      renderWithRouter();

      expect(screen.getByTestId('quick-link-admin-invitations')).toBeInTheDocument();
      expect(screen.getByText('招待管理')).toBeInTheDocument();
      expect(screen.getByText('ユーザー招待の管理')).toBeInTheDocument();
    });

    it('管理者の場合、監査ログカードが表示される', () => {
      renderWithRouter();

      expect(screen.getByTestId('quick-link-admin-audit')).toBeInTheDocument();
      expect(screen.getByText('監査ログ')).toBeInTheDocument();
      expect(screen.getByText('システム操作ログの確認')).toBeInTheDocument();
    });

    it('ユーザー管理カードのリンク先が /admin/users に設定されている', () => {
      renderWithRouter();

      const userManagementCard = screen.getByTestId('quick-link-admin-users');
      expect(userManagementCard).toHaveAttribute('href', '/admin/users');
    });

    it('招待管理カードのリンク先が /admin/invitations に設定されている', () => {
      renderWithRouter();

      const invitationCard = screen.getByTestId('quick-link-admin-invitations');
      expect(invitationCard).toHaveAttribute('href', '/admin/invitations');
    });

    it('監査ログカードのリンク先が /admin/audit-logs に設定されている', () => {
      renderWithRouter();

      const auditLogCard = screen.getByTestId('quick-link-admin-audit');
      expect(auditLogCard).toHaveAttribute('href', '/admin/audit-logs');
    });
  });

  describe('一般ユーザーの場合', () => {
    it('管理機能セクションが表示されない', () => {
      renderWithRouter();

      expect(screen.queryByText('管理機能')).not.toBeInTheDocument();
    });

    it('ユーザー管理カードが表示されない', () => {
      renderWithRouter();

      expect(screen.queryByTestId('quick-link-admin-users')).not.toBeInTheDocument();
    });

    it('招待管理カードが表示されない', () => {
      renderWithRouter();

      expect(screen.queryByTestId('quick-link-admin-invitations')).not.toBeInTheDocument();
    });

    it('監査ログカードが表示されない', () => {
      renderWithRouter();

      expect(screen.queryByTestId('quick-link-admin-audit')).not.toBeInTheDocument();
    });
  });

  describe('ウェルカムメッセージ', () => {
    it('ユーザー名を含むウェルカムメッセージが表示される', () => {
      renderWithRouter();

      expect(screen.getByText('ようこそ、テストユーザーさん')).toBeInTheDocument();
    });

    it('ユーザーがnullの場合はデフォルト名が表示される', () => {
      useAuthMock.mockReturnValue({
        user: null as unknown as UserProfile,
        isLoading: false,
        error: null,
      });

      renderWithRouter();

      expect(screen.getByText('ようこそ、ユーザーさん')).toBeInTheDocument();
    });

    it('displayNameがnullの場合はデフォルト名が表示される', () => {
      useAuthMock.mockReturnValue({
        user: {
          ...mockUser,
          displayName: undefined as unknown as string,
        },
        isLoading: false,
        error: null,
      });

      renderWithRouter();

      expect(screen.getByText('ようこそ、ユーザーさん')).toBeInTheDocument();
    });

    it('管理者のウェルカムメッセージが表示される', () => {
      useAuthMock.mockReturnValue({
        user: mockAdminUser,
        isLoading: false,
        error: null,
      });

      renderWithRouter();

      expect(screen.getByText('ようこそ、管理者ユーザーさん')).toBeInTheDocument();
    });
  });

  describe('アプリケーション説明', () => {
    it('アプリケーションの説明が表示される', () => {
      renderWithRouter();

      expect(
        screen.getByText('ArchiTrack - アーキテクチャ決定記録管理システム')
      ).toBeInTheDocument();
    });
  });

  describe('rolesがundefinedの場合', () => {
    it('管理機能セクションが表示されない', () => {
      useAuthMock.mockReturnValue({
        user: {
          ...mockUser,
          roles: undefined as unknown as string[],
        },
        isLoading: false,
        error: null,
      });

      renderWithRouter();

      expect(screen.queryByText('管理機能')).not.toBeInTheDocument();
    });
  });
});
