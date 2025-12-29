import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import UserSelect from './UserSelect';
import { AuthContext, type User, type AuthContextValue } from '../../contexts/AuthContext';

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
 * UserSelect コンポーネントのストーリー
 *
 * 担当者選択ドロップダウン。
 * 営業担当者・工事担当者の選択に使用。
 * admin以外の有効なユーザー一覧を候補として表示。
 */
const meta = {
  title: 'Components/Projects/UserSelect',
  component: UserSelect,
  decorators: [
    (Story) => {
      const mockAuthContext = createMockAuthContext(regularUser);
      return (
        <MemoryRouter>
          <AuthContext.Provider value={mockAuthContext}>
            <div style={{ width: '400px', padding: '24px' }}>
              <Story />
            </div>
          </AuthContext.Provider>
        </MemoryRouter>
      );
    },
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    onBlur: fn(),
    label: '担当者',
  },
} satisfies Meta<typeof UserSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 営業担当者選択
 * 営業担当者用のドロップダウン（必須）
 */
export const SalesPersonRequired: Story = {
  args: {
    value: '',
    label: '営業担当者',
    required: true,
    placeholder: '営業担当者を選択してください',
  },
};

/**
 * 工事担当者選択
 * 工事担当者用のドロップダウン（任意）
 */
export const ConstructionPersonOptional: Story = {
  args: {
    value: '',
    label: '工事担当者',
    required: false,
    placeholder: '工事担当者を選択してください',
  },
};

/**
 * ユーザー選択済み
 * 特定のユーザーが選択された状態
 */
export const WithValue: Story = {
  args: {
    value: 'user-123',
    label: '営業担当者',
    required: true,
  },
};

/**
 * エラー状態
 * バリデーションエラーが発生した状態
 */
export const WithError: Story = {
  args: {
    value: '',
    label: '営業担当者',
    required: true,
    error: '営業担当者は必須です',
  },
};

/**
 * 無効化状態
 * 入力が無効化された状態
 */
export const Disabled: Story = {
  args: {
    value: '',
    label: '営業担当者',
    disabled: true,
  },
};

/**
 * 選択済みで無効化
 * ユーザー選択済みかつ無効化された状態
 */
export const DisabledWithValue: Story = {
  args: {
    value: 'user-456',
    label: '営業担当者',
    disabled: true,
  },
};

/**
 * ログインユーザーをデフォルト選択
 * 新規作成時にログインユーザーを自動選択
 */
export const DefaultToCurrentUser: Story = {
  args: {
    value: '',
    label: '営業担当者',
    required: true,
    defaultToCurrentUser: true,
  },
};

/**
 * カスタムプレースホルダー
 * プレースホルダーをカスタマイズ
 */
export const CustomPlaceholder: Story = {
  args: {
    value: '',
    label: '担当者',
    placeholder: '担当者を指定してください（任意）',
  },
};
