/**
 * ロールの保存・削除の失敗の表示のテスト（タスク 37.3）
 *
 * @requirement user-authentication/REQ-17.2
 * @requirement user-authentication/REQ-17.5
 * @requirement user-authentication/REQ-17.6
 *
 * `ApiError.response` は応答の本文そのもの（`{ error, code, details? }`）で、`data` を持たない。
 * 画面は本文の `code` を読み、ロール名の重複・使用中のロール・システムロールの拒否の理由を表示する。
 * 応答の本文は backend/src/routes/roles.routes.ts の実際の形に揃える。
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserManagement } from '../../pages/UserManagement';
import { ApiError, apiClient } from '../../api/client';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const VERSION_1 = '2026-09-28T01:00:00.000Z';

const ROLES = [
  {
    id: 'role-1',
    name: 'admin',
    description: 'システム管理者',
    priority: 100,
    isSystem: true,
    userCount: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: VERSION_1,
  },
  {
    id: 'role-3',
    name: 'manager',
    description: 'マネージャー',
    priority: 75,
    isSystem: false,
    userCount: 2,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: VERSION_1,
  },
];

const SAVE_NAME_CONFLICT = 'ロールの保存に失敗しました。同じ名前のロールが既に存在します';
const DELETE_SYSTEM_ROLE = 'ロール削除に失敗しました。システムロールは削除できません';
const DELETE_IN_USE =
  'ロール削除に失敗しました。このロールはユーザーに割り当てられているため削除できません';

function nameConflictError(): ApiError {
  return new ApiError(409, "Role with name 'admin' already exists", {
    error: "Role with name 'admin' already exists",
    code: 'ROLE_NAME_CONFLICT',
  });
}

function mockLists() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/api/v1/roles') {
      return Promise.resolve(ROLES);
    }
    return Promise.resolve([]);
  });
}

async function openRolesTab() {
  const user = userEvent.setup();
  render(<UserManagement />);
  await user.click(screen.getByLabelText('ロールタブ'));
  await screen.findByLabelText('managerを編集');
  return user;
}

describe('UserManagement - ロールの保存・削除の失敗の表示（要件17.2 / 17.5 / 17.6）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLists();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('作成が 409 ROLE_NAME_CONFLICT で拒否されたら、ロール名の重複を理由として表示する', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(nameConflictError());
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('新しいロールを作成'));
    await user.type(screen.getByLabelText('ロール名 *'), 'admin');
    await user.click(screen.getByLabelText('ロールを作成'));

    // ページ上部の通知はダイアログの背後に隠れるため、ダイアログの中に出す
    const dialog = screen.getByRole('dialog');
    const alert = await within(dialog).findByText(SAVE_NAME_CONFLICT);
    expect(alert).toHaveAttribute('role', 'alert');
    // 失敗として赤で示す
    expect(alert).toHaveStyle({ color: '#991b1b' });
    // ページ上部には重ねて出さない
    expect(screen.getAllByText(SAVE_NAME_CONFLICT)).toHaveLength(1);
    // ダイアログは開いたままで、入力は失われない
    expect(within(dialog).getByLabelText('ロール名 *')).toHaveValue('admin');
    expect(screen.queryByTestId('role-conflict')).not.toBeInTheDocument();
  });

  it('保存の失敗の表示は、ダイアログを閉じて開き直すと消える', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(nameConflictError());
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('新しいロールを作成'));
    await user.type(screen.getByLabelText('ロール名 *'), 'admin');
    await user.click(screen.getByLabelText('ロールを作成'));
    expect(
      await within(screen.getByRole('dialog')).findByText(SAVE_NAME_CONFLICT)
    ).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 作成・編集のどちらで開き直しても、前の失敗は残らない
    await user.click(screen.getByLabelText('新しいロールを作成'));
    expect(within(screen.getByRole('dialog')).queryByText(SAVE_NAME_CONFLICT)).toBeNull();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' })
    );
    await user.click(screen.getByLabelText('managerを編集'));
    expect(within(screen.getByRole('dialog')).queryByText(SAVE_NAME_CONFLICT)).toBeNull();
  });

  it('保存の失敗の表示は、保存し直すと消え、成功すればダイアログを閉じる', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(nameConflictError()).mockResolvedValueOnce({});
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('新しいロールを作成'));
    const nameField = screen.getByLabelText('ロール名 *');
    await user.type(nameField, 'admin');
    await user.click(screen.getByLabelText('ロールを作成'));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(SAVE_NAME_CONFLICT)).toBeInTheDocument();

    await user.clear(nameField);
    await user.type(nameField, 'admin2');
    await user.click(within(dialog).getByLabelText('ロールを作成'));

    expect(await screen.findByText('ロールを作成しました')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(SAVE_NAME_CONFLICT)).not.toBeInTheDocument();
  });

  it('更新が 409 ROLE_NAME_CONFLICT で拒否されたら、ロール名の重複を理由として表示し版の競合としない', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(nameConflictError());
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを編集'));
    const dialog = screen.getByRole('dialog');
    const nameField = within(dialog).getByLabelText('ロール名 *');
    await user.clear(nameField);
    await user.type(nameField, 'admin');
    await user.click(within(dialog).getByLabelText('ロールを更新'));

    const alert = await within(dialog).findByText(SAVE_NAME_CONFLICT);
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.getAllByText(SAVE_NAME_CONFLICT)).toHaveLength(1);
    expect(within(dialog).getByLabelText('ロール名 *')).toHaveValue('admin');
    expect(screen.queryByTestId('role-conflict')).not.toBeInTheDocument();
    expect(screen.queryByText('ロールを更新しました')).not.toBeInTheDocument();
  });

  it('更新が 404 ROLE_NOT_FOUND で拒否されたら、ロールが見つからないことを表示する', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiError(404, 'Role not found', { error: 'Role not found', code: 'ROLE_NOT_FOUND' })
    );
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを編集'));
    await user.click(screen.getByLabelText('ロールを更新'));

    expect(
      await within(screen.getByRole('dialog')).findByText(
        'ロールの保存に失敗しました。ロールが見つかりません。削除された可能性があります'
      )
    ).toBeInTheDocument();
  });

  it('保存の失敗の本文に既知の code が無ければ、既定の文言を表示する', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(500, 'Failed to create role', { error: 'Failed to create role' })
    );
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('新しいロールを作成'));
    await user.type(screen.getByLabelText('ロール名 *'), 'new role');
    await user.click(screen.getByLabelText('ロールを作成'));

    const alert = await within(screen.getByRole('dialog')).findByText('ロールの保存に失敗しました');
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('削除が 400 ROLE_IN_USE で拒否されたら、使用中であることと割り当てのユーザー数を表示する', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(
      new ApiError(400, 'Role is in use by 2 user(s)', {
        error: 'Role is in use by 2 user(s)',
        code: 'ROLE_IN_USE',
        details: { userCount: 2 },
      })
    );
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを削除'));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/roles/role-3'));
    const alert = await screen.findByText(`${DELETE_IN_USE}（割り当て中のユーザー: 2人）`);
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveStyle({ color: '#991b1b' });
  });

  it('削除が 400 ROLE_IN_USE で拒否され件数が無ければ、使用中であることだけを表示する', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(
      new ApiError(400, 'Role is in use', { error: 'Role is in use', code: 'ROLE_IN_USE' })
    );
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを削除'));

    expect(await screen.findByText(DELETE_IN_USE)).toBeInTheDocument();
  });

  it('削除が 400 SYSTEM_ROLE_PROTECTED で拒否されたら、システムロールは削除できないことを表示する', async () => {
    // 画面はシステムロールの行に削除のボタンを出さない（次の it）。ここでは応答の本文から表示への
    // 対応づけだけを、manager の行から送った削除の応答を SYSTEM_ROLE_PROTECTED にして確かめる
    vi.mocked(apiClient.delete).mockRejectedValue(
      new ApiError(400, 'Cannot delete system role', {
        error: 'Cannot delete system role',
        code: 'SYSTEM_ROLE_PROTECTED',
      })
    );
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを削除'));

    const alert = await screen.findByText(DELETE_SYSTEM_ROLE);
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('システムロールの行には削除のボタンを出さない（要件17.6）', async () => {
    await openRolesTab();

    expect(screen.getByLabelText('adminを編集')).toBeInTheDocument();
    expect(screen.queryByLabelText('adminを削除')).not.toBeInTheDocument();
  });

  it('削除が 404 ROLE_NOT_FOUND で拒否されたら、ロールが見つからないことを表示する', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(
      new ApiError(404, 'Role not found', { error: 'Role not found', code: 'ROLE_NOT_FOUND' })
    );
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを削除'));

    expect(
      await screen.findByText(
        'ロール削除に失敗しました。ロールが見つかりません。削除された可能性があります'
      )
    ).toBeInTheDocument();
  });

  it('削除の失敗の本文に既知の code が無ければ、既定の文言を表示する', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('Network Error'));
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを削除'));

    expect(await screen.findByText('ロール削除に失敗しました')).toBeInTheDocument();
  });

  it('旧来の response.data.message の形は読まない（応答の本文に data は無い）', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue({
      response: { data: { message: '旧来の形の文言' } },
    });
    const user = await openRolesTab();

    await user.click(screen.getByLabelText('managerを削除'));

    expect(await screen.findByText('ロール削除に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('旧来の形の文言')).not.toBeInTheDocument();
  });
});
