import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ProfileForm from './ProfileForm';
import type { UserProfile } from '../types/profile.types';

/**
 * ProfileForm コンポーネントのストーリー
 *
 * ユーザープロフィール管理フォーム。
 * - プロフィール情報の表示・編集
 * - パスワード変更機能
 * - 2FA有効表示
 * - 管理者向けユーザー管理リンク
 */
const meta = {
  title: 'Components/ProfileForm',
  component: ProfileForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onUpdateProfile: fn().mockResolvedValue({
      success: true,
      message: 'プロフィールを更新しました',
    }),
    onChangePassword: fn().mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました',
    }),
    onNavigateToUserManagement: fn(),
  },
} satisfies Meta<typeof ProfileForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * サンプルのユーザープロフィール
 */
const sampleUser: UserProfile = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: '田中太郎',
  roles: ['user'],
  createdAt: new Date('2024-01-15').toISOString(),
  twoFactorEnabled: false,
};

const adminUser: UserProfile = {
  ...sampleUser,
  email: 'admin@example.com',
  displayName: '管理者',
  roles: ['admin', 'user'],
  twoFactorEnabled: true,
};

/**
 * デフォルト状態
 * 一般ユーザーのプロフィール表示
 */
export const Default: Story = {
  args: {
    user: sampleUser,
  },
};

/**
 * 管理者ユーザー
 * 管理者権限を持つユーザーのプロフィール（ユーザー管理リンク表示）
 */
export const AdminUser: Story = {
  args: {
    user: adminUser,
  },
};

/**
 * 2FA有効
 * 二要素認証が有効なユーザー
 */
export const WithTwoFactorEnabled: Story = {
  args: {
    user: {
      ...sampleUser,
      twoFactorEnabled: true,
    },
  },
};

/**
 * 複数ロール
 * 複数のロールを持つユーザー
 */
export const MultipleRoles: Story = {
  args: {
    user: {
      ...sampleUser,
      roles: ['admin', 'editor', 'viewer'],
    },
  },
};

/**
 * プロフィール更新成功
 * プロフィール更新が成功するケース
 */
export const UpdateSuccess: Story = {
  args: {
    user: sampleUser,
    onUpdateProfile: fn().mockResolvedValue({
      success: true,
      message: 'プロフィールを更新しました',
    }),
  },
};

/**
 * プロフィール更新失敗
 * プロフィール更新が失敗するケース
 */
export const UpdateError: Story = {
  args: {
    user: sampleUser,
    onUpdateProfile: fn().mockRejectedValue(new Error('プロフィール更新に失敗しました')),
  },
};

/**
 * パスワード変更成功
 * パスワード変更が成功するケース
 */
export const PasswordChangeSuccess: Story = {
  args: {
    user: sampleUser,
    onChangePassword: fn().mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました',
    }),
  },
};

/**
 * パスワード変更失敗
 * パスワード変更が失敗するケース（現在のパスワード不正）
 */
export const PasswordChangeError: Story = {
  args: {
    user: sampleUser,
    onChangePassword: fn().mockRejectedValue(new Error('現在のパスワードが正しくありません')),
  },
};

/**
 * ユーザー管理リンクなし
 * 管理者でもユーザー管理リンクを非表示
 */
export const AdminWithoutManagementLink: Story = {
  args: {
    user: adminUser,
    onNavigateToUserManagement: undefined,
  },
};
