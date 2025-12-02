import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TwoFactorSetupForm from './TwoFactorSetupForm';

/**
 * TwoFactorSetupForm コンポーネントのストーリー
 *
 * 2要素認証（2FA）セットアップフォーム。
 * QRコードスキャン、TOTP検証、バックアップコード保存の3ステップで構成されます。
 */
const meta = {
  title: 'Components/TwoFactorSetupForm',
  component: TwoFactorSetupForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onSetupStart: fn(),
    onEnable: fn(),
    onComplete: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof TwoFactorSetupForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ステップ1: QRコード表示
 * 2FA設定の初期状態でQRコードと秘密鍵を表示
 */
export const Step1_QRCode: Story = {
  args: {
    onSetupStart: fn().mockResolvedValue({
      qrCodeUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      secret: 'JBSWY3DPEHPK3PXP',
    }),
  },
};

/**
 * ステップ2: TOTP検証
 * QRコードスキャン後、TOTPコードを入力して検証
 */
export const Step2_TOTPVerification: Story = {
  args: {
    onSetupStart: fn().mockResolvedValue({
      qrCodeUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      secret: 'JBSWY3DPEHPK3PXP',
    }),
  },
  parameters: {
    docs: {
      description: {
        story: 'TOTPコードを入力して2FAセットアップを検証します。',
      },
    },
  },
};

/**
 * ステップ3: バックアップコード
 * TOTP検証成功後、バックアップコードを表示
 */
export const Step3_BackupCodes: Story = {
  args: {
    onSetupStart: fn().mockResolvedValue({
      qrCodeUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      secret: 'JBSWY3DPEHPK3PXP',
    }),
    onEnable: fn().mockResolvedValue({
      backupCodes: [
        'ABCD-1234',
        'EFGH-5678',
        'IJKL-9012',
        'MNOP-3456',
        'QRST-7890',
        'UVWX-1234',
        'YZAB-5678',
        'CDEF-9012',
        'GHIJ-3456',
        'KLMN-7890',
      ],
    }),
  },
};

/**
 * エラー状態
 * TOTP検証失敗時のエラー表示
 */
export const WithError: Story = {
  args: {
    onSetupStart: fn().mockResolvedValue({
      qrCodeUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      secret: 'JBSWY3DPEHPK3PXP',
    }),
    onEnable: fn().mockRejectedValue(new Error('TOTPコードが正しくありません')),
  },
};
