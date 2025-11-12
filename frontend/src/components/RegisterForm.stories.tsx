import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import RegisterForm from './RegisterForm';

/**
 * RegisterForm コンポーネントのストーリー
 *
 * 新規ユーザー登録フォーム。
 * メールアドレス、パスワード、表示名を入力してアカウントを作成します。
 */
const meta = {
  title: 'Components/RegisterForm',
  component: RegisterForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    invitationToken: 'test-invitation-token',
    onRegister: fn(),
    onVerifyInvitation: fn().mockResolvedValue({
      valid: true,
      email: 'invited@example.com',
    }),
  },
} satisfies Meta<typeof RegisterForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 登録フォームの初期表示状態
 */
export const Default: Story = {
  args: {},
};

/**
 * パスワード強度表示
 * パスワード入力時の強度インジケーター表示状態
 */
export const WithPasswordStrength: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: 'パスワードを入力すると、強度インジケーターが表示されます。',
      },
    },
  },
};

/**
 * エラー状態
 * 登録失敗時のエラーメッセージ表示
 */
export const WithError: Story = {
  args: {
    onRegister: fn().mockRejectedValue(new Error('このメールアドレスは既に登録されています')),
  },
};

/**
 * 検証エラー状態
 * パスワード不一致などのバリデーションエラー
 */
export const ValidationError: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: 'パスワードが一致しない場合、エラーメッセージが表示されます。',
      },
    },
  },
};
