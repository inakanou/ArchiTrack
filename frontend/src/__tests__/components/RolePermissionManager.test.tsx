/**
 * RolePermissionManager 単体テスト
 *
 * ロール・権限管理コンポーネントのテストを提供します。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RolePermissionManager from '../../components/RolePermissionManager';
import type { Role, Permission } from '../../types/role.types';

// モックデータ
const mockRoles: Role[] = [
  {
    id: '1',
    name: 'システム管理者',
    description: '全ての権限を持つ',
    priority: 100,
    isSystem: true,
    userCount: 2,
    permissionCount: 10,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: '一般ユーザー',
    description: '基本的な権限を持つ',
    priority: 0,
    isSystem: false,
    userCount: 10,
    permissionCount: 3,
    createdAt: new Date().toISOString(),
  },
];

const mockPermissions: Permission[] = [
  {
    id: '1',
    resource: 'adr',
    action: 'read',
    description: 'ADR閲覧権限',
  },
  {
    id: '2',
    resource: 'adr',
    action: 'create',
    description: 'ADR作成権限',
  },
  {
    id: '3',
    resource: '*',
    action: '*',
    description: '全権限',
  },
];

describe('RolePermissionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ロール一覧を表示する', () => {
    render(
      <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
    );

    expect(screen.getByText('システム管理者')).toBeInTheDocument();
    expect(screen.getByText('一般ユーザー')).toBeInTheDocument();
  });

  it('タブを切り替えると権限一覧が表示される', async () => {
    const user = userEvent.setup();

    render(
      <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
    );

    const permissionsTab = screen.getByRole('button', { name: /権限/i });
    await user.click(permissionsTab);

    await waitFor(() => {
      expect(screen.getByText('ADR閲覧権限')).toBeInTheDocument();
      expect(screen.getByText('ADR作成権限')).toBeInTheDocument();
    });
  });

  it('ロール作成ボタンをクリックするとダイアログが表示される', async () => {
    const user = userEvent.setup();

    render(
      <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
    );

    const createButton = screen.getByRole('button', { name: /ロール作成/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText(/ロール名/i)).toBeInTheDocument();
    });
  });

  it('システムロールには削除ボタンが表示されない', () => {
    render(
      <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
    );

    const deleteButtons = screen.queryAllByRole('button', { name: /削除/i });
    // 一般ユーザーのみ削除ボタンがある（システム管理者にはない）
    expect(deleteButtons.length).toBe(1);
  });

  it('ローディング中にスピナーを表示する', () => {
    render(<RolePermissionManager roles={[]} permissions={[]} loading={true} />);

    expect(screen.getByLabelText(/読み込み中/i)).toBeInTheDocument();
  });

  it('エラー時にエラーメッセージを表示する', () => {
    render(
      <RolePermissionManager
        roles={[]}
        permissions={[]}
        loading={false}
        error="ロール一覧の取得に失敗しました"
      />
    );

    expect(screen.getByText(/ロール一覧の取得に失敗しました/i)).toBeInTheDocument();
  });

  it('ロールが0件の場合にメッセージを表示する', () => {
    render(<RolePermissionManager roles={[]} permissions={mockPermissions} loading={false} />);

    expect(screen.getByText(/ロールがありません/i)).toBeInTheDocument();
  });

  it('アクセシビリティ属性が設定されている', () => {
    render(
      <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
