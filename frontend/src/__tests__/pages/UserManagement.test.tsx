/**
 * ユーザー管理画面のテスト
 *
 * 要件17: 動的ロール管理
 * 要件18: 権限管理
 * 要件19: ロールへの権限割り当て
 * 要件20: ユーザーへのロール割り当て
 * 要件21: 権限チェック機能
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserManagement } from '../../pages/UserManagement';
import type { Role, Permission, UserWithRoles } from '../../types/role.types';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('UserManagement Component', () => {
  const mockUsers: UserWithRoles[] = [
    {
      id: 'user-1',
      email: 'admin@example.com',
      displayName: 'Admin User',
      createdAt: '2025-01-01T00:00:00Z',
      roles: [
        {
          id: 'role-1',
          name: 'admin',
          description: '管理者',
          priority: 100,
          isSystem: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
    },
    {
      id: 'user-2',
      email: 'user@example.com',
      displayName: 'Test User',
      createdAt: '2025-01-02T00:00:00Z',
      roles: [
        {
          id: 'role-2',
          name: 'user',
          description: '一般ユーザー',
          priority: 50,
          isSystem: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
    },
  ];

  const mockRoles: Role[] = [
    {
      id: 'role-1',
      name: 'admin',
      description: '管理者',
      priority: 100,
      isSystem: true,
      userCount: 1,
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'role-2',
      name: 'user',
      description: '一般ユーザー',
      priority: 50,
      isSystem: true,
      userCount: 1,
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'role-3',
      name: 'manager',
      description: 'マネージャー',
      priority: 75,
      isSystem: false,
      userCount: 0,
      createdAt: '2025-01-01T00:00:00Z',
    },
  ];

  const mockPermissions: Permission[] = [
    {
      id: 'perm-1',
      resource: 'user',
      action: 'read',
      description: 'ユーザー読み取り',
    },
    {
      id: 'perm-2',
      resource: 'user',
      action: 'write',
      description: 'ユーザー書き込み',
    },
    {
      id: 'perm-3',
      resource: 'role',
      action: 'manage',
      description: 'ロール管理',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初期表示とタブ切り替え', () => {
    it('初期ロード時にユーザー、ロール、権限のデータを取得する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      // 3つのAPIが呼ばれる
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/users');
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/roles');
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/permissions');
      });
    });

    it('タブをクリックして切り替えられる（要件17-21）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      expect(screen.getByText('ロール一覧')).toBeInTheDocument();
      expect(screen.getByText('+ ロール作成')).toBeInTheDocument();

      // 権限タブに切り替え
      const permissionsTab = screen.getByLabelText('権限タブ');
      await user.click(permissionsTab);

      expect(screen.getByText('ロール・権限管理')).toBeInTheDocument();
    });
  });

  describe('ユーザータブ', () => {
    it('ユーザー一覧を表示する（要件20.1）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ユーザー情報が表示される
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
      expect(screen.getByText('Test User')).toBeInTheDocument();

      // ロール情報が表示される
      expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
      expect(screen.getAllByText('user').length).toBeGreaterThan(0);
    });

    it('ユーザーにロールを追加できる（要件20.2）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      // 初回データ取得
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      // ロール追加
      vi.mocked(apiClient.post).mockResolvedValue({ message: 'ロールを追加しました' });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ユーザーにロールを追加
      const roleSelects = screen.getAllByLabelText(/ロールを追加:/);
      await user.selectOptions(roleSelects[0]!, 'role-3'); // manager ロール

      // APIが呼ばれる
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/users/user-1/roles', {
          roleId: 'role-3',
        });
      });

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('ロールを追加しました')).toBeInTheDocument();
      });
    });

    it('ユーザーからロールを削除できる（要件20.3）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      // managerロールを持つユーザーを用意
      const usersWithManager: UserWithRoles[] = [
        {
          ...mockUsers[0]!,
          roles: [
            ...mockUsers[0]!.roles,
            mockRoles[2]!, // manager (isSystem: false)
          ],
        },
      ];

      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(usersWithManager);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      vi.mocked(apiClient.delete).mockResolvedValue({ message: 'ロールを削除しました' });

      // window.confirm をモック
      vi.stubGlobal(
        'confirm',
        vi.fn(() => true)
      );

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // managerロールの削除ボタンをクリック
      const deleteButtons = screen.getAllByLabelText(/を削除/);
      const managerDeleteButton = deleteButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('manager')
      );

      if (managerDeleteButton) {
        await user.click(managerDeleteButton);

        // 確認ダイアログが表示される
        expect(window.confirm).toHaveBeenCalled();

        // APIが呼ばれる
        await waitFor(() => {
          expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/users/user-1/roles/role-3');
        });

        // 成功メッセージが表示される
        await waitFor(() => {
          expect(screen.getByText('ロールを削除しました')).toBeInTheDocument();
        });
      }

      vi.unstubAllGlobals();
    });

    it('システムロールは削除ボタンが表示されない（要件17.2）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // admin と user はシステムロールなので削除ボタンがない
      const deleteButtons = screen.queryAllByLabelText(/adminを削除/);
      expect(deleteButtons.length).toBe(0);
    });

    it('ユーザーがいない場合は空状態を表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve([]);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('ユーザーがいません')).toBeInTheDocument();
      });
    });
  });

  describe('ロールタブ', () => {
    it('ロール一覧を表示する（要件17.1）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // ロール一覧が表示される
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('user')).toBeInTheDocument();
      expect(screen.getByText('manager')).toBeInTheDocument();

      // システムロールバッジが表示される
      const systemBadges = screen.getAllByText('システム');
      expect(systemBadges.length).toBe(2); // admin と user
    });

    it('ロール作成ダイアログを表示できる（要件17.3）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // ロール作成ボタンをクリック
      const createButton = screen.getByLabelText('新しいロールを作成');
      await user.click(createButton);

      // ダイアログが表示される
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('ロール作成')).toBeInTheDocument();
      expect(screen.getByLabelText('ロール名 *')).toBeInTheDocument();
      expect(screen.getByLabelText('説明')).toBeInTheDocument();
      expect(screen.getByLabelText('優先順位 (0-100)')).toBeInTheDocument();
    });

    it('ロールを作成できる（要件17.3）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      vi.mocked(apiClient.post).mockResolvedValue({
        id: 'role-4',
        name: 'developer',
        description: '開発者',
        priority: 60,
        isSystem: false,
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // ロール作成ボタンをクリック
      const createButton = screen.getByLabelText('新しいロールを作成');
      await user.click(createButton);

      // フォームに入力
      const nameInput = screen.getByLabelText('ロール名 *');
      const descriptionInput = screen.getByLabelText('説明');
      const priorityInput = screen.getByLabelText('優先順位 (0-100)');

      await user.clear(nameInput);
      await user.type(nameInput, 'developer');
      await user.clear(descriptionInput);
      await user.type(descriptionInput, '開発者');
      await user.clear(priorityInput);
      await user.type(priorityInput, '60');

      // 作成ボタンをクリック
      const submitButton = screen.getByLabelText('ロールを作成');
      await user.click(submitButton);

      // APIが呼ばれる
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/roles', {
          name: 'developer',
          description: '開発者',
          priority: 60,
        });
      });

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('ロールを作成しました')).toBeInTheDocument();
      });
    });

    it('ロール名が空の場合はバリデーションエラーを表示する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // ロール作成ボタンをクリック
      const createButton = screen.getByLabelText('新しいロールを作成');
      await user.click(createButton);

      // ロール名を空にして作成ボタンをクリック
      const nameInput = screen.getByLabelText('ロール名 *');
      await user.clear(nameInput);

      const submitButton = screen.getByLabelText('ロールを作成');
      await user.click(submitButton);

      // バリデーションエラーが表示される
      await waitFor(() => {
        expect(screen.getByText('ロール名を入力してください')).toBeInTheDocument();
      });

      // APIは呼ばれない
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('ロールを編集できる（要件17.4）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      vi.mocked(apiClient.patch).mockResolvedValue({
        id: 'role-3',
        name: 'manager-updated',
        description: 'マネージャー（更新）',
        priority: 80,
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // manager の編集ボタンをクリック
      const editButtons = screen.getAllByLabelText(/を編集/);
      const managerEditButton = editButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('manager')
      );

      if (managerEditButton) {
        await user.click(managerEditButton);

        // ダイアログが表示される
        expect(screen.getByText('ロール編集')).toBeInTheDocument();

        // フォームに既存の値が入っている
        const nameInput = screen.getByLabelText('ロール名 *');
        expect(nameInput).toHaveValue('manager');

        // フォームを編集
        await user.clear(nameInput);
        await user.type(nameInput, 'manager-updated');

        const priorityInput = screen.getByLabelText('優先順位 (0-100)');
        await user.clear(priorityInput);
        await user.type(priorityInput, '80');

        // 更新ボタンをクリック
        const submitButton = screen.getByLabelText('ロールを更新');
        await user.click(submitButton);

        // APIが呼ばれる
        await waitFor(() => {
          expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/roles/role-3', {
            name: 'manager-updated',
            description: 'マネージャー',
            priority: 80,
          });
        });

        // 成功メッセージが表示される
        await waitFor(() => {
          expect(screen.getByText('ロールを更新しました')).toBeInTheDocument();
        });
      }
    });

    it('ロールを削除できる（要件17.5）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      vi.mocked(apiClient.delete).mockResolvedValue({ message: 'ロールを削除しました' });

      vi.stubGlobal(
        'confirm',
        vi.fn(() => true)
      );

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // manager の削除ボタンをクリック
      const deleteButtons = screen.getAllByLabelText(/を削除/);
      const managerDeleteButton = deleteButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('manager')
      );

      if (managerDeleteButton) {
        await user.click(managerDeleteButton);

        // 確認ダイアログが表示される
        expect(window.confirm).toHaveBeenCalled();

        // APIが呼ばれる
        await waitFor(() => {
          expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/roles/role-3');
        });

        // 成功メッセージが表示される
        await waitFor(() => {
          expect(screen.getByText('ロールを削除しました')).toBeInTheDocument();
        });
      }

      vi.unstubAllGlobals();
    });

    it('システムロールは削除ボタンが表示されない（要件17.2）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // admin ロールに削除ボタンがない（システムロール）
      const adminRow = screen.getByText('admin').closest('tr');
      const deleteButton = adminRow?.querySelector('button[aria-label*="削除"]');
      expect(deleteButton).toBeNull();
    });
  });

  describe('権限タブ', () => {
    it('権限タブでロールを選択できる（要件19.1）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // 権限タブに切り替え
      const permissionsTab = screen.getByLabelText('権限タブ');
      await user.click(permissionsTab);

      // ロール選択セレクトボックスが表示される
      const roleSelect = screen.getByLabelText('ロールを選択:');
      expect(roleSelect).toBeInTheDocument();

      // ロールを選択
      await user.selectOptions(roleSelect, 'role-1');

      // 選択されたロールIDが反映される
      expect(roleSelect).toHaveValue('role-1');
    });

    it('ロール選択時に利用可能な権限一覧を表示する（要件19.2）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // 権限タブに切り替え
      const permissionsTab = screen.getByLabelText('権限タブ');
      await user.click(permissionsTab);

      // ロールを選択
      const roleSelect = screen.getByLabelText('ロールを選択:');
      await user.selectOptions(roleSelect, 'role-1');

      // 利用可能な権限が表示される
      await waitFor(() => {
        expect(screen.getByText('利用可能な権限')).toBeInTheDocument();
      });

      // 権限ボタンが表示される
      expect(screen.getByLabelText('user:readを追加')).toBeInTheDocument();
      expect(screen.getByLabelText('user:writeを追加')).toBeInTheDocument();
      expect(screen.getByLabelText('role:manageを追加')).toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    it('ユーザー一覧取得失敗時にエラーメッセージを表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.reject(new Error('サーバーエラー'));
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('ユーザー一覧を取得できませんでした')).toBeInTheDocument();
      });
    });

    it('ロール作成失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      vi.mocked(apiClient.post).mockRejectedValue({
        response: {
          data: {
            message: 'ロール名が重複しています',
          },
        },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // ロール作成ボタンをクリック
      const createButton = screen.getByLabelText('新しいロールを作成');
      await user.click(createButton);

      // フォームに入力
      const nameInput = screen.getByLabelText('ロール名 *');
      await user.type(nameInput, 'admin'); // 重複

      const submitButton = screen.getByLabelText('ロールを作成');
      await user.click(submitButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('ロール名が重複しています')).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('タブにrole属性が設定されている', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      const usersTab = screen.getByLabelText('ユーザータブ');
      expect(usersTab).toHaveAttribute('role', 'tab');
      expect(usersTab).toHaveAttribute('aria-selected', 'true');
    });

    it('ダイアログにrole属性が設定されている', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      });

      // ロールタブに切り替え
      const rolesTab = screen.getByLabelText('ロールタブ');
      await user.click(rolesTab);

      // ロール作成ボタンをクリック
      const createButton = screen.getByLabelText('新しいロールを作成');
      await user.click(createButton);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'role-dialog-title');
    });
  });

  describe('レスポンシブデザイン', () => {
    it('モバイルビューポートでモバイル最適化クラスを適用する', async () => {
      // モバイルビューポートをシミュレート（768px未満）
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/users')) return Promise.resolve(mockUsers);
        if (url.includes('/roles')) return Promise.resolve(mockRoles);
        if (url.includes('/permissions')) return Promise.resolve(mockPermissions);
        return Promise.resolve([]);
      });

      render(<UserManagement />);

      const container = screen.getByTestId('user-management-container');
      expect(container).toHaveClass('mobile-optimized');
    });
  });
});
