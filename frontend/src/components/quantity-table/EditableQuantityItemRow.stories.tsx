import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import EditableQuantityItemRow, {
  type EditableQuantityItemRowProps,
} from './EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

/**
 * EditableQuantityItemRow コンポーネントのストーリー
 *
 * 編集可能な数量項目行。各フィールドをオートコンプリート対応の入力フィールドとして表示し、
 * 編集・削除・コピー機能を提供。
 *
 * 【計算方法「箇所数」のケース（Task 70.2 / REQ-47）】
 * - 47.2 / 47.13: 「箇所数」選択時に箇所数・長さ・重量・調整係数・丸め設定を表示し、
 *   ピッチ固有のフィールドを非表示にする
 * - 47.12: 箇所数・長さ・重量の変更時に最終数量を自動再計算する
 * - 48.1 / 48.2: 切替時に旧方式固有のパラメータを破棄し、共通キー（長さ・重量）は引き継ぐ
 */

/**
 * 更新を状態へ反映する制御ラッパー。
 *
 * EditableQuantityItemRow は制御コンポーネントであり、item を親（QuantityTableEditPage）が保持する。
 * 静的な args のままでは「入力 → 再計算 → 数量の再描画」の経路を通らないため、
 * 操作を伴うストーリーでは本ラッパーで実画面と同じ経路を再現する。
 */
function StatefulQuantityItemRow({
  item: initialItem,
  onUpdate,
  ...rest
}: EditableQuantityItemRowProps) {
  const [item, setItem] = useState<QuantityItemDetail>(initialItem);

  return (
    <EditableQuantityItemRow
      {...rest}
      item={item}
      onUpdate={(itemId, updates) => {
        setItem((prev) => ({ ...prev, ...updates }));
        onUpdate?.(itemId, updates);
      }}
    />
  );
}

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
    getSuggestions: () => [],
    onBlurAddCandidate: fn(),
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
  },
};

/**
 * 移動ボタン表示
 * 上下の移動が可能な状態（REQ-6.3）
 */
export const WithMoveButtons: Story = {
  args: {
    item: sampleItem,
    canMoveUp: true,
    canMoveDown: true,
    onMoveUp: fn(),
    onMoveDown: fn(),
  },
};

// ============================================================================
// 計算方法「箇所数」（REQ-47 / Task 70.2）
// ============================================================================

/** 計算方法「箇所数」の数量項目（箇所数 5 × 長さ 2.00 × 重量 1.50 = 15.00） */
const countItem: QuantityItemDetail = {
  ...sampleItem,
  id: 'item-count',
  workType: '設備工事',
  name: '天井吊り金物',
  specification: 'M10',
  unit: '個',
  calculationMethod: 'COUNT',
  calculationParams: { count: 5, length: 2.0, weight: 1.5 },
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 15.0,
};

/** 計算方法「ピッチ」の数量項目（箇所数 = floor((10 - 0 - 0) / 2.5) + 1 = 5） */
const pitchItem: QuantityItemDetail = {
  ...sampleItem,
  id: 'item-pitch',
  calculationMethod: 'PITCH',
  calculationParams: {
    rangeLength: 10,
    endLength1: 0,
    endLength2: 0,
    pitchLength: 2.5,
    length: 2.0,
    weight: 1.5,
  },
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 15.0,
};

/**
 * 箇所数モード（表示）
 *
 * 箇所数・長さ・重量・調整係数・丸め設定が表示され、ピッチ固有のフィールドは表示されない（REQ-47.2 / 47.13）。
 * 箇所数は整数表示、長さ・重量は小数2桁表示（REQ-14.6 / 14.3）。
 */
export const CountMethod: Story = {
  name: '箇所数モード（表示 / REQ-47.2, 47.13, 14.6）',
  args: {
    item: countItem,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('combobox', { name: /計算方法/ })).toHaveValue('COUNT');

    // 箇所数は整数表示、長さ・重量は小数2桁表示
    await expect(canvas.getByLabelText(/^箇所数/)).toHaveValue('5');
    await expect(canvas.getByLabelText('長さ')).toHaveValue('2.00');
    await expect(canvas.getByLabelText(/^重量/)).toHaveValue('1.50');
    await expect(canvas.getByLabelText(/^調整係数/)).toHaveValue('1.00');
    await expect(canvas.getByLabelText(/^丸め設定/)).toHaveValue('0.01');

    // 5 × 2.00 × 1.50 = 15.00
    await expect(canvas.getByLabelText(/^数量/, { selector: 'input' })).toHaveValue('15.00');

    // ピッチ固有のフィールドは表示されない（REQ-47.13）
    await expect(canvas.queryByLabelText(/^範囲長/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^ピッチ長/)).not.toBeInTheDocument();
  },
};

/**
 * 箇所数モード（自動再計算 / REQ-47.12）
 *
 * 箇所数を 5 → 10 に変更すると、最終数量が 15.00 → 30.00 へ自動再計算される。
 */
export const CountMethodRecalculation: Story = {
  name: '箇所数モード（値変更で数量が自動再計算される / REQ-47.12）',
  args: {
    item: countItem,
  },
  render: (args) => <StatefulQuantityItemRow {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const countInput = canvas.getByLabelText(/^箇所数/);
    await expect(canvas.getByLabelText(/^数量/, { selector: 'input' })).toHaveValue('15.00');

    await userEvent.clear(countInput);
    await userEvent.type(countInput, '10');
    await userEvent.tab();

    // 10 × 2.00 × 1.50 = 30.00
    await expect(countInput).toHaveValue('10');
    await expect(canvas.getByLabelText(/^数量/, { selector: 'input' })).toHaveValue('30.00');
    await expect(args.onUpdate).toHaveBeenCalled();
  },
};

/**
 * ピッチ → 箇所数の切替（REQ-47.13 / REQ-48.1, 48.2）
 *
 * 計算方法を「箇所数」へ切り替えると、ピッチ固有のパラメータ（範囲長・端長1・端長2・ピッチ長）は
 * 破棄されフィールドも非表示になる。共通キー（長さ・重量）の入力値は引き継がれ、
 * 箇所数は未入力のまま（旧パラメータからの自動算出は行わない）。
 * 箇所数を入力すると、引き継がれた長さ・重量を用いて数量が再計算される。
 */
export const SwitchPitchToCount: Story = {
  name: 'ピッチ → 箇所数の切替（パラメータ破棄と引き継ぎ / REQ-48.1, 48.2）',
  args: {
    item: pitchItem,
  },
  render: (args) => <StatefulQuantityItemRow {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 切替前: ピッチのフィールド群が表示されている
    await expect(canvas.getByLabelText(/^範囲長/)).toHaveValue('10.00');

    await userEvent.selectOptions(canvas.getByRole('combobox', { name: /計算方法/ }), 'COUNT');

    // ピッチ固有のフィールドは非表示（REQ-47.13）
    await expect(canvas.queryByLabelText(/^範囲長/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^ピッチ長/)).not.toBeInTheDocument();

    // 共通キー（長さ・重量）は引き継がれ、箇所数は未入力（REQ-48.1, 48.2, 48.7）
    await expect(canvas.getByLabelText('長さ')).toHaveValue('2.00');
    await expect(canvas.getByLabelText(/^重量/)).toHaveValue('1.50');
    await expect(canvas.getByLabelText(/^箇所数/)).toHaveValue('');

    // 箇所数を入力すると、引き継がれた長さ・重量で再計算される（5 × 2.00 × 1.50 = 15.00）
    await userEvent.type(canvas.getByLabelText(/^箇所数/), '5');
    await userEvent.tab();

    await expect(canvas.getByLabelText(/^数量/, { selector: 'input' })).toHaveValue('15.00');
  },
};
