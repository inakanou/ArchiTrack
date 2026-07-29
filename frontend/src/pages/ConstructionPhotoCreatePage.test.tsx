/**
 * @fileoverview 工事写真アルバム作成ページテスト
 *
 * Task 6.2: アルバム作成/編集画面
 *
 * Requirements:
 * - 1.1: アルバム作成フォーム送信で新規アルバムを作成する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConstructionPhotoCreatePage from './ConstructionPhotoCreatePage';
import * as projectsApi from '../api/projects';
import * as constructionPhotosApi from '../api/construction-photos';
import { ApiError } from '../api/client';
import type { ProjectDetail } from '../types/project.types';
import type { ConstructionPhotoAlbum } from '../types/construction-photo.types';

// react-router-dom のモック（useParams / useNavigate を差し替え）
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: 'project-123' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/projects');
vi.mock('../api/construction-photos');

// useToast のモック
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};
vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

const mockProject: ProjectDetail = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト用プロジェクト説明',
  status: 'SURVEYING',
  statusLabel: '現地調査',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'partner-1',
  tradingPartner: {
    id: 'partner-1',
    name: 'テスト取引先',
    nameKana: 'テストトリヒキサキ',
  },
  salesPerson: {
    id: 'user-1',
    displayName: 'テスト管理者',
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockCreatedAlbum: ConstructionPhotoAlbum = {
  id: 'album-new',
  projectId: 'project-123',
  name: '基礎工事アルバム',
  memo: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <ConstructionPhotoCreatePage />
    </BrowserRouter>
  );
}

describe('ConstructionPhotoCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
  });

  describe('表示', () => {
    it('プロジェクト取得後にフォームを表示する', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規アルバム' })).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/アルバム名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/メモ/)).toBeInTheDocument();
    });

    it('ブレッドクラムナビゲーションを表示する', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規アルバム' })).toBeInTheDocument();
      });

      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumb).toBeInTheDocument();
    });
  });

  describe('フォーム送信 (Requirement 1.1)', () => {
    it('入力値で create API が呼ばれ、成功で一覧へ遷移する', async () => {
      vi.mocked(constructionPhotosApi.createConstructionPhotoAlbum).mockResolvedValue(
        mockCreatedAlbum
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規アルバム' })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/アルバム名/), {
        target: { value: '基礎工事アルバム' },
      });
      fireEvent.change(screen.getByLabelText(/メモ/), {
        target: { value: '基礎工事の記録' },
      });

      fireEvent.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(constructionPhotosApi.createConstructionPhotoAlbum).toHaveBeenCalledWith(
          'project-123',
          { name: '基礎工事アルバム', memo: '基礎工事の記録' }
        );
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-123/construction-photos');
      });

      expect(mockToast.success).toHaveBeenCalled();
    });

    it('メモ未入力時は memo=null で create API が呼ばれる', async () => {
      vi.mocked(constructionPhotosApi.createConstructionPhotoAlbum).mockResolvedValue(
        mockCreatedAlbum
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規アルバム' })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/アルバム名/), {
        target: { value: '基礎工事アルバム' },
      });

      fireEvent.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(constructionPhotosApi.createConstructionPhotoAlbum).toHaveBeenCalledWith(
          'project-123',
          { name: '基礎工事アルバム', memo: null }
        );
      });
    });
  });

  describe('バリデーション', () => {
    it('アルバム名が空の場合は create API を呼ばずエラーを表示する', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規アルバム' })).toBeInTheDocument();
      });

      // デフォルト値をクリアして送信
      fireEvent.change(screen.getByLabelText(/アルバム名/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(screen.getByText(/アルバム名は必須です/)).toBeInTheDocument();
      });

      expect(constructionPhotosApi.createConstructionPhotoAlbum).not.toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('作成エラー時にエラートーストを表示する', async () => {
      const apiError = new ApiError(500, '作成に失敗しました', {});
      vi.mocked(constructionPhotosApi.createConstructionPhotoAlbum).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規アルバム' })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/アルバム名/), {
        target: { value: '基礎工事アルバム' },
      });
      fireEvent.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('作成に失敗しました');
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('キャンセル', () => {
    it('キャンセルで一覧ページへ戻る', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '新規アルバム' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));

      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-123/construction-photos');
    });
  });
});
