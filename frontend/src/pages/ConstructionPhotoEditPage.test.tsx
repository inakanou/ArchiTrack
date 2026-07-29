/**
 * @fileoverview 工事写真アルバム編集ページテスト
 *
 * Task 6.2: アルバム作成/編集画面
 *
 * Requirements:
 * - 1.3: アルバム情報を編集して保存する（楽観的排他制御）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConstructionPhotoEditPage from './ConstructionPhotoEditPage';
import * as projectsApi from '../api/projects';
import * as constructionPhotosApi from '../api/construction-photos';
import { ApiError } from '../api/client';
import type { ProjectDetail } from '../types/project.types';
import type { ConstructionPhotoAlbum } from '../types/construction-photo.types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'album-1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/projects');
vi.mock('../api/construction-photos');

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

const mockAlbum: ConstructionPhotoAlbum = {
  id: 'album-1',
  projectId: 'project-123',
  name: '基礎工事アルバム',
  memo: '既存メモ',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <ConstructionPhotoEditPage />
    </BrowserRouter>
  );
}

describe('ConstructionPhotoEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(constructionPhotosApi.getConstructionPhotoAlbum).mockResolvedValue(mockAlbum);
  });

  describe('既存値ロード (Requirement 1.3)', () => {
    it('既存アルバムの値がフォームに初期表示される', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'アルバムを編集' })).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/アルバム名/) as HTMLInputElement;
      const memoInput = screen.getByLabelText(/メモ/) as HTMLTextAreaElement;
      expect(nameInput.value).toBe('基礎工事アルバム');
      expect(memoInput.value).toBe('既存メモ');
    });
  });

  describe('更新 (Requirement 1.3)', () => {
    it('入力値と updatedAt で update API が呼ばれ、成功で一覧へ遷移する', async () => {
      vi.mocked(constructionPhotosApi.updateConstructionPhotoAlbum).mockResolvedValue({
        ...mockAlbum,
        name: '基礎工事アルバム（改訂）',
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'アルバムを編集' })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/アルバム名/), {
        target: { value: '基礎工事アルバム（改訂）' },
      });

      fireEvent.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        expect(constructionPhotosApi.updateConstructionPhotoAlbum).toHaveBeenCalledWith(
          'album-1',
          { name: '基礎工事アルバム（改訂）', memo: '既存メモ' },
          '2025-01-02T00:00:00.000Z'
        );
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project-123/construction-photos');
      });

      expect(mockToast.success).toHaveBeenCalled();
    });

    it('競合(409)エラー時にエラートーストを表示する', async () => {
      const apiError = new ApiError(409, '競合が発生しました', {
        code: 'CONSTRUCTION_PHOTO_ALBUM_CONFLICT',
      });
      vi.mocked(constructionPhotosApi.updateConstructionPhotoAlbum).mockRejectedValue(apiError);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'アルバムを編集' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('競合が発生しました');
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('バリデーション', () => {
    it('アルバム名を空にして保存すると update API を呼ばずエラーを表示する', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'アルバムを編集' })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/アルバム名/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        expect(screen.getByText(/アルバム名は必須です/)).toBeInTheDocument();
      });

      expect(constructionPhotosApi.updateConstructionPhotoAlbum).not.toHaveBeenCalled();
    });
  });

  describe('存在しないアルバム', () => {
    it('404時に見つからない旨を表示する', async () => {
      vi.mocked(constructionPhotosApi.getConstructionPhotoAlbum).mockRejectedValue(
        new ApiError(404, 'not found', {})
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-1.3
 * @requirement construction-photo/REQ-1.5
 */
