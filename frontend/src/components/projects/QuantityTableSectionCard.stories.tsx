import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import QuantityTableSectionCard from './QuantityTableSectionCard';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

/**
 * QuantityTableSectionCard コンポーネントのストーリー
 *
 * プロジェクト詳細画面に表示する数量表セクション。
 * 直近の数量表一覧と総数を表示し、一覧・詳細画面への遷移リンクを提供。
 */

// サンプル数量表データ
const sampleQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    projectId: 'project-123',
    name: '外構工事数量表',
    groupCount: 3,
    itemCount: 25,
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-20T15:45:00Z',
  },
  {
    id: 'qt-2',
    projectId: 'project-123',
    name: '内装工事数量表',
    groupCount: 5,
    itemCount: 42,
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-18T14:20:00Z',
  },
  {
    id: 'qt-3',
    projectId: 'project-123',
    name: '電気設備数量表',
    groupCount: 2,
    itemCount: 18,
    createdAt: '2024-01-05T11:15:00Z',
    updatedAt: '2024-01-22T10:30:00Z',
  },
];

const meta = {
  title: 'Components/Projects/QuantityTableSectionCard',
  component: QuantityTableSectionCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: '600px' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof QuantityTableSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 複数の数量表がある場合
 */
export const Default: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 5,
    latestTables: sampleQuantityTables,
    isLoading: false,
  },
};

/**
 * 単一数量表
 * 1件のみの表示
 */
export const SingleTable: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestTables: [sampleQuantityTables[0]!],
    isLoading: false,
  },
};

/**
 * 空状態
 * 数量表がない場合
 */
export const Empty: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestTables: [],
    isLoading: false,
  },
};

/**
 * ローディング状態
 * データ取得中
 */
export const Loading: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestTables: [],
    isLoading: true,
  },
};

/**
 * 長いテーブル名
 * 名前が長い場合のレイアウト確認
 */
export const LongTableName: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestTables: [
      {
        ...sampleQuantityTables[0]!,
        name: 'これは非常に長い数量表名で、カード内でのテキスト折り返しを確認するためのサンプル数量表です',
      },
    ],
    isLoading: false,
  },
};

/**
 * 多数のグループ・項目
 * グループ数・項目数が多い場合
 */
export const ManyItems: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 10,
    latestTables: [
      {
        id: 'qt-many',
        projectId: 'project-123',
        name: '大規模工事数量表',
        groupCount: 50,
        itemCount: 500,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-25T12:00:00Z',
      },
    ],
    isLoading: false,
  },
};
