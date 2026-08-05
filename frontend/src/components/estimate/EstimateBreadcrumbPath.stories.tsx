/**
 * @fileoverview EstimateBreadcrumbPathコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateBreadcrumbPath, ESTIMATE_ROOT_LEVEL_LABEL } from './EstimateBreadcrumbPath';

const meta = {
  title: 'Estimate/EstimateBreadcrumbPath',
  component: EstimateBreadcrumbPath,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'ドリルダウン表示の現在階層経路（45.7）。末尾が現在の階層で、それ以外は戻り先のボタンになる。画面遷移のパンくずとは別物で、明細テーブル内部の階層位置を示す。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onNavigate: fn(),
  },
} satisfies Meta<typeof EstimateBreadcrumbPath>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ルート階層（経路が1段のみ）
 * 現在階層は戻り先ではないためボタンにならない
 */
export const RootLevel: Story = {
  args: {
    segments: [{ key: null, label: ESTIMATE_ROOT_LEVEL_LABEL }],
  },
};

/**
 * 1段下の階層
 * 「全体」へ戻る操作が有効になる
 */
export const OneLevelDeep: Story = {
  args: {
    segments: [
      { key: null, label: ESTIMATE_ROOT_LEVEL_LABEL },
      { key: 'item-2', label: '基礎工事' },
    ],
  },
};

/**
 * 深い階層（経路上の各段へ戻れる）
 */
export const DeepPath: Story = {
  args: {
    segments: [
      { key: null, label: ESTIMATE_ROOT_LEVEL_LABEL },
      { key: 'item-2', label: '建築工事' },
      { key: 'item-2-1', label: '基礎工事' },
      { key: 'item-2-1-1', label: 'コンクリート工事' },
    ],
  },
};

/**
 * 名称未設定の項目を含む経路
 */
export const WithUnnamedItem: Story = {
  args: {
    segments: [
      { key: null, label: ESTIMATE_ROOT_LEVEL_LABEL },
      { key: 'item-3', label: '（名称未設定）' },
    ],
  },
};

/**
 * 経路が空（何も描画しない）
 */
export const Empty: Story = {
  args: {
    segments: [],
  },
};
