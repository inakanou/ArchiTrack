import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import QuantityItemRow from './QuantityItemRow';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

/**
 * QuantityItemRow コンポーネントのストーリー
 *
 * 数量項目行。項目のデータをテーブル行形式で表示し、
 * 選択・編集・削除・コピー機能を提供。
 */

// サンプル数量項目データ
const sampleItem: QuantityItemDetail = {
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
};

const meta = {
  title: 'Components/QuantityTable/QuantityItemRow',
  component: QuantityItemRow,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onUpdate: fn(),
    onDelete: fn(),
    onCopy: fn(),
    onSelectionChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ overflowX: 'auto' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuantityItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 全フィールドに値が入力された状態
 */
export const Default: Story = {
  args: {
    item: sampleItem,
  },
};

/**
 * 選択状態
 * チェックボックスが選択されている
 */
export const Selected: Story = {
  args: {
    item: sampleItem,
    isSelected: true,
  },
};

/**
 * 中項目なし
 * 大項目のみの表示
 */
export const NoMiddleCategory: Story = {
  args: {
    item: {
      ...sampleItem,
      middleCategory: null,
    },
  },
};

/**
 * 規格なし
 * 規格が設定されていない
 */
export const NoSpecification: Story = {
  args: {
    item: {
      ...sampleItem,
      specification: null,
    },
  },
};

/**
 * 備考なし
 * 備考が設定されていない
 */
export const NoRemarks: Story = {
  args: {
    item: {
      ...sampleItem,
      remarks: null,
    },
  },
};

/**
 * 最小項目
 * 必須フィールドのみ
 */
export const MinimalItem: Story = {
  args: {
    item: {
      ...sampleItem,
      middleCategory: null,
      specification: null,
      remarks: null,
    },
  },
};

/**
 * 長いテキスト
 * 各フィールドに長いテキストが入力された場合
 */
export const LongText: Story = {
  args: {
    item: {
      ...sampleItem,
      majorCategory: 'これは非常に長い大項目名',
      middleCategory: 'これは非常に長い中項目名',
      workType: 'これは非常に長い工種名',
      name: 'これは非常に長い名称',
      specification: 'これは非常に長い規格',
      remarks: 'これは非常に長い備考',
    },
  },
};

/**
 * 大きな数量
 * 桁数が多い場合
 */
export const LargeQuantity: Story = {
  args: {
    item: {
      ...sampleItem,
      quantity: 12345678.99,
    },
  },
};
