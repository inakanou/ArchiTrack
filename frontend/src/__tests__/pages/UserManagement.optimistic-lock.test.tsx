/**
 * ロールの編集画面の楽観的ロックのテスト
 *
 * @requirement user-authentication/REQ-25.8
 *
 * ロールの一覧（GET /api/v1/roles）の updatedAt（版）を保持し、編集の保存時に
 * expectedUpdatedAt として送る。409 ROLE_CONFLICT を受けたら編集ダイアログに競合を表示し、
 * 最新の内容の再読み込みを促す。保存に成功したら応答の新しい版を採用する。
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const VERSION_2 = '2026-09-28T02:00:00.000Z';
const VERSION_3 = '2026-09-28T03:00:00.000Z';

interface RoleRow {
  id: string;
  name: string;
  description: string;
  priority: number;
  isSystem: boolean;
  userCount: number;
  createdAt: string;
  updatedAt?: string;
}

function managerRole(overrides: Partial<RoleRow> = {}): RoleRow {
  return {
    id: 'role-3',
    name: 'manager',
    description: 'マネージャー',
    priority: 75,
    isSystem: false,
    userCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: VERSION_1,
    ...overrides,
  };
}

function roleConflictError(): ApiError {
  return new ApiError(409, '他のユーザーによって更新されました。画面を更新してください', {
    type: 'https://architrack.example.com/problems/conflict',
    title: 'ROLE_CONFLICT',
    status: 409,
    code: 'ROLE_CONFLICT',
    details: { expectedUpdatedAt: VERSION_1, actualUpdatedAt: VERSION_2 },
  });
}

/**
 * GET の応答を URL で振り分ける。ロール一覧は呼ばれるたびに `rolesResponses` の先頭から返し、
 * 最後の要素は以降も返し続ける（要素が Error なら reject する）
 */
function mockGet(rolesResponses: Array<RoleRow[] | Error>) {
  let index = 0;
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/api/v1/roles') {
      const response = rolesResponses[Math.min(index, rolesResponses.length - 1)];
      index += 1;
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    }
    // ユーザー・権限の一覧は本テストの関心外
    return Promise.resolve([]);
  });
}

/** ロールタブを開き、manager の編集ダイアログを開く */
async function openManagerEditDialog() {
  const user = userEvent.setup();
  render(<UserManagement />);
  await user.click(screen.getByLabelText('ロールタブ'));
  await user.click(await screen.findByLabelText('managerを編集'));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('ロール編集')).toBeInTheDocument();
  return { user, dialog };
}

async function replaceDescription(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText('説明');
  await user.clear(field);
  await user.type(field, value);
}

function patchBodies(): Array<Record<string, unknown>> {
  return vi.mocked(apiClient.patch).mock.calls.map((call) => call[1] as Record<string, unknown>);
}

describe('UserManagement - ロール編集の楽観的ロック（要件25.8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('一覧で取得した版を expectedUpdatedAt として送る', async () => {
    mockGet([[managerRole()]]);
    vi.mocked(apiClient.patch).mockResolvedValue(
      managerRole({ description: '更新後', updatedAt: VERSION_2 })
    );

    const { user } = await openManagerEditDialog();
    await replaceDescription(user, '更新後');
    await user.click(screen.getByLabelText('ロールを更新'));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/roles/role-3', {
        name: 'manager',
        description: '更新後',
        priority: 75,
        expectedUpdatedAt: VERSION_1,
      });
    });
    expect(await screen.findByText('ロールを更新しました')).toBeInTheDocument();
    expect(screen.queryByTestId('role-conflict')).not.toBeInTheDocument();
  });

  it('保存に成功したら応答の新しい版を採用し、続けて編集しても競合にならない', async () => {
    // 保存後の一覧の再取得が失敗しても、PATCH の応答の版を採用している
    mockGet([[managerRole()], new ApiError(500, 'Internal Server Error')]);
    vi.mocked(apiClient.patch)
      .mockResolvedValueOnce(managerRole({ description: '1回目', updatedAt: VERSION_2 }))
      .mockResolvedValueOnce(managerRole({ description: '2回目', updatedAt: VERSION_3 }));

    const { user } = await openManagerEditDialog();
    await replaceDescription(user, '1回目');
    await user.click(screen.getByLabelText('ロールを更新'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByLabelText('managerを編集'));
    // ダイアログは保存後の内容で開く
    expect(screen.getByLabelText('説明')).toHaveValue('1回目');
    await replaceDescription(user, '2回目');
    await user.click(screen.getByLabelText('ロールを更新'));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(2));
    const [first, second] = patchBodies();
    expect(first?.expectedUpdatedAt).toBe(VERSION_1);
    expect(second?.expectedUpdatedAt).toBe(VERSION_2);
    expect(screen.queryByTestId('role-conflict')).not.toBeInTheDocument();
  });

  it('409 ROLE_CONFLICT を受けたら、編集ダイアログに競合を表示し入力を保つ', async () => {
    mockGet([[managerRole()]]);
    vi.mocked(apiClient.patch).mockRejectedValue(roleConflictError());

    const { user, dialog } = await openManagerEditDialog();
    await replaceDescription(user, '後の編集');
    await user.click(screen.getByLabelText('ロールを更新'));

    const conflict = await within(dialog).findByTestId('role-conflict');
    expect(conflict).toHaveAttribute('role', 'alert');
    expect(conflict).toHaveTextContent('ロールを保存できませんでした');
    expect(conflict).toHaveTextContent('最新の内容を読み込んでから、もう一度保存してください');
    expect(
      within(conflict).getByRole('button', { name: '最新の内容を読み込む' })
    ).toBeInTheDocument();
    // ダイアログは開いたままで、入力は失われない
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('説明')).toHaveValue('後の編集');
    expect(screen.queryByText('ロールを更新しました')).not.toBeInTheDocument();
  });

  it('409 でも ROLE_NAME_CONFLICT は版の競合として表示しない', async () => {
    mockGet([[managerRole()]]);
    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiError(409, "Role with name 'admin' already exists", {
        error: "Role with name 'admin' already exists",
        code: 'ROLE_NAME_CONFLICT',
      })
    );

    const { user } = await openManagerEditDialog();
    await replaceDescription(user, '名前の重複');
    await user.click(screen.getByLabelText('ロールを更新'));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    // 要件17.2: 版の競合ではなく、ロール名の重複の理由を表示する（37.3）
    expect(
      await within(screen.getByRole('dialog')).findByText(
        'ロールの保存に失敗しました。同じ名前のロールが既に存在します'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('role-conflict')).not.toBeInTheDocument();
  });

  it('最新の内容を読み込むと、最新の内容と版で入力を置き換え、再度の保存で新しい版を送る', async () => {
    const latest = managerRole({ description: '先の編集', priority: 60, updatedAt: VERSION_2 });
    mockGet([[managerRole()], [latest]]);
    vi.mocked(apiClient.patch)
      .mockRejectedValueOnce(roleConflictError())
      .mockResolvedValueOnce(managerRole({ description: '再度の編集', updatedAt: VERSION_3 }));

    const { user, dialog } = await openManagerEditDialog();
    await replaceDescription(user, '後の編集');
    await user.click(screen.getByLabelText('ロールを更新'));

    const conflict = await within(dialog).findByTestId('role-conflict');
    await user.click(within(conflict).getByRole('button', { name: '最新の内容を読み込む' }));

    await waitFor(() => expect(screen.getByLabelText('説明')).toHaveValue('先の編集'));
    expect(screen.getByLabelText('優先順位 (0-100)')).toHaveValue(60);
    expect(screen.queryByTestId('role-conflict')).not.toBeInTheDocument();
    expect(within(dialog).getByText('最新の内容を読み込みました')).toBeInTheDocument();

    await replaceDescription(user, '再度の編集');
    await user.click(screen.getByLabelText('ロールを更新'));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(2));
    expect(patchBodies()[1]).toEqual({
      name: 'manager',
      description: '再度の編集',
      priority: 60,
      expectedUpdatedAt: VERSION_2,
    });
    expect(await screen.findByText('ロールを更新しました')).toBeInTheDocument();
  });

  it('最新の内容の読み込みに失敗したら、競合の表示を保ち失敗を伝える', async () => {
    mockGet([[managerRole()], new ApiError(500, 'Internal Server Error')]);
    vi.mocked(apiClient.patch).mockRejectedValue(roleConflictError());

    const { user, dialog } = await openManagerEditDialog();
    await replaceDescription(user, '後の編集');
    await user.click(screen.getByLabelText('ロールを更新'));

    const conflict = await within(dialog).findByTestId('role-conflict');
    await user.click(within(conflict).getByRole('button', { name: '最新の内容を読み込む' }));

    expect(
      await within(dialog).findByText('最新の内容の読み込みに失敗しました')
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('role-conflict')).toBeInTheDocument();
    expect(screen.getByLabelText('説明')).toHaveValue('後の編集');
  });

  it('再読み込みでロールが見つからなければ、その旨を伝える', async () => {
    mockGet([[managerRole()], []]);
    vi.mocked(apiClient.patch).mockRejectedValue(roleConflictError());

    const { user, dialog } = await openManagerEditDialog();
    await replaceDescription(user, '後の編集');
    await user.click(screen.getByLabelText('ロールを更新'));

    const conflict = await within(dialog).findByTestId('role-conflict');
    await user.click(within(conflict).getByRole('button', { name: '最新の内容を読み込む' }));

    expect(
      await within(dialog).findByText('ロールが見つかりませんでした。削除された可能性があります')
    ).toBeInTheDocument();
  });

  it('一覧に版が無いときは expectedUpdatedAt を送らない（従来どおりの更新）', async () => {
    mockGet([[managerRole({ updatedAt: undefined })]]);
    vi.mocked(apiClient.patch).mockResolvedValue(managerRole({ description: '版なし' }));

    const { user } = await openManagerEditDialog();
    await replaceDescription(user, '版なし');
    await user.click(screen.getByLabelText('ロールを更新'));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    expect(patchBodies()[0]).not.toHaveProperty('expectedUpdatedAt');
  });
});
