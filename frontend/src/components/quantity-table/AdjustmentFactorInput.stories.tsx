import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import AdjustmentFactorInput from './AdjustmentFactorInput';

/**
 * AdjustmentFactorInput コンポーネントのストーリー
 *
 * 数量に乗算する調整係数を入力するフィールド。
 * デフォルト値は1.00。0以下の値は警告、数値以外の入力はエラーとして処理。
 */

const meta = {
  title: 'Components/QuantityTable/AdjustmentFactorInput',
  component: AdjustmentFactorInput,
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
} satisfies Meta<typeof AdjustmentFactorInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * デフォルト値（1.00）
 */
export const Default: Story = {
  args: {
    value: 1.0,
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
 * 警告状態
 * 0以下の値が入力された場合
 */
export const Warning: Story = {
  args: {
    value: 0,
    hasWarning: true,
  },
};

/**
 * エラー状態
 * 数値以外の入力やバリデーションエラー
 */
export const Error: Story = {
  args: {
    value: undefined,
    error: '調整係数は数値で入力してください',
  },
};

/**
 * 無効化状態
 * 編集不可
 */
export const Disabled: Story = {
  args: {
    value: 1.0,
    disabled: true,
  },
};

/**
 * 小数値
 * 細かい調整係数
 */
export const DecimalValue: Story = {
  args: {
    value: 1.25,
  },
};

/**
 * 大きな値
 * 2倍以上の調整係数
 */
export const LargeValue: Story = {
  args: {
    value: 2.5,
  },
};
