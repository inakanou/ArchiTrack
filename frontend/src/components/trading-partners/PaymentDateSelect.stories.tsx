import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PaymentDateSelect, { LAST_DAY_VALUE } from './PaymentDateSelect';

/**
 * PaymentDateSelect コンポーネントのストーリー
 *
 * 支払日選択コンポーネント。
 * 月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）の
 * 組み合わせをドロップダウンで提供します。
 */
const meta = {
  title: 'TradingPartners/PaymentDateSelect',
  component: PaymentDateSelect,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '支払日として月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）の組み合わせをドロップダウンで提供するコンポーネントです。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    label: '支払日',
  },
} satisfies Meta<typeof PaymentDateSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 未選択の初期状態
 */
export const Default: Story = {
  args: {
    monthOffset: null,
    day: null,
  },
};

/**
 * 選択済み状態（翌月15日）
 * 月と日が選択された状態
 */
export const Selected: Story = {
  args: {
    monthOffset: 1,
    day: 15,
  },
};

/**
 * 翌々月末日選択状態
 * 翌々月の末日が選択された状態
 */
export const SecondMonthLastDay: Story = {
  args: {
    monthOffset: 2,
    day: LAST_DAY_VALUE,
  },
};

/**
 * 3ヶ月後25日選択状態
 * 3ヶ月後の25日が選択された状態
 */
export const ThirdMonth: Story = {
  args: {
    monthOffset: 3,
    day: 25,
  },
};

/**
 * 必須フィールド状態
 * 必須マーク（*）が表示される状態
 */
export const Required: Story = {
  args: {
    monthOffset: null,
    day: null,
    required: true,
  },
};

/**
 * 無効化状態
 * 選択が無効化された状態
 */
export const Disabled: Story = {
  args: {
    monthOffset: 1,
    day: 10,
    disabled: true,
  },
};

/**
 * エラー状態
 * エラーメッセージが表示される状態
 */
export const WithError: Story = {
  args: {
    monthOffset: null,
    day: null,
    required: true,
    error: '支払日を選択してください',
  },
};

/**
 * 月のみ選択状態
 * 月は選択済みだが日は未選択の状態
 */
export const OnlyMonthSelected: Story = {
  args: {
    monthOffset: 1,
    day: null,
  },
};

/**
 * 日のみ選択状態
 * 日は選択済みだが月は未選択の状態
 */
export const OnlyDaySelected: Story = {
  args: {
    monthOffset: null,
    day: 20,
  },
};
