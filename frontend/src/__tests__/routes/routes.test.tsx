/**
 * @fileoverview ルーティング設定のテスト
 *
 * Task 10.3: ルーティング設定
 *
 * Requirements:
 * - 21.2: ユーザーがヘッダーの「プロジェクト」リンクをクリックするとプロジェクト一覧画面（/projects）に遷移する
 * - 21.6: ユーザーがダッシュボードの「プロジェクト管理」カードをクリックするとプロジェクト一覧画面（/projects）に遷移する
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';

// AuthContextモック
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      displayName: 'Test User',
    },
    hasRole: () => true,
    hasPermission: () => true,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// APIクライアントモック
vi.mock('../../api/projects', () => ({
  getProjects: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getProject: vi.fn().mockResolvedValue({
    id: 'test-id',
    name: 'Test Project',
    customerName: 'Test Customer',
    salesPerson: { id: 'sp-1', displayName: 'Sales Person' },
    status: 'PREPARING',
    statusLabel: '準備中',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }),
  getStatusHistory: vi.fn().mockResolvedValue([]),
  createProject: vi.fn(),
  getAssignableUsers: vi.fn().mockResolvedValue([]),
  searchCustomers: vi.fn().mockResolvedValue([]),
}));

// ページコンポーネントモック
vi.mock('../../pages/ProjectListPage', () => ({
  default: () => <div data-testid="project-list-page">Project List Page</div>,
}));

vi.mock('../../pages/ProjectDetailPage', () => ({
  default: () => <div data-testid="project-detail-page">Project Detail Page</div>,
}));

vi.mock('../../pages/ProjectCreatePage', () => ({
  default: () => <div data-testid="project-create-page">Project Create Page</div>,
}));

vi.mock('../../pages/Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard-page">Dashboard</div>,
}));

// 取引先ページコンポーネントモック
vi.mock('../../pages/TradingPartnerListPage', () => ({
  default: () => <div data-testid="trading-partner-list-page">Trading Partner List Page</div>,
}));

vi.mock('../../pages/TradingPartnerDetailPage', () => ({
  default: () => <div data-testid="trading-partner-detail-page">Trading Partner Detail Page</div>,
}));

vi.mock('../../pages/TradingPartnerCreatePage', () => ({
  default: () => <div data-testid="trading-partner-create-page">Trading Partner Create Page</div>,
}));

vi.mock('../../pages/TradingPartnerEditPage', () => ({
  default: () => <div data-testid="trading-partner-edit-page">Trading Partner Edit Page</div>,
}));

vi.mock('../../components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/ProtectedLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    ProtectedLayout: () => (
      <div data-testid="protected-layout">
        <nav>Header</nav>
        <Outlet />
      </div>
    ),
  };
});

describe('Routes - Project Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/projects ルート', () => {
    it('/projects にアクセスするとプロジェクト一覧ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('project-list-page')).toBeInTheDocument();
      });
    });

    it('/projects はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/projects/new ルート', () => {
    it('/projects/new にアクセスするとプロジェクト作成ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('project-create-page')).toBeInTheDocument();
      });
    });

    it('/projects/new はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/projects/:id ルート', () => {
    it('/projects/:id にアクセスするとプロジェクト詳細ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
      });
    });

    it('/projects/:id はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('ルート順序', () => {
    it('/projects/new は /projects/:id より先にマッチする', async () => {
      // /projects/new に "new" がIDとして解釈されないことを確認
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('project-create-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('project-detail-page')).not.toBeInTheDocument();
    });
  });
});

/**
 * 取引先管理ルートのテスト
 *
 * Task 12.6: routes.tsx 取引先ルート追加
 *
 * Requirements:
 * - 12.9: 取引先一覧ページを /trading-partners のURLで提供する
 * - 12.10: 取引先新規作成ページを /trading-partners/new のURLで提供する
 * - 12.11: 取引先詳細ページを /trading-partners/:id のURLで提供する
 * - 12.12: 取引先編集ページを /trading-partners/:id/edit のURLで提供する
 * - 12.24: 取引先管理ページ群をProtectedRouteで保護し、認証済みユーザーのみアクセスを許可する
 * - 12.25: 取引先管理ページ群にProtectedLayout（AppHeader付き）を適用する
 * - 12.26: 未認証ユーザーが取引先管理ページにアクセスした場合はログインページにリダイレクトする
 * - 12.27: ログイン後は元のページ（リダイレクト元の取引先ページ）に遷移する
 */
describe('Routes - Trading Partner Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/trading-partners ルート (REQ-12.9)', () => {
    it('/trading-partners にアクセスすると取引先一覧ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('trading-partner-list-page')).toBeInTheDocument();
      });
    });

    it('/trading-partners はProtectedLayoutでラップされている (REQ-12.25)', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/trading-partners/new ルート (REQ-12.10)', () => {
    it('/trading-partners/new にアクセスすると取引先作成ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('trading-partner-create-page')).toBeInTheDocument();
      });
    });

    it('/trading-partners/new はProtectedLayoutでラップされている (REQ-12.25)', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/trading-partners/:id ルート (REQ-12.11)', () => {
    it('/trading-partners/:id にアクセスすると取引先詳細ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/test-partner-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('trading-partner-detail-page')).toBeInTheDocument();
      });
    });

    it('/trading-partners/:id はProtectedLayoutでラップされている (REQ-12.25)', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/test-partner-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/trading-partners/:id/edit ルート (REQ-12.12)', () => {
    it('/trading-partners/:id/edit にアクセスすると取引先編集ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/test-partner-id/edit'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('trading-partner-edit-page')).toBeInTheDocument();
      });
    });

    it('/trading-partners/:id/edit はProtectedLayoutでラップされている (REQ-12.25)', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/test-partner-id/edit'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('ルート順序', () => {
    it('/trading-partners/new は /trading-partners/:id より先にマッチする', async () => {
      // /trading-partners/new に "new" がIDとして解釈されないことを確認
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('trading-partner-create-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('trading-partner-detail-page')).not.toBeInTheDocument();
    });

    it('/trading-partners/:id/edit は /trading-partners/:id より先にマッチする', async () => {
      // /trading-partners/:id/edit が正しくマッチすることを確認
      const router = createMemoryRouter(routes, {
        initialEntries: ['/trading-partners/test-id/edit'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('trading-partner-edit-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('trading-partner-detail-page')).not.toBeInTheDocument();
    });
  });
});
