import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ProjectListCard from './ProjectListCard';
import type { ProjectInfo } from '../../types/project.types';

/**
 * ProjectListCard コンポーネントのストーリー
 *
 * モバイル向けカード形式のプロジェクト一覧表示。
 * タッチ操作に最適化されたUI（タップターゲット44x44px以上）。
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
];

const meta = {
  title: 'Components/Projects/ProjectListCard',
  component: ProjectListCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onCardClick: fn(),
  },
} satisfies Meta<typeof ProjectListCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 複数プロジェクトのカード一覧
 */
export const Default: Story = {
  args: {
    projects: sampleProjects,
  },
};

/**
 * 単一プロジェクト
 * 1件のみの表示
 */
export const SingleProject: Story = {
  args: {
    projects: [sampleProjects[0]!],
  },
};

/**
 * 様々なステータス
 * 全ステータスのプロジェクトを表示
 */
export const AllStatuses: Story = {
  args: {
    projects: [
      {
        ...sampleProjects[0]!,
        id: 'p-1',
        status: 'PREPARING',
        statusLabel: '準備中',
        name: '準備中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-2',
        status: 'SURVEYING',
        statusLabel: '調査中',
        name: '調査中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-3',
        status: 'ESTIMATING',
        statusLabel: '見積中',
        name: '見積中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-4',
        status: 'APPROVING',
        statusLabel: '決裁待ち',
        name: '承認中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-5',
        status: 'CONTRACTING',
        statusLabel: '契約中',
        name: '契約中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-6',
        status: 'CONSTRUCTING',
        statusLabel: '工事中',
        name: '施工中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-7',
        status: 'DELIVERING',
        statusLabel: '引渡中',
        name: '引渡中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-8',
        status: 'BILLING',
        statusLabel: '請求中',
        name: '請求中プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-9',
        status: 'AWAITING',
        statusLabel: '入金待ち',
        name: '入金待ちプロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-10',
        status: 'COMPLETED',
        statusLabel: '完了',
        name: '完了プロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-11',
        status: 'CANCELLED',
        statusLabel: '中止',
        name: 'キャンセルプロジェクト',
      },
      {
        ...sampleProjects[0]!,
        id: 'p-12',
        status: 'LOST',
        statusLabel: '失注',
        name: '失注プロジェクト',
      },
    ],
  },
};

/**
 * 担当者なし
 * 工事担当者が未設定のプロジェクト
 */
export const NoConstructionPerson: Story = {
  args: {
    projects: [
      {
        ...sampleProjects[1]!,
        constructionPerson: undefined,
      },
    ],
  },
};

/**
 * 取引先なし
 * 取引先が未設定のプロジェクト
 */
export const NoTradingPartner: Story = {
  args: {
    projects: [
      {
        ...sampleProjects[0]!,
        tradingPartnerId: null,
        tradingPartner: null,
      },
    ],
  },
};

/**
 * 長いプロジェクト名
 * 名前が長い場合のレイアウト確認
 */
export const LongProjectName: Story = {
  args: {
    projects: [
      {
        ...sampleProjects[0]!,
        name: 'これは非常に長いプロジェクト名で、カード内でのテキスト折り返しを確認するためのサンプルプロジェクトです',
      },
    ],
  },
};

/**
 * 空の一覧
 * プロジェクトがない場合（親コンポーネントで空メッセージ表示を想定）
 */
export const Empty: Story = {
  args: {
    projects: [],
  },
};
