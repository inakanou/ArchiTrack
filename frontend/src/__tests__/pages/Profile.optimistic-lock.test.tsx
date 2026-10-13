/**
 * プロフィール画面の楽観的ロックのテスト
 *
 * @requirement user-authentication/REQ-25.8
 *
 * 画面を開いたときに GET /api/v1/auth/me の updatedAt（版）を取得し、保存時に
 * expectedUpdatedAt として送る。409 PROFILE_CONFLICT を受けたら競合を表示し、
 * 最新の内容の再取得を促す。保存に成功したら応答の新しい版を採用する。
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Profile } from '../../pages/Profile';
import { ApiError } from '../../api/client';
import type { UserProfile } from '../../types/auth.types';

const mockGetCurrentUser = vi.fn();
const mockUpdateProfile = vi.fn();

vi.mock('../../api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/auth')>();
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  };
});

const mockUseAuth = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const VERSION_1 = '2026-09-27T01:00:00.000Z';
const VERSION_2 = '2026-09-27T02:00:00.000Z';
const VERSION_3 = '2026-09-27T03:00:00.000Z';

function profile(displayName: string, updatedAt: string): UserProfile {
  return {
    id: 'user-123',
    email: 'test@example.com',
    displayName,
    roles: ['user'],
    emailVerified: true,
    twoFactorEnabled: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt,
  };
}

function conflictError(): ApiError {
  return new ApiError(409, '他の操作によって更新されました。画面を更新してください', {
    type: 'https://architrack.example.com/problems/conflict',
    title: 'PROFILE_CONFLICT',
    status: 409,
    code: 'PROFILE_CONFLICT',
    details: { expectedUpdatedAt: VERSION_1, actualUpdatedAt: VERSION_2 },
  });
}

async function editDisplayName(value: string) {
  const user = userEvent.setup();
  const field = screen.getByLabelText(/表示名/i);
  await user.clear(field);
  await user.type(field, value);
  return user;
}

describe('Profile - 楽観的ロック（要件25.8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: profile('Test User', '2026-09-27T00:00:00.000Z'),
      logout: vi.fn(),
    });
    mockGetCurrentUser.mockResolvedValue(profile('Test User', VERSION_1));
  });

  it('画面を開いたときに取得した版を expectedUpdatedAt として送る', async () => {
    mockUpdateProfile.mockResolvedValue(profile('Updated Name', VERSION_2));
    render(<Profile />);

    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalledTimes(1));
    const user = await editDisplayName('Updated Name');
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        displayName: 'Updated Name',
        expectedUpdatedAt: VERSION_1,
      });
    });
    expect(await screen.findByText('プロフィールを更新しました')).toBeInTheDocument();
  });

  it('版の取得が終わるまでは保存できない', async () => {
    let resolveProfile: (value: UserProfile) => void = () => {};
    mockGetCurrentUser.mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveProfile = resolve;
      })
    );
    render(<Profile />);

    await editDisplayName('Updated Name');
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    expect(saveButton).toBeDisabled();

    resolveProfile(profile('Test User', VERSION_1));
    await waitFor(() => expect(saveButton).toBeEnabled());
    // 編集中の入力は取得した内容で上書きしない
    expect(screen.getByLabelText(/表示名/i)).toHaveValue('Updated Name');
  });

  it('保存に成功したら応答の新しい版を採用し、続けて保存しても新しい版を送る', async () => {
    mockUpdateProfile
      .mockResolvedValueOnce(profile('First Name', VERSION_2))
      .mockResolvedValueOnce(profile('Second Name', VERSION_3));
    render(<Profile />);
    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalledTimes(1));

    const user = await editDisplayName('First Name');
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);
    expect(await screen.findByText('プロフィールを更新しました')).toBeInTheDocument();
    // 保存した値が基準になり、未変更の保存ボタンは無効に戻る
    await waitFor(() => expect(saveButton).toBeDisabled());

    await editDisplayName('Second Name');
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(2));
    expect(mockUpdateProfile).toHaveBeenNthCalledWith(1, {
      displayName: 'First Name',
      expectedUpdatedAt: VERSION_1,
    });
    expect(mockUpdateProfile).toHaveBeenNthCalledWith(2, {
      displayName: 'Second Name',
      expectedUpdatedAt: VERSION_2,
    });
    expect(screen.queryByTestId('profile-conflict')).not.toBeInTheDocument();
  });

  it('409 PROFILE_CONFLICT を受けたら競合を表示し、最新の内容の再読み込みを促す', async () => {
    mockUpdateProfile.mockRejectedValueOnce(conflictError());
    render(<Profile />);
    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalledTimes(1));

    const user = await editDisplayName('My Name');
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    const conflict = await screen.findByTestId('profile-conflict');
    expect(conflict).toHaveAttribute('role', 'alert');
    expect(conflict).toHaveTextContent('プロフィールを保存できませんでした');
    expect(conflict).toHaveTextContent('最新の内容を読み込んでから、もう一度保存してください');
    expect(screen.getByRole('button', { name: '最新の内容を読み込む' })).toBeInTheDocument();
    // 汎用の失敗表示ではなく競合として扱う
    expect(screen.queryByText('プロフィールの更新に失敗しました')).not.toBeInTheDocument();
    expect(screen.queryByText('プロフィールを更新しました')).not.toBeInTheDocument();
  });

  it('再読み込みで最新の表示名と版を採用し、次の保存はその版を送る', async () => {
    mockUpdateProfile
      .mockRejectedValueOnce(conflictError())
      .mockResolvedValueOnce(profile('My Name', VERSION_3));
    render(<Profile />);
    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalledTimes(1));

    const user = await editDisplayName('My Name');
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);
    await screen.findByTestId('profile-conflict');

    mockGetCurrentUser.mockResolvedValueOnce(profile('Other Name', VERSION_2));
    await user.click(screen.getByRole('button', { name: '最新の内容を読み込む' }));

    await waitFor(() => expect(screen.getByLabelText(/表示名/i)).toHaveValue('Other Name'));
    expect(screen.queryByTestId('profile-conflict')).not.toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    await editDisplayName('My Name');
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(2));
    expect(mockUpdateProfile).toHaveBeenLastCalledWith({
      displayName: 'My Name',
      expectedUpdatedAt: VERSION_2,
    });
    expect(await screen.findByText('プロフィールを更新しました')).toBeInTheDocument();
  });

  it('PROFILE_CONFLICT 以外の失敗は従来どおり失敗のメッセージを表示する', async () => {
    mockUpdateProfile.mockRejectedValueOnce(
      new ApiError(409, 'Conflict', { status: 409, code: 'CONFLICT' })
    );
    render(<Profile />);
    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalledTimes(1));

    const user = await editDisplayName('My Name');
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(await screen.findByText('プロフィールの更新に失敗しました')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-conflict')).not.toBeInTheDocument();
  });

  it('版を取得できなかったときは版なしで保存する（従来の振る舞い）', async () => {
    mockGetCurrentUser.mockRejectedValueOnce(new ApiError(500, 'Server error'));
    mockUpdateProfile.mockResolvedValue(profile('Updated Name', VERSION_2));
    render(<Profile />);
    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalledTimes(1));

    const user = await editDisplayName('Updated Name');
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Updated Name' });
    });
  });
});
