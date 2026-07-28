/**
 * @fileoverview ConstructionPhotoListTable のテスト
 *
 * Task 12.3: アルバム編集・削除導線を結線
 *
 * デスクトップ用一覧テーブルの行ごとに編集・削除の操作導線を提供する。
 * 行アクション（編集/削除ボタン）は行クリック（詳細遷移）とは独立して動作し、
 * 誤ってバブリングして詳細遷移が発火しないことを検証する。
 *
 * Requirements: 16.6（一覧画面で各アルバムの編集・削除導線を提供する）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConstructionPhotoListTable from './ConstructionPhotoListTable';
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

function renderTable(
  overrides: Partial<React.ComponentProps<typeof ConstructionPhotoListTable>> = {}
) {
  const onSort = vi.fn();
  const onRowClick = vi.fn();
  const onEditAlbum = vi.fn();
  const onDeleteAlbum = vi.fn();
  render(
    <ConstructionPhotoListTable
      albums={albums}
      sortField="createdAt"
      sortOrder="desc"
      onSort={onSort}
      onRowClick={onRowClick}
      onEditAlbum={onEditAlbum}
      onDeleteAlbum={onDeleteAlbum}
      {...overrides}
    />
  );
  return { onSort, onRowClick, onEditAlbum, onDeleteAlbum };
}

describe('ConstructionPhotoListTable', () => {
  describe('行の編集・削除導線 (R16.6)', () => {
    it('各行に編集・削除ボタンが表示される', () => {
      renderTable();

      const row1 = screen.getByTestId('album-row-album-1');
      expect(within(row1).getByRole('button', { name: /編集/ })).toBeInTheDocument();
      expect(within(row1).getByRole('button', { name: /削除/ })).toBeInTheDocument();

      const row2 = screen.getByTestId('album-row-album-2');
      expect(within(row2).getByRole('button', { name: /編集/ })).toBeInTheDocument();
      expect(within(row2).getByRole('button', { name: /削除/ })).toBeInTheDocument();
    });

    it('編集ボタンをクリックするとonEditAlbumが呼ばれ、onRowClickは呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      const { onEditAlbum, onRowClick } = renderTable();

      const row = screen.getByTestId('album-row-album-1');
      await user.click(within(row).getByRole('button', { name: /編集/ }));

      expect(onEditAlbum).toHaveBeenCalledWith('album-1');
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('削除ボタンをクリックするとonDeleteAlbumがアルバムID・名前で呼ばれ、onRowClickは呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      const { onDeleteAlbum, onRowClick } = renderTable();

      const row = screen.getByTestId('album-row-album-1');
      await user.click(within(row).getByRole('button', { name: /削除/ }));

      expect(onDeleteAlbum).toHaveBeenCalledWith('album-1', '基礎工事アルバム');
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('行クリック（アクション以外）では従来通りonRowClickが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      const { onRowClick } = renderTable();

      const row = screen.getByTestId('album-row-album-1');
      await user.click(row);

      expect(onRowClick).toHaveBeenCalledWith('album-1');
    });
  });
});
