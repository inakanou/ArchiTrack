import type { Meta, StoryObj } from '@storybook/react';
import RolePermissionManager from './RolePermissionManager';
import type { Role, Permission } from '../types/role.types';

/**
 * RolePermissionManager コンポーネントのストーリー
 *
 * ロールと権限の管理画面。
 * ユーザーロール、権限の割り当て、権限の管理を行います。
 */
const meta = {
  title: 'Components/RolePermissionManager',
  component: RolePermissionManager,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    roles: [],
    permissions: [],
    loading: false,
  },
} satisfies Meta<typeof RolePermissionManager>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockRoles: Role[] = [
  {
    id: 'role-1',
    name: 'admin',
    description: '管理者',
    priority: 1,
    isSystem: true,
    userCount: 5,
    permissionCount: 10,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'role-2',
    name: 'user',
    description: '一般ユーザー',
    priority: 100,
    isSystem: true,
    userCount: 50,
    permissionCount: 2,
    createdAt: '2025-01-01T00:00:00Z',
  },
];

const mockPermissions: Permission[] = [
  {
    id: 'perm-1',
    resource: 'users',
    action: 'read',
    description: 'ユーザー情報の閲覧',
  },
  {
    id: 'perm-2',
    resource: 'users',
    action: 'write',
    description: 'ユーザー情報の編集',
  },
  {
    id: 'perm-3',
    resource: 'users',
    action: 'delete',
    description: 'ユーザーの削除',
  },
  {
    id: 'perm-4',
    resource: 'projects',
    action: 'read',
    description: 'プロジェクト情報の閲覧',
  },
  {
    id: 'perm-5',
    resource: 'projects',
    action: 'write',
    description: 'プロジェクト情報の編集',
  },
];

/**
 * デフォルト状態
 * ロールと権限の一覧を表示
 */
export const Default: Story = {
  args: {
    roles: mockRoles,
    permissions: mockPermissions,
    loading: false,
  },
};

/**
 * ローディング状態
 * データ取得中の状態
 */
export const Loading: Story = {
  args: {
    roles: [],
    permissions: [],
    loading: true,
  },
};

/**
 * エラー状態
 * データ取得失敗時のエラー表示
 */
export const WithError: Story = {
  args: {
    roles: [],
    permissions: [],
    loading: false,
    error: 'ロール情報を取得できませんでした',
  },
};
