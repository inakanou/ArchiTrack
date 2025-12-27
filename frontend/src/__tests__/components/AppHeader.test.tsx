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

  /**
   * タスク10.1: AppHeaderへのプロジェクトリンク追加
   *
   * 要件:
   * - 21.1: ナビゲーションメニューにプロジェクト管理へのリンクが表示されている
   * - 21.2: プロジェクトリンクをクリックするとプロジェクト一覧ページに遷移する
   * - 21.3: プロジェクトリンクはアイコン付きで表示される
   * - 21.4: プロジェクトリンクはダッシュボードリンクの隣に配置される
   */
  describe('プロジェクトリンク（タスク10.1）', () => {
    /**
     * REQ-21.1: ナビゲーションメニューにプロジェクト管理へのリンクが表示されている
     */
    it('should render project link in navigation', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByRole('link', { name: /プロジェクト/i })).toBeInTheDocument();
    });

    /**
     * REQ-21.2: プロジェクトリンクをクリックするとプロジェクト一覧ページ（/projects）に遷移する
     */
    it('should have correct href to /projects', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const projectLink = screen.getByRole('link', { name: /プロジェクト/i });
      expect(projectLink).toHaveAttribute('href', '/projects');
    });

    /**
     * REQ-21.3: プロジェクトリンクはアイコン付きで表示される
     */
    it('should render project link with icon', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const projectLink = screen.getByRole('link', { name: /プロジェクト/i });
      // SVGアイコンが含まれていることを確認
      const svg = projectLink.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    /**
     * REQ-21.4: プロジェクトリンクはダッシュボードリンクの隣（右側）に配置される
     */
    it('should render project link after dashboard link', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const dashboardLink = screen.getByRole('link', { name: /ダッシュボード/i });
      const projectLink = screen.getByRole('link', { name: /プロジェクト/i });

      // DOM順序でプロジェクトリンクがダッシュボードリンクの後に来ることを確認
      const nav = screen.getByRole('navigation');
      const links = nav.querySelectorAll('a.app-header-nav-link');

      // linksをArrayに変換
      const linksArray = Array.from(links);

      const dashboardIndex = linksArray.indexOf(dashboardLink);
      const projectIndex = linksArray.indexOf(projectLink);

      expect(dashboardIndex).toBeLessThan(projectIndex);
      expect(projectIndex).toBe(dashboardIndex + 1);
    });

    /**
     * プロジェクトリンクが正しいCSSクラスを持つ
     */
    it('should have correct CSS class on project link', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const projectLink = screen.getByRole('link', { name: /プロジェクト/i });
      expect(projectLink).toHaveClass('app-header-nav-link');
    });

    /**
     * プロジェクトリンクにテキスト「プロジェクト」が表示される
     */
    it('should display text "プロジェクト" in link', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByText('プロジェクト')).toBeInTheDocument();
    });
  });

  /**
   * タスク12.7: AppHeaderへの取引先リンク追加
   *
   * 要件:
   * - 12.1: AppHeaderのメインナビゲーションに「取引先」リンクを表示する
   * - 12.2: 認証済みユーザーがAppHeaderの「取引先」リンクをクリックしたとき、取引先一覧ページ（/trading-partners）に遷移する
   * - 12.3: 「取引先」リンクにアイコン（ビルディングアイコン）を付与して視認性を高める
   * - 12.4: 「取引先」リンクを「プロジェクト」リンクの次に配置する
   */
  describe('取引先リンク（タスク12.7）', () => {
    /**
     * REQ-12.1: AppHeaderのメインナビゲーションに「取引先」リンクを表示する
     */
    it('should render trading partner link in navigation', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByRole('link', { name: /取引先/i })).toBeInTheDocument();
    });

    /**
     * REQ-12.2: 認証済みユーザーがAppHeaderの「取引先」リンクをクリックしたとき、
     * 取引先一覧ページ（/trading-partners）に遷移する
     */
    it('should have correct href to /trading-partners', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const tradingPartnerLink = screen.getByRole('link', { name: /取引先/i });
      expect(tradingPartnerLink).toHaveAttribute('href', '/trading-partners');
    });

    /**
     * REQ-12.3: 「取引先」リンクにアイコン（ビルディングアイコン）を付与して視認性を高める
     */
    it('should render trading partner link with icon', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const tradingPartnerLink = screen.getByRole('link', { name: /取引先/i });
      // SVGアイコンが含まれていることを確認
      const svg = tradingPartnerLink.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    /**
     * REQ-12.4: 「取引先」リンクを「プロジェクト」リンクの次に配置する
     */
    it('should render trading partner link after project link', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const projectLink = screen.getByRole('link', { name: /プロジェクト/i });
      const tradingPartnerLink = screen.getByRole('link', { name: /取引先/i });

      // DOM順序で取引先リンクがプロジェクトリンクの後に来ることを確認
      const nav = screen.getByRole('navigation');
      const links = nav.querySelectorAll('a.app-header-nav-link');

      // linksをArrayに変換
      const linksArray = Array.from(links);

      const projectIndex = linksArray.indexOf(projectLink);
      const tradingPartnerIndex = linksArray.indexOf(tradingPartnerLink);

      expect(projectIndex).toBeLessThan(tradingPartnerIndex);
      expect(tradingPartnerIndex).toBe(projectIndex + 1);
    });

    /**
     * 取引先リンクが正しいCSSクラスを持つ
     */
    it('should have correct CSS class on trading partner link', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const tradingPartnerLink = screen.getByRole('link', { name: /取引先/i });
      expect(tradingPartnerLink).toHaveClass('app-header-nav-link');
    });

    /**
     * 取引先リンクにテキスト「取引先」が表示される
     */
    it('should display text "取引先" in link', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByText('取引先')).toBeInTheDocument();
    });

    /**
     * ナビゲーションリンクの順序が正しい（ダッシュボード → プロジェクト → 取引先）
     */
    it('should have correct navigation link order: Dashboard > Project > Trading Partner', () => {
      const mockAuthValue = createMockAuthContextValue();

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      const nav = screen.getByRole('navigation');
      const links = nav.querySelectorAll('a.app-header-nav-link');
      const linksArray = Array.from(links);

      const dashboardLink = screen.getByRole('link', { name: /ダッシュボード/i });
      const projectLink = screen.getByRole('link', { name: /プロジェクト/i });
      const tradingPartnerLink = screen.getByRole('link', { name: /取引先/i });

      const dashboardIndex = linksArray.indexOf(dashboardLink);
      const projectIndex = linksArray.indexOf(projectLink);
      const tradingPartnerIndex = linksArray.indexOf(tradingPartnerLink);

      expect(dashboardIndex).toBe(0);
      expect(projectIndex).toBe(1);
      expect(tradingPartnerIndex).toBe(2);
    });
  });

  describe('イニシャル表示', () => {
    /**
     * displayNameがundefinedの場合「U」が表示される
     */
    it('should show "U" when displayName is undefined', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: '',
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

      // イニシャル「U」が表示されることを確認
      expect(screen.getByText('U')).toBeInTheDocument();
    });

    /**
     * displayNameがundefinedの場合「ユーザー」が表示される
     */
    it('should show "ユーザー" when displayName is undefined', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: '',
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

      expect(screen.getByText('ユーザー')).toBeInTheDocument();
    });

    /**
     * 2単語の名前の場合、両方の頭文字が表示される
     */
    it('should show initials from two-word name', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'John Doe',
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

      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    /**
     * 1単語の名前の場合、最初の2文字が表示される
     */
    it('should show first 2 characters for single-word name', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Admin',
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

      expect(screen.getByText('AD')).toBeInTheDocument();
    });
  });

  describe('キーボードナビゲーション詳細', () => {
    /**
     * ArrowDownでメニューが開く
     */
    it('should open dropdown with ArrowDown key', async () => {
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
      userButton.focus();
      await user.keyboard('{ArrowDown}');

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    /**
     * Spaceキーでメニューが開く
     */
    it('should open dropdown with Space key', async () => {
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
      userButton.focus();
      await user.keyboard(' ');

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    /**
     * ArrowDown/ArrowUpでメニュー内をナビゲート
     */
    it('should navigate menu items with ArrowDown/ArrowUp', async () => {
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
      await user.click(userButton);

      // ArrowDownで最初のアイテム（プロフィール）へ
      await user.keyboard('{ArrowDown}');
      const profileItem = screen.getByRole('menuitem', { name: /プロフィール/i });
      expect(profileItem).toHaveClass('is-focused');

      // さらにArrowDownで次のアイテム（ログアウト）へ
      await user.keyboard('{ArrowDown}');
      const logoutItem = screen.getByRole('menuitem', { name: /ログアウト/i });
      expect(logoutItem).toHaveClass('is-focused');

      // ArrowUpで前のアイテム（プロフィール）へ
      await user.keyboard('{ArrowUp}');
      expect(profileItem).toHaveClass('is-focused');
    });

    /**
     * Enterキーでフォーカス中のアイテムを選択
     */
    it('should select focused item with Enter key', async () => {
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
      await user.click(userButton);

      // ArrowDownで最初のアイテム（プロフィール）を選択
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });

    /**
     * マウスエンターでフォーカスが移動する
     */
    it('should focus item on mouse enter', async () => {
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
      await user.click(userButton);

      const logoutItem = screen.getByRole('menuitem', { name: /ログアウト/i });
      await user.hover(logoutItem);

      expect(logoutItem).toHaveClass('is-focused');
    });

    /**
     * 循環ナビゲーション：最後から最初へ
     */
    it('should wrap around from last to first item with ArrowDown', async () => {
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
      await user.click(userButton);

      // 最後のアイテムまで移動
      await user.keyboard('{ArrowDown}'); // プロフィール
      await user.keyboard('{ArrowDown}'); // ログアウト
      await user.keyboard('{ArrowDown}'); // 循環して最初へ

      const profileItem = screen.getByRole('menuitem', { name: /プロフィール/i });
      expect(profileItem).toHaveClass('is-focused');
    });

    /**
     * 循環ナビゲーション：最初から最後へ
     */
    it('should wrap around from first to last item with ArrowUp', async () => {
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
      await user.click(userButton);

      // ArrowUpで最後のアイテムへ循環
      await user.keyboard('{ArrowUp}');

      const logoutItem = screen.getByRole('menuitem', { name: /ログアウト/i });
      expect(logoutItem).toHaveClass('is-focused');
    });
  });

  describe('外部クリックでメニューを閉じる', () => {
    /**
     * メニュー外をクリックするとメニューが閉じる
     */
    it('should close menu when clicking outside', async () => {
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
      await user.click(userButton);

      expect(screen.getByRole('menu')).toBeInTheDocument();

      // メニュー外をクリック
      await user.click(document.body);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('ユーザー情報エッジケース', () => {
    /**
     * rolesがundefinedの場合でもクラッシュしない
     */
    it('should handle undefined roles gracefully', () => {
      const mockAuthValue = createMockAuthContextValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
          roles: undefined,
        },
      });

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // 管理メニューは表示されない
      expect(screen.queryByRole('button', { name: /管理メニュー/i })).not.toBeInTheDocument();
    });
  });
});
