/**
 * @fileoverview ProtectedLayoutコンポーネントのテスト
 *
 * Requirements:
 * - REQ-28.21: 認証済みユーザーが保護された画面にアクセスすると共通ヘッダーナビゲーションが表示される
 * - REQ-28.22: ダッシュボードへのリンク、プロフィールへのリンク、ログアウトボタンを含む
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedLayout } from '../../components/ProtectedLayout';
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
    logout: vi.fn(),
  })),
}));

// ロガーを無効化
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ProtectedLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (initialPath = '/dashboard') => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route
              path="/dashboard"
              element={<div data-testid="dashboard-content">ダッシュボード</div>}
            />
            <Route
              path="/profile"
              element={<div data-testid="profile-content">プロフィール</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  describe('レイアウト構造', () => {
    it('AppHeaderが表示されること（REQ-28.21）', () => {
      renderWithRouter();

      // ヘッダーナビゲーションが存在することを確認
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('子ルートのコンテンツがmain要素内に表示されること', () => {
      renderWithRouter('/dashboard');

      // main要素が存在することを確認
      expect(screen.getByRole('main')).toBeInTheDocument();

      // 子ルートのコンテンツが表示されること
      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
    });

    it('異なるルートで適切なコンテンツが表示されること', () => {
      renderWithRouter('/profile');

      expect(screen.getByTestId('profile-content')).toBeInTheDocument();
    });
  });

  describe('スタイル', () => {
    it('最小高さが画面全体に設定されていること', () => {
      renderWithRouter();

      // ルート要素のクラスを確認（min-h-screen）
      const container = screen.getByRole('main').parentElement;
      expect(container).toHaveClass('min-h-screen');
    });
  });
});
