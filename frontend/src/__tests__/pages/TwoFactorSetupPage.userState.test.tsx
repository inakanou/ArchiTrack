/**
 * 2FA 設定の画面の、設定の完了による制限の解除と遷移のテスト（user-authentication タスク47.6）
 *
 * - 有効化の応答の利用者（2FA 登録済み）で AuthContext の利用者を更新し、遷移の制限を解く
 * - 設定の完了後、ProtectedRoute が保存した遷移先へ戻す。無ければ 2FA 未登録だった利用者は
 *   ダッシュボード（ログイン後の通常の遷移先）、登録済みの利用者（認証アプリの変更）はプロフィールへ（要件34.4・28.32）
 * - 招待経由の登録の直後の案内（sessionStorage）を一度だけ表示する（要件34.5・12.9）
 *
 * @requirement user-authentication/REQ-34.4
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { TwoFactorSetupPage } from '../../pages/TwoFactorSetupPage';
import { AuthContext, AuthContextValue, type User } from '../../contexts/AuthContext';

vi.mock('../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

import { apiClient } from '../../api/client';

// 設定の部品が受け取った設定の開始・有効化の関数（描画ごとに記録する）
const renderedHandlers: Array<{ onSetupStart: unknown; onEnable: unknown }> = [];

// 設定の手順は画面の外の部品が持つ。ここでは有効化と完了の呼び出しだけを再現する
vi.mock('../../components/TwoFactorSetupForm', () => ({
  default: ({
    onSetupStart,
    onEnable,
    onComplete,
  }: {
    onSetupStart: () => Promise<unknown>;
    onEnable: (code: string) => Promise<unknown>;
    onComplete: () => void;
  }) => {
    renderedHandlers.push({ onSetupStart, onEnable });
    return (
      <div>
        <button onClick={() => void onEnable('123456')}>有効化</button>
        <button onClick={() => onComplete()}>完了</button>
      </div>
    );
  },
}));

// 2FA 登録済みの利用者には認証アプリの変更の手順を表示する（タスク47.9）。ここでは完了の呼び出しだけを再現する
vi.mock('../../components/TwoFactorReenrollForm', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div>
      <button onClick={() => onComplete()}>完了</button>
    </div>
  ),
}));

const notEnrolledUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  roles: ['user'],
  twoFactorEnabled: false,
  mustChangePassword: false,
};

function createAuthValue(user: User, updateUser: AuthContextValue['updateUser']): AuthContextValue {
  return {
    isAuthenticated: true,
    user,
    isLoading: false,
    isInitialized: true,
    sessionExpired: false,
    sessionExpiredDuringOperation: false,
    twoFactorState: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    clearSessionExpired: vi.fn(),
    handleReauthSuccess: vi.fn(),
    navigateToLogin: vi.fn(),
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
    establishSession: vi.fn(),
    updateUser,
  };
}

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderPage(user: User, state?: unknown) {
  const updateUser = vi.fn();
  const tree = (value: AuthContextValue) => (
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[{ pathname: '/profile/2fa-setup', state }]}>
        <Routes>
          <Route path="/profile/2fa-setup" element={<TwoFactorSetupPage />} />
          <Route path="*" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  const { rerender } = render(tree(createAuthValue(user, updateUser)));
  return {
    updateUser,
    rerenderWithUser: (next: User) => rerender(tree(createAuthValue(next, updateUser))),
  };
}

describe('TwoFactorSetupPage（設定の完了による制限の解除）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('有効化の応答の利用者で AuthContext の利用者を更新する', async () => {
    const enabledUser = { ...notEnrolledUser, twoFactorEnabled: true };
    vi.mocked(apiClient.post).mockResolvedValue({ backupCodes: ['A'], user: enabledUser });
    const { updateUser } = renderPage(notEnrolledUser);

    await userEvent.click(screen.getByRole('button', { name: '有効化' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(enabledUser));
  });

  /**
   * 設定の部品は関数の参照が変わると設定をやり直す。有効化で利用者が更新されて画面が再描画されても、
   * 設定をやり直さない（やり直すと登録済みの利用者の設定の開始が拒否され、エラーが出る）
   */
  it('利用者の状態の更新で再描画されても、設定の部品へ同じ設定の開始・有効化の関数を渡す', () => {
    renderedHandlers.length = 0;
    const { rerenderWithUser } = renderPage(notEnrolledUser);

    rerenderWithUser({ ...notEnrolledUser, twoFactorEnabled: true });

    expect(renderedHandlers.length).toBeGreaterThan(1);
    expect(new Set(renderedHandlers.map((h) => h.onSetupStart)).size).toBe(1);
    expect(new Set(renderedHandlers.map((h) => h.onEnable)).size).toBe(1);
  });

  it('有効化の応答に利用者が無いときも 2FA 登録済みとして更新する', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ backupCodes: ['A'] });
    const { updateUser } = renderPage(notEnrolledUser);

    await userEvent.click(screen.getByRole('button', { name: '有効化' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ twoFactorEnabled: true }));
  });

  it('有効化の失敗では利用者を更新しない', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('invalid code'));
    const { updateUser } = renderPage(notEnrolledUser);

    await userEvent.click(screen.getByRole('button', { name: '有効化' }));

    await screen.findByRole('alert');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('設定の完了後、保存された遷移先へ戻す（要件34.4）', async () => {
    renderPage(notEnrolledUser, { from: '/projects/abc' });

    await userEvent.click(screen.getByRole('button', { name: '完了' }));

    expect(await screen.findByTestId('current-path', {}, { timeout: 3000 })).toHaveTextContent(
      '/projects/abc'
    );
  });

  it('保存された遷移先が無ければ、2FA 未登録だった利用者はダッシュボードへ進む（要件34.4）', async () => {
    renderPage(notEnrolledUser);

    await userEvent.click(screen.getByRole('button', { name: '完了' }));

    expect(await screen.findByTestId('current-path', {}, { timeout: 3000 })).toHaveTextContent(
      '/dashboard'
    );
  });

  it('2FA 登録済みの利用者（認証アプリの変更）はプロフィールへ戻る（要件28.32）', async () => {
    renderPage({ ...notEnrolledUser, twoFactorEnabled: true });

    await userEvent.click(screen.getByRole('button', { name: '完了' }));

    expect(await screen.findByTestId('current-path', {}, { timeout: 3000 })).toHaveTextContent(
      '/profile'
    );
  });

  it('外部の URL や制限の画面は遷移先として使わない', async () => {
    renderPage(notEnrolledUser, { from: '//evil.example.com/' });

    await userEvent.click(screen.getByRole('button', { name: '完了' }));

    expect(await screen.findByTestId('current-path', {}, { timeout: 3000 })).toHaveTextContent(
      '/dashboard'
    );
  });

  it('招待経由の登録の直後の案内を一度だけ表示する', () => {
    sessionStorage.setItem('twoFactorSetupNotice', 'ユーザー登録が完了しました。');
    renderPage(notEnrolledUser);

    expect(screen.getByRole('status')).toHaveTextContent('ユーザー登録が完了しました。');
    // 表示の時点で消す（再読み込みや次の表示で繰り返さない）
    expect(sessionStorage.getItem('twoFactorSetupNotice')).toBeNull();
  });

  it('案内が無ければ表示しない', () => {
    renderPage(notEnrolledUser);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
