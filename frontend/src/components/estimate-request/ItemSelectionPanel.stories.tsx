import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ItemSelectionPanel } from './ItemSelectionPanel';
import type { ItemWithSelectionInfo } from '../../types/estimate-request.types';

/**
 * ItemSelectionPanel コンポーネントのストーリー
 *
 * 見積依頼詳細画面で内訳書項目の選択状態を管理するコンポーネント。
 * チェックボックスによる項目選択、見積依頼方法の選択、
 * 内訳書を本文に含めるオプションを提供。
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
    selected: false,
    customCategory: 'コンクリート工',
    workType: '打設工',
    name: 'コンクリート打設',
    specification: '21N/mm²',
    unit: 'm³',
    quantity: 50,
    displayOrder: 3,
    otherRequests: [
      {
        estimateRequestId: 'er-2',
        estimateRequestName: 'ABC建設向け見積依頼',
        tradingPartnerName: '株式会社ABC建設',
      },
    ],
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
    otherRequests: [
      {
        estimateRequestId: 'er-2',
        estimateRequestName: 'ABC建設向け見積依頼',
        tradingPartnerName: '株式会社ABC建設',
      },
      {
        estimateRequestId: 'er-3',
        estimateRequestName: 'XYZ工業向け見積依頼',
        tradingPartnerName: '株式会社XYZ工業',
      },
    ],
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
  title: 'Components/EstimateRequest/ItemSelectionPanel',
  component: ItemSelectionPanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onItemSelectionChange: fn(),
    onMethodChange: fn(),
    onIncludeBreakdownChange: fn(),
  },
} satisfies Meta<typeof ItemSelectionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示（メール）
 * メール送信モードでの表示
 */
export const Default: Story = {
  args: {
    items: sampleItems,
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: false,
  },
};

/**
 * FAXモード
 * FAX送信モードでの表示
 */
export const FaxMode: Story = {
  args: {
    items: sampleItems,
    method: 'FAX',
    includeBreakdownInBody: false,
    loading: false,
  },
};

/**
 * 内訳書を本文に含める
 * チェックボックスがオンの状態
 */
export const WithBreakdownInBody: Story = {
  args: {
    items: sampleItems,
    method: 'EMAIL',
    includeBreakdownInBody: true,
    loading: false,
  },
};

/**
 * ローディング状態
 * 保存中などでUIが無効化されている状態
 */
export const Loading: Story = {
  args: {
    items: sampleItems,
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: true,
  },
};

/**
 * 項目なし
 * 項目が存在しない場合
 */
export const EmptyItems: Story = {
  args: {
    items: [],
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: false,
  },
};

/**
 * 全項目選択
 * すべての項目が選択されている状態
 */
export const AllSelected: Story = {
  args: {
    items: sampleItems.map((item) => ({ ...item, selected: true })),
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: false,
  },
};

/**
 * 全項目未選択
 * すべての項目が未選択の状態
 */
export const NoneSelected: Story = {
  args: {
    items: sampleItems.map((item) => ({ ...item, selected: false })),
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: false,
  },
};

/**
 * 他の見積依頼で選択済み
 * 複数の項目が他の見積依頼で選択されている場合
 */
export const WithOtherRequests: Story = {
  args: {
    items: sampleItems.map((item) => ({
      ...item,
      otherRequests:
        item.id === 'item-1' || item.id === 'item-2'
          ? [
              {
                estimateRequestId: 'er-2',
                estimateRequestName: 'ABC建設向け見積依頼',
                tradingPartnerName: '株式会社ABC建設',
              },
            ]
          : item.otherRequests,
    })),
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: false,
  },
};

/**
 * 多数の項目
 * 多くの項目がある場合
 */
export const ManyItems: Story = {
  args: {
    items: Array.from({ length: 20 }, (_, i) => ({
      id: `item-${i + 1}`,
      estimateRequestItemId: `eri-${i + 1}`,
      selected: i % 3 !== 0,
      customCategory: `カテゴリ${Math.floor(i / 5) + 1}`,
      workType: `工種${(i % 5) + 1}`,
      name: `項目${i + 1}`,
      specification: `規格${i + 1}`,
      unit: ['m³', 'm²', 'kg', 'm', '式'][i % 5]!,
      quantity: Math.floor(Math.random() * 1000) + 1,
      displayOrder: i + 1,
      otherRequests:
        i % 4 === 0
          ? [
              {
                estimateRequestId: 'er-other',
                estimateRequestName: '他社建設向け見積依頼',
                tradingPartnerName: '他社建設',
              },
            ]
          : [],
    })),
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: false,
  },
};

/**
 * 長い値
 * 各フィールドの値が長い場合
 */
export const LongValues: Story = {
  args: {
    items: [
      {
        id: 'item-long',
        estimateRequestItemId: 'eri-long',
        selected: true,
        customCategory: 'これは非常に長いカテゴリ名です',
        workType: 'これは非常に長い工種名です',
        name: 'これは非常に長い項目名でレイアウトを確認するためのサンプルです',
        specification:
          'これは非常に長い規格名でテーブルのレイアウトを確認するためのサンプル規格です',
        unit: '平方メートル',
        quantity: 1234567,
        displayOrder: 1,
        otherRequests: [
          {
            estimateRequestId: 'er-2',
            estimateRequestName: '非常に長い名前の見積依頼',
            tradingPartnerName: '非常に長い名前の株式会社サンプル建設工業',
          },
          {
            estimateRequestId: 'er-3',
            estimateRequestName: 'もう一つの長い名前の見積依頼',
            tradingPartnerName: 'もう一つの長い名前の株式会社XYZ工業',
          },
        ],
      },
    ],
    method: 'EMAIL',
    includeBreakdownInBody: false,
    loading: false,
  },
};
