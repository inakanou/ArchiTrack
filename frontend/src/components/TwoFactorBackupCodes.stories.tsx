import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TwoFactorBackupCodes from './TwoFactorBackupCodes';

/**
 * TwoFactorBackupCodes コンポーネントのストーリー
 *
 * 2要素認証のバックアップコードの表示。この表示が保存の最後の機会であり、
 * コピー・ダウンロードと、保存を確かめた後の「完了」を持つ。
 * 2FA の設定と認証アプリの変更（再登録）の両方の最後の段で使う。
 */
const meta = {
  title: 'Components/TwoFactorBackupCodes',
  component: TwoFactorBackupCodes,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    backupCodes: [
      'ABCD-1234',
      'EFGH-5678',
      'IJKL-9012',
      'MNOP-3456',
      'QRST-7890',
      'UVWX-1357',
      'YZAB-2468',
      'CDEF-3579',
      'GHIJ-4680',
      'KLMN-5791',
    ],
    onComplete: fn(),
    onCopyError: fn(),
  },
} satisfies Meta<typeof TwoFactorBackupCodes>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 10 個のバックアップコードの表示
 */
export const Default: Story = {};
