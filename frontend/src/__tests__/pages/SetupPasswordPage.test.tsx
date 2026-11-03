/**
 * 初回のパスワード変更の画面のテスト（user-authentication タスク47.6）
 *
 * `/setup/password` は `/profile` のパスワード変更の区画だけを表示し、パスワード変更とログアウト以外の
 * API を呼ばない（初回の変更中の利用者は他の API が 403 になる）。変更の完了で全てのリフレッシュトークンが
 * 失効するため、ログアウトしてログイン画面へ戻す（design.md「AuthContext・ProtectedRoute（変更）」）。
 *
 * @requirement user-authentication/REQ-37.7
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SetupPasswordPage } from '../../pages/SetupPasswordPage';
import { AuthContext, type AuthContextValue, type User } from '../../contexts/AuthContext';

vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    setTokenRefreshCallback: vi.fn(),
  },
}));

import { apiClient } from '../../api/client';

const initialAdmin: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Initial Admin',
  roles: ['admin'],
  twoFactorEnabled: false,
  mustChangePassword: true,
};

function renderPage() {
  const logout = vi.fn().mockResolvedValue(undefined);
  const value: AuthContextValue = {
    isAuthenticated: true,
    user: initialAdmin,
    isLoading: false,
    isInitialized: true,
    sessionExpired: false,
    sessionExpiredDuringOperation: false,
    twoFactorState: null,
    login: vi.fn(),
    logout,
    refreshToken: vi.fn(),
    clearSessionExpired: vi.fn(),
    handleReauthSuccess: vi.fn(),
    navigateToLogin: vi.fn(),
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
    establishSession: vi.fn(),
    updateUser: vi.fn(),
  };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/setup/password']}>
        <Routes>
          <Route path="/setup/password" element={<SetupPasswordPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return { logout };
}

async function fillAndConfirm(currentPassword: string, newPassword: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('現在のパスワード'), currentPassword);
  await user.type(screen.getByLabelText('新しいパスワード'), newPassword);
  await user.type(screen.getByLabelText('パスワード確認'), newPassword);
  await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));
  await user.click(await screen.findByRole('button', { name: 'はい、変更する' }));
}

describe('SetupPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('初回のパスワード変更の見出しとパスワード変更の区画だけを表示する', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('初回のパスワード変更');
    expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument();
    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード確認')).toBeInTheDocument();
    // プロフィール画面の他の区画（プロフィール情報・セキュリティ設定・2FA の管理）は出さない
    expect(screen.queryByText('セキュリティ設定')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('表示名')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('表示の時点で API を呼ばない（パスワード変更以外は 403 になる）', () => {
    renderPage();

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('変更の完了でパスワード変更だけを呼び、再ログインの案内を残してログアウトする', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ message: 'Password changed successfully' });
    const { logout } = renderPage();

    await fillAndConfirm('InitialPass123!', 'BrandNewPass456!');

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/password/change', {
      currentPassword: 'InitialPass123!',
      newPassword: 'BrandNewPass456!',
      newPasswordConfirm: 'BrandNewPass456!',
    });
    // ログイン画面（ログアウトで ProtectedRoute が移す）が表示の時点で読む案内
    expect(sessionStorage.getItem('logoutMessage')).toBe(
      'パスワードを変更しました。新しいパスワードでログインしてください。'
    );
    // リフレッシュを試みずにログアウトする（サーバー側のリフレッシュトークンは失効している）
    expect(apiClient.setTokenRefreshCallback).toHaveBeenCalledWith(null);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('変更の失敗ではログアウトせず、理由を表示する', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({
      response: { error: 'Current password is incorrect' },
    });
    const { logout } = renderPage();

    await fillAndConfirm('WrongPass123!', 'BrandNewPass456!');

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
    expect(logout).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('logoutMessage')).toBeNull();
  });

  it('入力欄は 16px で表示する（モバイルのフォーカス時の自動拡大を抑える）', () => {
    renderPage();

    for (const label of ['現在のパスワード', '新しいパスワード', 'パスワード確認']) {
      expect(screen.getByLabelText(label)).toHaveStyle({ fontSize: '16px' });
    }
  });
});
