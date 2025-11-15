import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PasswordResetForm from './PasswordResetForm';

/**
 * PasswordResetForm コンポーネントのストーリー
 *
 * パスワードリセットフォーム。
 * メールアドレスを入力してパスワードリセットリンクを受け取ります。
 */
const meta = {
  title: 'Components/PasswordResetForm',
  component: PasswordResetForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onRequestReset: fn(),
  },
} satisfies Meta<typeof PasswordResetForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * パスワードリセットフォームの初期表示状態
 */
export const Default: Story = {
  args: {},
};

/**
 * 送信成功状態
 * リセットメール送信成功後の状態
 */
export const Success: Story = {
  args: {
    onRequestReset: fn().mockResolvedValue(undefined),
  },
};

/**
 * エラー状態
 * メールアドレスが存在しない場合のエラー
 */
export const WithError: Story = {
  args: {
    onRequestReset: fn().mockRejectedValue(new Error('このメールアドレスは登録されていません')),
  },
};
