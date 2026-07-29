/**
 * @fileoverview ConstructionPhotoSearchFilter のストーリー
 *
 * 工事写真アルバムの検索・フィルタUI。
 * キーワード検索とソート（作成日/更新日・昇順/降順）を提供する。
 * 未入力・入力済みの各状態を確認する。
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ConstructionPhotoSearchFilter from './ConstructionPhotoSearchFilter';

const meta = {
  title: 'ConstructionPhotos/ConstructionPhotoSearchFilter',
  component: ConstructionPhotoSearchFilter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onFilterChange: fn(),
    onSortChange: fn(),
  },
} satisfies Meta<typeof ConstructionPhotoSearchFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 検索キーワード未入力・作成日の降順
 */
export const Default: Story = {
  args: {
    filter: {},
    sortField: 'createdAt',
    sortOrder: 'desc',
  },
};

/**
 * フィルタ適用状態
 * キーワード入力済み・更新日の昇順
 */
export const WithSearch: Story = {
  args: {
    filter: { search: '基礎工事' },
    sortField: 'updatedAt',
    sortOrder: 'asc',
  },
};
