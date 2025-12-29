import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ProjectListTable from './ProjectListTable';
import type { ProjectInfo } from '../../types/project.types';

/**
 * ProjectListTable コンポーネントのストーリー
 *
 * デスクトップ向けテーブル形式のプロジェクト一覧表示。
 * ソート機能と行クリックによる詳細画面遷移をサポート。
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
  {
    id: 'project-5',
    name: '札幌本社ビル建設',
    status: 'PREPARING',
    statusLabel: '準備中',
    tradingPartnerId: 'tp-4',
    tradingPartner: { id: 'tp-4', name: '株式会社GHI', nameKana: 'カブシキガイシャジーエイチアイ' },
    salesPerson: { id: 'user-3', displayName: '佐藤 花子' },
    constructionPerson: undefined,
    createdAt: '2024-01-22T14:00:00Z',
    updatedAt: '2024-01-22T14:00:00Z',
  },
];

const meta = {
  title: 'Components/Projects/ProjectListTable',
  component: ProjectListTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSort: fn(),
    onRowClick: fn(),
  },
} satisfies Meta<typeof ProjectListTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示（更新日降順）
 * 通常のプロジェクト一覧表示
 */
export const Default: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'updatedAt',
    sortOrder: 'desc',
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
 * ステータス降順ソート
 * ステータスで降順ソート
 */
export const SortByStatusDesc: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'status',
    sortOrder: 'desc',
  },
};

/**
 * 作成日昇順ソート
 * 作成日で昇順ソート
 */
export const SortByCreatedAtAsc: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'createdAt',
    sortOrder: 'asc',
  },
};

/**
 * 営業担当者でソート
 * 営業担当者名で昇順ソート
 */
export const SortBySalesPerson: Story = {
  args: {
    projects: sampleProjects,
    sortField: 'salesPersonName',
    sortOrder: 'asc',
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

/**
 * 空の一覧
 * プロジェクトがない場合（テーブルヘッダーのみ表示）
 */
export const Empty: Story = {
  args: {
    projects: [],
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};

/**
 * 多数のプロジェクト
 * 大量のプロジェクトを表示
 */
export const ManyProjects: Story = {
  args: {
    projects: Array.from({ length: 20 }, (_, i) => ({
      ...sampleProjects[i % sampleProjects.length]!,
      id: `project-${i + 1}`,
      name: `プロジェクト ${i + 1}`,
    })),
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
};
