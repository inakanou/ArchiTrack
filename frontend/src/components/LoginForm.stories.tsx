import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import LoginForm from './LoginForm';

/**
 * LoginForm コンポーネントのストーリー
 *
 * ユーザー認証のためのログインフォーム。
 * メールアドレスとパスワードでログインし、2FAが有効な場合は検証画面に遷移します。
 */
const meta = {
  title: 'Components/LoginForm',
  component: LoginForm,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onLogin: fn(),
  },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * ログインフォームの初期表示状態
 */
export const Default: Story = {
  args: {},
};

/**
 * ローディング状態
 * ログイン処理中の状態
 */
export const Loading: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = canvasElement as HTMLElement;
    const emailInput = canvas.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = canvas.querySelector('input[type="password"]') as HTMLInputElement;
    const submitButton = canvas.querySelector('button[type="submit"]') as HTMLButtonElement;

    if (emailInput && passwordInput && submitButton) {
      emailInput.value = 'user@example.com';
      passwordInput.value = 'password123';
      submitButton.click();
    }
  },
};

/**
 * エラー状態
 * ログイン失敗時のエラーメッセージ表示
 */
export const WithError: Story = {
  args: {
    onLogin: fn().mockRejectedValue(new Error('メールアドレスまたはパスワードが正しくありません')),
  },
};

/**
 * 2FA検証状態
 * 2要素認証が有効なユーザーのログイン後の状態
 */
export const TwoFactorVerification: Story = {
  args: {
    onLogin: fn().mockResolvedValue({
      requiresTwoFactor: true,
      tempToken: 'temp-token-123',
    }),
  },
};
