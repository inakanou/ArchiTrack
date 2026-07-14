import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import CalculationFields, { type CalculationFieldsProps } from './CalculationFields';
import type { CalculationParams } from '../../types/quantity-edit.types';

/**
 * CalculationFields コンポーネントのストーリー
 *
 * 計算方法に応じた入力フィールドを表示。
 * - 標準モード: メッセージのみ表示
 * - 面積・体積モード: 幅、奥行き、高さ、重量の4フィールド
 * - ピッチモード: 範囲長、端長1、端長2、ピッチ長、長さ、重量の6フィールド
 * - 箇所数モード: 箇所数、長さ、重量の3フィールド（Task 70.2 / REQ-47）
 *
 * 【箇所数（COUNT）のケース（Task 70.2）】
 * Requirements:
 * - 47.2 / 47.13: 「箇所数」「長さ」「重量」「調整係数」「丸め設定」をこの順序で表示し、
 *   ピッチ固有のフィールド（範囲長・端長1・端長2・ピッチ長）を表示しない
 *   （FIELDS_BY_METHOD 化前はピッチのフィールド群へ無言でフォールバックしていた）
 * - 47.10 / 47.11: 小数・数値以外・範囲外の入力を拒否しエラーメッセージを表示する
 * - 14.6 / 14.3: 「箇所数」は整数表示（小数桁なし）、「長さ」「重量」は小数2桁表示
 */

/**
 * 実画面（EditableQuantityItemRow）と同じ「入力 → 親の params 更新 → 再描画」の
 * 経路を再現する制御ラッパー。
 *
 * CalculationFields は制御コンポーネントであり、params を親が保持する。
 * 静的な args のままでは blur 後の props 同期経路（表示整形 2/3）を通らないため、
 * 操作を伴うストーリーでは本ラッパーを使う。
 */
function ControlledCalculationFields({
  params: initialParams,
  onChange,
  ...rest
}: CalculationFieldsProps) {
  const [params, setParams] = useState<CalculationParams>(initialParams);

  return (
    <CalculationFields
      {...rest}
      params={params}
      onChange={(next) => {
        setParams(next);
        onChange(next);
      }}
    />
  );
}

/** 表示されている入力フィールドのラベル列（必須マークを除く）を DOM 順に取得する */
function visibleFieldLabels(canvasElement: HTMLElement): string[] {
  const inputs = Array.from(canvasElement.querySelectorAll('input'));
  return inputs.map((input) => {
    const label = input.parentElement?.querySelector('label');
    return (label?.textContent ?? '').replace('*', '').trim();
  });
}

/**
 * 計算パラメータのフィールドからフォーカスを外す（blur 整形と親への通知を発火させる）。
 *
 * Tab キーによる移動では隣の計算パラメータ（長さ）へフォーカスが入り、
 * その空欄の blur が `onChange({ length: undefined })` を発火させてしまう。
 * 計算パラメータ以外の入力（調整係数。onChange ではなく onAdjustmentFactorChange を呼ぶ）へ
 * フォーカスを移すことで、検証対象の `onChange` 呼び出しのみを観測できる状態にする。
 */
async function blurCalculationParamField(canvasElement: HTMLElement): Promise<void> {
  await userEvent.click(within(canvasElement).getByText(/^調整係数/));
}

const meta = {
  title: 'Components/QuantityTable/CalculationFields',
  component: CalculationFields,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    // 調整係数・丸め設定のコールバックは明示的なスパイを渡す。
    // 未指定だと Storybook が暗黙のアクション（implicit action arg）を注入し、
    // play 関数内でこれらのフィールドが blur された時点でエラーになる。
    onAdjustmentFactorChange: fn(),
    onRoundingUnitChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '600px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalculationFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 標準モード
 * 直接数量を入力するメッセージのみ表示
 */
export const Standard: Story = {
  args: {
    method: 'STANDARD',
    params: {},
  },
};

/**
 * 面積・体積モード（空）
 * 全フィールドが空の状態
 */
export const AreaVolumeEmpty: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {},
  },
};

/**
 * 面積・体積モード（値入力済み）
 * 幅、奥行き、高さに値が入力された状態
 */
export const AreaVolumeWithValues: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {
      width: 10.5,
      depth: 5.0,
      height: 3.0,
    },
  },
};

/**
 * 面積・体積モード（重量あり）
 * 重量も含めた入力
 */
export const AreaVolumeWithWeight: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {
      width: 10.5,
      depth: 5.0,
      height: 3.0,
      weight: 2.5,
    },
  },
};

/**
 * ピッチモード（空）
 * 全フィールドが空の状態
 */
export const PitchEmpty: Story = {
  args: {
    method: 'PITCH',
    params: {},
  },
};

/**
 * ピッチモード（必須項目のみ）
 * 範囲長、端長1、端長2、ピッチ長のみ入力
 */
export const PitchRequiredOnly: Story = {
  args: {
    method: 'PITCH',
    params: {
      rangeLength: 100.0,
      endLength1: 5.0,
      endLength2: 5.0,
      pitchLength: 10.0,
    },
  },
};

/**
 * ピッチモード（全項目入力）
 * 全フィールドに値が入力された状態
 */
export const PitchFull: Story = {
  args: {
    method: 'PITCH',
    params: {
      rangeLength: 100.0,
      endLength1: 5.0,
      endLength2: 5.0,
      pitchLength: 10.0,
      length: 2.0,
      weight: 1.5,
    },
  },
};

/**
 * 無効化状態
 * 全フィールドが編集不可
 */
export const Disabled: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {
      width: 10.5,
      depth: 5.0,
    },
    disabled: true,
  },
};

// ============================================================================
// 箇所数モード（REQ-47 / Task 70.2）
// ============================================================================

/**
 * 箇所数モード（空）
 * 箇所数・長さ・重量が未入力の状態
 */
export const CountEmpty: Story = {
  args: {
    method: 'COUNT',
    params: {},
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
  },
};

/**
 * 箇所数モード（必須項目のみ）
 * 箇所数のみ入力。長さ・重量が未入力のため、箇所数そのものが計算結果になる（REQ-47 AC5）
 */
export const CountRequiredOnly: Story = {
  args: {
    method: 'COUNT',
    params: { count: 5 },
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
  },
};

/**
 * 箇所数モード（全項目入力）
 * 箇所数 × 長さ × 重量 が計算結果になる（REQ-47 AC4）
 */
export const CountFull: Story = {
  args: {
    method: 'COUNT',
    params: { count: 5, length: 2.0, weight: 1.5 },
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
  },
};

/**
 * 箇所数モード（無効化状態）
 * 全フィールドが編集不可
 */
export const CountDisabled: Story = {
  args: {
    method: 'COUNT',
    params: { count: 5, length: 2.0, weight: 1.5 },
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
    disabled: true,
  },
};

/**
 * 箇所数モードのフィールド構成（REQ-47 AC2 / AC13）
 *
 * 「箇所数 → 長さ → 重量 → 調整係数 → 丸め設定」の順序で表示され、
 * ピッチ固有のフィールド（範囲長・端長1・端長2・ピッチ長）と
 * 面積・体積固有のフィールド（幅・奥行き・高さ）は表示されない。
 * ＝ ピッチのフィールド群へフォールバックしないこと。
 */
export const CountFieldsWithoutPitchFallback: Story = {
  name: '箇所数のフィールド構成（ピッチへフォールバックしない / REQ-47.2, 47.13）',
  args: {
    method: 'COUNT',
    params: { count: 5, length: 2.0, weight: 1.5 },
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 表示順序（REQ-47 AC2）
    await expect(visibleFieldLabels(canvasElement)).toEqual([
      '箇所数',
      '長さ',
      '重量',
      '調整係数',
      '丸め設定',
    ]);

    // ピッチ固有のフィールドは描画されない（REQ-47 AC13）
    await expect(canvas.queryByLabelText(/^範囲長/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^端長1/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^端長2/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^ピッチ長/)).not.toBeInTheDocument();

    // 面積・体積固有のフィールドも描画されない
    await expect(canvas.queryByLabelText(/^幅/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^奥行き/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^高さ/)).not.toBeInTheDocument();

    // 箇所数は必須、長さ・重量は任意（REQ-47 AC8）
    await expect(canvas.getByLabelText(/^箇所数/)).toHaveAttribute('aria-required', 'true');
    await expect(canvas.getByLabelText('長さ')).not.toHaveAttribute('aria-required');
  },
};

/**
 * 箇所数は整数表示・長さ/重量は小数2桁表示（REQ-14 AC6 / AC3）
 *
 * 初期表示（props からの整形）と、値を入力してフォーカスアウトした後（blur 整形 →
 * 親の params 更新 → props 同期）の双方で、箇所数に小数桁が付与されないことを確認する。
 */
export const CountIntegerFormatting: Story = {
  name: '箇所数は整数表示（初期表示 / 入力後 / REQ-14.6）',
  args: {
    method: 'COUNT',
    params: { count: 5, length: 2.0, weight: 1.5 },
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
  },
  render: (args) => <ControlledCalculationFields {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const countInput = canvas.getByLabelText(/^箇所数/);
    const lengthInput = canvas.getByLabelText('長さ');
    const weightInput = canvas.getByLabelText(/^重量/);

    // 初期表示: 箇所数は「5」（5.00 にしない）、長さ・重量は小数2桁（REQ-14 AC3/AC6）
    await expect(countInput).toHaveValue('5');
    await expect(lengthInput).toHaveValue('2.00');
    await expect(weightInput).toHaveValue('1.50');

    // 入力 → フォーカスアウト: 整数のまま表示され、親へ数値として通知される
    await userEvent.clear(countInput);
    await userEvent.type(countInput, '12');
    await blurCalculationParamField(canvasElement);

    await expect(countInput).toHaveValue('12');
    await expect(args.onChange).toHaveBeenLastCalledWith({ count: 12, length: 2.0, weight: 1.5 });
  },
};

/**
 * 箇所数の入力拒否とエラー表示（REQ-47 AC10 / AC11）
 *
 * 小数は「整数で入力してください」、範囲外（0）は「1〜9999999の範囲で入力してください」を
 * 表示し、いずれも値を親へ通知しない。
 */
export const CountInvalidInput: Story = {
  name: '箇所数の入力拒否（小数・範囲外 / REQ-47.10, 47.11）',
  args: {
    method: 'COUNT',
    params: {},
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
  },
  render: (args) => <ControlledCalculationFields {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const countInput = canvas.getByLabelText(/^箇所数/);

    // 小数は拒否される（REQ-47 AC10）
    await userEvent.clear(countInput);
    await userEvent.type(countInput, '2.5');
    await blurCalculationParamField(canvasElement);

    await expect(canvas.getByRole('alert')).toHaveTextContent('箇所数は整数で入力してください');
    await expect(countInput).toHaveAttribute('aria-invalid', 'true');
    await expect(args.onChange).not.toHaveBeenCalled();

    // 範囲外（0）も拒否される（REQ-47 AC11）
    await userEvent.clear(countInput);
    await userEvent.type(countInput, '0');
    await blurCalculationParamField(canvasElement);

    await expect(canvas.getByRole('alert')).toHaveTextContent(
      '箇所数は1〜9999999の範囲で入力してください'
    );
    await expect(args.onChange).not.toHaveBeenCalled();

    // 有効な整数を入力し直すとエラーが解消され、値が通知される
    await userEvent.clear(countInput);
    await userEvent.type(countInput, '3');
    await blurCalculationParamField(canvasElement);

    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(countInput).toHaveValue('3');
    await expect(args.onChange).toHaveBeenLastCalledWith({ count: 3 });
  },
};
