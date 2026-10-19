/**
 * AuthContext と ApiClient の Cookie によるセッションの取り扱い
 *
 * 実物の ApiClient と TokenRefreshManager を使い、通信（fetch）だけを差し替えて確かめる。
 *
 * - アクセストークン・リフレッシュトークンをブラウザの永続ストレージ（localStorage・sessionStorage）へ書かない
 * - 再読み込みの初期化は CSRF トークンの取得 → Cookie によるリフレッシュの順で行い、利用者を復元する
 * - リフレッシュとログアウトは本文を送らず、Cookie（credentials: 'include'）と X-CSRF-Token で送る
 *
 * user-authentication 要件33.8・33.10・33.11・33.12 に対応する
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useContext } from 'react';
import { AuthProvider, AuthContext, type AuthContextValue } from '../../contexts/AuthContext';
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
const LOGIN_ACCESS_TOKEN = 'login-access-token';
const LOGIN_REFRESH_TOKEN = 'login-refresh-token-in-body';
const RESTORED_USER = {
  id: 'user-1',
  email: 'restored@example.com',
  displayName: 'Restored User',
  roles: ['user'],
};

interface RecordedRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

type RouteHandler = (request: RecordedRequest) => { status: number; body: unknown };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * fetch をパスごとの応答で差し替え、送った要求を記録する
 */
function installFetch(routes: Record<string, RouteHandler>): RecordedRequest[] {
  const recorded: RecordedRequest[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const request: RecordedRequest = {
      path: url.pathname,
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      body: init?.body,
      credentials: init?.credentials,
    };
    recorded.push(request);
    const handler = routes[`${request.method} ${request.path}`];
    if (!handler) {
      return jsonResponse(404, { error: `unexpected ${request.method} ${request.path}` });
    }
    const { status, body } = handler(request);
    return jsonResponse(status, body);
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
      <div data-testid="initialized">{context.isInitialized ? 'yes' : 'no'}</div>
      <div data-testid="user">{context.user ? context.user.email : 'no-user'}</div>
      <div data-testid="session-expired">{context.sessionExpired ? 'expired' : 'not-expired'}</div>
    </div>
  );
}

/** ストレージに書かれた全ての値（キーと値） */
function storedEntries(storage: Storage): string[] {
  const entries: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      entries.push(`${key}=${storage.getItem(key) ?? ''}`);
    }
  }
  return entries;
}

describe('AuthContext - Cookie によるセッション（要件33.8, 33.10, 33.11）', () => {
  let originalFetch: typeof globalThis.fetch;
  let localSetItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
    apiClient.setAccessToken(null);
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    latestContext = undefined;
    localSetItem = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    sessionStorage.clear();
    apiClient.setAccessToken(null);
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    vi.restoreAllMocks();
  });

  it('再読み込みの初期化で、CSRF トークンの取得 → Cookie によるリフレッシュの順に送り、利用者を復元する', async () => {
    const recorded = installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: CSRF_TOKEN } }),
      'POST /api/v1/auth/refresh': () => ({
        status: 200,
        body: { accessToken: RESTORED_ACCESS_TOKEN, user: RESTORED_USER },
      }),
      'GET /api/v1/auth/me': () => ({
        status: 200,
        body: { ...RESTORED_USER, permissions: ['project:read'] },
      }),
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));
    expect(screen.getByTestId('user')).toHaveTextContent(RESTORED_USER.email);
    expect(screen.getByTestId('session-expired')).toHaveTextContent('not-expired');

    const paths = recorded.map((r) => `${r.method} ${r.path}`);
    const csrfIndex = paths.indexOf('GET /csrf-token');
    const refreshIndex = paths.indexOf('POST /api/v1/auth/refresh');
    expect(csrfIndex).toBeGreaterThanOrEqual(0);
    expect(refreshIndex).toBeGreaterThan(csrfIndex);

    const refresh = recorded[refreshIndex]!;
    // 本文を送らない（リフレッシュトークンは HttpOnly Cookie だけにある）
    expect(refresh.body).toBeUndefined();
    expect(refresh.credentials).toBe('include');
    expect(refresh.headers['X-CSRF-Token']).toBe(CSRF_TOKEN);
    expect(refresh.headers['Authorization']).toBeUndefined();

    // 復元したアクセストークンはメモリだけにある
    expect(apiClient.getAccessToken()).toBe(RESTORED_ACCESS_TOKEN);
    expect(storedEntries(localStorage)).toEqual([]);
    expect(storedEntries(sessionStorage)).toEqual([]);
    expect(localSetItem).not.toHaveBeenCalled();
  });

  it('ログインの応答のトークンを永続ストレージへ書かず、アクセストークンをメモリだけに持つ', async () => {
    installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: CSRF_TOKEN } }),
      // 初期化の時点では Cookie が無い
      'POST /api/v1/auth/refresh': () => ({
        status: 400,
        body: { error: 'Refresh token is required', code: 'VALIDATION_ERROR' },
      }),
      'POST /api/v1/auth/login': () => ({
        status: 200,
        body: {
          accessToken: LOGIN_ACCESS_TOKEN,
          refreshToken: LOGIN_REFRESH_TOKEN,
          user: RESTORED_USER,
          expiresIn: 15 * 60 * 1000,
        },
      }),
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));

    await act(async () => {
      await latestContext!.login(RESTORED_USER.email, 'Password123!');
    });

    expect(screen.getByTestId('user')).toHaveTextContent(RESTORED_USER.email);
    expect(apiClient.getAccessToken()).toBe(LOGIN_ACCESS_TOKEN);

    const everything = [...storedEntries(localStorage), ...storedEntries(sessionStorage)].join(
      '\n'
    );
    expect(everything).not.toContain(LOGIN_ACCESS_TOKEN);
    expect(everything).not.toContain(LOGIN_REFRESH_TOKEN);
    expect(localSetItem).not.toHaveBeenCalled();
  });

  it('Cookie が無い（400）初期化は未認証で、セッション切れとして扱わない', async () => {
    installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: CSRF_TOKEN } }),
      'POST /api/v1/auth/refresh': () => ({
        status: 400,
        body: { error: 'Refresh token is required', code: 'VALIDATION_ERROR' },
      }),
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('session-expired')).toHaveTextContent('not-expired');
  });

  it('Cookie が拒否された（401）初期化は未認証で、セッション切れとして扱う', async () => {
    installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: CSRF_TOKEN } }),
      'POST /api/v1/auth/refresh': () => ({
        status: 401,
        body: { error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' },
      }),
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('initialized')).toHaveTextContent('yes'));
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('session-expired')).toHaveTextContent('expired');
  });

  it('ログアウトは本文を送らず、Cookie と X-CSRF-Token で送り、メモリのアクセストークンを消す', async () => {
    const recorded = installFetch({
      'GET /csrf-token': () => ({ status: 200, body: { csrfToken: CSRF_TOKEN } }),
      'POST /api/v1/auth/refresh': () => ({
        status: 200,
        body: { accessToken: RESTORED_ACCESS_TOKEN, user: RESTORED_USER },
      }),
      'GET /api/v1/auth/me': () => ({ status: 200, body: RESTORED_USER }),
      'POST /api/v1/auth/logout': () => ({
        status: 200,
        body: { message: 'Logged out successfully' },
      }),
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(RESTORED_USER.email));

    await act(async () => {
      await latestContext!.logout();
    });

    const logout = recorded.find((r) => r.method === 'POST' && r.path === '/api/v1/auth/logout');
    expect(logout).toBeDefined();
    expect(logout!.body).toBeUndefined();
    expect(logout!.credentials).toBe('include');
    expect(logout!.headers['X-CSRF-Token']).toBe(CSRF_TOKEN);
    expect(logout!.headers['Authorization']).toBe(`Bearer ${RESTORED_ACCESS_TOKEN}`);
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(apiClient.getAccessToken()).toBeNull();
  });
});
