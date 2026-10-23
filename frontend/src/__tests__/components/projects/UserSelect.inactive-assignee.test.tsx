/**
 * @fileoverview 担当者選択の部品が、候補に無い（無効化された）現在の担当者の表示名を表示するテスト
 *
 * タスク49.7: 担当者候補は有効な利用者だけになる。現在の担当者が無効化されて候補に無いときも、
 * 案件の詳細から渡された表示名に「（無効）」を添えて表示する。
 *
 * Requirements (user-authentication):
 * - REQ-36.6: 無効化されたユーザーが担当者として設定された既存データの表示で、表示名を引き続き表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserSelect from '../../../components/projects/UserSelect';
import type { AssignableUser } from '../../../types/project.types';

vi.mock('../../../api/projects', () => ({
  getAssignableUsers: vi.fn(),
}));

vi.mock('../../../api/client', () => ({
  apiClient: {
    getAccessToken: vi.fn(() => 'mock-token'),
    setAccessToken: vi.fn(),
  },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'current-user-id', displayName: 'Current User', email: 'current@example.com' },
    isAuthenticated: true,
    isInitialized: true,
  })),
}));

import { getAssignableUsers } from '../../../api/projects';

/** 候補 API は有効な利用者だけを返す（無効化された inactive-user は含まれない） */
const activeCandidates: AssignableUser[] = [
  { id: 'user-1', displayName: '山田太郎' },
  { id: 'user-2', displayName: '鈴木花子' },
];

const inactiveAssignee = { id: 'inactive-user', displayName: '退職次郎' };

async function waitLoaded() {
  await waitFor(() => {
    expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
  });
}

describe('UserSelect — 無効化された現在の担当者の表示（36.6）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAssignableUsers).mockResolvedValue(activeCandidates);
  });

  it('現在の担当者が候補に無いとき、表示名に「（無効）」を添えて選択中として表示する', async () => {
    render(
      <UserSelect
        value={inactiveAssignee.id}
        onChange={vi.fn()}
        label="営業担当者"
        currentAssignee={inactiveAssignee}
      />
    );
    await waitLoaded();

    const select = screen.getByRole('combobox', { name: '営業担当者' }) as HTMLSelectElement;
    expect(select.value).toBe('inactive-user');
    expect(select.selectedOptions[0]?.textContent).toBe('退職次郎（無効）');
    // 有効な候補もそのまま並ぶ
    expect(screen.getByRole('option', { name: '山田太郎' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '鈴木花子' })).toBeInTheDocument();
  });

  it('別の担当者を選んだ後も、無効化された担当者へ戻せるよう選択肢に残る', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <UserSelect
        value={inactiveAssignee.id}
        onChange={onChange}
        label="営業担当者"
        currentAssignee={inactiveAssignee}
      />
    );
    await waitLoaded();

    await user.selectOptions(screen.getByRole('combobox', { name: '営業担当者' }), 'user-1');
    expect(onChange).toHaveBeenLastCalledWith('user-1');
    rerender(
      <UserSelect
        value="user-1"
        onChange={onChange}
        label="営業担当者"
        currentAssignee={inactiveAssignee}
      />
    );

    expect(screen.getByRole('option', { name: '退職次郎（無効）' })).toBeInTheDocument();
  });

  it('有効な候補が 0 件でも、無効化された現在の担当者の名前を表示する', async () => {
    vi.mocked(getAssignableUsers).mockResolvedValue([]);
    render(
      <UserSelect
        value={inactiveAssignee.id}
        onChange={vi.fn()}
        label="工事担当者"
        currentAssignee={inactiveAssignee}
      />
    );
    await waitLoaded();

    const select = screen.getByRole('combobox', { name: '工事担当者' }) as HTMLSelectElement;
    expect(select.value).toBe('inactive-user');
    expect(select.selectedOptions[0]?.textContent).toBe('退職次郎（無効）');
  });

  it('候補の取得に失敗したときは、現在の担当者を「（無効）」と表示せず、選択値も変えない', async () => {
    vi.mocked(getAssignableUsers).mockRejectedValue(new Error('network'));
    const onChange = vi.fn();
    render(
      <UserSelect
        value="user-2"
        onChange={onChange}
        label="営業担当者"
        currentAssignee={{ id: 'user-2', displayName: '鈴木花子' }}
      />
    );
    await waitLoaded();

    expect(screen.getByRole('alert')).toHaveTextContent('ユーザー一覧の取得に失敗しました');
    expect(screen.queryByText(/（無効）/)).not.toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: '営業担当者' }) as HTMLSelectElement;
    expect(select.value).toBe('user-2');
    expect(select.selectedOptions[0]?.textContent).toBe('鈴木花子');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('現在の担当者が候補にいるときは「（無効）」を付けず、選択肢を重複させない', async () => {
    render(
      <UserSelect
        value="user-2"
        onChange={vi.fn()}
        label="営業担当者"
        currentAssignee={{ id: 'user-2', displayName: '鈴木花子' }}
      />
    );
    await waitLoaded();

    const select = screen.getByRole('combobox', { name: '営業担当者' }) as HTMLSelectElement;
    expect(select.value).toBe('user-2');
    expect(screen.queryByText(/（無効）/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: '鈴木花子' })).toHaveLength(1);
  });
});
