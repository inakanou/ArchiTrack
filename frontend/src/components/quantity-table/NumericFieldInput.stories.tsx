/**
 * @fileoverview 数値フィールド入力コンポーネントのStorybook
 *
 * Task 12.3: フォーマッターユニットテストとStorybookを追加する
 *
 * Requirements:
 * - 14.1: 調整係数・丸め設定・数量フィールドを右寄せで表示する
 * - 14.2: 調整係数・丸め設定・数量フィールドを小数2桁で常時表示する
 * - 14.5: 全ての数値フィールドを右寄せで表示する
 *
 * @module components/quantity-table/NumericFieldInput.stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import NumericFieldInput, { type NumericFieldInputProps } from './NumericFieldInput';

const meta: Meta<typeof NumericFieldInput> = {
  title: 'QuantityTable/NumericFieldInput',
  component: NumericFieldInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
数値フィールド入力コンポーネント

調整係数・丸め設定・数量フィールドを統一的に扱い、小数2桁での常時表示と右寄せ表示を提供します。

## 機能
- 数値を常に小数2桁で表示（例: 1 → "1.00"）
- 右寄せで数値を表示
- フィールドタイプ別のデフォルト値を自動適用
- 空白入力時は自動的にデフォルト値を設定

## フィールドタイプ
- adjustmentFactor: 調整係数（デフォルト: 1.00）
- roundingUnit: 丸め設定（デフォルト: 0.01）
- quantity: 数量（デフォルト: 0.00）
        `,
      },
    },
  },
  argTypes: {
    value: {
      description: '現在の値（undefinedの場合はデフォルト値を表示）',
      control: { type: 'number' },
    },
    fieldType: {
      description: 'フィールドタイプ',
      control: { type: 'select' },
      options: ['adjustmentFactor', 'roundingUnit', 'quantity'],
    },
    label: {
      description: 'ラベル',
      control: { type: 'text' },
    },
    error: {
      description: 'エラーメッセージ',
      control: { type: 'text' },
    },
    required: {
      description: '必須フィールドかどうか',
      control: { type: 'boolean' },
    },
    disabled: {
      description: '無効化フラグ',
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof NumericFieldInput>;

// ============================================================================
// ラッパーコンポーネント
// ============================================================================

/**
 * 制御コンポーネントとして動作するラッパー
 */
function ControlledNumericFieldInput(props: Omit<NumericFieldInputProps, 'onChange'>) {
  const [value, setValue] = useState<number | undefined>(props.value);

  return (
    <div style={{ width: '120px' }}>
      <NumericFieldInput {...props} value={value} onChange={(newValue) => setValue(newValue)} />
    </div>
  );
}

// ============================================================================
// 基本ストーリー
// ============================================================================

/**
 * デフォルトの調整係数入力
 */
export const Default: Story = {
  args: {
    value: 1,
    fieldType: 'adjustmentFactor',
    label: '調整係数',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 調整係数入力
 */
export const AdjustmentFactor: Story = {
  name: '調整係数',
  args: {
    value: 1.5,
    fieldType: 'adjustmentFactor',
    label: '調整係数',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 丸め設定入力
 */
export const RoundingUnit: Story = {
  name: '丸め設定',
  args: {
    value: 0.01,
    fieldType: 'roundingUnit',
    label: '丸め設定',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 数量入力
 */
export const Quantity: Story = {
  name: '数量',
  args: {
    value: 100,
    fieldType: 'quantity',
    label: '数量',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

// ============================================================================
// 表示書式ストーリー
// ============================================================================

/**
 * 整数値の表示（1 → "1.00"）
 */
export const IntegerDisplay: Story = {
  name: '整数値の表示',
  args: {
    value: 1,
    fieldType: 'adjustmentFactor',
    label: '整数（1 → "1.00"）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 小数1桁の表示（1.5 → "1.50"）
 */
export const OneDecimalDisplay: Story = {
  name: '小数1桁の表示',
  args: {
    value: 1.5,
    fieldType: 'adjustmentFactor',
    label: '小数1桁（1.5 → "1.50"）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 小数2桁の表示
 */
export const TwoDecimalDisplay: Story = {
  name: '小数2桁の表示',
  args: {
    value: 1.25,
    fieldType: 'adjustmentFactor',
    label: '小数2桁（1.25）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * ゼロの表示
 */
export const ZeroDisplay: Story = {
  name: 'ゼロの表示',
  args: {
    value: 0,
    fieldType: 'quantity',
    label: 'ゼロ（0 → "0.00"）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 負の値の表示
 */
export const NegativeDisplay: Story = {
  name: '負の値の表示',
  args: {
    value: -1.5,
    fieldType: 'adjustmentFactor',
    label: '負の値（-1.5 → "-1.50"）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

// ============================================================================
// デフォルト値ストーリー
// ============================================================================

/**
 * 調整係数のデフォルト値
 */
export const AdjustmentFactorDefault: Story = {
  name: '調整係数デフォルト値',
  args: {
    value: undefined,
    fieldType: 'adjustmentFactor',
    label: '調整係数（デフォルト: 1.00）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 丸め設定のデフォルト値
 */
export const RoundingUnitDefault: Story = {
  name: '丸め設定デフォルト値',
  args: {
    value: undefined,
    fieldType: 'roundingUnit',
    label: '丸め設定（デフォルト: 0.01）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 数量のデフォルト値
 */
export const QuantityDefault: Story = {
  name: '数量デフォルト値',
  args: {
    value: undefined,
    fieldType: 'quantity',
    label: '数量（デフォルト: 0.00）',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

// ============================================================================
// 状態ストーリー
// ============================================================================

/**
 * 必須フィールド
 */
export const Required: Story = {
  name: '必須フィールド',
  args: {
    value: 1,
    fieldType: 'adjustmentFactor',
    label: '調整係数',
    required: true,
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * エラー状態
 */
export const WithError: Story = {
  name: 'エラー状態',
  args: {
    value: 10,
    fieldType: 'adjustmentFactor',
    label: '調整係数',
    error: '調整係数は-9.99〜9.99の範囲で入力してください',
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

/**
 * 無効化状態
 */
export const Disabled: Story = {
  name: '無効化状態',
  args: {
    value: 1,
    fieldType: 'adjustmentFactor',
    label: '調整係数',
    disabled: true,
  },
  render: (args) => <ControlledNumericFieldInput {...args} />,
};

// ============================================================================
// 組み合わせストーリー
// ============================================================================

/**
 * 全フィールドタイプの比較
 */
export const AllFieldTypes: Story = {
  name: '全フィールドタイプ比較',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '200px' }}>
      <ControlledNumericFieldInput value={1.5} fieldType="adjustmentFactor" label="調整係数" />
      <ControlledNumericFieldInput value={0.1} fieldType="roundingUnit" label="丸め設定" />
      <ControlledNumericFieldInput value={150.5} fieldType="quantity" label="数量" />
    </div>
  ),
};

/**
 * グリッドレイアウトでの使用例
 */
export const InGrid: Story = {
  name: 'グリッドレイアウト',
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 80px)',
        gap: '8px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '4px',
      }}
    >
      <ControlledNumericFieldInput value={1} fieldType="adjustmentFactor" label="調整" />
      <ControlledNumericFieldInput value={0.01} fieldType="roundingUnit" label="丸め" />
      <ControlledNumericFieldInput value={100} fieldType="quantity" label="数量" />
    </div>
  ),
};
