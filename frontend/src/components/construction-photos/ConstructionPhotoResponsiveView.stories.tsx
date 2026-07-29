/**
 * @fileoverview 工事写真アルバム一覧レスポンシブビューのStorybook
 *
 * 画面幅に応じてテーブル（デスクトップ/タブレット）とカード（モバイル）を切り替える
 * ラッパーコンポーネントを確認する。0件時の空状態メッセージも網羅する。
 * 表示の切り替えはビューポート幅に依存するため、幅を変えて確認すること。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ConstructionPhotoResponsiveView from './ConstructionPhotoResponsiveView';
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
  title: 'ConstructionPhotos/ConstructionPhotoResponsiveView',
  component: ConstructionPhotoResponsiveView,
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
} satisfies Meta<typeof ConstructionPhotoResponsiveView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 画面幅に応じてテーブル/カードへ切り替わる（広い幅ではテーブル表示）。
 */
export const Default: Story = {
  args: {},
};

/**
 * モバイル幅（カード表示）
 * 狭いビューポートでカード形式に切り替わることを確認する。
 */
export const Mobile: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

/**
 * 空状態
 * アルバムが0件の場合、専用の空メッセージを表示する。
 */
export const Empty: Story = {
  args: {
    albums: [],
  },
};
