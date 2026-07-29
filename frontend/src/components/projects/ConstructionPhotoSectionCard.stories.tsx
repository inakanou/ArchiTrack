import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import type { ConstructionPhotoSectionItem } from './ConstructionPhotoSectionCard';
import ConstructionPhotoSectionCard from './ConstructionPhotoSectionCard';

/**
 * @fileoverview ConstructionPhotoSectionCard コンポーネントのストーリー
 *
 * プロジェクト詳細画面で工程表パネルの直下に配置する工事写真セクションカード。
 * 直近の工事写真アルバム（アルバム名・更新日時・写真枚数・代表サムネ）と総数を表示し、
 * 「すべて見る」「新規作成」への遷移リンクを提供する。
 *
 * react-router-dom の Link を用いるため MemoryRouter でラップする。
 * データあり／空状態／ローディングの主要分岐を提示する。
 */

const sampleAlbums: ConstructionPhotoSectionItem[] = [
  {
    id: 'album-1',
    name: '基礎工事',
    photoCount: 12,
    thumbnailUrl: 'https://example.com/album1.jpg',
    updatedAt: '2026-07-20T09:00:00.000Z',
  },
  {
    id: 'album-2',
    name: '躯体工事',
    photoCount: 8,
    thumbnailUrl: null,
    updatedAt: '2026-07-18T14:30:00.000Z',
  },
];

const meta = {
  title: 'Projects/ConstructionPhotoSectionCard',
  component: ConstructionPhotoSectionCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    projectId: 'project-1',
    totalCount: 2,
    latestAlbums: sampleAlbums,
    isLoading: false,
  },
} satisfies Meta<typeof ConstructionPhotoSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 直近のアルバムが複数あり、総数・遷移リンクを表示する。
 */
export const Default: Story = {
  args: {},
};

/**
 * 空状態
 * 工事写真アルバムが1件もない場合。空状態メッセージと新規作成リンクを表示する。
 */
export const Empty: Story = {
  args: {
    totalCount: 0,
    latestAlbums: [],
  },
};

/**
 * ローディング状態
 * アルバム取得中のスケルトン表示。
 */
export const Loading: Story = {
  args: {
    isLoading: true,
    latestAlbums: [],
  },
};
