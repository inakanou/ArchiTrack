import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import CalculationMethodSelect from './CalculationMethodSelect';

/**
 * CalculationMethodSelect コンポーネントのストーリー
 *
 * 数量項目の計算方法を選択するドロップダウン。
 * 標準/面積・体積/ピッチの3種類から選択可能。
 */

const meta = {
  title: 'Components/QuantityTable/CalculationMethodSelect',
  component: CalculationMethodSelect,
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
} satisfies Meta<typeof CalculationMethodSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 標準モード（デフォルト）
 */
export const Standard: Story = {
  args: {
    value: 'STANDARD',
  },
};

/**
 * 面積・体積モード
 */
export const AreaVolume: Story = {
  args: {
    value: 'AREA_VOLUME',
  },
};

/**
 * ピッチモード
 */
export const Pitch: Story = {
  args: {
    value: 'PITCH',
  },
};

/**
 * 無効化状態
 * 編集不可
 */
export const Disabled: Story = {
  args: {
    value: 'STANDARD',
    disabled: true,
  },
};
