/**
 * @fileoverview 工事写真アルバム一覧テーブル（デスクトップ用）のStorybook
 *
 * デスクトップ幅での表形式のアルバム一覧表示を確認する。
 * 作成日/更新日のソート状態、代表サムネイルの優先表示、編集/削除導線（権限連動）、
 * 空状態を網羅する。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ConstructionPhotoListTable from './ConstructionPhotoListTable';
import type { ConstructionPhotoAlbumListItem } from './ConstructionPhotoListTable';

// モック: 複数件のアルバム一覧（代表サムネあり/なしを混在）
const sampleAlbums: ConstructionPhotoAlbumListItem[] = [
  {
    id: 'album-1',
    projectId: 'project-1',
    name: '基礎工事 2026年7月',
    memo: '配筋・打設の記録',
    thumbnailUrl: 'https://example.com/photo1.jpg',
    createdAt: '2026-07-01T09:00:00.000Z',
    updatedAt: '2026-07-05T12:30:00.000Z',
  },
  {
    id: 'album-2',
    projectId: 'project-1',
    name: '外装仕上げ',
    memo: null,
    thumbnailUrl: 'https://example.com/photo2.jpg',
    createdAt: '2026-07-10T08:15:00.000Z',
    updatedAt: '2026-07-12T17:45:00.000Z',
  },
  {
    id: 'album-3',
    projectId: 'project-1',
    name: '内装検査（サムネ未生成）',
    memo: '代表写真がまだ設定されていないアルバム',
    thumbnailUrl: null,
    createdAt: '2026-07-15T11:00:00.000Z',
    updatedAt: '2026-07-15T11:00:00.000Z',
  },
];

const meta = {
  title: 'ConstructionPhotos/ConstructionPhotoListTable',
  component: ConstructionPhotoListTable,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    albums: sampleAlbums,
    sortField: 'createdAt',
    sortOrder: 'desc',
    onSort: fn(),
    onRowClick: fn(),
    onEditAlbum: fn(),
    onDeleteAlbum: fn(),
  },
} satisfies Meta<typeof ConstructionPhotoListTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 作成日の降順ソートで複数件のアルバムを表形式で表示する。
 */
export const Default: Story = {
  args: {},
};

/**
 * 更新日の昇順ソート
 * ソートフィールド/順序が更新日・昇順の場合の表示。
 */
export const SortedByUpdatedAsc: Story = {
  args: {
    sortField: 'updatedAt',
    sortOrder: 'asc',
  },
};

/**
 * 空状態
 * アルバムが0件の場合（ヘッダーのみ表示、行なし）。
 */
export const Empty: Story = {
  args: {
    albums: [],
  },
};

/**
 * 閲覧のみ（権限連動）
 * onEditAlbum / onDeleteAlbum を渡さず、操作列のボタンを非表示にした状態。
 */
export const ReadOnly: Story = {
  args: {
    onEditAlbum: undefined,
    onDeleteAlbum: undefined,
  },
};
