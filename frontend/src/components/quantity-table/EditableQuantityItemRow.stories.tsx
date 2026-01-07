import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import EditableQuantityItemRow from './EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

/**
 * EditableQuantityItemRow コンポーネントのストーリー
 *
 * 編集可能な数量項目行。各フィールドをオートコンプリート対応の入力フィールドとして表示し、
 * 編集・削除・コピー機能を提供。
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
  title: 'Components/QuantityTable/EditableQuantityItemRow',
  component: EditableQuantityItemRow,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onUpdate: fn(),
    onDelete: fn(),
    onCopy: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ overflowX: 'auto' }}>
        <div role="table" aria-label="数量項目テーブル">
          <div role="rowgroup">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof EditableQuantityItemRow>;

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
 * 必須フィールドのみ
 * 中項目、規格、備考が空の状態
 */
export const RequiredFieldsOnly: Story = {
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
 * バリデーションエラー表示
 * 必須フィールドが未入力の場合
 */
export const WithValidation: Story = {
  args: {
    item: {
      ...sampleItem,
      majorCategory: '',
      workType: '',
      name: '',
      unit: '',
    },
    showValidation: true,
  },
};

/**
 * 新規項目（空）
 * 全フィールドが空の新規追加状態
 */
export const Empty: Story = {
  args: {
    item: {
      ...sampleItem,
      id: 'new-item',
      majorCategory: '',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '',
      name: '',
      specification: null,
      quantity: 0,
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
      majorCategory: 'これは非常に長い大項目名で折り返しを確認します',
      workType: 'これは非常に長い工種名で折り返しを確認します',
      name: 'これは非常に長い名称で折り返しを確認します',
      specification: 'これは非常に長い規格で折り返しを確認します',
      remarks: 'これは非常に長い備考で折り返しを確認します',
    },
  },
};

/**
 * 未保存値あり
 * 画面上で入力された未保存の値を候補に含める
 */
export const WithUnsavedValues: Story = {
  args: {
    item: sampleItem,
    unsavedMajorCategories: ['外構工事', '設備工事'],
    unsavedMiddleCategories: ['基礎工事', '仕上工事'],
    unsavedWorkTypes: ['鉄筋工', '型枠工'],
    unsavedUnits: ['m', 'kg'],
    unsavedSpecifications: ['SD295A', 'SD345'],
  },
};
