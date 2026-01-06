import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import QuantityInput from './QuantityInput';

/**
 * QuantityInput コンポーネントのストーリー
 *
 * 数量入力コンポーネント。標準モードでは直接数値を入力し、
 * 計算モードでは計算結果を読み取り専用で表示。
 * 負の値は警告、数値以外の入力はエラーとして処理。
 */

const meta = {
  title: 'Components/QuantityTable/QuantityInput',
  component: QuantityInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '200px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuantityInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 正の数量が入力された状態
 */
export const Default: Story = {
  args: {
    value: 150.5,
  },
};

/**
 * 空の状態
 * 値が未入力
 */
export const Empty: Story = {
  args: {
    value: undefined,
  },
};

/**
 * ゼロ
 * 数量がゼロの場合
 */
export const Zero: Story = {
  args: {
    value: 0,
  },
};

/**
 * 読み取り専用（計算結果）
 * 計算モードで自動計算された値を表示
 */
export const ReadOnly: Story = {
  args: {
    value: 157.5,
    readOnly: true,
  },
};

/**
 * 警告状態
 * 負の値が入力された場合
 */
export const Warning: Story = {
  args: {
    value: -10,
    hasWarning: true,
  },
};

/**
 * エラー状態
 * バリデーションエラー
 */
export const Error: Story = {
  args: {
    value: undefined,
    error: '数量を入力してください',
  },
};

/**
 * 無効化状態
 * 編集不可
 */
export const Disabled: Story = {
  args: {
    value: 150.5,
    disabled: true,
  },
};

/**
 * 大きな値
 * 桁数が多い場合
 */
export const LargeValue: Story = {
  args: {
    value: 12345.67,
  },
};

/**
 * 小数点以下多桁
 * 精度が高い場合
 */
export const HighPrecision: Story = {
  args: {
    value: 3.14159,
  },
};
