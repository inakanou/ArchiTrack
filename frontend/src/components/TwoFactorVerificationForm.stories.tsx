import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TwoFactorVerificationForm from './TwoFactorVerificationForm';

/**
 * TwoFactorVerificationForm コンポーネントのストーリー
 *
 * 2要素認証（2FA）検証フォーム。
 * TOTPコードまたはバックアップコードを入力して認証します。
 */
const meta = {
  title: 'Components/TwoFactorVerificationForm',
  component: TwoFactorVerificationForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onVerifyTOTP: fn(),
    onVerifyBackupCode: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof TwoFactorVerificationForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（TOTPモード）
 * 6桁のTOTPコード入力画面
 */
export const Default: Story = {
  args: {},
};

/**
 * バックアップコードモード
 * バックアップコード入力画面
 */
export const BackupCodeMode: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: 'TOTPアプリが利用できない場合、バックアップコードで認証できます。',
      },
    },
  },
};

/**
 * エラー状態
 * TOTP検証失敗時のエラー表示
 */
export const WithError: Story = {
  args: {
    onVerifyTOTP: fn().mockRejectedValue(new Error('TOTPコードが正しくありません')),
  },
};
