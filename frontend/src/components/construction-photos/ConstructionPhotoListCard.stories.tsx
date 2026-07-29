/**
 * @fileoverview 工事写真アルバム一覧カード（モバイル用）のStorybook
 *
 * モバイル幅でのカード形式のアルバム一覧表示を確認する。
 * 代表サムネイルの優先表示、編集/削除導線（権限連動）、空状態を網羅する。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ConstructionPhotoListCard from './ConstructionPhotoListCard';
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
  title: 'ConstructionPhotos/ConstructionPhotoListCard',
  component: ConstructionPhotoListCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    albums: sampleAlbums,
    onCardClick: fn(),
    onEditAlbum: fn(),
    onDeleteAlbum: fn(),
  },
} satisfies Meta<typeof ConstructionPhotoListCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 複数件のアルバムをカード形式で表示し、編集/削除導線を含む。
 */
export const Default: Story = {
  args: {},
};

/**
 * 空状態
 * アルバムが0件の場合（カードリストは空のコンテナのみ）。
 */
export const Empty: Story = {
  args: {
    albums: [],
  },
};

/**
 * 閲覧のみ（権限連動）
 * onEditAlbum / onDeleteAlbum を渡さず、編集・削除ボタンを非表示にした状態。
 */
export const ReadOnly: Story = {
  args: {
    onEditAlbum: undefined,
    onDeleteAlbum: undefined,
  },
};
