import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import QuantityGroupCard from './QuantityGroupCard';
import type { QuantityGroupDetail, QuantityItemDetail } from '../../types/quantity-table.types';

/**
 * QuantityGroupCard コンポーネントのストーリー
 *
 * 数量グループカード。グループヘッダー（名前、サムネイル、アクションボタン）と
 * 項目一覧を表示するアコーディオンコンポーネント。
 */

// サンプル数量項目データ
const sampleItems: QuantityItemDetail[] = [
  {
    id: 'item-1',
    quantityGroupId: 'group-1',
    majorCategory: '建築工事',
    middleCategory: '躯体工事',
    minorCategory: null,
    customCategory: null,
    workType: 'コンクリート工',
    name: '普通コンクリート',
    specification: '21-8-25',
    unit: 'm³',
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
    quantity: 150.5,
    remarks: '基礎部分',
    displayOrder: 1,
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-20T15:45:00Z',
  },
  {
    id: 'item-2',
    quantityGroupId: 'group-1',
    majorCategory: '建築工事',
    middleCategory: '躯体工事',
    minorCategory: null,
    customCategory: null,
    workType: '鉄筋工',
    name: '異形鉄筋',
    specification: 'SD295A D16',
    unit: 't',
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
    quantity: 8.5,
    remarks: null,
    displayOrder: 2,
    createdAt: '2024-01-15T10:35:00Z',
    updatedAt: '2024-01-20T15:50:00Z',
  },
];

// サンプルグループデータ
const sampleGroup: QuantityGroupDetail = {
  id: 'group-1',
  quantityTableId: 'table-1',
  name: '基礎工事',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 1,
  itemCount: 2,
  items: sampleItems,
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-20T15:45:00Z',
};

const meta = {
  title: 'Components/QuantityTable/QuantityGroupCard',
  component: QuantityGroupCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onAddItem: fn(),
    onDeleteGroup: fn(),
    onSelectImage: fn(),
    onUpdateItem: fn(),
    onDeleteItem: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1200px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuantityGroupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 展開状態で項目一覧を表示
 */
export const Default: Story = {
  args: {
    group: sampleGroup,
    groupDisplayName: '基礎工事',
    initialExpanded: true,
  },
};

/**
 * 折りたたみ状態
 * 項目一覧が非表示
 */
export const Collapsed: Story = {
  args: {
    group: sampleGroup,
    groupDisplayName: '基礎工事',
    initialExpanded: false,
  },
};

/**
 * 画像なし
 * サムネイル画像が設定されていない
 */
export const NoImage: Story = {
  args: {
    group: sampleGroup,
    groupDisplayName: '基礎工事',
    initialExpanded: true,
  },
};

/**
 * 画像あり
 * サムネイル画像が設定されている
 */
export const WithImage: Story = {
  args: {
    group: {
      ...sampleGroup,
      surveyImageId: 'image-1',
      surveyImage: {
        id: 'image-1',
        thumbnailUrl: 'https://via.placeholder.com/80x60',
        originalUrl: 'https://via.placeholder.com/800x600',
        fileName: 'survey-photo.jpg',
      },
    },
    groupDisplayName: '基礎工事',
    initialExpanded: true,
  },
};

/**
 * 項目なし
 * 空のグループ
 */
export const Empty: Story = {
  args: {
    group: {
      ...sampleGroup,
      itemCount: 0,
      items: [],
    },
    groupDisplayName: '新規グループ',
    initialExpanded: true,
  },
};

/**
 * 名前なしグループ
 * グループ名が設定されていない
 */
export const NoName: Story = {
  args: {
    group: {
      ...sampleGroup,
      name: null,
    },
    groupDisplayName: 'グループ 1',
    initialExpanded: true,
  },
};

/**
 * 多数の項目
 * 多くの項目を含むグループ
 */
export const ManyItems: Story = {
  args: {
    group: {
      ...sampleGroup,
      itemCount: 10,
      items: Array.from({ length: 10 }, (_, i) => ({
        ...sampleItems[0]!,
        id: `item-${i + 1}`,
        name: `項目 ${i + 1}`,
        displayOrder: i + 1,
      })),
    },
    groupDisplayName: '大規模グループ',
    initialExpanded: true,
  },
};
