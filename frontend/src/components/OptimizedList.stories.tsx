import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { OptimizedList, VirtualList, type ListItem } from './OptimizedList';

/**
 * OptimizedList コンポーネントのストーリー
 *
 * パフォーマンス最適化されたリストコンポーネント。
 * - useMemoでフィルタリング結果をメモ化
 * - useCallbackでイベントハンドラーをメモ化
 * - React.memoで子コンポーネントをメモ化
 */
const meta = {
  title: 'Components/OptimizedList',
  component: OptimizedList,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onItemSelect: fn(),
  },
} satisfies Meta<typeof OptimizedList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * サンプルのリストアイテムデータ
 */
const sampleItems: ListItem[] = [
  { id: 1, title: 'プロジェクトA', description: '建築設計プロジェクト' },
  { id: 2, title: 'プロジェクトB', description: 'インテリアデザイン' },
  { id: 3, title: 'プロジェクトC', description: '都市計画' },
  { id: 4, title: 'プロジェクトD', description: 'リノベーション' },
  { id: 5, title: 'タスク管理', description: '日々のタスク管理' },
  { id: 6, title: 'レポート作成', description: '月次レポートの作成' },
  { id: 7, title: '顧客対応', description: '顧客からの問い合わせ対応' },
  { id: 8, title: '会議準備', description: '週次会議の準備' },
];

/**
 * デフォルト状態
 * アイテム一覧の初期表示状態
 */
export const Default: Story = {
  args: {
    items: sampleItems,
  },
};

/**
 * フィルター適用
 * フィルターテキストでアイテムを絞り込み
 */
export const WithFilter: Story = {
  args: {
    items: sampleItems,
    filterText: 'プロジェクト',
  },
};

/**
 * 空の状態
 * アイテムがない場合の表示
 */
export const Empty: Story = {
  args: {
    items: [],
  },
};

/**
 * フィルター結果なし
 * フィルターに一致するアイテムがない場合
 */
export const NoFilterResults: Story = {
  args: {
    items: sampleItems,
    filterText: '存在しないキーワード',
  },
};

/**
 * 大量データ
 * 多数のアイテムがある場合のパフォーマンス確認
 */
export const ManyItems: Story = {
  args: {
    items: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      title: `アイテム ${i + 1}`,
      description: `これはアイテム ${i + 1} の説明です`,
    })),
  },
};

/**
 * 説明なしアイテム
 * 説明がないアイテムの表示
 */
export const WithoutDescriptions: Story = {
  args: {
    items: [
      { id: 1, title: 'タイトルのみ1' },
      { id: 2, title: 'タイトルのみ2' },
      { id: 3, title: 'タイトルのみ3' },
    ],
  },
};

/**
 * VirtualList コンポーネント
 * 仮想スクロールによる大量データの効率的な表示
 */

export const VirtualListDefault: StoryObj<typeof VirtualList> = {
  render: (args) => <VirtualList {...args} />,
  args: {
    items: Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      title: `仮想アイテム ${i + 1}`,
      description: `これは仮想スクロールリストのアイテム ${i + 1} です`,
    })),
    itemHeight: 80,
    containerHeight: 400,
    onItemSelect: fn(),
  },
};

export const VirtualListSmallContainer: StoryObj<typeof VirtualList> = {
  render: (args) => <VirtualList {...args} />,
  args: {
    items: Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      title: `アイテム ${i + 1}`,
      description: `説明文 ${i + 1}`,
    })),
    itemHeight: 60,
    containerHeight: 200,
    onItemSelect: fn(),
  },
};
