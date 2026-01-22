import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { fn } from 'storybook/test';
import { ItemizedStatementSectionCard } from './ItemizedStatementSectionCard';
import type { ItemizedStatementInfo } from '../../types/itemized-statement.types';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

/**
 * ItemizedStatementSectionCard コンポーネントのストーリー
 *
 * プロジェクト詳細画面に表示する内訳書セクション。
 * 直近の内訳書一覧と総数を表示し、一覧・詳細画面への遷移リンクを提供。
 */

// サンプル内訳書データ
const sampleStatements: ItemizedStatementInfo[] = [
  {
    id: 'is-1',
    projectId: 'project-123',
    name: '外構工事内訳書',
    sourceQuantityTableId: 'qt-1',
    sourceQuantityTableName: '外構工事数量表',
    itemCount: 25,
    createdAt: '2024-01-20T10:30:00Z',
    updatedAt: '2024-01-20T15:45:00Z',
  },
  {
    id: 'is-2',
    projectId: 'project-123',
    name: '内装工事内訳書',
    sourceQuantityTableId: 'qt-2',
    sourceQuantityTableName: '内装工事数量表',
    itemCount: 42,
    createdAt: '2024-01-18T09:00:00Z',
    updatedAt: '2024-01-18T14:20:00Z',
  },
  {
    id: 'is-3',
    projectId: 'project-123',
    name: '電気設備内訳書',
    sourceQuantityTableId: 'qt-3',
    sourceQuantityTableName: '電気設備数量表',
    itemCount: 18,
    createdAt: '2024-01-15T11:15:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
];

// サンプル数量表データ
const sampleQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    projectId: 'project-123',
    name: '外構工事数量表',
    groupCount: 3,
    itemCount: 25,
    createdAt: '2024-01-10T10:30:00Z',
    updatedAt: '2024-01-15T15:45:00Z',
  },
  {
    id: 'qt-2',
    projectId: 'project-123',
    name: '内装工事数量表',
    groupCount: 5,
    itemCount: 42,
    createdAt: '2024-01-08T09:00:00Z',
    updatedAt: '2024-01-12T14:20:00Z',
  },
];

const meta = {
  title: 'Components/Projects/ItemizedStatementSectionCard',
  component: ItemizedStatementSectionCard,
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
  args: {
    onSuccess: fn(),
  },
} satisfies Meta<typeof ItemizedStatementSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 複数の内訳書がある場合
 */
export const Default: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 5,
    latestStatements: sampleStatements,
    quantityTables: sampleQuantityTables,
    isLoading: false,
  },
};

/**
 * 単一内訳書
 * 1件のみの表示
 */
export const SingleStatement: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestStatements: [sampleStatements[0]!],
    quantityTables: sampleQuantityTables,
    isLoading: false,
  },
};

/**
 * 空状態（数量表あり）
 * 内訳書がないが、数量表がある場合
 */
export const EmptyWithQuantityTables: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestStatements: [],
    quantityTables: sampleQuantityTables,
    isLoading: false,
  },
};

/**
 * 空状態（数量表なし）
 * 内訳書も数量表もない場合
 */
export const EmptyWithoutQuantityTables: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestStatements: [],
    quantityTables: [],
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
    latestStatements: [],
    quantityTables: [],
    isLoading: true,
  },
};

/**
 * 長い内訳書名
 * 名前が長い場合のレイアウト確認
 */
export const LongStatementName: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestStatements: [
      {
        ...sampleStatements[0]!,
        name: 'これは非常に長い内訳書名で、カード内でのテキスト折り返しを確認するためのサンプル内訳書です',
      },
    ],
    quantityTables: sampleQuantityTables,
    isLoading: false,
  },
};

/**
 * 多数の項目
 * 項目数が多い場合
 */
export const ManyItems: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 10,
    latestStatements: [
      {
        id: 'is-many',
        projectId: 'project-123',
        name: '大規模工事内訳書',
        sourceQuantityTableId: 'qt-1',
        sourceQuantityTableName: '大規模工事数量表',
        itemCount: 500,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-25T12:00:00Z',
      },
    ],
    quantityTables: sampleQuantityTables,
    isLoading: false,
  },
};
