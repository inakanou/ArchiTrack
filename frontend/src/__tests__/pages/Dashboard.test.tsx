/**
 * @fileoverview ダッシュボードページのテスト
 *
 * Task 10.2: Dashboardへのプロジェクト管理カード追加
 *
 * Requirements:
 * - 21.5: ダッシュボードにプロジェクト管理へのクイックアクセスカードが表示されている
 * - 21.6: プロジェクト管理カードをクリックするとプロジェクト一覧ページに遷移する
 * - 21.7: プロジェクト管理カードには「工事案件の作成・管理」という説明が表示される
 * - 21.8: プロジェクト管理カードはクイックアクセスセクションの先頭に配置される
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

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    isLoading: false,
    error: null,
  })),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
