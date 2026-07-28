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
import { render, screen, within, fireEvent } from '@testing-library/react';
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

  describe('ソート導線 (R3.4)', () => {
    it('昇順ソート時は現在ソート列に昇順アイコンが表示される', () => {
      renderTable({ sortField: 'createdAt', sortOrder: 'asc' });

      expect(screen.getByTestId('sort-icon-asc')).toBeInTheDocument();
      expect(screen.queryByTestId('sort-icon-desc')).not.toBeInTheDocument();
    });

    it('降順ソート時は現在ソート列に降順アイコンが表示される', () => {
      renderTable({ sortField: 'updatedAt', sortOrder: 'desc' });

      expect(screen.getByTestId('sort-icon-desc')).toBeInTheDocument();
      expect(screen.queryByTestId('sort-icon-asc')).not.toBeInTheDocument();
    });

    it('ソート可能なヘッダーをクリックするとonSortが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      const { onSort } = renderTable();

      await user.click(screen.getByRole('button', { name: '作成日でソート' }));
      expect(onSort).toHaveBeenCalledWith('createdAt');

      await user.click(screen.getByRole('button', { name: '更新日でソート' }));
      expect(onSort).toHaveBeenCalledWith('updatedAt');
    });

    it('ソート可能なヘッダーでEnter/Spaceキー押下時にonSortが呼ばれる', () => {
      const { onSort } = renderTable();

      const createdHeader = screen.getByRole('button', { name: '作成日でソート' });
      fireEvent.keyDown(createdHeader, { key: 'Enter' });
      expect(onSort).toHaveBeenCalledWith('createdAt');

      fireEvent.keyDown(createdHeader, { key: ' ' });
      expect(onSort).toHaveBeenCalledTimes(2);
    });

    it('ソート可能なヘッダーで無関係なキー押下時はonSortが呼ばれない', () => {
      const { onSort } = renderTable();

      const createdHeader = screen.getByRole('button', { name: '作成日でソート' });
      fireEvent.keyDown(createdHeader, { key: 'Tab' });
      expect(onSort).not.toHaveBeenCalled();
    });
  });

  describe('行のキーボード操作 (R3.1)', () => {
    it('行でEnterキー押下時にonRowClickが呼ばれる', () => {
      const { onRowClick } = renderTable();

      const row = screen.getByTestId('album-row-album-1');
      fireEvent.keyDown(row, { key: 'Enter' });

      expect(onRowClick).toHaveBeenCalledWith('album-1');
    });

    it('行でSpaceキー押下時にonRowClickが呼ばれる', () => {
      const { onRowClick } = renderTable();

      const row = screen.getByTestId('album-row-album-2');
      fireEvent.keyDown(row, { key: ' ' });

      expect(onRowClick).toHaveBeenCalledWith('album-2');
    });

    it('行で無関係なキー押下時はonRowClickが呼ばれない', () => {
      const { onRowClick } = renderTable();

      const row = screen.getByTestId('album-row-album-1');
      fireEvent.keyDown(row, { key: 'ArrowDown' });

      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('アクションセルでのキー操作は行のkeydownに伝播しない', () => {
      const { onRowClick } = renderTable();

      const row = screen.getByTestId('album-row-album-1');
      const editButton = within(row).getByRole('button', { name: /編集/ });
      fireEvent.keyDown(editButton, { key: 'Enter' });

      expect(onRowClick).not.toHaveBeenCalled();
    });
  });

  describe('サムネイル表示 (R3.5, R11.3)', () => {
    it('thumbnailUrlがある場合は画像を表示し、ない場合はプレースホルダーを表示する', () => {
      renderTable();

      const row1 = screen.getByTestId('album-row-album-1');
      expect(within(row1).getByRole('img', { name: /のサムネイル/ })).toBeInTheDocument();

      const row2 = screen.getByTestId('album-row-album-2');
      expect(within(row2).getByTestId('thumbnail-placeholder')).toBeInTheDocument();
    });
  });

  describe('権限連動の導線非表示 (R17.1, R17.2)', () => {
    it('onEditAlbum/onDeleteAlbum未指定時は編集・削除ボタンを表示しない', () => {
      renderTable({ onEditAlbum: undefined, onDeleteAlbum: undefined });

      expect(screen.queryByRole('button', { name: /編集/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /削除/ })).not.toBeInTheDocument();
    });
  });
});
