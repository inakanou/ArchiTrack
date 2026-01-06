import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import RoundingUnitInput from './RoundingUnitInput';

/**
 * RoundingUnitInput コンポーネントのストーリー
 *
 * 数量の丸め単位を入力するフィールド。
 * デフォルト値は0.01。0以下の値はエラー、プリセット値のボタンも提供。
 */

const meta = {
  title: 'Components/QuantityTable/RoundingUnitInput',
  component: RoundingUnitInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '250px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoundingUnitInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * デフォルト値（0.01）
 */
export const Default: Story = {
  args: {
    value: 0.01,
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
 * 0.1単位
 * プリセット値の1つ
 */
export const PointOne: Story = {
  args: {
    value: 0.1,
  },
};

/**
 * 1単位
 * 整数丸め
 */
export const One: Story = {
  args: {
    value: 1,
  },
};

/**
 * エラー状態
 * 0以下の値やバリデーションエラー
 */
export const Error: Story = {
  args: {
    value: 0,
    error: '丸め設定は正の値を入力してください',
  },
};

/**
 * 無効化状態
 * 編集不可
 */
export const Disabled: Story = {
  args: {
    value: 0.01,
    disabled: true,
  },
};

/**
 * カスタム値
 * プリセット以外の値
 */
export const CustomValue: Story = {
  args: {
    value: 0.05,
  },
};

/**
 * 小さな単位
 * より精密な丸め
 */
export const SmallUnit: Story = {
  args: {
    value: 0.001,
  },
};
