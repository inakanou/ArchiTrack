/**
 * @fileoverview 登録とリセットの画面が URL のフラグメントからトークンを読み、URL から取り除き、本文で検証するテスト
 *
 * タスク50.3: メールのリンクと招待 URL はトークンをフラグメント（`#token=`）に置く。画面はフラグメントから
 * トークンを読み（移行期間はクエリの `?token=` も読む）、読んだ直後に履歴を増やさずに URL から取り除き、
 * 検証の要求の本文で送る。React の StrictMode の二重の実行でもトークンを失わずに検証する。
 *
 * Requirements (user-authentication):
 * - REQ-37.3: 招待トークン・パスワードリセットトークンの検証の要求を記録するとき、アクセスログその他の記録にトークンの値を残さない
 */

import { StrictMode, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RegisterPage } from '../../pages/RegisterPage';
import { PasswordResetPage } from '../../pages/PasswordResetPage';
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContext';
import { readUrlToken } from '../../hooks/useUrlToken';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

import { apiClient } from '../../api/client';

const INVITATION_VERIFY_PATH = '/api/v1/invitations/verify';
const RESET_VERIFY_PATH = '/api/v1/auth/password/verify-reset';

const authValue = {
  isAuthenticated: false,
  user: null,
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
} satisfies AuthContextValue;

/**
 * ブラウザの URL を与えて、本物の履歴を使うルーターで画面を描画する（StrictMode の二重の実行を含む）
 */
function renderAt(url: string, element: ReactNode) {
  window.history.replaceState(null, '', url);
  const historyLength = window.history.length;
  const view = render(
    <StrictMode>
      <AuthContext.Provider value={authValue}>
        <BrowserRouter>
          <Routes>
            <Route path="/register" element={element} />
            <Route path="/password-reset" element={element} />
          </Routes>
        </BrowserRouter>
      </AuthContext.Provider>
    </StrictMode>
  );
  return { ...view, historyLength };
}

/** 検証の要求で送られた本文の全て（StrictMode で 2 回送られても全て同じトークンであること） */
function verifiedBodies(path: string): unknown[] {
  return vi
    .mocked(apiClient.post)
    .mock.calls.filter(([calledPath]) => calledPath === path)
    .map(([, body]) => body);
}

describe('登録とリセットの画面のトークンの受け取り（要件37.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === INVITATION_VERIFY_PATH) {
        return { email: 'invited@example.com' };
      }
      if (path === RESET_VERIFY_PATH) {
        return { valid: true };
      }
      return {};
    });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  describe('readUrlToken', () => {
    /**
     * @requirement user-authentication/REQ-37.3
     */
    it('フラグメントのトークンを読み、無ければ移行期間のクエリのトークンを読む', () => {
      expect(readUrlToken('', '#token=frag')).toBe('frag');
      expect(readUrlToken('?token=query', '')).toBe('query');
      expect(readUrlToken('?token=query', '#token=frag')).toBe('frag');
      expect(readUrlToken('?other=1', '#section')).toBeNull();
      expect(readUrlToken('', '')).toBeNull();
    });
  });

  describe('RegisterPage', () => {
    /**
     * @requirement user-authentication/REQ-37.3
     */
    it('フラグメントのトークンを読んだ直後に、履歴を増やさずに URL から取り除き、本文で検証する', async () => {
      const { historyLength } = renderAt('/register#token=fragment-invite-token', <RegisterPage />);

      await waitFor(() => {
        expect(verifiedBodies(INVITATION_VERIFY_PATH).length).toBeGreaterThan(0);
      });
      expect(verifiedBodies(INVITATION_VERIFY_PATH)).toEqual(
        verifiedBodies(INVITATION_VERIFY_PATH).map(() => ({ token: 'fragment-invite-token' }))
      );
      expect(window.location.pathname).toBe('/register');
      expect(window.location.hash).toBe('');
      expect(window.location.search).toBe('');
      expect(window.location.href).not.toContain('fragment-invite-token');
      expect(window.history.length).toBe(historyLength);
      expect(apiClient.get).not.toHaveBeenCalled();
      // URL から取り除いた後も、読んだトークンで登録の画面を表示し続ける
      expect(await screen.findByDisplayValue('invited@example.com')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /招待トークンが必要です/ })).toBeNull();
    });

    /**
     * @requirement user-authentication/REQ-37.3
     */
    it('移行期間のクエリのトークンも読み、他のパラメータを残してトークンだけを URL から取り除く', async () => {
      renderAt('/register?token=query-invite-token&from=mail', <RegisterPage />);

      await waitFor(() => {
        expect(verifiedBodies(INVITATION_VERIFY_PATH).length).toBeGreaterThan(0);
      });
      expect(verifiedBodies(INVITATION_VERIFY_PATH)[0]).toEqual({ token: 'query-invite-token' });
      expect(window.location.search).toBe('?from=mail');
      expect(window.location.href).not.toContain('query-invite-token');
    });
  });

  describe('PasswordResetPage', () => {
    /**
     * @requirement user-authentication/REQ-37.3
     */
    it('フラグメントのトークンを読んだ直後に URL から取り除き、検証とリセットを本文で送る', async () => {
      const user = userEvent.setup();
      const { historyLength } = renderAt(
        '/password-reset#token=fragment-reset-token',
        <PasswordResetPage />
      );

      await waitFor(() => {
        expect(verifiedBodies(RESET_VERIFY_PATH).length).toBeGreaterThan(0);
      });
      expect(verifiedBodies(RESET_VERIFY_PATH)).toEqual(
        verifiedBodies(RESET_VERIFY_PATH).map(() => ({ token: 'fragment-reset-token' }))
      );
      expect(window.location.pathname).toBe('/password-reset');
      expect(window.location.hash).toBe('');
      expect(window.location.href).not.toContain('fragment-reset-token');
      expect(window.history.length).toBe(historyLength);
      expect(apiClient.get).not.toHaveBeenCalled();

      // URL から取り除いた後も、読んだトークンでリセットを送る
      const password = 'Fragment-Reset-Pass-2026!';
      await user.type(await screen.findByLabelText('新しいパスワード'), password);
      await user.type(screen.getByLabelText('パスワード (確認)'), password);
      await user.click(screen.getByRole('button', { name: 'パスワードをリセット' }));
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/password/reset', {
          token: 'fragment-reset-token',
          newPassword: password,
        });
      });
    });

    /**
     * @requirement user-authentication/REQ-37.3
     */
    it('画面を開いたまま同じタブでリンクを開いた（フラグメントだけが変わった）ときも、読んで取り除き本文で検証する', async () => {
      renderAt('/password-reset', <PasswordResetPage />);
      expect(
        await screen.findByRole('heading', { name: 'パスワードリセット要求' })
      ).toBeInTheDocument();
      expect(verifiedBodies(RESET_VERIFY_PATH)).toHaveLength(0);

      window.location.hash = '#token=same-tab-reset-token';

      await waitFor(() => {
        expect(verifiedBodies(RESET_VERIFY_PATH)).toContainEqual({ token: 'same-tab-reset-token' });
      });
      await waitFor(() => {
        expect(window.location.hash).toBe('');
      });
      expect(window.location.href).not.toContain('same-tab-reset-token');
      expect(
        await screen.findByRole('heading', { name: /^パスワードリセット$/ })
      ).toBeInTheDocument();
    });

    /**
     * @requirement user-authentication/REQ-37.3
     */
    it('移行期間のクエリのトークンも読み、URL から取り除いて本文で検証する', async () => {
      renderAt('/password-reset?token=query-reset-token', <PasswordResetPage />);

      await waitFor(() => {
        expect(verifiedBodies(RESET_VERIFY_PATH).length).toBeGreaterThan(0);
      });
      expect(verifiedBodies(RESET_VERIFY_PATH)[0]).toEqual({ token: 'query-reset-token' });
      expect(window.location.search).toBe('');
      expect(window.location.href).not.toContain('query-reset-token');
    });
  });
});
