import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ProjectListView from './ProjectListView';
import type { ProjectInfo } from '../../types/project.types';

/**
 * ProjectListView コンポーネントのストーリー
 *
 * レスポンシブ対応のプロジェクト一覧ビュー。
 * 768px以上でテーブル表示、768px未満でカード表示に自動切り替え。
 */

// サンプルプロジェクトデータ
const sampleProjects: ProjectInfo[] = [
  {
    id: 'project-1',
    name: '東京オフィス改装工事',
    status: 'SURVEYING',
    statusLabel: '調査中',
    tradingPartnerId: 'tp-1',
    tradingPartner: { id: 'tp-1', name: '株式会社ABC', nameKana: 'カブシキガイシャエービーシー' },
    salesPerson: { id: 'user-1', displayName: '山田 太郎' },
    constructionPerson: { id: 'user-2', displayName: '鈴木 一郎' },
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-20T15:45:00Z',
  },
  {
    id: 'project-2',
    name: '大阪支社新築工事',
    status: 'ESTIMATING',
    statusLabel: '見積中',
    tradingPartnerId: 'tp-2',
    tradingPartner: {
      id: 'tp-2',
      name: '株式会社XYZ',
      nameKana: 'カブシキガイシャエックスワイゼット',
    },
    salesPerson: { id: 'user-3', displayName: '佐藤 花子' },
    constructionPerson: undefined,
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-18T14:20:00Z',
  },
  {
    id: 'project-3',
    name: '名古屋工場増築計画',
    status: 'CONSTRUCTING',
    statusLabel: '工事中',
    tradingPartnerId: null,
    tradingPartner: null,
    salesPerson: { id: 'user-1', displayName: '山田 太郎' },
    constructionPerson: { id: 'user-4', displayName: '田中 次郎' },
    createdAt: '2024-01-05T11:15:00Z',
    updatedAt: '2024-01-22T10:30:00Z',
  },
  {
    id: 'project-4',
    name: '福岡倉庫リノベーション',
    status: 'COMPLETED',
    statusLabel: '完了',
    tradingPartnerId: 'tp-3',
    tradingPartner: { id: 'tp-3', name: '有限会社DEF', nameKana: 'ユウゲンガイシャディーイーエフ' },
    salesPerson: { id: 'user-5', displayName: '高橋 健太' },
    constructionPerson: { id: 'user-6', displayName: '伊藤 美咲' },
    createdAt: '2023-12-01T08:00:00Z',
    updatedAt: '2024-01-15T17:00:00Z',
  },
];

const meta = {
  title: 'Components/Projects/ProjectListView',
  component: ProjectListView,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSort: fn(),
    onRowClick: fn(),
  },
} satisfies Meta<typeof ProjectListView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 画面幅に応じてテーブル/カードを自動切り替え
 */
export const Default: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};

/**
 * デスクトップ表示
 * 768px以上でテーブル形式
 */
export const Desktop: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  parameters: {
    viewport: {
      defaultViewport: 'desktop',
    },
  },
};

/**
 * タブレット表示
 * 768px以上でテーブル形式
 */
export const Tablet: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};

/**
 * モバイル表示
 * 768px未満でカード形式
 */
export const Mobile: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

/**
 * 名前昇順ソート
 * プロジェクト名で昇順ソート
 */
export const SortByNameAsc: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'name',
    sortOrder: 'asc',
  },
};

/**
 * 空の一覧
 * プロジェクトがない場合
 */
export const Empty: Story = {
  args: {
    projects: [],
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};

/**
 * 単一プロジェクト
 * 1件のみの表示
 */
export const SingleProject: Story = {
  args: {
    projects: [sampleProjects[0]!],
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};
