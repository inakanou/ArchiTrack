/**
 * 発行済みのアクセストークンが失効した後のログアウトでも、ログイン画面へ移ること（user-authentication タスク76.1）
 *
 * パスワードの変更と全デバイスのログアウトは、利用者のアクセストークンの世代を進め、画面が持つ
 * アクセストークンも直ちに 401 になる（design.md の「アクセストークンの即失効」。2026-11-24 の利用者の判断）。
 * 画面は変更・全デバイスのログアウトの後に `logout()` を呼ぶので、ログアウトの API は 401 になる。
 * 明示のログアウトは操作中のセッション切れ（再認証のモーダル）として扱わず、従来どおりログイン画面へ移る。
 *
 * 実物の AuthProvider・ApiClient・TokenRefreshManager・ProtectedRoute を使い、通信（fetch）だけを差し替える。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useContext } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, AuthContext, type AuthContextValue } from '../../contexts/AuthContext';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { apiClient } from '../../api/client';

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

const CSRF_TOKEN = 'csrf-token-from-body';
const RESTORED_ACCESS_TOKEN = 'restored-access-token';
const RESTORED_USER = {
  id: 'user-1',
  email: 'restored@example.com',
  displayName: 'Restored User',
  roles: ['user'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};
const INVALID_TOKEN_BODY = { error: 'INVALID_TOKEN', message: 'Invalid or expired token' };

interface RecordedRequest {
  path: string;
  method: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * 初期化のリフレッシュは成功し、それ以降のリフレッシュ（失効したリフレッシュトークン）と
 * 失効したアクセストークンのログアウトは 401 を返す通信に差し替える
 */
function installRevokedSessionFetch(): RecordedRequest[] {
  const recorded: RecordedRequest[] = [];
  let refreshCount = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const request = { path: url.pathname, method: init?.method ?? 'GET' };
    recorded.push(request);
    const key = `${request.method} ${request.path}`;
    if (key === 'GET /csrf-token') {
      return jsonResponse(200, { csrfToken: CSRF_TOKEN });
    }
    if (key === 'POST /api/v1/auth/refresh') {
      refreshCount += 1;
      return refreshCount === 1
        ? jsonResponse(200, { accessToken: RESTORED_ACCESS_TOKEN, user: RESTORED_USER })
        : jsonResponse(401, { error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }
    if (key === 'GET /api/v1/auth/me') {
      return jsonResponse(200, RESTORED_USER);
    }
    if (key === 'POST /api/v1/auth/logout') {
      return jsonResponse(401, INVALID_TOKEN_BODY);
    }
    return jsonResponse(404, { error: `unexpected ${key}` });
  }) as typeof globalThis.fetch;
  return recorded;
}

let latestContext: AuthContextValue | undefined;

function Probe() {
  const context = useContext(AuthContext);
  latestContext = context;
  if (!context) {
    return null;
  }
  return (
    <div>
      <div data-testid="user">{context.user ? context.user.email : 'no-user'}</div>
      <div data-testid="reauth">
        {context.sessionExpiredDuringOperation ? 'reauth-required' : 'no-reauth'}
      </div>
    </div>
  );
}

function renderProtectedPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <AuthProvider>
        <Probe />
        <Routes>
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <div data-testid="protected-page">profile</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthContext - 失効したアクセストークンでのログアウト（タスク76.1）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    sessionStorage.clear();
    apiClient.setAccessToken(null);
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    latestContext = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sessionStorage.clear();
    apiClient.setAccessToken(null);
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    vi.restoreAllMocks();
  });

  it('パスワードの変更の後（リフレッシュを外してログアウト）は、ログアウトの 401 でも再認証を求めずログイン画面へ移る', async () => {
    const recorded = installRevokedSessionFetch();
    renderProtectedPage();
    await waitFor(() => expect(screen.getByTestId('protected-page')).toBeInTheDocument());

    // パスワードの変更の画面と同じ手順（Profile・SetupPasswordPage の handlePasswordChanged）
    await act(async () => {
      apiClient.setTokenRefreshCallback(null);
      await latestContext!.logout();
    });

    expect(recorded.some((r) => r.method === 'POST' && r.path === '/api/v1/auth/logout')).toBe(
      true
    );
    await waitFor(() => expect(screen.getByTestId('login-page')).toBeInTheDocument());
    expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('reauth')).toHaveTextContent('no-reauth');
    expect(apiClient.getAccessToken()).toBeNull();
  });

  it('全デバイスのログアウトの後は、ログアウトの 401 とリフレッシュの 401 でも再認証を求めずログイン画面へ移る', async () => {
    const recorded = installRevokedSessionFetch();
    renderProtectedPage();
    await waitFor(() => expect(screen.getByTestId('protected-page')).toBeInTheDocument());

    // セッション管理の画面と同じ手順（全デバイスのログアウトの成功の後に logout を呼ぶ）
    await act(async () => {
      await latestContext!.logout();
    });

    // ログアウトの 401 でリフレッシュを試み、失効したリフレッシュトークンで 401 になる
    expect(
      recorded.filter((r) => r.method === 'POST' && r.path === '/api/v1/auth/refresh')
    ).toHaveLength(2);
    await waitFor(() => expect(screen.getByTestId('login-page')).toBeInTheDocument());
    expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('reauth')).toHaveTextContent('no-reauth');
  });
});
