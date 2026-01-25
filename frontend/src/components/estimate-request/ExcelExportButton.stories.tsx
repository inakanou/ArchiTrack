import type { Meta, StoryObj } from '@storybook/react';
import { ExcelExportButton } from './ExcelExportButton';
import type { ItemWithSelectionInfo } from '../../types/estimate-request.types';

/**
 * ExcelExportButton コンポーネントのストーリー
 *
 * 選択された項目をExcel形式でダウンロードするボタン。
 * 項目が選択されていない場合は無効化。
 */

// サンプル項目データ
const sampleItems: ItemWithSelectionInfo[] = [
  {
    id: 'item-1',
    estimateRequestItemId: 'eri-1',
    selected: true,
    customCategory: '土工事',
    workType: '掘削工',
    name: '掘削',
    specification: '普通土',
    unit: 'm³',
    quantity: 100,
    displayOrder: 1,
    otherRequests: [],
  },
  {
    id: 'item-2',
    estimateRequestItemId: 'eri-2',
    selected: true,
    customCategory: '土工事',
    workType: '埋戻工',
    name: '埋戻',
    specification: '発生土',
    unit: 'm³',
    quantity: 80,
    displayOrder: 2,
    otherRequests: [],
  },
  {
    id: 'item-3',
    estimateRequestItemId: 'eri-3',
    selected: true,
    customCategory: 'コンクリート工',
    workType: '打設工',
    name: 'コンクリート打設',
    specification: '21N/mm²',
    unit: 'm³',
    quantity: 50,
    displayOrder: 3,
    otherRequests: [],
  },
  {
    id: 'item-4',
    estimateRequestItemId: 'eri-4',
    selected: true,
    customCategory: '鉄筋工',
    workType: '配筋工',
    name: '鉄筋組立',
    specification: 'D13',
    unit: 'kg',
    quantity: 5000,
    displayOrder: 4,
    otherRequests: [],
  },
  {
    id: 'item-5',
    estimateRequestItemId: 'eri-5',
    selected: true,
    customCategory: '型枠工',
    workType: '型枠工',
    name: '型枠組立',
    specification: '合板',
    unit: 'm²',
    quantity: 500,
    displayOrder: 5,
    otherRequests: [],
  },
];

const meta = {
  title: 'Components/EstimateRequest/ExcelExportButton',
  component: ExcelExportButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ExcelExportButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 複数項目が選択されている状態
 */
export const Default: Story = {
  args: {
    selectedItems: sampleItems,
    estimateRequestName: '外構工事見積依頼',
    disabled: false,
  },
};

/**
 * 単一項目
 * 1件のみ選択されている場合
 */
export const SingleItem: Story = {
  args: {
    selectedItems: [sampleItems[0]!],
    estimateRequestName: '簡易工事見積依頼',
    disabled: false,
  },
};

/**
 * 項目なし（無効）
 * 項目が選択されていない場合
 */
export const NoItems: Story = {
  args: {
    selectedItems: [],
    estimateRequestName: '空の見積依頼',
    disabled: false,
  },
};

/**
 * 明示的に無効
 * disabled propsで無効化されている場合
 */
export const Disabled: Story = {
  args: {
    selectedItems: sampleItems,
    estimateRequestName: '外構工事見積依頼',
    disabled: true,
  },
};

/**
 * 多数の項目
 * 多くの項目が選択されている場合
 */
export const ManyItems: Story = {
  args: {
    selectedItems: Array.from({ length: 50 }, (_, i) => ({
      id: `item-${i + 1}`,
      estimateRequestItemId: `eri-${i + 1}`,
      selected: true,
      customCategory: `カテゴリ${Math.floor(i / 10) + 1}`,
      workType: `工種${(i % 5) + 1}`,
      name: `項目${i + 1}`,
      specification: `規格${i + 1}`,
      unit: ['m³', 'm²', 'kg', 'm', '式'][i % 5]!,
      quantity: Math.floor(Math.random() * 1000) + 1,
      displayOrder: i + 1,
      otherRequests: [],
    })),
    estimateRequestName: '大規模工事見積依頼',
    disabled: false,
  },
};

/**
 * 長いファイル名
 * 見積依頼名が長い場合
 */
export const LongFileName: Story = {
  args: {
    selectedItems: sampleItems,
    estimateRequestName: 'これは非常に長い見積依頼名でファイル名として使用される場合のテストです',
    disabled: false,
  },
};
