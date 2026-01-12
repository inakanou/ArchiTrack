/**
 * @fileoverview 計算用数値フィールド入力コンポーネントのStorybook
 *
 * Task 12.3: 寸法・ピッチフィールドの条件付き書式を実装する
 *
 * Requirements:
 * - 14.3: 寸法・ピッチフィールドは数値入力時のみ小数2桁で表示し、空白時は表示しない
 * - 14.4: 寸法・ピッチフィールドの入力フォーカス時は編集可能な形式で表示し、フォーカスアウト時は書式適用表示に切り替える
 *
 * @module components/quantity-table/CalculationNumericInput.stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import CalculationNumericInput, {
  type CalculationNumericInputProps,
} from './CalculationNumericInput';

const meta: Meta<typeof CalculationNumericInput> = {
  title: 'QuantityTable/CalculationNumericInput',
  component: CalculationNumericInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
計算用数値フィールド入力コンポーネント

寸法・ピッチフィールドの条件付き書式を提供します。

## 機能
- 数値入力時のみ小数2桁で表示
- 空白時は表示なし
- フォーカス時は編集可能形式
- フォーカスアウト時は書式適用

## フィールドタイプ
面積・体積モード:
- 幅（W）
- 奥行き（D）
- 高さ（H）
- 重量

ピッチモード:
- 範囲長（必須）
- 端長1（必須）
- 端長2（必須）
- ピッチ長（必須）
- 長さ
- 重量
        `,
      },
    },
  },
  argTypes: {
    value: {
      description: '現在の値（undefinedの場合は空白を表示）',
      control: { type: 'number' },
    },
    label: {
      description: 'ラベル',
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
type Story = StoryObj<typeof CalculationNumericInput>;

// ============================================================================
// ラッパーコンポーネント
// ============================================================================

/**
 * 制御コンポーネントとして動作するラッパー
 */
function ControlledCalculationNumericInput(props: Omit<CalculationNumericInputProps, 'onChange'>) {
  const [value, setValue] = useState<number | undefined>(props.value);

  return (
    <div style={{ width: '80px' }}>
      <CalculationNumericInput {...props} value={value} onChange={setValue} />
    </div>
  );
}

// ============================================================================
// 基本ストーリー
// ============================================================================

/**
 * 数値入力時の表示
 */
export const Default: Story = {
  args: {
    value: 1.5,
    label: '幅（W）',
  },
  render: (args) => <ControlledCalculationNumericInput {...args} />,
};

/**
 * 空白状態
 */
export const Empty: Story = {
  name: '空白状態',
  args: {
    value: undefined,
    label: '幅（W）',
  },
  render: (args) => <ControlledCalculationNumericInput {...args} />,
};

/**
 * 整数値の表示
 */
export const IntegerValue: Story = {
  name: '整数値',
  args: {
    value: 10,
    label: '幅（W）',
  },
  render: (args) => <ControlledCalculationNumericInput {...args} />,
};

/**
 * ゼロの表示
 */
export const ZeroValue: Story = {
  name: 'ゼロ',
  args: {
    value: 0,
    label: '幅（W）',
  },
  render: (args) => <ControlledCalculationNumericInput {...args} />,
};

// ============================================================================
// 面積・体積モードフィールド
// ============================================================================

/**
 * 面積・体積モードの全フィールド
 */
export const AreaVolumeFields: Story = {
  name: '面積・体積モードフィールド',
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 70px)',
        gap: '4px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '4px',
      }}
    >
      <ControlledCalculationNumericInput value={2.5} label="幅（W）" />
      <ControlledCalculationNumericInput value={3.0} label="奥行き（D）" />
      <ControlledCalculationNumericInput value={undefined} label="高さ（H）" />
      <ControlledCalculationNumericInput value={1.5} label="重量" />
    </div>
  ),
};

// ============================================================================
// ピッチモードフィールド
// ============================================================================

/**
 * ピッチモードの全フィールド
 */
export const PitchFields: Story = {
  name: 'ピッチモードフィールド',
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 70px)',
        gap: '4px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '4px',
      }}
    >
      <ControlledCalculationNumericInput value={10.0} label="範囲長" required />
      <ControlledCalculationNumericInput value={0.5} label="端長1" required />
      <ControlledCalculationNumericInput value={0.5} label="端長2" required />
      <ControlledCalculationNumericInput value={0.9} label="ピッチ長" required />
      <ControlledCalculationNumericInput value={undefined} label="長さ" />
      <ControlledCalculationNumericInput value={undefined} label="重量" />
    </div>
  ),
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
    value: 10,
    label: '範囲長',
    required: true,
  },
  render: (args) => <ControlledCalculationNumericInput {...args} />,
};

/**
 * 無効化状態
 */
export const Disabled: Story = {
  name: '無効化状態',
  args: {
    value: 5.5,
    label: '幅（W）',
    disabled: true,
  },
  render: (args) => <ControlledCalculationNumericInput {...args} />,
};

/**
 * 空白で無効化
 */
export const DisabledEmpty: Story = {
  name: '空白で無効化',
  args: {
    value: undefined,
    label: '高さ（H）',
    disabled: true,
  },
  render: (args) => <ControlledCalculationNumericInput {...args} />,
};

// ============================================================================
// 入力シナリオ
// ============================================================================

/**
 * 入力→フォーカスアウトのシナリオ
 */
export const InputScenario: Story = {
  name: '入力シナリオ',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '200px' }}>
      <div>
        <p style={{ fontSize: '12px', color: '#4b5563', marginBottom: '8px' }}>
          フィールドをクリックして値を入力し、フォーカスアウトすると小数2桁表示に変換されます。
        </p>
        <ControlledCalculationNumericInput value={undefined} label="幅（W）" />
      </div>
      <div>
        <p style={{ fontSize: '12px', color: '#4b5563', marginBottom: '8px' }}>
          既に値がある場合、フォーカス時に編集可能になります。
        </p>
        <ControlledCalculationNumericInput value={5.25} label="奥行き（D）" />
      </div>
    </div>
  ),
};

/**
 * 必須項目と任意項目の混在
 */
export const MixedRequiredOptional: Story = {
  name: '必須/任意混在',
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 80px)',
        gap: '8px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '4px',
      }}
    >
      <ControlledCalculationNumericInput value={10} label="範囲長" required />
      <ControlledCalculationNumericInput value={0.5} label="端長1" required />
      <ControlledCalculationNumericInput value={undefined} label="長さ" />
      <ControlledCalculationNumericInput value={undefined} label="重量" />
    </div>
  ),
};
