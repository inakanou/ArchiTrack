/**
 * @fileoverview 工事写真一覧レスポンシブビュー テスト
 *
 * Task 6.1: 工事写真一覧画面（表/カード切替）
 *
 * Requirements:
 * - 3.2: デスクトップは表形式、モバイルはカード形式
 * - 3.5, 11.3: 代表サムネイル優先表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConstructionPhotoResponsiveView from './ConstructionPhotoResponsiveView';
import type { ConstructionPhotoAlbumListItem } from './ConstructionPhotoListTable';

const albums: ConstructionPhotoAlbumListItem[] = [
  {
    id: 'album-1',
    projectId: 'project-123',
    name: '基礎工事アルバム',
    memo: 'メモ1',
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-16T00:00:00.000Z',
  },
  {
    id: 'album-2',
    projectId: 'project-123',
    name: '躯体工事アルバム',
    memo: null,
    thumbnailUrl: null,
    createdAt: '2024-02-15T00:00:00.000Z',
    updatedAt: '2024-02-16T00:00:00.000Z',
  },
];

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

describe('ConstructionPhotoResponsiveView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMatchMedia(() => false);
  });

  it('デスクトップ幅では表形式で表示されること', () => {
    setMatchMedia((query) => query === '(min-width: 1024px)');
    render(
      <ConstructionPhotoResponsiveView
        albums={albums}
        sortField="createdAt"
        sortOrder="desc"
        onSort={vi.fn()}
        onRowClick={vi.fn()}
      />
    );

    expect(screen.getByRole('table', { name: '工事写真一覧' })).toBeInTheDocument();
    expect(screen.getByText('基礎工事アルバム')).toBeInTheDocument();
  });

  it('モバイル幅ではカード形式で表示されること', () => {
    setMatchMedia((query) => query === '(max-width: 767px)');
    render(
      <ConstructionPhotoResponsiveView
        albums={albums}
        sortField="createdAt"
        sortOrder="desc"
        onSort={vi.fn()}
        onRowClick={vi.fn()}
      />
    );

    expect(screen.getByTestId('album-card-list')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('サムネイルURLがあるアルバムはサムネイル画像を表示すること (R3.5, R11.3)', () => {
    setMatchMedia((query) => query === '(min-width: 1024px)');
    render(
      <ConstructionPhotoResponsiveView
        albums={albums}
        sortField="createdAt"
        sortOrder="desc"
        onSort={vi.fn()}
        onRowClick={vi.fn()}
      />
    );

    const img = screen.getByAltText('基礎工事アルバムのサムネイル');
    expect(img).toHaveAttribute('src', 'https://example.com/thumb-1.jpg');
  });

  it('サムネイルURLがないアルバムはプレースホルダーを表示すること', () => {
    setMatchMedia((query) => query === '(min-width: 1024px)');
    render(
      <ConstructionPhotoResponsiveView
        albums={albums}
        sortField="createdAt"
        sortOrder="desc"
        onSort={vi.fn()}
        onRowClick={vi.fn()}
      />
    );

    expect(screen.getAllByTestId('thumbnail-placeholder').length).toBeGreaterThan(0);
  });

  it('行クリックで onRowClick が呼ばれること', async () => {
    const user = userEvent.setup({ delay: null });
    const onRowClick = vi.fn();
    setMatchMedia((query) => query === '(min-width: 1024px)');
    render(
      <ConstructionPhotoResponsiveView
        albums={albums}
        sortField="createdAt"
        sortOrder="desc"
        onSort={vi.fn()}
        onRowClick={onRowClick}
      />
    );

    const row = screen.getByRole('row', { name: /基礎工事アルバム/i });
    await user.click(row);
    expect(onRowClick).toHaveBeenCalledWith('album-1');
  });
});
