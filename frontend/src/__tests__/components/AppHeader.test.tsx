import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../../components/Navigation/AppHeader';
import { AuthContext, AuthContextValue } from '../../contexts/AuthContext';

// useNavigateをモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// AuthContextのモック値を作成するヘルパー関数
function createMockAuthContextValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
      roles: ['user'],
    },
    isLoading: false,
    isInitialized: true,
    sessionExpired: false,
    twoFactorState: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    clearSessionExpired: vi.fn(),
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
    ...overrides,
  };
}

describe('AppHeader - タスク23.2: ナビゲーションコンポーネントの認証状態対応', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本的なレンダリング', () => {
    /**
     * 要件28.4: 認証済みユーザーにはヘッダーナビゲーションが表示される
     */
    it('should render header with logo and user display name', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // ロゴが表示されることを確認
      expect(screen.getByText('ArchiTrack')).toBeInTheDocument();

      // ユーザー名が表示されることを確認
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    /**
     * ダッシュボードリンクが表示される
     */
    it('should render dashboard link', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByRole('link', { name: /ダッシュボード/i })).toBeInTheDocument();
    });

    /**
     * セマンティックなHTML構造（header要素）を使用
     */
    it('should use semantic header element', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    /**
     * nav要素がナビゲーション領域として存在する
     */
    it('should use nav element for navigation', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('ユーザーメニュー', () => {
    /**
     * ユーザーメニューのドロップダウンが動作する
     */
    it('should toggle user dropdown menu on click', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // ユーザー名ボタンをクリック
      const userButton = screen.getByRole('button', { name: /Test User/i });
      await user.click(userButton);

      // ドロップダウンメニューが表示される
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /プロフィール/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /ログアウト/i })).toBeInTheDocument();
    });

    /**
     * プロフィールリンクをクリックすると/profileに遷移する
     */
    it('should navigate to /profile when profile menu item is clicked', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // ユーザーメニューを開く
      const userButton = screen.getByRole('button', { name: /Test User/i });
      await user.click(userButton);

      // プロフィールをクリック
      const profileMenuItem = screen.getByRole('menuitem', { name: /プロフィール/i });
      await user.click(profileMenuItem);

      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });

    /**
     * ログアウトをクリックするとlogout関数が呼び出される
     */
    it('should call logout when logout menu item is clicked', async () => {
      const user = userEvent.setup();
      const mockLogout = vi.fn();
      const mockAuthValue = createMockAuthContextValue({ logout: mockLogout });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // ユーザーメニューを開く
      const userButton = screen.getByRole('button', { name: /Test User/i });
      await user.click(userButton);

      // ログアウトをクリック
      const logoutMenuItem = screen.getByRole('menuitem', { name: /ログアウト/i });
      await user.click(logoutMenuItem);

      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('管理者メニュー', () => {
    /**
     * 一般ユーザーには管理メニューが表示されない
     */
    it('should not show admin menu for regular users', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Regular User',
          roles: ['user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.queryByRole('button', { name: /管理メニュー/i })).not.toBeInTheDocument();
    });

    /**
     * 管理者には管理メニューが表示される
     */
    it('should show admin menu for admin users', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin', 'user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByRole('button', { name: /管理メニュー/i })).toBeInTheDocument();
    });

    /**
     * 管理メニューのドロップダウンが動作する
     */
    it('should toggle admin dropdown menu on click', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin', 'user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // 管理メニューボタンをクリック
      const adminButton = screen.getByRole('button', { name: /管理メニュー/i });
      await user.click(adminButton);

      // ドロップダウンメニューが表示される
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /ユーザー管理/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /招待管理/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /監査ログ/i })).toBeInTheDocument();
    });

    /**
     * 管理メニューの各項目が正しい遷移先を持つ
     */
    it('should navigate to correct admin pages', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin', 'user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // 管理メニューを開く
      const adminButton = screen.getByRole('button', { name: /管理メニュー/i });
      await user.click(adminButton);

      // ユーザー管理をクリック
      const userMgmtItem = screen.getByRole('menuitem', { name: /ユーザー管理/i });
      await user.click(userMgmtItem);

      expect(mockNavigate).toHaveBeenCalledWith('/admin/users');
    });

    /**
     * 招待管理リンクが正しく動作する
     */
    it('should navigate to invitation management page', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin', 'user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // 管理メニューを開く
      const adminButton = screen.getByRole('button', { name: /管理メニュー/i });
      await user.click(adminButton);

      // 招待管理をクリック
      const invitationItem = screen.getByRole('menuitem', { name: /招待管理/i });
      await user.click(invitationItem);

      expect(mockNavigate).toHaveBeenCalledWith('/admin/invitations');
    });

    /**
     * 監査ログリンクが正しく動作する
     */
    it('should navigate to audit logs page', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin', 'user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // 管理メニューを開く
      const adminButton = screen.getByRole('button', { name: /管理メニュー/i });
      await user.click(adminButton);

      // 監査ログをクリック
      const auditLogsItem = screen.getByRole('menuitem', { name: /監査ログ/i });
      await user.click(auditLogsItem);

      expect(mockNavigate).toHaveBeenCalledWith('/admin/audit-logs');
    });
  });

  describe('アクセシビリティ', () => {
    /**
     * ドロップダウンメニューがキーボード操作に対応している
     */
    it('should support keyboard navigation for dropdown', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // ユーザーボタンにフォーカスしてEnterで開く
      const userButton = screen.getByRole('button', { name: /Test User/i });
      userButton.focus();
      await user.keyboard('{Enter}');

      // メニューが開かれることを確認
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    /**
     * Escapeキーでドロップダウンが閉じる
     */
    it('should close dropdown on Escape key', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // メニューを開く
      const userButton = screen.getByRole('button', { name: /Test User/i });
      await user.click(userButton);

      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Escapeで閉じる
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    /**
     * aria-expanded属性が正しく設定される
     */
    it('should have correct aria-expanded attribute on dropdown trigger', async () => {
      const user = userEvent.setup();
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const userButton = screen.getByRole('button', { name: /Test User/i });

      // 初期状態: 閉じている
      expect(userButton).toHaveAttribute('aria-expanded', 'false');

      // クリックして開く
      await user.click(userButton);
      expect(userButton).toHaveAttribute('aria-expanded', 'true');
    });

    /**
     * aria-haspopup属性が正しく設定される
     */
    it('should have aria-haspopup="menu" on dropdown triggers', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin', 'user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const userButton = screen.getByRole('button', { name: /Admin User/i });
      const adminButton = screen.getByRole('button', { name: /管理メニュー/i });

      expect(userButton).toHaveAttribute('aria-haspopup', 'menu');
      expect(adminButton).toHaveAttribute('aria-haspopup', 'menu');
    });
  });

  describe('認証状態の反映', () => {
    /**
     * ユーザー情報が更新されるとヘッダーに反映される
     */
    it('should reflect updated user display name', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Updated Display Name',
          roles: ['user'],
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByText('Updated Display Name')).toBeInTheDocument();
    });

    /**
     * ロールが更新されると管理メニューの表示が更新される
     */
    it('should show admin menu when user role is updated to admin', () => {
      // 初期状態: 一般ユーザー
      const initialAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
          roles: ['user'],
        },
      });

      const { rerender } = render(
        <AuthContext.Provider value={initialAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // 管理メニューが表示されないことを確認
      expect(screen.queryByRole('button', { name: /管理メニュー/i })).not.toBeInTheDocument();

      // 管理者にロールを更新
      const updatedAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
          roles: ['admin', 'user'],
        },
      });

      rerender(
        <AuthContext.Provider value={updatedAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // 管理メニューが表示されることを確認
      expect(screen.getByRole('button', { name: /管理メニュー/i })).toBeInTheDocument();
    });
  });

  describe('ロゴリンク', () => {
    /**
     * ロゴをクリックするとダッシュボードに遷移する
     */
    it('should navigate to dashboard when logo is clicked', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const logoLink = screen.getByRole('link', { name: /ArchiTrack/i });
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });
});
