import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { AuthContext, type User, type AuthContextValue } from '../../contexts/AuthContext';
import { fn } from 'storybook/test';

/**
 * AppHeader コンポーネントのストーリー
 *
 * 認証済みユーザー向けの共通ヘッダーナビゲーション。
 * ロゴ、ダッシュボードリンク、プロジェクトリンク、取引先リンク、
 * 管理者メニュー（adminロールのみ）、ユーザーメニューを含みます。
 */

/**
 * モック用のAuthContextを作成するヘルパー
 */
const createMockAuthContext = (user: User | null): AuthContextValue => ({
  user,
  isAuthenticated: !!user,
  isLoading: false,
  isInitialized: true,
  sessionExpired: false,
  twoFactorState: null,
  login: fn().mockResolvedValue(undefined),
  logout: fn().mockResolvedValue(undefined),
  refreshToken: fn().mockResolvedValue('mock-token'),
  clearSessionExpired: fn(),
  verify2FA: fn().mockResolvedValue(undefined),
  verifyBackupCode: fn().mockResolvedValue(undefined),
  cancel2FA: fn(),
});

/**
 * 一般ユーザーのモックデータ
 */
const regularUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: '山田 太郎',
  roles: ['user'],
  createdAt: new Date().toISOString(),
};

/**
 * 管理者ユーザーのモックデータ
 */
const adminUser: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: '管理者 一郎',
  roles: ['admin', 'user'],
  createdAt: new Date().toISOString(),
};

/**
 * 表示名なしユーザーのモックデータ
 */
const noDisplayNameUser: User = {
  id: 'user-2',
  email: 'nodisplay@example.com',
  displayName: '',
  roles: ['user'],
  createdAt: new Date().toISOString(),
};

/**
 * 単語1つの表示名ユーザーのモックデータ
 */
const singleNameUser: User = {
  id: 'user-3',
  email: 'single@example.com',
  displayName: 'Alice',
  roles: ['user'],
  createdAt: new Date().toISOString(),
};

const meta = {
  title: 'Navigation/AppHeader',
  component: AppHeader,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '認証済みユーザー向けの共通ヘッダーナビゲーション。ダッシュボード、プロジェクト、取引先へのリンクと、管理者メニュー・ユーザーメニューを含む。',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story, context) => {
      const args = context.args as { user?: User };
      const user = args?.user || regularUser;
      const mockAuthContext = createMockAuthContext(user);
      return (
        <MemoryRouter>
          <AuthContext.Provider value={mockAuthContext}>
            <Story />
          </AuthContext.Provider>
        </MemoryRouter>
      );
    },
  ],
} satisfies Meta<typeof AppHeader & { user?: User }>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 一般ユーザー
 * 通常のユーザーとしてログインした状態（管理者メニューは非表示）
 */
export const RegularUser: Story = {
  args: {
    user: regularUser,
  },
};

/**
 * 管理者ユーザー
 * adminロールを持つユーザーとしてログインした状態（管理者メニュー表示）
 */
export const AdminUser: Story = {
  args: {
    user: adminUser,
  },
};

/**
 * 表示名なしユーザー
 * displayNameが空の場合、「ユーザー」と表示される
 */
export const NoDisplayName: Story = {
  args: {
    user: noDisplayNameUser,
  },
};

/**
 * 単語1つの表示名
 * 表示名が単一の単語の場合のイニシャル表示
 */
export const SingleWordName: Story = {
  args: {
    user: singleNameUser,
  },
};
