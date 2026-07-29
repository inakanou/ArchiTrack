/**
 * @fileoverview 工事写真 画像ビューアページのテスト
 *
 * Task 11.2: 閲覧専用画像ビューア＋ビューアページ＋ルート
 *
 * ページはアルバム・写真項目メタデータ（ファイル名等の表示用）を取得したうえで、
 * 非合成原本を必要時にのみ取得（R14.6）し ConstructionPhotoImageViewer へ渡す。
 * 閉じる操作で詳細画面（/construction-photos/:albumId）へ戻る（R14.5）。
 * ConstructionPhotoImageViewer はコンポーネント単体テストで検証済みのためモックし、
 * 本テストはページの取得オーケストレーション（フェッチ呼び出し・object URL 生成/解放・
 * 404/エラー処理・閉じる時のナビゲーション）に集中する。
 *
 * Requirements: 14.1, 14.5, 14.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConstructionPhotoImageViewerPage from './ConstructionPhotoImageViewerPage';
import { getConstructionPhotoAlbum } from '../api/construction-photos';
import {
  getConstructionPhotos,
  getConstructionPhotoOriginalImage,
} from '../api/construction-photo-images';
import { ApiError } from '../api/client';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoWithUrls,
} from '../types/construction-photo.types';
import type { ConstructionPhotoImageViewerProps } from '../components/construction-photos/ConstructionPhotoImageViewer';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ albumId: 'album-1', photoId: 'photo-1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/construction-photos');
vi.mock('../api/construction-photo-images');

vi.mock('../components/construction-photos/ConstructionPhotoImageViewer', () => ({
  default: ({
    imageUrl,
    imageName,
    isLoading,
    error,
    onClose,
  }: ConstructionPhotoImageViewerProps) => (
    <div
      data-testid="mock-viewer"
      data-image-url={imageUrl ?? ''}
      data-image-name={imageName ?? ''}
      data-loading={String(!!isLoading)}
      data-error={error ?? ''}
    >
      <button type="button" onClick={onClose}>
        MockClose
      </button>
    </div>
  ),
}));

function makeAlbum(overrides: Partial<ConstructionPhotoAlbum> = {}): ConstructionPhotoAlbum {
  return {
    id: 'album-1',
    projectId: 'project-1',
    name: 'テストアルバム',
    memo: null,
    thumbnailUrl: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePhoto(overrides: Partial<ConstructionPhotoWithUrls> = {}): ConstructionPhotoWithUrls {
  return {
    id: 'photo-1',
    albumId: 'album-1',
    fileName: 'photo-1.jpg',
    fileSize: 1000,
    width: 800,
    height: 600,
    displayOrder: 1,
    comment: null,
    includeInReport: false,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    printImageUrl: 'https://example.com/print-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <BrowserRouter>
      <ConstructionPhotoImageViewerPage />
    </BrowserRouter>
  );
}

describe('ConstructionPhotoImageViewerPage', () => {
  const mockCreateObjectURL = vi.fn(() => 'blob:mock-object-url');
  const mockRevokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('アルバム・写真項目・原本Blobを取得しビューアへ渡す (R14.1, R14.6)', async () => {
    vi.mocked(getConstructionPhotoAlbum).mockResolvedValue(makeAlbum());
    vi.mocked(getConstructionPhotos).mockResolvedValue([makePhoto()]);
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    vi.mocked(getConstructionPhotoOriginalImage).mockResolvedValue(blob);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewer')).toHaveAttribute(
        'data-image-url',
        'blob:mock-object-url'
      );
    });

    expect(getConstructionPhotoOriginalImage).toHaveBeenCalledTimes(1);
    expect(getConstructionPhotoOriginalImage).toHaveBeenCalledWith('photo-1');
    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
    expect(screen.getByTestId('mock-viewer')).toHaveAttribute('data-image-name', 'photo-1.jpg');
    expect(screen.getByTestId('mock-viewer')).toHaveAttribute('data-loading', 'false');
  });

  it('原本取得完了までローディング状態をビューアへ伝える', async () => {
    vi.mocked(getConstructionPhotoAlbum).mockResolvedValue(makeAlbum());
    vi.mocked(getConstructionPhotos).mockResolvedValue([makePhoto()]);
    let resolveOriginal: (blob: Blob) => void = () => {};
    vi.mocked(getConstructionPhotoOriginalImage).mockReturnValue(
      new Promise((resolve) => {
        resolveOriginal = resolve;
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewer')).toHaveAttribute('data-loading', 'true');
    });

    resolveOriginal(new Blob(['x'], { type: 'image/jpeg' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewer')).toHaveAttribute('data-loading', 'false');
    });
  });

  it('閉じる操作で詳細画面（/construction-photos/:albumId）へ戻る (R14.5)', async () => {
    vi.mocked(getConstructionPhotoAlbum).mockResolvedValue(makeAlbum());
    vi.mocked(getConstructionPhotos).mockResolvedValue([makePhoto()]);
    vi.mocked(getConstructionPhotoOriginalImage).mockResolvedValue(
      new Blob(['x'], { type: 'image/jpeg' })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewer')).toHaveAttribute('data-loading', 'false');
    });

    fireEvent.click(screen.getByText('MockClose'));

    expect(mockNavigate).toHaveBeenCalledWith('/construction-photos/album-1');
  });

  it('アンマウント時にobject URLを解放する', async () => {
    vi.mocked(getConstructionPhotoAlbum).mockResolvedValue(makeAlbum());
    vi.mocked(getConstructionPhotos).mockResolvedValue([makePhoto()]);
    vi.mocked(getConstructionPhotoOriginalImage).mockResolvedValue(
      new Blob(['x'], { type: 'image/jpeg' })
    );

    const { unmount } = renderPage();

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    unmount();

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-object-url');
  });

  it('アルバム配下に対象写真項目が存在しない場合は未検出表示にする', async () => {
    vi.mocked(getConstructionPhotoAlbum).mockResolvedValue(makeAlbum());
    vi.mocked(getConstructionPhotos).mockResolvedValue([makePhoto({ id: 'other-photo' })]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/前の画面に戻る|一覧に戻る/)).toBeInTheDocument();
    });
    expect(getConstructionPhotoOriginalImage).not.toHaveBeenCalled();
  });

  it('アルバムが見つからない場合(404)は未検出表示にする', async () => {
    vi.mocked(getConstructionPhotoAlbum).mockRejectedValue(new ApiError(404, 'Not Found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/前の画面に戻る|一覧に戻る/)).toBeInTheDocument();
    });
  });

  it('原本取得に失敗した場合はエラーをビューアへ伝える', async () => {
    vi.mocked(getConstructionPhotoAlbum).mockResolvedValue(makeAlbum());
    vi.mocked(getConstructionPhotos).mockResolvedValue([makePhoto()]);
    vi.mocked(getConstructionPhotoOriginalImage).mockRejectedValue(
      new ApiError(500, '原本の取得に失敗しました')
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewer')).toHaveAttribute(
        'data-error',
        '原本の取得に失敗しました'
      );
    });
  });
});
