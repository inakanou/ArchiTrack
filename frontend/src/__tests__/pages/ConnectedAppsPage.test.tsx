/**
 * 連携中のアプリの画面のテスト（user-authentication タスク78.2）
 *
 * design.md「Requirements 46-51」の ConnectedAppsPage・ExternalAppRoutes に従う。
 * - 経路は `/connected-apps`（既存の ProtectedRoute の内側。制限中の利用者は既存の扱いで設定の画面へ移る）
 * - 本人の接続ごとにアプリの名称・操作の範囲・同意の日時・最後に使われた日時・期限を示す（49.1）
 * - 接続が無ければ連携中のアプリが無いことを示す（49.2）
 * - 取り消しは確認のダイアログを出し（49.3）、確定で CSRF 付きの DELETE を送る（49.4）
 * - 取り消しの後に一覧から消えて知らせる。404 は一覧を読み直して終了済みと知らせる。失敗は再試行を促す
 *
 * API クライアントは本物を使い、`fetch` だけを差し替える（CSRF の付与を画面から確かめる）。
 *
 * @requirement user-authentication/REQ-49.1
 * @requirement user-authentication/REQ-49.2
 * @requirement user-authentication/REQ-49.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../../routes';
import { AuthContext, type AuthContextValue, type User } from '../../contexts/AuthContext';
import { apiClient } from '../../api/client';
import { formatDateTime } from '../../utils/formatters';

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

const LIST_PATH = '/api/v1/external-app-connections';
const CLAUDE_ID = '0b7f5c1e-8a3d-4f6b-9c2e-1d4a5b6c7d8e';
const TOOL_ID = '6f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';

const baseUser: User = {
  id: 'user-1',
  email: 'taro@example.com',
  displayName: '山田 太郎',
  roles: ['user'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};

function authValue(user: User): AuthContextValue {
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
    updateUser: vi.fn(),
  };
}

const claudeConnection = {
  id: CLAUDE_ID,
  appName: 'Claude',
  scopes: ['read', 'write'],
  consentedAt: '2026-11-01T01:00:00.000Z',
  lastUsedAt: '2026-11-20T03:30:00.000Z',
  expiresAt: '2026-12-20T03:30:00.000Z',
};

const toolConnection = {
  id: TOOL_ID,
  appName: '積算ツール',
  scopes: ['read'],
  consentedAt: '2026-11-10T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: '2026-12-10T00:00:00.000Z',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type Reply = Response | Promise<Response>;

/**
 * 「メソッド パス」ごとに応答の列を持つ fetch の差し替え。列の最後の応答は繰り返す
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
    const key = `${method} ${url.pathname}`;
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

function callsTo(fetchMock: ReturnType<typeof installFetch>, method: string, path: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input));
    return (init?.method ?? 'GET') === method && url.pathname === path;
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderRoute(user: User = baseUser) {
  const router = createMemoryRouter(routes, { initialEntries: ['/connected-apps'] });
  render(
    <AuthContext.Provider value={authValue(user)}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
  return router;
}

async function findItem(appName: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 2, name: appName });
  const item = heading.closest('li');
  if (!item) {
    throw new Error(`${appName} の一覧の項目が見つからない`);
  }
  return item;
}

/** 一覧の欄（dt）の値（dd）を返す */
function fieldValue(item: HTMLElement, label: string): string {
  const term = within(item).getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling;
  if (!value || value.tagName !== 'DD') {
    throw new Error(`${label} の値が見つからない`);
  }
  return value.textContent ?? '';
}

async function openRevokeDialog(user: ReturnType<typeof userEvent.setup>, appName: string) {
  const item = await findItem(appName);
  await user.click(within(item).getByRole('button', { name: `「${appName}」の接続を取り消す` }));
  return screen.findByRole('dialog', { name: '接続の取り消し' });
}

describe('ConnectedAppsPage（連携中のアプリ）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    apiClient.clearCredentials();
    apiClient.setAccessToken('access-token');
    apiClient.setTokenRefreshCallback(null);
    apiClient.setSessionExpiredCallback(null);
    apiClient.setUserStateRestrictionCallback(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    apiClient.clearCredentials();
  });

  it('接続ごとにアプリの名称・操作の範囲・同意の日時・最後に使われた日時・期限を示す（49.1）', async () => {
    installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection, toolConnection] })],
    });

    renderRoute();

    expect(
      await screen.findByRole('heading', { level: 1, name: '連携中のアプリ' })
    ).toBeInTheDocument();
    const claude = await findItem('Claude');
    expect(fieldValue(claude, '許可している操作')).toBe('読み取り、書き込み');
    expect(fieldValue(claude, '同意した日時')).toBe(formatDateTime(claudeConnection.consentedAt));
    expect(fieldValue(claude, '最後に使われた日時')).toBe(
      formatDateTime(claudeConnection.lastUsedAt)
    );
    expect(fieldValue(claude, '期限')).toBe(formatDateTime(claudeConnection.expiresAt));

    const tool = await findItem('積算ツール');
    expect(fieldValue(tool, '許可している操作')).toBe('読み取り');
    expect(fieldValue(tool, '最後に使われた日時')).toBe('まだ使われていません');
    expect(fieldValue(tool, '期限')).toBe(formatDateTime(toolConnection.expiresAt));

    // 並びは API の順（同意の新しい順は API が決める）
    const items = within(screen.getByRole('list', { name: '連携中のアプリ' })).getAllByRole(
      'listitem'
    );
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByRole('heading')).toHaveTextContent('Claude');

    // 期限の決まり（78.1 の同意の画面と同じ言い回し）
    expect(screen.getByText('最後に使われてから 30 日間使われなかったとき')).toBeInTheDocument();
    expect(
      screen.getByText('同意から 90 日が過ぎたとき（使っていても延長されません）')
    ).toBeInTheDocument();

    // 接続の ID を表示しない
    expect(document.body).not.toHaveTextContent(CLAUDE_ID);
    expect(document.body).not.toHaveTextContent(TOOL_ID);
  });

  it('接続が無ければ連携中のアプリが無いことを示し、取り消しの操作を出さない（49.2）', async () => {
    installFetch({ [`GET ${LIST_PATH}`]: [json(200, { data: [] })] });

    renderRoute();

    expect(await screen.findByText('連携中のアプリはありません。')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '連携中のアプリ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /接続を取り消す/ })).not.toBeInTheDocument();
  });

  it('読み込み中は進捗を示す', async () => {
    const pending = deferred<Response>();
    installFetch({ [`GET ${LIST_PATH}`]: [pending.promise] });

    renderRoute();

    expect(await screen.findByText('読み込み中...')).toBeInTheDocument();
    await act(async () => {
      pending.resolve(json(200, { data: [claudeConnection] }));
    });
    expect(await findItem('Claude')).toBeInTheDocument();
    expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
  });

  it('一覧の取得に失敗したら再試行を促し、再試行で読み直す', async () => {
    const user = userEvent.setup();
    // GET は API クライアントが 503 を 3 回まで自動で送り直すので、4 回とも 503 にする
    const unavailable = () => json(503, { code: 'SERVICE_UNAVAILABLE' });
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [
        unavailable(),
        unavailable(),
        unavailable(),
        unavailable(),
        json(200, { data: [claudeConnection] }),
      ],
    });

    renderRoute();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('連携中のアプリを読み込めませんでした');
    await user.click(within(alert).getByRole('button', { name: '再試行' }));

    expect(await findItem('Claude')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', LIST_PATH)).toHaveLength(5);
  });

  it('通信に失敗したらネットワークの確認を促す', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof globalThis.fetch;

    renderRoute();

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('ネットワーク接続を確認してください');
    expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  it('取り消しを選ぶとアプリの名称を示した確認のダイアログを出し、まだ送らない（49.3）', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection, toolConnection] })],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('「Claude」の接続を取り消しますか？');
    expect(dialog).toHaveTextContent('アプリから接続し直してください');
    // 最初のフォーカスは安全な「キャンセル」
    expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
  });

  it('確定すると CSRF 付きで DELETE を送り、一覧から消して知らせる（49.4）', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection, toolConnection] })],
      [`DELETE ${LIST_PATH}/${CLAUDE_ID}`]: [new Response(null, { status: 204 })],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: 'Claude' })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await findItem('積算ツール')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('「Claude」の接続を取り消しました。');

    const deletes = callsTo(fetchMock, 'DELETE', `${LIST_PATH}/${CLAUDE_ID}`);
    expect(deletes).toHaveLength(1);
    const init = deletes[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
    expect(init.body).toBeUndefined();
    // 一覧は読み直さず、手元から消す
    expect(callsTo(fetchMock, 'GET', LIST_PATH)).toHaveLength(1);

    // 消えた項目の代わりに見出しへフォーカスを戻す
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: '連携中のアプリ' })).toHaveFocus()
    );
  });

  it('最後の 1 件を取り消すと、連携中のアプリが無いことを示す', async () => {
    const user = userEvent.setup();
    installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [toolConnection] })],
      [`DELETE ${LIST_PATH}/${TOOL_ID}`]: [new Response(null, { status: 204 })],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, '積算ツール');
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

    expect(await screen.findByText('連携中のアプリはありません。')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('「積算ツール」の接続を取り消しました。');
  });

  it('CSRF の不一致では一度だけ取り直して送り直す', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection] })],
      [`DELETE ${LIST_PATH}/${CLAUDE_ID}`]: [
        json(403, { error: 'Invalid CSRF token', code: 'CSRF_TOKEN_INVALID' }),
        new Response(null, { status: 204 }),
      ],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

    expect(await screen.findByText('連携中のアプリはありません。')).toBeInTheDocument();
    const deletes = callsTo(fetchMock, 'DELETE', `${LIST_PATH}/${CLAUDE_ID}`);
    expect(deletes).toHaveLength(2);
    expect(
      ((deletes[1]?.[1] as RequestInit).headers as Record<string, string>)['X-CSRF-Token']
    ).toBe('csrf-2');
  });

  it('キャンセルでは何も送らず一覧を残し、取り消しのボタンへフォーカスを戻す', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection] })],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await findItem('Claude')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '「Claude」の接続を取り消す' })).toHaveFocus()
    );
  });

  it('Escape でもダイアログを閉じ、何も送らない', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection] })],
    });

    renderRoute();
    await openRevokeDialog(user, 'Claude');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '「Claude」の接続を取り消す' })).toHaveFocus()
    );
  });

  it('ダイアログの中で Tab を押してもフォーカスがダイアログの外へ出ない', async () => {
    const user = userEvent.setup();
    installFetch({ [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection] })] });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    for (let index = 0; index < 4; index += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('すでに終了していた接続（404）は一覧を読み直し、終了済みと知らせる', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [
        json(200, { data: [claudeConnection, toolConnection] }),
        json(200, { data: [toolConnection] }),
      ],
      [`DELETE ${LIST_PATH}/${CLAUDE_ID}`]: [
        json(404, { error: 'External app connection not found', code: 'CONNECTION_NOT_FOUND' }),
      ],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: 'Claude' })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await findItem('積算ツール')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '「Claude」の接続はすでに終了していました。一覧を更新しました。'
    );
    expect(callsTo(fetchMock, 'GET', LIST_PATH)).toHaveLength(2);
  });

  it('取り消しに失敗したらダイアログに再試行を促し、もう一度確定すると取り消せる', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection] })],
      [`DELETE ${LIST_PATH}/${CLAUDE_ID}`]: [
        json(503, { code: 'SERVICE_UNAVAILABLE' }),
        new Response(null, { status: 204 }),
      ],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('接続を取り消せませんでした。時間をおいて再試行してください。');
    // 自動で送り直さない
    expect(callsTo(fetchMock, 'DELETE', `${LIST_PATH}/${CLAUDE_ID}`)).toHaveLength(1);
    expect(await findItem('Claude')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '取り消す' })).toBeEnabled();

    await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

    expect(await screen.findByText('連携中のアプリはありません。')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'DELETE', `${LIST_PATH}/${CLAUDE_ID}`)).toHaveLength(2);
  });

  it('取り消しの通信に失敗したらネットワークの確認を促す', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection] })],
    });
    const listFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        throw new TypeError('Failed to fetch');
      }
      return listFetch(input, init);
    }) as typeof globalThis.fetch;

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

    const alert = await within(dialog).findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('ネットワーク接続を確認して、もう一度お試しください。');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('送信中は二重の送信を受けず、ダイアログも閉じない', async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    const fetchMock = installFetch({
      [`GET ${LIST_PATH}`]: [json(200, { data: [claudeConnection] })],
      [`DELETE ${LIST_PATH}/${CLAUDE_ID}`]: [pending.promise],
    });

    renderRoute();
    const dialog = await openRevokeDialog(user, 'Claude');
    const confirm = within(dialog).getByRole('button', { name: '取り消す' });
    await user.click(confirm);

    await waitFor(() =>
      expect(callsTo(fetchMock, 'DELETE', `${LIST_PATH}/${CLAUDE_ID}`)).toHaveLength(1)
    );
    const busy = within(dialog).getByRole('button', { name: '取り消し中...' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    await user.click(busy);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '接続の取り消し' })).toBeInTheDocument();

    await act(async () => {
      pending.resolve(new Response(null, { status: 204 }));
    });

    expect(await screen.findByText('連携中のアプリはありません。')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'DELETE', `${LIST_PATH}/${CLAUDE_ID}`)).toHaveLength(1);
  });

  it.each([
    ['2FA 未登録', { twoFactorEnabled: false }, '/profile/2fa-setup'],
    ['初回のパスワード変更が必要', { mustChangePassword: true }, '/setup/password'],
  ])(
    '%s の利用者は既存の ProtectedRoute の扱いで設定の画面へ移り、一覧を要求しない',
    async (_label, flags, expectedPath) => {
      const fetchMock = installFetch({});

      const router = renderRoute({ ...baseUser, ...flags });

      await waitFor(() => expect(router.state.location.pathname).toBe(expectedPath));
      expect(callsTo(fetchMock, 'GET', LIST_PATH)).toHaveLength(0);
      expect(
        screen.queryByRole('heading', { level: 1, name: '連携中のアプリ' })
      ).not.toBeInTheDocument();
    }
  );

  it('プロフィールの画面へ戻る導線を置く', async () => {
    installFetch({ [`GET ${LIST_PATH}`]: [json(200, { data: [] })] });

    renderRoute();

    expect(await screen.findByRole('link', { name: '← プロフィールに戻る' })).toHaveAttribute(
      'href',
      '/profile'
    );
  });
});
