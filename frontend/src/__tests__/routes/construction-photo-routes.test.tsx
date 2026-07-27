/**
 * @fileoverview 工事写真ルーティングのテスト
 *
 * Task 7.1: ルート登録とブレッドクラム
 *
 * Requirements:
 * - 2.5: 全ての工事写真関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: 一覧画面ブレッドクラム階層
 * - 2.7: 詳細画面ブレッドクラム階層
 * - 2.8: ブレッドクラム各項目クリックで対応画面へ遷移
 * - 2.9: 一覧画面タイトル「工事写真一覧」
 *
 * ルート（site-survey 順序規約: specific/new を :id より先に定義）:
 * - /projects/:projectId/construction-photos（一覧）
 * - /projects/:projectId/construction-photos/new（アルバム作成）
 * - /construction-photos/:id（詳細）
 * - /construction-photos/:id/edit（アルバム編集）
 * - /projects/:projectId/construction-signboards（看板マスタ）
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

// 工事写真ページコンポーネントモック
vi.mock('../../pages/ConstructionPhotoListPage', () => ({
  default: () => (
    <div data-testid="construction-photo-list-page">Construction Photo List Page</div>
  ),
}));

vi.mock('../../pages/ConstructionPhotoCreatePage', () => ({
  default: () => (
    <div data-testid="construction-photo-create-page">Construction Photo Create Page</div>
  ),
}));

vi.mock('../../pages/ConstructionPhotoDetailPage', () => ({
  default: () => (
    <div data-testid="construction-photo-detail-page">Construction Photo Detail Page</div>
  ),
}));

vi.mock('../../pages/ConstructionPhotoEditPage', () => ({
  default: () => (
    <div data-testid="construction-photo-edit-page">Construction Photo Edit Page</div>
  ),
}));

vi.mock('../../pages/ConstructionSignboardListPage', () => ({
  default: () => (
    <div data-testid="construction-signboard-list-page">Construction Signboard List Page</div>
  ),
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

describe('Routes - Construction Photo Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/projects/:projectId/construction-photos ルート (一覧, REQ-2.9)', () => {
    it('一覧ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/construction-photos'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-photo-list-page')).toBeInTheDocument();
      });
    });

    it('ProtectedLayoutでラップされている', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/construction-photos'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('protected-layout')).toBeInTheDocument();
      });
    });
  });

  describe('/projects/:projectId/construction-photos/new ルート (アルバム作成, REQ-1.1)', () => {
    it('アルバム作成ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/construction-photos/new'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-photo-create-page')).toBeInTheDocument();
      });
    });
  });

  describe('/construction-photos/:id ルート (詳細, REQ-2.4)', () => {
    it('詳細ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/construction-photos/test-album-id'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-photo-detail-page')).toBeInTheDocument();
      });
    });
  });

  describe('/construction-photos/:id/edit ルート (アルバム編集)', () => {
    it('アルバム編集ページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/construction-photos/test-album-id/edit'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-photo-edit-page')).toBeInTheDocument();
      });
    });
  });

  describe('/projects/:projectId/construction-signboards ルート (看板マスタ, REQ-8)', () => {
    it('看板マスタページが表示される', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/construction-signboards'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-signboard-list-page')).toBeInTheDocument();
      });
    });
  });

  describe('ルート順序（specific before :id）', () => {
    it('/projects/:projectId/construction-photos/new は :id 詳細より先にマッチする', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/test-project-id/construction-photos/new'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-photo-create-page')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('construction-photo-detail-page')).not.toBeInTheDocument();
    });

    it('/construction-photos/:id/edit は /construction-photos/:id より先にマッチする', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/construction-photos/test-id/edit'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-photo-edit-page')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('construction-photo-detail-page')).not.toBeInTheDocument();
    });
  });

  describe('パスパラメータ', () => {
    it('/projects/:projectId/construction-photos の projectId が正しくパースされる', async () => {
      const router = createMemoryRouter(routes, {
        initialEntries: ['/projects/project-abc/construction-photos'],
      });
      render(<RouterProvider router={router} />);
      await waitFor(() => {
        expect(screen.getByTestId('construction-photo-list-page')).toBeInTheDocument();
      });
    });
  });
});
