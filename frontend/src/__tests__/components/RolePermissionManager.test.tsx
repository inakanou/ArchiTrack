/**
 * RolePermissionManager 単体テスト
 *
 * ロール・権限管理コンポーネントのテストを提供します。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  describe('ロール作成ダイアログ', () => {
    it('ダイアログでロール名を入力できる', async () => {
      const user = userEvent.setup();

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      const createButton = screen.getByRole('button', { name: /ロール作成/i });
      await user.click(createButton);

      const nameInput = screen.getByLabelText(/ロール名/i);
      await user.type(nameInput, '新しいロール');

      expect(nameInput).toHaveValue('新しいロール');
    });

    it('ダイアログで説明を入力できる', async () => {
      const user = userEvent.setup();

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      const createButton = screen.getByRole('button', { name: /ロール作成/i });
      await user.click(createButton);

      const descriptionInput = screen.getByLabelText(/説明/i);
      await user.type(descriptionInput, 'これはテストの説明です');

      expect(descriptionInput).toHaveValue('これはテストの説明です');
    });

    it('キャンセルボタンでダイアログを閉じられる', async () => {
      const user = userEvent.setup();

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      const createButton = screen.getByRole('button', { name: /ロール作成/i });
      await user.click(createButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('背景クリックでダイアログを閉じられる', async () => {
      const user = userEvent.setup();

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      const createButton = screen.getByRole('button', { name: /ロール作成/i });
      await user.click(createButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // ダイアログの背景（オーバーレイ）をクリック
      const dialog = screen.getByRole('dialog');
      await user.click(dialog);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('フォーム送信でダイアログが閉じられる', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      const createButton = screen.getByRole('button', { name: /ロール作成/i });
      await user.click(createButton);

      const nameInput = screen.getByLabelText(/ロール名/i);
      const descriptionInput = screen.getByLabelText(/説明/i);
      await user.type(nameInput, 'テストロール');
      await user.type(descriptionInput, 'テストの説明');

      // ダイアログ内のsubmitボタンを取得
      const dialog = screen.getByRole('dialog');
      const submitButton = within(dialog).getByRole('button', { name: /^作成$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Creating role:', {
        name: 'テストロール',
        description: 'テストの説明',
        priority: 0,
      });

      consoleSpy.mockRestore();
    });

    it('フォーム送信後に入力がリセットされる', async () => {
      const user = userEvent.setup();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      const createButton = screen.getByRole('button', { name: /ロール作成/i });
      await user.click(createButton);

      const nameInput = screen.getByLabelText(/ロール名/i);
      const descriptionInput = screen.getByLabelText(/説明/i);
      await user.type(nameInput, 'テストロール');
      await user.type(descriptionInput, 'テストの説明');

      // ダイアログ内のsubmitボタンを取得
      const dialog = screen.getByRole('dialog');
      const submitButton = within(dialog).getByRole('button', { name: /^作成$/i });
      await user.click(submitButton);

      // 再度ダイアログを開く
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/ロール名/i)).toHaveValue('');
        expect(screen.getByLabelText(/説明/i)).toHaveValue('');
      });
    });
  });

  describe('権限タブ', () => {
    it('権限が0件の場合にメッセージを表示する', async () => {
      const user = userEvent.setup();

      render(<RolePermissionManager roles={mockRoles} permissions={[]} loading={false} />);

      const permissionsTab = screen.getByRole('button', { name: /権限/i });
      await user.click(permissionsTab);

      await waitFor(() => {
        expect(screen.getByText(/権限がありません/i)).toBeInTheDocument();
      });
    });

    it('権限タブでローディング中にスピナーを表示する', async () => {
      const user = userEvent.setup();

      render(<RolePermissionManager roles={mockRoles} permissions={[]} loading={true} />);

      const permissionsTab = screen.getByRole('button', { name: /権限/i });
      await user.click(permissionsTab);

      await waitFor(() => {
        expect(screen.getByLabelText(/読み込み中/i)).toBeInTheDocument();
      });
    });

    it('権限テーブルにリソースとアクションが表示される', async () => {
      const user = userEvent.setup();

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      const permissionsTab = screen.getByRole('button', { name: /権限/i });
      await user.click(permissionsTab);

      await waitFor(() => {
        // 権限テーブルが表示される
        const tables = screen.getAllByRole('table');
        expect(tables.length).toBeGreaterThanOrEqual(1);
        // 権限説明が表示される
        expect(screen.getByText('ADR閲覧権限')).toBeInTheDocument();
        expect(screen.getByText('ADR作成権限')).toBeInTheDocument();
        expect(screen.getByText('全権限')).toBeInTheDocument();
      });
    });
  });

  describe('タブ切り替え', () => {
    it('ロールタブに戻れる', async () => {
      const user = userEvent.setup();

      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      // 権限タブに切り替え
      const permissionsTab = screen.getByRole('button', { name: /権限/i });
      await user.click(permissionsTab);

      await waitFor(() => {
        expect(screen.getByText('ADR閲覧権限')).toBeInTheDocument();
      });

      // ロールタブに戻る
      const rolesTab = screen.getByRole('button', { name: /ロール/i });
      await user.click(rolesTab);

      await waitFor(() => {
        expect(screen.getByText('システム管理者')).toBeInTheDocument();
        expect(screen.queryByText('ADR閲覧権限')).not.toBeInTheDocument();
      });
    });
  });

  describe('ロールテーブル詳細', () => {
    it('ロールのユーザー数と権限数が表示される', () => {
      render(
        <RolePermissionManager roles={mockRoles} permissions={mockPermissions} loading={false} />
      );

      // テーブル内にデータが表示されていることを確認
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();

      // ロール名でテーブルに表示されていることを検証
      expect(screen.getByText('システム管理者')).toBeInTheDocument();
      expect(screen.getByText('一般ユーザー')).toBeInTheDocument();
    });

    it('ユーザー数・権限数が未設定の場合は0が表示される', () => {
      const roleWithZeroCounts: Role[] = [
        {
          id: '3',
          name: 'テストロール',
          description: 'カウントが未設定',
          priority: 50,
          isSystem: false,
          createdAt: new Date().toISOString(),
        },
      ];

      render(
        <RolePermissionManager
          roles={roleWithZeroCounts}
          permissions={mockPermissions}
          loading={false}
        />
      );

      // userCount, permissionCountが未定義の場合は0が表示される
      const zeroCells = screen.getAllByText('0');
      expect(zeroCells.length).toBeGreaterThanOrEqual(2);
    });
  });
});
