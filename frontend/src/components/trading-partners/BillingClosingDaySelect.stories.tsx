import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import BillingClosingDaySelect, { LAST_DAY_VALUE } from './BillingClosingDaySelect';

/**
 * BillingClosingDaySelect コンポーネントのストーリー
 *
 * 請求締日選択コンポーネント。
 * 1日〜31日および「末日」の計32オプションをドロップダウンで提供します。
 */
const meta = {
  title: 'TradingPartners/BillingClosingDaySelect',
  component: BillingClosingDaySelect,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '請求締日として1日〜31日および「末日」の計32オプションをドロップダウンで提供するコンポーネントです。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    label: '請求締日',
  },
} satisfies Meta<typeof BillingClosingDaySelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 未選択の初期状態
 */
export const Default: Story = {
  args: {
    value: null,
  },
};

/**
 * 選択済み状態（15日）
 * 日付が選択された状態
 */
export const Selected: Story = {
  args: {
    value: 15,
  },
};

/**
 * 末日選択状態
 * 「末日」が選択された状態
 */
export const LastDaySelected: Story = {
  args: {
    value: LAST_DAY_VALUE,
  },
};

/**
 * 必須フィールド状態
 * 必須マーク（*）が表示される状態
 */
export const Required: Story = {
  args: {
    value: null,
    required: true,
  },
};

/**
 * 無効化状態
 * 選択が無効化された状態
 */
export const Disabled: Story = {
  args: {
    value: 10,
    disabled: true,
  },
};

/**
 * エラー状態
 * エラーメッセージが表示される状態
 */
export const WithError: Story = {
  args: {
    value: null,
    required: true,
    error: '請求締日を選択してください',
  },
};
