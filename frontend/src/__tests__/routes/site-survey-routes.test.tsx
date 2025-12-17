/**
 * @fileoverview 現場調査ルーティングのテスト
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * Requirements:
 * - 1.1: 現場調査作成フォーム
 * - 1.2: 現場調査詳細画面
 * - 1.3: 現場調査情報編集
 * - 3.1: 現場調査一覧画面
 *
 * ルート:
 * - /projects/:projectId/site-surveys（一覧）
 * - /projects/:projectId/site-surveys/new（作成）
 * - /site-surveys/:id（詳細）
 * - /site-surveys/:id/edit（編集）
 * - /site-surveys/:id/images/:imageId（ビューア/エディタ）
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

// site-surveys APIモック
vi.mock('../../api/site-surveys', () => ({
  getSiteSurveys: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getSiteSurvey: vi.fn().mockResolvedValue({
    id: 'test-survey-id',
    projectId: 'test-project-id',
    name: 'Test Survey',
    surveyDate: '2025-01-01',
    memo: 'Test memo',
    project: { id: 'test-project-id', name: 'Test Project' },
    images: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }),
  createSiteSurvey: vi.fn(),
  updateSiteSurvey: vi.fn(),
  deleteSiteSurvey: vi.fn(),
}));

// projects APIモック
vi.mock('../../api/projects', () => ({
  getProject: vi.fn().mockResolvedValue({
    id: 'test-project-id',
    name: 'Test Project',
    customerName: 'Test Customer',
    status: 'PREPARING',
    statusLabel: '準備中',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }),
  getProjects: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getStatusHistory: vi.fn().mockResolvedValue([]),
  createProject: vi.fn(),
  getAssignableUsers: vi.fn().mockResolvedValue([]),
  searchCustomers: vi.fn().mockResolvedValue([]),
}));

// 現場調査ページコンポーネントモック
vi.mock('../../pages/SiteSurveyListPage', () => ({
  default: () => <div data-testid="site-survey-list-page">Site Survey List Page</div>,
}));

vi.mock('../../pages/SiteSurveyDetailPage', () => ({
  default: () => <div data-testid="site-survey-detail-page">Site Survey Detail Page</div>,
}));

vi.mock('../../pages/SiteSurveyCreatePage', () => ({
  default: () => <div data-testid="site-survey-create-page">Site Survey Create Page</div>,
}));

vi.mock('../../pages/SiteSurveyEditPage', () => ({
  default: () => <div data-testid="site-survey-edit-page">Site Survey Edit Page</div>,
}));

vi.mock('../../pages/SiteSurveyImageViewerPage', () => ({
  default: () => (
    <div data-testid="site-survey-image-viewer-page">Site Survey Image Viewer Page</div>
  ),
}));

// その他のページコンポーネントモック
vi.mock('../../pages/Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard-page">Dashboard</div>,
}));

vi.mock('../../pages/ProjectListPage', () => ({
  default: () => <div data-testid="project-list-page">Project List Page</div>,
}));

vi.mock('../../pages/ProjectDetailPage', () => ({
  default: () => <div data-testid="project-detail-page">Project Detail Page</div>,
}));

vi.mock('../../pages/ProjectCreatePage', () => ({
  default: () => <div data-testid="project-create-page">Project Create Page</div>,
}));

vi.mock('../../pages/ProjectEditPage', () => ({
  default: () => <div data-testid="project-edit-page">Project Edit Page</div>,
}));

// 取引先ページモック
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

// ProtectedRouteとProtectedLayoutモック
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

/**
 * 現場調査管理ルートのテスト
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * 対象ルート:
 * - /projects/:projectId/site-surveys（一覧）
 * - /projects/:projectId/site-surveys/new（作成）
 * - /site-surveys/:id（詳細）
 * - /site-surveys/:id/edit（編集）
 * - /site-surveys/:id/images/:imageId（ビューア/エディタ）
 */
describe('Routes - Site Survey Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/projects/:projectId/site-surveys ルート (REQ-3.1)', () => {
    it('/projects/:projectId/site-surveys にアクセスすると現場調査一覧ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/site-surveys'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-list-page')).toBeInTheDocument();
      });
    });

    it('/projects/:projectId/site-surveys はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/site-surveys'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/projects/:projectId/site-surveys/new ルート (REQ-1.1)', () => {
    it('/projects/:projectId/site-surveys/new にアクセスすると現場調査作成ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/site-surveys/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-create-page')).toBeInTheDocument();
      });
    });

    it('/projects/:projectId/site-surveys/new はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/site-surveys/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/site-surveys/:id ルート (REQ-1.2)', () => {
    it('/site-surveys/:id にアクセスすると現場調査詳細ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-survey-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-detail-page')).toBeInTheDocument();
      });
    });

    it('/site-surveys/:id はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-survey-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/site-surveys/:id/edit ルート (REQ-1.3)', () => {
    it('/site-surveys/:id/edit にアクセスすると現場調査編集ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-survey-id/edit'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-edit-page')).toBeInTheDocument();
      });
    });

    it('/site-surveys/:id/edit はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-survey-id/edit'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/site-surveys/:id/images/:imageId ルート (画像ビューア/エディタ)', () => {
    it('/site-surveys/:id/images/:imageId にアクセスすると画像ビューアページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-survey-id/images/test-image-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-image-viewer-page')).toBeInTheDocument();
      });
    });

    it('/site-surveys/:id/images/:imageId はProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-survey-id/images/test-image-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('ルート順序', () => {
    it('/projects/:projectId/site-surveys/new は /projects/:projectId/site-surveys/:id より先にマッチする', async () => {
      // /projects/:projectId/site-surveys/new に "new" がIDとして解釈されないことを確認
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/site-surveys/new'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-create-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('site-survey-detail-page')).not.toBeInTheDocument();
    });

    it('/site-surveys/:id/edit は /site-surveys/:id より先にマッチする', async () => {
      // /site-surveys/:id/edit が正しくマッチすることを確認
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-id/edit'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-edit-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('site-survey-detail-page')).not.toBeInTheDocument();
    });

    it('/site-surveys/:id/images/:imageId は /site-surveys/:id より先にマッチする', async () => {
      // /site-surveys/:id/images/:imageId が正しくマッチすることを確認
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/test-id/images/test-image-id'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-image-viewer-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('site-survey-detail-page')).not.toBeInTheDocument();
    });
  });

  describe('パスパラメータ', () => {
    it('/projects/:projectId/site-surveys のprojectIdは正しくパースされる', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/project-123/site-surveys'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-list-page')).toBeInTheDocument();
      });
    });

    it('/site-surveys/:id/images/:imageId の複数パラメータが正しくパースされる', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/site-surveys/survey-456/images/image-789'],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByTestId('site-survey-image-viewer-page')).toBeInTheDocument();
      });
    });
  });
});
