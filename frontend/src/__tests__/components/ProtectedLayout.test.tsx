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
  // 2FA 未登録の利用者は遷移を制限した画面になる（タスク47.6）。通常のレイアウトの検証は登録済みで行う
  twoFactorEnabled: true,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const mockHandleReauthSuccess = vi.fn();
const mockNavigateToLogin = vi.fn();

const mockUseAuth = vi.fn(() => ({
  user: mockUser,
  isLoading: false,
  error: null,
  logout: vi.fn(),
  sessionExpiredDuringOperation: false,
  handleReauthSuccess: mockHandleReauthSuccess,
  navigateToLogin: mockNavigateToLogin,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
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

// apiClientをモック（SessionExpiredModalが使用）
vi.mock('../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    statusCode: number;
    response?: unknown;
    constructor(statusCode: number, message: string, response?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.response = response;
    }
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

  /**
   * 要件30.1, 30.2, 30.3: SessionExpiredModalのグローバル配置
   */
  describe('SessionExpiredModal統合', () => {
    it('sessionExpiredDuringOperation=trueの場合にモーダルが表示されること', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isLoading: false,
        error: null,
        logout: vi.fn(),
        sessionExpiredDuringOperation: true,
        handleReauthSuccess: mockHandleReauthSuccess,
        navigateToLogin: mockNavigateToLogin,
      });

      renderWithRouter();

      // SessionExpiredModalが表示されること
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('セッションの有効期限が切れました')).toBeInTheDocument();
    });

    it('sessionExpiredDuringOperation=falseの場合にモーダルが表示されないこと', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isLoading: false,
        error: null,
        logout: vi.fn(),
        sessionExpiredDuringOperation: false,
        handleReauthSuccess: mockHandleReauthSuccess,
        navigateToLogin: mockNavigateToLogin,
      });

      renderWithRouter();

      // SessionExpiredModalが表示されないこと
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ユーザーのメールアドレスがモーダルに渡されること', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isLoading: false,
        error: null,
        logout: vi.fn(),
        sessionExpiredDuringOperation: true,
        handleReauthSuccess: mockHandleReauthSuccess,
        navigateToLogin: mockNavigateToLogin,
      });

      renderWithRouter();

      // メールアドレスが自動入力されていること
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });
  });

  /**
   * 制限中の利用者（初回のパスワード変更・2FA 未登録）はナビゲーションを出さず、ログアウトだけを置く
   * （design.md「AuthContext・ProtectedRoute（変更）」、user-authentication タスク47.6）
   * @requirement user-authentication/REQ-34.3
   * @requirement user-authentication/REQ-37.7
   */
  describe('利用者の状態による制限中のレイアウト', () => {
    it.each([
      ['2FA 未登録', { twoFactorEnabled: false, mustChangePassword: false }],
      ['初回のパスワード変更中', { twoFactorEnabled: false, mustChangePassword: true }],
    ])(
      '%s の利用者にはナビゲーションを出さず、ログアウトのボタンだけを置く',
      async (_label, flags) => {
        const logout = vi.fn().mockResolvedValue(undefined);
        mockUseAuth.mockReturnValue({
          user: { ...mockUser, ...flags },
          isLoading: false,
          error: null,
          logout,
          sessionExpiredDuringOperation: false,
          handleReauthSuccess: mockHandleReauthSuccess,
          navigateToLogin: mockNavigateToLogin,
        });

        renderWithRouter('/profile');

        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByTestId('profile-content')).toBeInTheDocument();
        const logoutButton = screen.getByRole('button', { name: 'ログアウト' });

        logoutButton.click();

        expect(logout).toHaveBeenCalledTimes(1);
      }
    );

    it('制限の無い利用者には共通のナビゲーションを出す', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isLoading: false,
        error: null,
        logout: vi.fn(),
        sessionExpiredDuringOperation: false,
        handleReauthSuccess: mockHandleReauthSuccess,
        navigateToLogin: mockNavigateToLogin,
      });

      renderWithRouter('/profile');

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });
});
