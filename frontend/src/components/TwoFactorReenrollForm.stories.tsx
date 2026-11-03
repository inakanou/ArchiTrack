import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TwoFactorReenrollForm from './TwoFactorReenrollForm';

/**
 * TwoFactorReenrollForm コンポーネントのストーリー
 *
 * 2要素認証の認証アプリの変更（再登録）の手順。
 * 現在のコード → 新しい QR コード → 新しいコード → 新しいバックアップコードの 4 段で構成される。
 * 新しい秘密鍵は確認まで採用されず、それまでは現在の認証アプリのコードが有効である。
 */
const meta = {
  title: 'Components/TwoFactorReenrollForm',
  component: TwoFactorReenrollForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onStart: fn().mockResolvedValue({
      success: true,
      data: {
        qrCodeDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        secretForManualEntry: 'JBSWY3DPEHPK3PXP',
      },
    }),
    onConfirm: fn().mockResolvedValue({
      success: true,
      data: { backupCodes: ['ABCD-1234', 'EFGH-5678'] },
    }),
    onComplete: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof TwoFactorReenrollForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 手順 1: 現在の認証アプリのコードの入力
 */
export const Step1_CurrentCode: Story = {};
