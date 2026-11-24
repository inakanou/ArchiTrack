/**
 * 外部アプリの接続の同意の画面のテスト（user-authentication タスク78.1）
 *
 * design.md「Requirements 46-51」の ConsentPage・ExternalAppRoutes・Error Handling に従う。
 * - 経路は `/connect/consent/:uid`。未ログインならログインの後に同じ画面へ戻る（47.1）
 * - アプリ名・戻り先のホスト名・利用者・範囲・期限（未使用 30 日と同意から 90 日）を示す（47.4）
 * - 「読み取り」は外せず、「書き込み」は既定で未選択（47.5）。`offline_access` は出さない
 * - 2FA の通過の後に同意・拒否を受け、応答の URL へ全ページで遷移する。状態を変える要求は CSRF を付ける（47.11）
 * - 権限なし（46.3）・期限切れ・制限中（34.2。拒否の操作も出さない）・ロック（403）・回数制限（429）の案内
 *
 * API クライアントは本物を使い、`fetch` だけを差し替える（CSRF の付与と取り直しを画面から確かめる）。
 * 全ページの遷移は `navigateFullPage` を差し替えて、渡した URL を確かめる。
 *
 * @requirement user-authentication/REQ-46.3
 * @requirement user-authentication/REQ-47.1
 * @requirement user-authentication/REQ-47.4
 * @requirement user-authentication/REQ-47.5
 * @requirement user-authentication/REQ-47.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { routes } from '../../routes';
import { AuthContext, type AuthContextValue, type User } from '../../contexts/AuthContext';
import { apiClient } from '../../api/client';

const navigation = vi.hoisted(() => ({ navigateFullPage: vi.fn() }));
vi.mock('../../utils/full-page-navigation', () => navigation);

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

const UID = 'Abcdefghij_klmnopqrst-uvwxyz0123456789ABCDE';
const CONSENT_PATH = `/connect/consent/${UID}`;
const REDIRECT_TO = `https://architrack.example/oauth/authorize/${UID}`;
const NEXT_CODE_NOTICE = 'ログインで使ったコードは使えません。次のコードをお待ちください';
const RECONNECT_MESSAGE = 'アプリから接続し直してください';
const RESTRICTED_MESSAGE = '設定を済ませてからアプリで接続し直してください';

const baseUser: User = {
  id: 'user-1',
  email: 'taro@example.com',
  displayName: '山田 太郎',
  roles: ['user'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};

function authValue(user: User | null): AuthContextValue {
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

interface ViewOverrides {
  readonly requestedScopes?: readonly string[];
  readonly secondFactorVerified?: boolean;
}

function viewBody(overrides: ViewOverrides = {}) {
  return {
    appName: 'Claude',
    redirectHost: 'claude.ai',
    account: { displayName: '山田 太郎', email: 'taro@example.com' },
    requestedScopes: overrides.requestedScopes ?? ['read', 'write'],
    idleDays: 30,
    absoluteDays: 90,
    secondFactorVerified: overrides.secondFactorVerified ?? true,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type Reply = Response | Promise<Response>;

/**
 * 経路ごとに応答の列を持つ fetch の差し替え。列の最後の応答は繰り返す
 */
function installFetch(replies: Record<string, Reply[]>) {
  const queues = new Map(Object.entries(replies).map(([key, list]) => [key, [...list]]));
  let csrfCount = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/csrf-token') {
      csrfCount += 1;
      return json(200, { csrfToken: `csrf-${csrfCount}` });
    }
    const key = `${method} ${url.pathname.replace(`/oauth/interaction/${UID}`, '')}`;
    const queue = queues.get(key);
    if (!queue || queue.length === 0) {
      throw new Error(`想定しない要求: ${key}`);
    }
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const reply = await (next as Reply);
    return reply.clone();
  });
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof installFetch>, method: string, suffix: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input));
    return (init?.method ?? 'GET') === method && url.pathname.endsWith(suffix);
  });
}

function LocationProbe({ name }: { name: string }) {
  const location = useLocation();
  return (
    <div data-testid="probe" data-search={location.search}>
      {name}
    </div>
  );
}

function consentRouteElement(): ReactElement {
  const route = routes.find((candidate) => candidate.path === '/connect/consent/:uid');
  if (!route?.element) {
    throw new Error('経路 /connect/consent/:uid が定義されていない');
  }
  return route.element as ReactElement;
}

function renderPage(user: User | null = baseUser, path: string = CONSENT_PATH) {
  return render(
    <AuthContext.Provider value={authValue(user)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/connect/consent/:uid" element={consentRouteElement()} />
          <Route path="/login" element={<LocationProbe name="login" />} />
          <Route path="/profile/2fa-setup" element={<LocationProbe name="2fa-setup" />} />
          <Route path="/setup/password" element={<LocationProbe name="setup-password" />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

async function enterTotp(user: ReturnType<typeof userEvent.setup>, code: string) {
  for (const [index, digit] of code.split('').entries()) {
    await user.type(screen.getByLabelText(`認証コード ${index + 1}桁目`), digit);
  }
  await user.click(screen.getByRole('button', { name: '検証' }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('OAuthConsentPage（外部アプリの接続の同意）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    apiClient.clearCredentials();
    apiClient.setAccessToken('access-token');
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    apiClient.setUserStateRestrictionCallback(null);
    navigation.navigateFullPage.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    apiClient.clearCredentials();
  });

  it('未ログインならログインの画面へ移し、戻り先に同じ画面と uid を渡す（47.1）', () => {
    const fetchMock = installFetch({});

    renderPage(null);

    expect(screen.getByTestId('probe')).toHaveTextContent('login');
    expect(screen.getByTestId('probe')).toHaveAttribute(
      'data-search',
      `?redirectUrl=${encodeURIComponent(CONSENT_PATH)}`
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('読み込み中は進捗を示す', async () => {
    const pending = deferred<Response>();
    installFetch({ 'GET /details': [pending.promise] });

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('読み込み中');
    await act(async () => {
      pending.resolve(json(200, viewBody()));
    });
    expect(await screen.findByText('Claude', { selector: 'dd' })).toBeInTheDocument();
  });

  it('2FA を通していなければ、同意の内容を出さず 2FA の入力と「次のコード」の注意を出す（47.2）', async () => {
    installFetch({ 'GET /details': [json(200, viewBody({ secondFactorVerified: false }))] });

    renderPage();

    expect(await screen.findByRole('group', { name: '認証コード入力' })).toBeInTheDocument();
    expect(screen.getByText(NEXT_CODE_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '認証コード入力' })).toHaveAccessibleDescription(
      NEXT_CODE_NOTICE
    );
    expect(screen.queryByRole('button', { name: '許可する' })).not.toBeInTheDocument();
    expect(screen.queryByText('claude.ai')).not.toBeInTheDocument();
  });

  it('バックアップコードの入力でも「次のコード」の注意を出し続ける', async () => {
    const user = userEvent.setup();
    installFetch({ 'GET /details': [json(200, viewBody({ secondFactorVerified: false }))] });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'バックアップコードを使用する' }));

    expect(screen.getByLabelText('バックアップコード')).toBeInTheDocument();
    expect(screen.getByText(NEXT_CODE_NOTICE)).toBeInTheDocument();
  });

  it('TOTP を CSRF 付きで送り、通過したら同意の内容を出す', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
      'POST /second-factor': [new Response(null, { status: 204 })],
    });

    renderPage();
    await screen.findByRole('group', { name: '認証コード入力' });
    await enterTotp(user, '123456');

    expect(await screen.findByRole('button', { name: '許可する' })).toBeInTheDocument();
    const [call] = callsTo(fetchMock, 'POST', '/second-factor');
    const init = call?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ type: 'totp', code: '123456' });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
    expect(navigation.navigateFullPage).not.toHaveBeenCalled();
  });

  it('バックアップコードを type backup で送る', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
      'POST /second-factor': [new Response(null, { status: 204 })],
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'バックアップコードを使用する' }));
    await user.type(screen.getByLabelText('バックアップコード'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: '検証' }));

    expect(await screen.findByRole('button', { name: '許可する' })).toBeInTheDocument();
    const init = callsTo(fetchMock, 'POST', '/second-factor')[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ type: 'backup', code: 'ABCD1234' });
  });

  it('アプリ名・戻り先のホスト名・利用者・範囲・2 つの期限を示す（47.4）', async () => {
    installFetch({ 'GET /details': [json(200, viewBody())] });

    renderPage();

    const details = await screen.findByRole('region', { name: '接続の内容' });
    expect(within(details).getByText('Claude', { selector: 'dd' })).toBeInTheDocument();
    expect(within(details).getByText('claude.ai')).toBeInTheDocument();
    expect(within(details).getByText(/山田 太郎/)).toBeInTheDocument();
    expect(within(details).getByText(/taro@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '許可する操作' })).toBeInTheDocument();
    const expiry = screen.getByRole('region', { name: '接続の期限' });
    expect(expiry).toHaveTextContent('最後に使われてから 30 日');
    expect(expiry).toHaveTextContent('同意から 90 日');
    expect(expiry).toHaveTextContent('使っていても延長されません');
  });

  it('「読み取り」は選択済みで外せず、「書き込み」は既定で未選択（47.5）', async () => {
    const user = userEvent.setup();
    installFetch({ 'GET /details': [json(200, viewBody())] });

    renderPage();

    const read = await screen.findByRole('checkbox', { name: /読み取り/ });
    const write = screen.getByRole('checkbox', { name: /書き込み/ });
    expect(read).toBeChecked();
    expect(read).toBeDisabled();
    expect(write).not.toBeChecked();
    expect(write).toBeEnabled();
    await user.click(read);
    expect(read).toBeChecked();
  });

  it('offline_access を選択肢に出さず、書き込みを求めていなければ書き込みも出さない', async () => {
    installFetch({
      'GET /details': [json(200, viewBody({ requestedScopes: ['read', 'offline_access'] }))],
    });

    renderPage();

    await screen.findByRole('checkbox', { name: /読み取り/ });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText(/offline_access/)).not.toBeInTheDocument();
  });

  it('既定のまま許可すると読み取りだけを送り、応答の URL へ全ページで遷移する（47.11）', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      'GET /details': [json(200, viewBody())],
      'POST /approve': [json(200, { redirectTo: REDIRECT_TO })],
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: '許可する' }));

    await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledWith(REDIRECT_TO));
    expect(navigation.navigateFullPage).toHaveBeenCalledTimes(1);
    const init = callsTo(fetchMock, 'POST', '/approve')[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ scopes: ['read'] });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
    expect(screen.getByRole('status')).toHaveTextContent('アプリへ戻っています');
  });

  it('書き込みを選んで許可すると読み取りと書き込みを送る', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      'GET /details': [json(200, viewBody())],
      'POST /approve': [json(200, { redirectTo: REDIRECT_TO })],
    });

    renderPage();
    await user.click(await screen.findByRole('checkbox', { name: /書き込み/ }));
    await user.click(screen.getByRole('button', { name: '許可する' }));

    await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledWith(REDIRECT_TO));
    const init = callsTo(fetchMock, 'POST', '/approve')[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ scopes: ['read', 'write'] });
  });

  it('拒否すると本文なしで送り、応答の URL へ全ページで遷移する（47.7）', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      'GET /details': [json(200, viewBody())],
      'POST /deny': [json(200, { redirectTo: REDIRECT_TO })],
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: '拒否する' }));

    await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledWith(REDIRECT_TO));
    const init = callsTo(fetchMock, 'POST', '/deny')[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
    expect(callsTo(fetchMock, 'POST', '/approve')).toHaveLength(0);
  });

  it('CSRF の不一致では一度だけ取り直して送り直し、遷移する', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      'GET /details': [json(200, viewBody())],
      'POST /approve': [
        json(403, { error: 'Invalid CSRF token', code: 'CSRF_TOKEN_INVALID' }),
        json(200, { redirectTo: REDIRECT_TO }),
      ],
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: '許可する' }));

    await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledWith(REDIRECT_TO));
    const approves = callsTo(fetchMock, 'POST', '/approve');
    expect(approves).toHaveLength(2);
    expect(callsTo(fetchMock, 'GET', '/csrf-token')).toHaveLength(2);
    expect(
      ((approves[0]?.[1] as RequestInit).headers as Record<string, string>)['X-CSRF-Token']
    ).toBe('csrf-1');
    expect(
      ((approves[1]?.[1] as RequestInit).headers as Record<string, string>)['X-CSRF-Token']
    ).toBe('csrf-2');
  });

  it('送信中は二重の送信と離脱を防ぎ、許可も拒否も 1 回しか送らない（74.2 の申し送り）', async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    const fetchMock = installFetch({
      'GET /details': [json(200, viewBody())],
      'POST /approve': [pending.promise],
      'POST /deny': [json(200, { redirectTo: REDIRECT_TO })],
    });

    renderPage();
    const approve = await screen.findByRole('button', { name: '許可する' });
    await user.click(approve);

    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/approve')).toHaveLength(1));
    expect(screen.getByRole('button', { name: '許可する' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒否する' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /書き込み/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '許可する' }));
    await user.click(screen.getByRole('button', { name: '拒否する' }));
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await act(async () => {
      pending.resolve(json(200, { redirectTo: REDIRECT_TO }));
    });

    await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledTimes(1));
    expect(callsTo(fetchMock, 'POST', '/approve')).toHaveLength(1);
    expect(callsTo(fetchMock, 'POST', '/deny')).toHaveLength(0);
    // 遷移の後は離脱の確認を出さない（全ページの遷移を止めない）
    const afterRedirect = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterRedirect);
    expect(afterRedirect.defaultPrevented).toBe(false);
  });

  it('権限が無ければ管理者への依頼を案内し、許可の操作を出さない（46.3）', async () => {
    installFetch({
      'GET /details': [json(403, { error: '権限がありません', code: 'PERMISSION_REQUIRED' })],
    });

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('外部アプリを接続する権限がありません');
    expect(alert).toHaveTextContent('管理者');
    expect(screen.queryByRole('button', { name: '許可する' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '認証コード入力' })).not.toBeInTheDocument();
  });

  it.each([
    ['INTERACTION_NOT_FOUND', 404],
    ['RECONNECT_REQUIRED', 404],
  ])(
    '申し込みが %s（%i）ならアプリから接続し直すよう案内し、操作を出さない',
    async (code, status) => {
      installFetch({ 'GET /details': [json(status, { error: 'x', code })] });

      renderPage();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(RECONNECT_MESSAGE);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );

  it('2FA の送信が RECONNECT_REQUIRED（404）なら接続し直すよう案内する', async () => {
    const user = userEvent.setup();
    installFetch({
      'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
      'POST /second-factor': [json(404, { code: 'RECONNECT_REQUIRED' })],
    });

    renderPage();
    await screen.findByRole('group', { name: '認証コード入力' });
    await enterTotp(user, '123456');

    expect(await screen.findByRole('alert')).toHaveTextContent(RECONNECT_MESSAGE);
    expect(screen.queryByRole('group', { name: '認証コード入力' })).not.toBeInTheDocument();
  });

  it('uid の形が不正なら API を呼ばずに接続し直すよう案内し、URL の値を表示しない', async () => {
    const fetchMock = installFetch({});
    const badUid = 'evil-value<b>injected</b>';

    renderPage(baseUser, `/connect/consent/${encodeURIComponent(badUid)}`);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(RECONNECT_MESSAGE);
    expect(document.body.textContent).not.toContain('evil-value');
    expect(document.body.textContent).not.toContain('injected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('案内には URL の uid を表示しない', async () => {
    installFetch({ 'GET /details': [json(404, { code: 'INTERACTION_NOT_FOUND' })] });

    renderPage();

    await screen.findByRole('alert');
    expect(document.body.textContent).not.toContain(UID);
  });

  it('案内を表示したら案内へフォーカスを移す', async () => {
    installFetch({ 'GET /details': [json(404, { code: 'INTERACTION_NOT_FOUND' })] });

    renderPage();

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it.each([
    ['2FA 未登録', { twoFactorEnabled: false }],
    ['初回のパスワード変更が必要', { mustChangePassword: true }],
  ])(
    '%s の利用者には設定を済ませるよう案内し、許可も拒否も出さず API も呼ばない（34.2）',
    async (_label, flags) => {
      const fetchMock = installFetch({});

      renderPage({ ...baseUser, ...flags });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(RESTRICTED_MESSAGE);
      expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(['TWO_FACTOR_SETUP_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'])(
    '申し込みの取得が 403 %s なら設定を済ませるよう案内し、操作を出さない',
    async (code) => {
      installFetch({ 'GET /details': [json(403, { error: 'x', code })] });

      renderPage();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(RESTRICTED_MESSAGE);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );

  it('2FA のコードの誤り（400）では再入力を促し、同意の内容を出さない（47.3）', async () => {
    const user = userEvent.setup();
    installFetch({
      'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
      'POST /second-factor': [json(400, { code: 'SECOND_FACTOR_FAILED' })],
    });

    renderPage();
    await screen.findByRole('group', { name: '認証コード入力' });
    await enterTotp(user, '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent('認証コードが正しくありません');
    expect(screen.queryByRole('button', { name: '許可する' })).not.toBeInTheDocument();
    expect(screen.getByText(NEXT_CODE_NOTICE)).toBeInTheDocument();
  });

  it('2FA のロック（403）では解除の時刻を示して待つよう案内する', async () => {
    const user = userEvent.setup();
    const unlockAt = new Date('2026-11-25T03:15:00.000Z');
    installFetch({
      'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
      'POST /second-factor': [
        json(403, { code: 'SECOND_FACTOR_LOCKED', unlockAt: unlockAt.toISOString() }),
      ],
    });

    renderPage();
    await screen.findByRole('group', { name: '認証コード入力' });
    await enterTotp(user, '000000');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ロック');
    expect(alert).toHaveTextContent(unlockAt.toLocaleString('ja-JP'));
    expect(alert).toHaveTextContent('以降に再試行してください');
    expect(screen.queryByRole('button', { name: '許可する' })).not.toBeInTheDocument();
  });

  it('2FA の回数制限（429）では時間をおいて再試行するよう案内する', async () => {
    const user = userEvent.setup();
    installFetch({
      'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
      'POST /second-factor': [json(429, { error: 'Too many', retryAfter: 60 })],
    });

    renderPage();
    await screen.findByRole('group', { name: '認証コード入力' });
    await enterTotp(user, '000000');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('試行回数の上限');
    expect(alert).toHaveTextContent('60 秒');
    expect(alert).toHaveTextContent('再試行してください');
  });

  it('同意の時点で 2FA の通過が切れていれば（403 SECOND_FACTOR_REQUIRED）2FA の入力へ戻す', async () => {
    const user = userEvent.setup();
    installFetch({
      'GET /details': [json(200, viewBody())],
      'POST /approve': [json(403, { code: 'SECOND_FACTOR_REQUIRED' })],
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: '許可する' }));

    expect(await screen.findByRole('group', { name: '認証コード入力' })).toBeInTheDocument();
    expect(screen.getByText(/もう一度コードを入力してください/)).toBeInTheDocument();
    expect(navigation.navigateFullPage).not.toHaveBeenCalled();
  });

  it('申し込みの取得が 503 なら再試行を促し、再試行で読み直す', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      'GET /details': [
        json(503, { code: 'SERVICE_UNAVAILABLE' }),
        json(503, { code: 'SERVICE_UNAVAILABLE' }),
        json(503, { code: 'SERVICE_UNAVAILABLE' }),
        json(503, { code: 'SERVICE_UNAVAILABLE' }),
        json(200, viewBody()),
      ],
    });

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('時間をおいて再試行してください');
    await user.click(screen.getByRole('button', { name: '再試行' }));

    expect(await screen.findByRole('button', { name: '許可する' })).toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', '/details').length).toBeGreaterThanOrEqual(5);
  });

  it('同意の送信が 503 なら再試行を促し、送信の操作を戻す', async () => {
    const user = userEvent.setup();
    installFetch({
      'GET /details': [json(200, viewBody())],
      'POST /approve': [json(503, { code: 'SERVICE_UNAVAILABLE' })],
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: '許可する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('時間をおいて再試行してください');
    expect(screen.getByRole('button', { name: '許可する' })).toBeEnabled();
    expect(navigation.navigateFullPage).not.toHaveBeenCalled();
  });

  it('通信に失敗したらネットワークの確認と再試行を促す（15.9）', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ネットワーク接続を確認してください');
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  it('経路は制限中の利用者を設定の画面へ置き換えない（案内を出すため）', async () => {
    installFetch({});

    renderPage({ ...baseUser, twoFactorEnabled: false });

    expect(await screen.findByRole('alert')).toHaveTextContent(RESTRICTED_MESSAGE);
    expect(screen.getByRole('link', { name: '設定へ進む' })).toHaveAttribute(
      'href',
      '/profile/2fa-setup'
    );
  });
  describe('拒否の経路（独立レビュー 1 回目の指摘）', () => {
    it('2FA の段階で「接続を拒否する」を押すと、本文なしで deny へ CSRF 付きで送り、全ページで 1 回遷移する', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
        'POST /deny': [json(200, { redirectTo: REDIRECT_TO })],
      });

      renderPage();
      await user.click(await screen.findByRole('button', { name: '接続を拒否する' }));

      await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledWith(REDIRECT_TO));
      expect(navigation.navigateFullPage).toHaveBeenCalledTimes(1);
      const denies = callsTo(fetchMock, 'POST', '/deny');
      expect(denies).toHaveLength(1);
      const init = denies[0]?.[1] as RequestInit;
      expect(init.body).toBeUndefined();
      expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
      expect(callsTo(fetchMock, 'POST', '/second-factor')).toHaveLength(0);
    });

    it('2FA の段階の拒否が 503 なら、案内を出してフォーカスを移し、遷移しない', async () => {
      const user = userEvent.setup();
      installFetch({
        'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
        'POST /deny': [json(503, { code: 'SERVICE_UNAVAILABLE' })],
      });

      renderPage();
      await user.click(await screen.findByRole('button', { name: '接続を拒否する' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('時間をおいて再試行してください');
      await waitFor(() => expect(alert).toHaveFocus());
      expect(navigation.navigateFullPage).not.toHaveBeenCalled();
      expect(screen.getByRole('group', { name: '認証コード入力' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '接続を拒否する' })).toBeEnabled();
    });

    it('権限なしの画面の「接続を拒否してアプリへ戻る」で deny を送り、全ページで遷移する', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        'GET /details': [json(403, { code: 'PERMISSION_REQUIRED' })],
        'POST /deny': [json(200, { redirectTo: REDIRECT_TO })],
      });

      renderPage();
      await user.click(await screen.findByRole('button', { name: '接続を拒否してアプリへ戻る' }));

      await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledWith(REDIRECT_TO));
      expect(navigation.navigateFullPage).toHaveBeenCalledTimes(1);
      expect(callsTo(fetchMock, 'POST', '/deny')).toHaveLength(1);
    });

    it('権限なしの画面の拒否が失敗したら、権限なしの案内を残して失敗の案内を並べ、失敗の案内へフォーカスを移す', async () => {
      const user = userEvent.setup();
      installFetch({
        'GET /details': [json(403, { code: 'PERMISSION_REQUIRED' })],
        'POST /deny': [json(503, { code: 'SERVICE_UNAVAILABLE' })],
      });

      renderPage();
      await user.click(await screen.findByRole('button', { name: '接続を拒否してアプリへ戻る' }));

      await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
      const [permission, failure] = screen.getAllByRole('alert');
      expect(permission).toHaveTextContent('外部アプリを接続する権限がありません');
      expect(failure).toHaveTextContent('時間をおいて再試行してください');
      await waitFor(() => expect(failure).toHaveFocus());
      expect(navigation.navigateFullPage).not.toHaveBeenCalled();
    });

    it('details が 400 READ_SCOPE_REQUIRED なら誤りの案内と拒否のボタンを出し、拒否で遷移する', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        'GET /details': [json(400, { code: 'READ_SCOPE_REQUIRED' })],
        'POST /deny': [json(200, { redirectTo: REDIRECT_TO })],
      });

      renderPage();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('アプリの申し込みの内容に誤りがあるため接続できません');
      expect(screen.queryByRole('button', { name: '許可する' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '接続を拒否してアプリへ戻る' }));

      await waitFor(() => expect(navigation.navigateFullPage).toHaveBeenCalledWith(REDIRECT_TO));
      expect(callsTo(fetchMock, 'POST', '/deny')).toHaveLength(1);
    });
  });

  it('2FA を通って同意の内容へ切り替わったら、説明の文へフォーカスを移す', async () => {
    const user = userEvent.setup();
    installFetch({
      'GET /details': [json(200, viewBody({ secondFactorVerified: false }))],
      'POST /second-factor': [new Response(null, { status: 204 })],
    });

    renderPage();
    await screen.findByRole('group', { name: '認証コード入力' });
    await enterTotp(user, '123456');

    const intro = await screen.findByText(/接続を求めています/);
    await waitFor(() => expect(intro).toHaveFocus());
  });
});
