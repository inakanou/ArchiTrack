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
