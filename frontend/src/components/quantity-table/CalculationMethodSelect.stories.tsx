import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import CalculationMethodSelect, {
  type CalculationMethodSelectProps,
} from './CalculationMethodSelect';
import type { CalculationMethod } from '../../types/quantity-edit.types';

/**
 * CalculationMethodSelect コンポーネントのストーリー
 *
 * 数量項目の計算方法を選択するドロップダウン。
 * 標準/面積・体積/ピッチ/箇所数の4種類から選択可能（Task 70.2 / REQ-8.12, REQ-47.1）。
 *
 * 選択肢・表示順・ラベルは `utils/calculation-method.ts` の
 * `CALCULATION_METHOD_OPTIONS`（単一情報源）から供給される。
 */

/**
 * 選択状態を保持する制御ラッパー。
 *
 * CalculationMethodSelect は制御コンポーネント（value を親が保持する）であり、
 * 静的な args のままでは選択操作が表示へ反映されない。
 * 実画面（EditableQuantityItemRow）と同じ経路を再現するために用いる。
 */
function ControlledCalculationMethodSelect({
  value: initialValue,
  onChange,
  ...rest
}: CalculationMethodSelectProps) {
  const [value, setValue] = useState<CalculationMethod>(initialValue);

  return (
    <CalculationMethodSelect
      {...rest}
      value={value}
      onChange={(method) => {
        setValue(method);
        onChange(method);
      }}
    />
  );
}

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
 * 箇所数モード（REQ-47.1）
 */
export const Count: Story = {
  args: {
    value: 'COUNT',
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

// ============================================================================
// 箇所数の選択肢（REQ-8.12 / REQ-47.1 / Task 70.2）
// ============================================================================

/**
 * 選択肢に「箇所数」が含まれる（REQ-8.12 / REQ-47.1）
 *
 * 「標準 → 面積・体積 → ピッチ → 箇所数」の順序で4つの選択肢が存在することを確認する。
 */
export const CountOptionAvailable: Story = {
  name: '選択肢は4つ（標準/面積・体積/ピッチ/箇所数 / REQ-47.1）',
  args: {
    value: 'STANDARD',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: /計算方法/ });

    const options = within(select).getAllByRole('option') as HTMLOptionElement[];

    await expect(options.map((option) => option.value)).toEqual([
      'STANDARD',
      'AREA_VOLUME',
      'PITCH',
      'COUNT',
    ]);
    await expect(options.map((option) => option.textContent)).toEqual([
      '標準',
      '面積・体積',
      'ピッチ',
      '箇所数',
    ]);
  },
};

/**
 * ピッチから箇所数へ切り替える（REQ-47.13）
 *
 * 「箇所数」を選択すると onChange に 'COUNT' が通知され、選択状態が反映される。
 */
export const SelectCountFromPitch: Story = {
  name: 'ピッチ → 箇所数へ切り替える（REQ-47.13）',
  args: {
    value: 'PITCH',
  },
  render: (args) => <ControlledCalculationMethodSelect {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: /計算方法/ }) as HTMLSelectElement;

    await expect(select.value).toBe('PITCH');

    await userEvent.selectOptions(select, 'COUNT');

    await expect(args.onChange).toHaveBeenCalledWith('COUNT');
    await expect(select.value).toBe('COUNT');
  },
};
