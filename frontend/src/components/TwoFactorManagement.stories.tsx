import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TwoFactorManagement from './TwoFactorManagement';
import type { BackupCodeInfo } from '../types/two-factor.types';

/**
 * TwoFactorManagement コンポーネントのストーリー
 *
 * 二要素認証（2FA）管理コンポーネント。
 * - バックアップコードの表示・再生成
 * - 2FAの無効化
 * - 残りコード数警告
 */
const meta = {
  title: 'Components/TwoFactorManagement',
  component: TwoFactorManagement,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onRegenerateBackupCodes: fn().mockResolvedValue({
      success: true,
      data: {
        backupCodes: [
          'ABC123',
          'DEF456',
          'GHI789',
          'JKL012',
          'MNO345',
          'PQR678',
          'STU901',
          'VWX234',
          'YZA567',
          'BCD890',
        ],
      },
    }),
    onDisableTwoFactor: fn().mockResolvedValue({
      success: true,
    }),
    onDisableSuccess: fn(),
  },
} satisfies Meta<typeof TwoFactorManagement>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * サンプルのバックアップコード（全て未使用）
 */
const allUnusedCodes: BackupCodeInfo[] = [
  { code: 'ABC123', isUsed: false, usedAt: null },
  { code: 'DEF456', isUsed: false, usedAt: null },
  { code: 'GHI789', isUsed: false, usedAt: null },
  { code: 'JKL012', isUsed: false, usedAt: null },
  { code: 'MNO345', isUsed: false, usedAt: null },
  { code: 'PQR678', isUsed: false, usedAt: null },
  { code: 'STU901', isUsed: false, usedAt: null },
  { code: 'VWX234', isUsed: false, usedAt: null },
  { code: 'YZA567', isUsed: false, usedAt: null },
  { code: 'BCD890', isUsed: false, usedAt: null },
];

/**
 * 一部使用済みコード
 */
const partiallyUsedCodes: BackupCodeInfo[] = [
  {
    code: 'ABC123',
    isUsed: true,
    usedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'DEF456',
    isUsed: true,
    usedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'GHI789',
    isUsed: true,
    usedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  { code: 'JKL012', isUsed: false, usedAt: null },
  { code: 'MNO345', isUsed: false, usedAt: null },
  { code: 'PQR678', isUsed: false, usedAt: null },
  { code: 'STU901', isUsed: false, usedAt: null },
  { code: 'VWX234', isUsed: false, usedAt: null },
  { code: 'YZA567', isUsed: false, usedAt: null },
  { code: 'BCD890', isUsed: false, usedAt: null },
];

/**
 * 残り少ないコード（警告表示）
 */
const lowRemainingCodes: BackupCodeInfo[] = [
  {
    code: 'ABC123',
    isUsed: true,
    usedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'DEF456',
    isUsed: true,
    usedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'GHI789',
    isUsed: true,
    usedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'JKL012',
    isUsed: true,
    usedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'MNO345',
    isUsed: true,
    usedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'PQR678',
    isUsed: true,
    usedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'STU901',
    isUsed: true,
    usedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  { code: 'VWX234', isUsed: false, usedAt: null },
  { code: 'YZA567', isUsed: false, usedAt: null },
  { code: 'BCD890', isUsed: false, usedAt: null },
];

/**
 * 残り1つのコード（危険警告）
 */
const oneRemainingCode: BackupCodeInfo[] = [
  {
    code: 'ABC123',
    isUsed: true,
    usedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'DEF456',
    isUsed: true,
    usedAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'GHI789',
    isUsed: true,
    usedAt: new Date(Date.now() - 26 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'JKL012',
    isUsed: true,
    usedAt: new Date(Date.now() - 24 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'MNO345',
    isUsed: true,
    usedAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'PQR678',
    isUsed: true,
    usedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'STU901',
    isUsed: true,
    usedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'VWX234',
    isUsed: true,
    usedAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    code: 'YZA567',
    isUsed: true,
    usedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  { code: 'BCD890', isUsed: false, usedAt: null },
];

/**
 * デフォルト状態
 * 全てのバックアップコードが未使用
 */
export const Default: Story = {
  args: {
    backupCodes: allUnusedCodes,
  },
};

/**
 * 一部使用済み
 * いくつかのバックアップコードが使用済み
 */
export const PartiallyUsed: Story = {
  args: {
    backupCodes: partiallyUsedCodes,
  },
};

/**
 * 残り少ない（警告表示）
 * 残りのバックアップコードが3個以下で警告表示
 */
export const LowRemaining: Story = {
  args: {
    backupCodes: lowRemainingCodes,
  },
};

/**
 * 残り1つ
 * 残りのバックアップコードが1個のみ
 */
export const OneRemaining: Story = {
  args: {
    backupCodes: oneRemainingCode,
  },
};

/**
 * 全て使用済み
 * 全てのバックアップコードが使用済み
 */
export const AllUsed: Story = {
  args: {
    backupCodes: allUnusedCodes.map((code) => ({ ...code, isUsed: true })),
  },
};

/**
 * 再生成成功
 * バックアップコード再生成が成功するケース
 */
export const RegenerateSuccess: Story = {
  args: {
    backupCodes: lowRemainingCodes,
    onRegenerateBackupCodes: fn().mockResolvedValue({
      success: true,
      data: {
        backupCodes: [
          'NEW001',
          'NEW002',
          'NEW003',
          'NEW004',
          'NEW005',
          'NEW006',
          'NEW007',
          'NEW008',
          'NEW009',
          'NEW010',
        ],
      },
    }),
  },
};

/**
 * 再生成失敗
 * バックアップコード再生成が失敗するケース
 */
export const RegenerateError: Story = {
  args: {
    backupCodes: lowRemainingCodes,
    onRegenerateBackupCodes: fn().mockResolvedValue({
      success: false,
      error: 'バックアップコードの再生成に失敗しました',
    }),
  },
};

/**
 * 2FA無効化成功
 * 2FA無効化が成功するケース
 */
export const DisableSuccess: Story = {
  args: {
    backupCodes: allUnusedCodes,
    onDisableTwoFactor: fn().mockResolvedValue({
      success: true,
    }),
  },
};

/**
 * 2FA無効化失敗（パスワード不正）
 * 2FA無効化時にパスワードが不正な場合
 */
export const DisablePasswordError: Story = {
  args: {
    backupCodes: allUnusedCodes,
    onDisableTwoFactor: fn().mockResolvedValue({
      success: false,
      error: 'パスワードが正しくありません',
    }),
  },
};

/**
 * 2FA無効化失敗（サーバーエラー）
 * 2FA無効化時にサーバーエラーが発生した場合
 */
export const DisableServerError: Story = {
  args: {
    backupCodes: allUnusedCodes,
    onDisableTwoFactor: fn().mockRejectedValue(new Error('サーバーエラーが発生しました')),
  },
};
