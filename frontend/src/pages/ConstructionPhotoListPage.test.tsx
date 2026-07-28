/**
 * @fileoverview 工事写真一覧ページテスト
 *
 * Task 6.1: 工事写真一覧画面
 *
 * Requirements:
 * - 3.1: プロジェクト配下のアルバムをページネーション付きで表示
 * - 3.2: 他機能同様のレスポンシブUI（デスクトップ表 / モバイルカード）
 * - 3.3: アルバム名での部分一致検索
 * - 3.4: 作成日・更新日でのソート
 * - 3.5, 11.3: 代表サムネイル優先表示
 * - 2.4: 一覧項目選択で詳細画面へ遷移
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ConstructionPhotoListPage from './ConstructionPhotoListPage';
import * as projectsApi from '../api/projects';
import * as constructionPhotosApi from '../api/construction-photos';
import { ApiError } from '../api/client';
import type { PaginatedConstructionPhotoAlbums } from '../types/construction-photo.types';

// react-router-dom のモック（useNavigate のみ差し替え）
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// APIモック
vi.mock('../api/projects');
vi.mock('../api/construction-photos');

// モックデータ
const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト説明',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'tp-1',
  tradingPartner: { id: 'tp-1', name: '取引先A', nameKana: 'トリヒキサキエー' },
  salesPerson: { id: 'user-1', displayName: '営業担当A' },
  constructionPerson: undefined,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// アルバムはサムネURLを持たない DTO だが、サーバ拡張を見越して thumbnailUrl を付与し
// 代表サムネ優先表示（R3.5, R11.3）を検証する。DTO 型へキャストして渡す。
const mockAlbums = {
  data: [
    {
      id: 'album-1',
      projectId: 'project-123',
      name: '基礎工事アルバム',
      memo: 'テストメモ',
      thumbnailUrl: 'https://example.com/thumb-1.jpg',
      createdAt: '2024-01-15T00:00:00.000Z',
      updatedAt: '2024-01-16T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 50,
    total: 1,
    totalPages: 1,
  },
} as unknown as PaginatedConstructionPhotoAlbums;

// テストヘルパー
const renderWithRouter = (initialEntry: string) => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/projects/:projectId/construction-photos"
          element={<ConstructionPhotoListPage />}
        />
      </Routes>
    </MemoryRouter>
  );
};

// matchMedia モックを設定するヘルパー
const setMatchMedia = (matcher: (query: string) => boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: matcher(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe('ConstructionPhotoListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockClear();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(constructionPhotosApi.getConstructionPhotoAlbums).mockResolvedValue(mockAlbums);
    // デフォルトはデスクトップ扱い（全メディアクエリ false → table）
    setMatchMedia(() => false);
  });

  describe('タイトル (Requirement 2.9)', () => {
    it('ページタイトルが「工事写真一覧」で表示されること', async () => {
      renderWithRouter('/projects/project-123/construction-photos');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '工事写真一覧' })).toBeInTheDocument();
      });
    });
  });

  describe('レスポンシブ表示 (Requirement 3.2)', () => {
    it('デスクトップ幅では表形式で表示されること', async () => {
      // デスクトップ: isDesktop のみ true
      setMatchMedia((query) => query === '(min-width: 1024px)');
      renderWithRouter('/projects/project-123/construction-photos');

      await waitFor(() => {
        expect(screen.getByRole('table', { name: '工事写真一覧' })).toBeInTheDocument();
      });
    });

    it('モバイル幅ではカード形式で表示されること', async () => {
      // モバイル: isMobile のみ true
      setMatchMedia((query) => query === '(max-width: 767px)');
      renderWithRouter('/projects/project-123/construction-photos');

      await waitFor(() => {
        expect(screen.getByTestId('album-card-list')).toBeInTheDocument();
      });
      // テーブルは表示されない
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('検索 (Requirement 3.3)', () => {
    it('検索実行時に search パラメータ付きでAPIが呼ばれること', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter('/projects/project-123/construction-photos');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '工事写真一覧' })).toBeInTheDocument();
      });

      vi.mocked(constructionPhotosApi.getConstructionPhotoAlbums).mockClear();

      const searchInput = screen.getByRole('searchbox', { name: '検索キーワード' });
      await user.type(searchInput, '基礎');
      const searchButton = screen.getByRole('button', { name: '検索' });
      await user.click(searchButton);

      await waitFor(() => {
        expect(constructionPhotosApi.getConstructionPhotoAlbums).toHaveBeenCalledWith(
          'project-123',
          expect.objectContaining({ search: '基礎' })
        );
      });
    });
  });

  describe('ページング (Requirement 3.1)', () => {
    it('次のページ操作で page パラメータが更新されてAPIが呼ばれること', async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(constructionPhotosApi.getConstructionPhotoAlbums).mockResolvedValue({
        data: mockAlbums.data,
        pagination: { page: 1, limit: 50, total: 80, totalPages: 2 },
      } as unknown as PaginatedConstructionPhotoAlbums);

      renderWithRouter('/projects/project-123/construction-photos');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '工事写真一覧' })).toBeInTheDocument();
      });

      vi.mocked(constructionPhotosApi.getConstructionPhotoAlbums).mockClear();

      const nextButton = screen.getByRole('button', { name: '次のページ' });
      await user.click(nextButton);

      await waitFor(() => {
        expect(constructionPhotosApi.getConstructionPhotoAlbums).toHaveBeenCalledWith(
          'project-123',
          expect.objectContaining({ page: 2 })
        );
      });
    });
  });

  describe('代表サムネイル優先表示 (Requirements 3.5, 11.3)', () => {
    it('thumbnailUrl があるアルバムはサムネイル画像が表示されること', async () => {
      setMatchMedia((query) => query === '(min-width: 1024px)');
      renderWithRouter('/projects/project-123/construction-photos');

      await waitFor(() => {
        const img = screen.getByAltText('基礎工事アルバムのサムネイル');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'https://example.com/thumb-1.jpg');
      });
    });
  });

  describe('行クリックによるナビゲーション (Requirement 2.4)', () => {
    it('行をクリックすると工事写真詳細ページへ遷移すること', async () => {
      const user = userEvent.setup({ delay: null });
      setMatchMedia((query) => query === '(min-width: 1024px)');
      renderWithRouter('/projects/project-123/construction-photos');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '工事写真一覧' })).toBeInTheDocument();
      });

      const row = screen.getByRole('row', { name: /基礎工事アルバム/i });
      await user.click(row);

      expect(navigateMock).toHaveBeenCalledWith('/construction-photos/album-1');
    });
  });

  // ==========================================================================
  // Task 12.3: 一覧行にアルバム編集・削除導線を追加 (R16.6)
  // ==========================================================================

  describe('一覧行の編集・削除導線 (R16.6)', () => {
    beforeEach(() => {
      vi.mocked(constructionPhotosApi.deleteConstructionPhotoAlbum).mockResolvedValue(undefined);
      setMatchMedia((query) => query === '(min-width: 1024px)');
    });

    it('行の編集ボタン押下でアルバム編集画面へ遷移し、行クリックの詳細遷移は発生しない', async () => {
      renderWithRouter('/projects/project-123/construction-photos');

      const row = await screen.findByTestId('album-row-album-1');
      fireEvent.click(within(row).getByRole('button', { name: /編集/ }));

      expect(navigateMock).toHaveBeenCalledWith('/construction-photos/album-1/edit');
      expect(navigateMock).not.toHaveBeenCalledWith('/construction-photos/album-1');
    });

    it('行の削除ボタン押下で確認ダイアログが表示され、承認すると削除APIが呼ばれ一覧が再取得される', async () => {
      renderWithRouter('/projects/project-123/construction-photos');

      const row = await screen.findByTestId('album-row-album-1');
      fireEvent.click(within(row).getByRole('button', { name: /削除/ }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/基礎工事アルバム/)).toBeInTheDocument();

      vi.mocked(constructionPhotosApi.getConstructionPhotoAlbums).mockClear();
      fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));

      await waitFor(() => {
        expect(constructionPhotosApi.deleteConstructionPhotoAlbum).toHaveBeenCalledWith('album-1');
      });
      await waitFor(() => {
        expect(constructionPhotosApi.getConstructionPhotoAlbums).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('行の削除確認ダイアログでキャンセルすると削除APIは呼ばれない', async () => {
      renderWithRouter('/projects/project-123/construction-photos');

      const row = await screen.findByTestId('album-row-album-1');
      fireEvent.click(within(row).getByRole('button', { name: /削除/ }));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(constructionPhotosApi.deleteConstructionPhotoAlbum).not.toHaveBeenCalled();
    });

    it('削除APIが失敗するとエラーメッセージが表示され、ダイアログが閉じ、誤った画面遷移は発生しない', async () => {
      vi.mocked(constructionPhotosApi.deleteConstructionPhotoAlbum).mockRejectedValue(
        new ApiError(500, 'サーバー内部エラーによりアルバムを削除できませんでした')
      );

      renderWithRouter('/projects/project-123/construction-photos');

      const row = await screen.findByTestId('album-row-album-1');
      fireEvent.click(within(row).getByRole('button', { name: /削除/ }));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));

      await waitFor(() => {
        expect(constructionPhotosApi.deleteConstructionPhotoAlbum).toHaveBeenCalledWith('album-1');
      });

      // 失敗後はダイアログが閉じ、無言のまま再有効化されるのではなくエラーが提示される
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      const alertBanner = await screen.findByRole('alert');
      expect(alertBanner).toHaveTextContent(
        'サーバー内部エラーによりアルバムを削除できませんでした'
      );

      // 一覧画面に留まったままで、誤った画面遷移（詳細/編集など）は発生しない
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
