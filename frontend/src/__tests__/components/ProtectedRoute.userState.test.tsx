/**
 * ProtectedRoute の利用者の状態による遷移の制限のテスト（user-authentication タスク47.6）
 *
 * design.md「AuthContext・ProtectedRoute（変更）」:
 * - `user.mustChangePassword` が真なら `/setup/password` だけを許し、他の経路は同画面へ置き換える（37.7）
 * - `user.twoFactorEnabled` が偽なら `/profile/2fa-setup` だけを許す（34.1・34.3・34.5・34.8）
 * - 置き換えるときは元の遷移先を保存し、設定の完了後に戻せるようにする（34.4）
 *
 * @requirement user-authentication/REQ-34.3
 * @requirement user-authentication/REQ-37.7
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AuthContext, AuthContextValue, type User } from '../../contexts/AuthContext';

function createAuthValue(user: User | null): AuthContextValue {
  return {
    isAuthenticated: user !== null,
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
    updateUser: vi.fn(),
  };
}

const baseUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  roles: ['admin', 'user'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};

/** 表示中の画面の名前と、保存された遷移先（location.state.from）・案内（location.state.message） */
function Screen({ name }: { name: string }) {
  const location = useLocation();
  const state = location.state as { from?: string; message?: string } | null;
  return (
    <div
      data-testid="screen"
      data-from={state?.from ?? ''}
      data-message={state?.message ?? ''}
      data-search={location.search}
    >
      {name}
    </div>
  );
}

function renderAt(path: string, user: User | null, state?: unknown) {
  return render(
    <AuthContext.Provider value={createAuthValue(user)}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: path.split('?')[0],
            search: path.includes('?') ? `?${path.split('?')[1]}` : '',
            state,
          },
        ]}
      >
        <Routes>
          <Route path="/login" element={<Screen name="login" />} />
          {['/dashboard', '/projects', '/profile', '/profile/2fa-setup', '/setup/password'].map(
            (routePath) => (
              <Route
                key={routePath}
                path={routePath}
                element={
                  <ProtectedRoute>
                    <Screen name={routePath} />
                  </ProtectedRoute>
                }
              />
            )
          )}
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiredRole="admin">
                <Screen name="/admin/users" />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('ProtectedRoute（利用者の状態による遷移の制限）', () => {
  it('未ログインで初回のパスワード変更の画面を開くと、遷移先を保存せずにログイン画面へ移す', () => {
    renderAt('/setup/password', null);

    expect(screen.getByTestId('screen')).toHaveTextContent('login');
    expect(screen.getByTestId('screen')).toHaveAttribute('data-from', '');
    expect(screen.getByTestId('screen')).toHaveAttribute('data-search', '');
  });

  describe('初回のパスワード変更を要する利用者（要件37.7）', () => {
    const user: User = { ...baseUser, twoFactorEnabled: false, mustChangePassword: true };

    it.each(['/dashboard', '/projects', '/profile', '/profile/2fa-setup', '/admin/users'])(
      '%s を /setup/password へ置き換える',
      (path) => {
        renderAt(path, user);

        expect(screen.getByTestId('screen')).toHaveTextContent('/setup/password');
      }
    );

    it('/setup/password はそのまま表示する', () => {
      renderAt('/setup/password', user);

      expect(screen.getByTestId('screen')).toHaveTextContent('/setup/password');
    });
  });

  describe('2FA 未登録の利用者（要件34.3）', () => {
    const user: User = { ...baseUser, twoFactorEnabled: false };

    it.each(['/dashboard', '/projects', '/profile', '/setup/password', '/admin/users'])(
      '%s を 2FA 設定の画面へ置き換える',
      (path) => {
        renderAt(path, user);

        expect(screen.getByTestId('screen')).toHaveTextContent('/profile/2fa-setup');
      }
    );

    it('置き換えた元の遷移先を保存する（設定の完了後に戻す。要件34.4）', () => {
      renderAt('/projects?page=2', user);

      expect(screen.getByTestId('screen')).toHaveAttribute('data-from', '/projects?page=2');
    });

    it('制限の画面そのものは遷移先として保存しない', () => {
      renderAt('/setup/password', user);

      expect(screen.getByTestId('screen')).toHaveAttribute('data-from', '');
    });

    it('2FA 設定の画面はそのまま表示する', () => {
      renderAt('/profile/2fa-setup', user);

      expect(screen.getByTestId('screen')).toHaveTextContent('/profile/2fa-setup');
    });
  });

  describe('制限の無い利用者', () => {
    it('通常の画面をそのまま表示する', () => {
      renderAt('/projects', baseUser);

      expect(screen.getByTestId('screen')).toHaveTextContent('/projects');
    });

    it('2FA 設定の画面も開ける（認証アプリの変更の導線）', () => {
      renderAt('/profile/2fa-setup', baseUser);

      expect(screen.getByTestId('screen')).toHaveTextContent('/profile/2fa-setup');
    });

    it('初回のパスワード変更の画面はプロフィール画面へ置き換える', () => {
      renderAt('/setup/password', baseUser);

      expect(screen.getByTestId('screen')).toHaveTextContent('/profile');
      expect(screen.getByTestId('screen')).not.toHaveTextContent('/setup/password');
    });

    it('状態の項目を持たない利用者は制限しない', () => {
      renderAt('/projects', { id: 'u', email: 'u@example.com', displayName: 'U' });

      expect(screen.getByTestId('screen')).toHaveTextContent('/projects');
    });
  });
});
