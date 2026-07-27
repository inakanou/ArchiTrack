/**
 * @fileoverview 工事写真ブレッドクラム階層のテスト
 *
 * Task 7.1: ルート登録とブレッドクラム
 *
 * 実際の `routes` を通して各画面を描画し、URL→パスパラメータ→画面→ブレッドクラムの
 * 結線を検証する（APIはモック）。6.x の画面は変更せず、画面内蔵のブレッドクラムが
 * 規定階層（2.6/2.7）と一覧タイトル（2.9）を満たすことを確認する。
 *
 * Requirements:
 * - 2.5: 全ての工事写真関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: 一覧: ダッシュボード > プロジェクト一覧 > プロジェクト > 工事写真一覧
 * - 2.7: 詳細: ダッシュボード > プロジェクト一覧 > プロジェクト > 工事写真一覧 > 工事写真
 * - 2.8: ブレッドクラム各項目クリックで対応画面へ遷移（リンク先URL検証）
 * - 2.9: 一覧画面タイトル「工事写真一覧」
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';

// AuthContextモック（保護ルート通過）
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'u1', email: 'test@example.com', displayName: 'Test User' },
    hasRole: () => true,
    hasPermission: () => true,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/ProtectedLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    ProtectedLayout: () => (
      <div data-testid="protected-layout">
        <Outlet />
      </div>
    ),
  };
});

// トースト（看板画面が利用）
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    addToast: vi.fn(),
    removeToast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    projectCreated: vi.fn(),
    projectUpdated: vi.fn(),
    projectDeleted: vi.fn(),
    projectStatusChanged: vi.fn(),
    operationFailed: vi.fn(),
  }),
}));

// API モック
vi.mock('../../api/projects', () => ({
  getProject: vi.fn().mockResolvedValue({
    id: 'project-123',
    name: 'テストプロジェクト',
    status: 'PREPARING',
    statusLabel: '準備中',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }),
}));

vi.mock('../../api/construction-photos', () => ({
  getConstructionPhotoAlbums: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  }),
  getConstructionPhotoAlbum: vi.fn().mockResolvedValue({
    id: 'album-1',
    projectId: 'project-123',
    name: '基礎工事アルバム',
    memo: null,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-16T00:00:00.000Z',
  }),
}));

vi.mock('../../api/construction-photo-images', () => ({
  getConstructionPhotos: vi.fn().mockResolvedValue([]),
  updateConstructionPhotoMetadataBatch: vi.fn(),
  updateConstructionPhotoOrder: vi.fn(),
  deleteConstructionPhoto: vi.fn(),
}));

vi.mock('../../api/construction-signboards', () => ({
  getConstructionSignboards: vi.fn().mockResolvedValue([]),
  createConstructionSignboard: vi.fn(),
  updateConstructionSignboard: vi.fn(),
  deleteConstructionSignboard: vi.fn(),
}));

const renderAt = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
};

beforeEach(() => {
  vi.clearAllMocks();
  // レスポンシブ画面が matchMedia を利用
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('工事写真ブレッドクラム階層', () => {
  it('一覧画面: 階層 (2.6) とタイトル (2.9) を表示し、各項目が対応URLへリンクする (2.8)', async () => {
    renderAt('/projects/project-123/construction-photos');

    // タイトル (2.9)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '工事写真一覧' })).toBeInTheDocument();
    });

    // ブレッドクラム階層 (2.6)
    const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
    const scoped = within(nav);
    expect(scoped.getByText('ダッシュボード')).toBeInTheDocument();
    expect(scoped.getByText('プロジェクト一覧')).toBeInTheDocument();
    expect(scoped.getByText('テストプロジェクト')).toBeInTheDocument();
    expect(scoped.getByText('工事写真一覧')).toBeInTheDocument();

    // リンク先URL (2.8)
    expect(scoped.getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute('href', '/');
    expect(scoped.getByRole('link', { name: 'プロジェクト一覧' })).toHaveAttribute(
      'href',
      '/projects'
    );
    expect(scoped.getByRole('link', { name: 'テストプロジェクト' })).toHaveAttribute(
      'href',
      '/projects/project-123'
    );
  });

  it('詳細画面: 階層 (2.7) を表示し「工事写真一覧」が一覧URLへリンクする (2.8)', async () => {
    renderAt('/construction-photos/album-1');

    const nav = await screen.findByRole('navigation', { name: 'パンくずナビゲーション' });
    const scoped = within(nav);

    expect(scoped.getByText('ダッシュボード')).toBeInTheDocument();
    expect(scoped.getByText('プロジェクト一覧')).toBeInTheDocument();
    expect(scoped.getByText('テストプロジェクト')).toBeInTheDocument();
    expect(scoped.getByText('工事写真一覧')).toBeInTheDocument();
    // 末尾は工事写真（アルバム名）
    expect(scoped.getByText('基礎工事アルバム')).toBeInTheDocument();

    // 「工事写真一覧」は一覧URLへ遷移するリンク (2.8)
    expect(scoped.getByRole('link', { name: '工事写真一覧' })).toHaveAttribute(
      'href',
      '/projects/project-123/construction-photos'
    );
  });

  it('看板マスタ画面: ブレッドクラムに工事写真一覧階層を表示する (2.5)', async () => {
    renderAt('/projects/project-123/construction-signboards');

    const nav = await screen.findByRole('navigation', { name: 'パンくずナビゲーション' });
    const scoped = within(nav);

    expect(scoped.getByText('ダッシュボード')).toBeInTheDocument();
    expect(scoped.getByText('テストプロジェクト')).toBeInTheDocument();
    expect(scoped.getByRole('link', { name: '工事写真一覧' })).toHaveAttribute(
      'href',
      '/projects/project-123/construction-photos'
    );
  });
});
