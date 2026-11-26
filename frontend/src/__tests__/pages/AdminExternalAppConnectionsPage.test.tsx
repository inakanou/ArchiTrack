/**
 * 接続の管理画面のテスト（user-authentication タスク78.3）
 *
 * design.md「Requirements 46-51」の AdminConnectionsPage・ExternalAppRoutes に従う。
 * - 経路は `/admin/external-app-connections`（既存の管理者ルートと同じ `ProtectedRoute requiredRole="admin"`）
 * - 全利用者の接続を、利用者・アプリの名称・操作の範囲・同意の日時・最後に使われた日時・期限とともに示す（49.6）
 * - 利用者とアプリで絞り込み、ページを切り替える（49.7）。不正な値は送らず、欄の下に誤りを示す
 * - 取り消しは利用者とアプリを示した確認のダイアログの後に、CSRF 付きの DELETE を送る（49.8）
 * - 古い一覧の応答を捨て、読み直しに失敗したら「一覧を更新しました」を残さず、失敗の案内へフォーカスを移す
 *
 * API クライアントは本物を使い、`fetch` だけを差し替える（CSRF の付与とクエリを画面から確かめる）。
 *
 * @requirement user-authentication/REQ-49.6
 * @requirement user-authentication/REQ-49.7
 * @requirement user-authentication/REQ-49.8
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

const PAGE_PATH = '/admin/external-app-connections';
const ADMIN_PATH = '/api/v1/admin/external-app-connections';
const USERS_PATH = '/api/v1/users';

const USER_A = {
  id: '1c9d4e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  displayName: '山田 太郎',
  email: 'taro@example.com',
};
const USER_B = {
  id: '2d0e5f3a-4b5c-4d6e-9f7a-8b9c0d1e2f3a',
  displayName: '佐藤 花子',
  email: 'hanako@example.com',
};

const CONN_1 = '0b7f5c1e-8a3d-4f6b-9c2e-1d4a5b6c7d8e';
const CONN_2 = '6f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';
const CONN_3 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const conn1 = {
  id: CONN_1,
  appName: 'Claude',
  clientId: 'claude-connector',
  scopes: ['read', 'write'],
  consentedAt: '2026-11-01T01:00:00.000Z',
  lastUsedAt: '2026-11-20T03:30:00.000Z',
  expiresAt: '2026-12-20T03:30:00.000Z',
  user: USER_A,
};
const conn2 = {
  id: CONN_2,
  appName: '積算ツール',
  clientId: 'estimate-tool',
  scopes: ['read'],
  consentedAt: '2026-11-10T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: '2026-12-10T00:00:00.000Z',
  user: USER_B,
};
const conn3 = {
  id: CONN_3,
  appName: 'Claude',
  clientId: 'claude-connector',
  scopes: ['read'],
  consentedAt: '2026-11-05T00:00:00.000Z',
  lastUsedAt: '2026-11-06T00:00:00.000Z',
  expiresAt: '2026-12-06T00:00:00.000Z',
  user: USER_B,
};

const adminUser: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: '管理者',
  roles: ['admin', 'user'],
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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function page(
  data: readonly unknown[],
  pagination: { page?: number; limit?: number; total?: number; totalPages?: number } = {}
): Response {
  const limit = pagination.limit ?? 20;
  const total = pagination.total ?? data.length;
  return json(200, {
    data,
    pagination: {
      page: pagination.page ?? 1,
      limit,
      total,
      totalPages: pagination.totalPages ?? Math.ceil(total / limit),
    },
  });
}

const usersResponse = () =>
  json(200, [
    { ...USER_A, createdAt: '2026-01-01T00:00:00.000Z', roles: [] },
    { ...USER_B, createdAt: '2026-01-02T00:00:00.000Z', roles: [] },
  ]);

type Reply = Response | Promise<Response> | ((url: URL) => Response | Promise<Response>);

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
    const next = (queue.length > 1 ? queue.shift() : queue[0]) as Reply;
    const reply = await (typeof next === 'function' ? next(url) : next);
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

/** 一覧の GET のクエリ（送った順） */
function listQueries(fetchMock: ReturnType<typeof installFetch>): URLSearchParams[] {
  return callsTo(fetchMock, 'GET', ADMIN_PATH).map(
    ([input]) => new URL(String(input)).searchParams
  );
}

function lastListQuery(fetchMock: ReturnType<typeof installFetch>): Record<string, string> {
  const queries = listQueries(fetchMock);
  const last = queries[queries.length - 1];
  if (!last) throw new Error('一覧の要求が無い');
  return Object.fromEntries(last.entries());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderRoute(user: User = adminUser, path = PAGE_PATH) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={authValue(user)}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
  return router;
}

function table(): HTMLElement {
  return screen.getByRole('table', { name: '外部アプリの接続の一覧' });
}

/** 利用者の表示名とアプリの名称で行を探す */
function findRow(displayName: string, appName: string): HTMLElement | null {
  const rows = within(table()).getAllByRole('row').slice(1);
  return (
    rows.find((row) => {
      const cells = within(row).queryAllByRole('cell');
      const header = within(row).queryByRole('rowheader');
      return (
        header?.textContent?.includes(displayName) === true &&
        cells.some((cell) => cell.textContent?.includes(appName))
      );
    }) ?? null
  );
}

async function findRowAsync(displayName: string, appName: string): Promise<HTMLElement> {
  let row: HTMLElement | null = null;
  await waitFor(() => {
    row = findRow(displayName, appName);
    expect(row).not.toBeNull();
  });
  return row as unknown as HTMLElement;
}

async function openRevokeDialog(
  user: ReturnType<typeof userEvent.setup>,
  displayName: string,
  appName: string
) {
  const row = await findRowAsync(displayName, appName);
  await user.click(
    within(row).getByRole('button', { name: `${displayName}の「${appName}」の接続を取り消す` })
  );
  return screen.findByRole('dialog', { name: '接続の取り消し' });
}

const unavailable = () => json(503, { error: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE' });

describe('AdminExternalAppConnectionsPage（接続の管理）', () => {
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

  describe('一覧（49.6）', () => {
    it('全利用者の接続を、利用者・アプリ・操作の範囲・同意・最後の利用・期限とともに示す', async () => {
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1, conn2])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();

      expect(
        await screen.findByRole('heading', { level: 1, name: '外部アプリの接続' })
      ).toBeInTheDocument();
      const row1 = await findRowAsync('山田 太郎', 'Claude');
      const cells1 = within(row1).getAllByRole('cell');
      expect(within(row1).getByRole('rowheader')).toHaveTextContent('taro@example.com');
      expect(cells1[0]).toHaveTextContent('Claude');
      expect(cells1[0]).toHaveTextContent('claude-connector');
      expect(cells1[1]).toHaveTextContent('読み取り、書き込み');
      expect(cells1[2]).toHaveTextContent(formatDateTime(conn1.consentedAt));
      expect(cells1[3]).toHaveTextContent(formatDateTime(conn1.lastUsedAt));
      expect(cells1[4]).toHaveTextContent(formatDateTime(conn1.expiresAt));

      const row2 = findRow('佐藤 花子', '積算ツール') as HTMLElement;
      const cells2 = within(row2).getAllByRole('cell');
      expect(cells2[1]).toHaveTextContent('読み取り');
      expect(cells2[1]).not.toHaveTextContent('書き込み');
      expect(cells2[3]).toHaveTextContent('まだ使われていません');
      expect(cells2[4]).toHaveTextContent(formatDateTime(conn2.expiresAt));

      // 列見出し
      const headers = within(table())
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
      expect(headers).toEqual([
        '利用者',
        'アプリ',
        '許可している操作',
        '同意した日時',
        '最後に使われた日時',
        '期限',
        '操作',
      ]);

      // 最初の要求は 1 ページ目・既定の件数で、絞り込みを送らない
      expect(lastListQuery(fetchMock)).toEqual({ page: '1', limit: '20' });

      // 接続・利用者の ID を表示しない
      expect(document.body).not.toHaveTextContent(CONN_1);
      expect(document.body).not.toHaveTextContent(CONN_2);
      expect(document.body).not.toHaveTextContent(USER_A.id);
    });

    it('接続が無ければ無いことを示し、表を出さない', async () => {
      installFetch({
        [`GET ${ADMIN_PATH}`]: [page([])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();

      expect(await screen.findByText('外部アプリの接続はありません。')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('読み込み中は進捗を示す', async () => {
      const pending = deferred<Response>();
      installFetch({
        [`GET ${ADMIN_PATH}`]: [pending.promise],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();

      expect(await screen.findByText('読み込み中...')).toBeInTheDocument();
      await act(async () => {
        pending.resolve(page([conn1]));
      });
      expect(await findRowAsync('山田 太郎', 'Claude')).toBeInTheDocument();
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });
  });

  describe('絞り込み（49.7）', () => {
    it('利用者を選んで絞り込むと、その利用者の ID を送り 1 ページ目へ戻る', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [
          (url) =>
            url.searchParams.get('userId') === USER_B.id
              ? page([conn2, conn3])
              : page([conn1, conn2]),
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();
      await findRowAsync('山田 太郎', 'Claude');

      const select = screen.getByRole('combobox', { name: '利用者' });
      await waitFor(() =>
        expect(
          within(select).getByRole('option', { name: '佐藤 花子（hanako@example.com）' })
        ).toBeInTheDocument()
      );
      await user.selectOptions(select, '佐藤 花子（hanako@example.com）');
      // 選んだだけでは送らない
      expect(listQueries(fetchMock)).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: '絞り込む' }));

      await waitFor(() =>
        expect(lastListQuery(fetchMock)).toEqual({ page: '1', limit: '20', userId: USER_B.id })
      );
      await findRowAsync('佐藤 花子', '積算ツール');
      await waitFor(() => expect(findRow('山田 太郎', 'Claude')).toBeNull());
      // 送るのは利用者の ID で、表示名やメールアドレスを送らない
      expect(lastListQuery(fetchMock).userId).toBe(USER_B.id);
    });

    it('アプリの client ID で絞り込むと、前後の空白を除いた完全一致の値を送る', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [
          (url) =>
            url.searchParams.get('clientId') === 'estimate-tool'
              ? page([conn2])
              : page([conn1, conn2]),
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();
      await findRowAsync('山田 太郎', 'Claude');

      await user.type(
        screen.getByRole('textbox', { name: 'アプリの client ID' }),
        '  estimate-tool '
      );
      await user.click(screen.getByRole('button', { name: '絞り込む' }));

      await waitFor(() =>
        expect(lastListQuery(fetchMock)).toEqual({
          page: '1',
          limit: '20',
          clientId: 'estimate-tool',
        })
      );
      await waitFor(() => expect(findRow('山田 太郎', 'Claude')).toBeNull());
      expect(findRow('佐藤 花子', '積算ツール')).not.toBeNull();
    });

    it('利用者とアプリを合わせて絞り込み、条件に合う接続が無ければそう示す', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1, conn2]), page([])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();
      await findRowAsync('山田 太郎', 'Claude');
      const select = screen.getByRole('combobox', { name: '利用者' });
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
      await user.selectOptions(select, '山田 太郎（taro@example.com）');
      await user.type(screen.getByRole('textbox', { name: 'アプリの client ID' }), 'estimate-tool');
      await user.click(screen.getByRole('button', { name: '絞り込む' }));

      expect(await screen.findByText('条件に合う接続はありません。')).toBeInTheDocument();
      expect(lastListQuery(fetchMock)).toEqual({
        page: '1',
        limit: '20',
        userId: USER_A.id,
        clientId: 'estimate-tool',
      });
    });

    it.each([
      ['全角の文字', 'クロード'],
      ['256 文字', 'a'.repeat(256)],
      ['制御文字を含む値', 'app\tid'],
    ])('不正なアプリの client ID（%s）は送らず、欄の下に誤りを示す', async (_label, value) => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();
      await findRowAsync('山田 太郎', 'Claude');

      const input = screen.getByRole('textbox', { name: 'アプリの client ID' });
      await user.click(input);
      await user.paste(value);
      await user.click(screen.getByRole('button', { name: '絞り込む' }));

      const error = await screen.findByText(
        'アプリの client ID は半角の英数字・記号で 255 文字以内で入力してください'
      );
      expect(error).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input.getAttribute('aria-describedby') ?? '').toContain(error.id);
      expect(input).toHaveFocus();
      expect(listQueries(fetchMock)).toHaveLength(1);
    });

    it('利用者の一覧を読めなければ利用者の ID の入力にし、UUID でない値は送らない', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1, conn2])],
        [`GET ${USERS_PATH}`]: [json(403, { error: 'Forbidden', code: 'PERMISSION_DENIED' })],
      });

      renderRoute();
      await findRowAsync('山田 太郎', 'Claude');

      const input = await screen.findByRole('textbox', { name: '利用者の ID' });
      expect(screen.queryByRole('combobox', { name: '利用者' })).not.toBeInTheDocument();
      await user.type(input, 'not-a-uuid');
      await user.click(screen.getByRole('button', { name: '絞り込む' }));

      expect(
        await screen.findByText('利用者の ID は UUID の形式で入力してください')
      ).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(listQueries(fetchMock)).toHaveLength(1);

      await user.clear(input);
      await user.type(input, USER_B.id.toUpperCase());
      await user.click(screen.getByRole('button', { name: '絞り込む' }));

      await waitFor(() =>
        expect(lastListQuery(fetchMock)).toEqual({
          page: '1',
          limit: '20',
          // 利用者の ID は DB で大文字と小文字を区別するので、小文字にして送る
          userId: USER_B.id,
        })
      );
      expect(
        screen.queryByText('利用者の ID は UUID の形式で入力してください')
      ).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('条件をクリアすると絞り込みを外して 1 ページ目を読み直す', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1, conn2])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();
      await findRowAsync('山田 太郎', 'Claude');
      const input = screen.getByRole('textbox', { name: 'アプリの client ID' });
      await user.type(input, 'claude-connector');
      await user.click(screen.getByRole('button', { name: '絞り込む' }));
      await waitFor(() => expect(lastListQuery(fetchMock).clientId).toBe('claude-connector'));

      await user.click(screen.getByRole('button', { name: '条件をクリア' }));

      await waitFor(() => expect(lastListQuery(fetchMock)).toEqual({ page: '1', limit: '20' }));
      expect(input).toHaveValue('');
      expect(screen.getByRole('combobox', { name: '利用者' })).toHaveValue('');
    });
  });

  describe('ページの切り替え（49.7）', () => {
    it('既存のページ送りでページと件数を切り替え、絞り込みを保つ', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [
          (url) => {
            const current = Number(url.searchParams.get('page'));
            const limit = Number(url.searchParams.get('limit'));
            const rows = current === 1 ? [conn1] : current === 2 ? [conn2] : [conn3];
            return page(rows, { page: current, limit, total: 45 });
          },
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();
      await findRowAsync('山田 太郎', 'Claude');
      const pagination = screen.getByRole('navigation', { name: 'ページネーション' });
      expect(within(pagination).getByTestId('total-count')).toHaveTextContent('45');
      expect(within(pagination).getByTestId('total-pages')).toHaveTextContent('3');

      await user.type(
        screen.getByRole('textbox', { name: 'アプリの client ID' }),
        'claude-connector'
      );
      await user.click(screen.getByRole('button', { name: '絞り込む' }));
      await waitFor(() => expect(lastListQuery(fetchMock).clientId).toBe('claude-connector'));

      await user.click(within(pagination).getByRole('button', { name: '次のページ' }));
      await waitFor(() =>
        expect(lastListQuery(fetchMock)).toEqual({
          page: '2',
          limit: '20',
          clientId: 'claude-connector',
        })
      );
      await findRowAsync('佐藤 花子', '積算ツール');
      expect(within(pagination).getByTestId('current-page')).toHaveTextContent('2');

      await user.click(within(pagination).getByRole('button', { name: 'ページ 3' }));
      await waitFor(() => expect(lastListQuery(fetchMock).page).toBe('3'));
      await findRowAsync('佐藤 花子', 'Claude');

      await user.selectOptions(
        within(pagination).getByRole('combobox', { name: '表示件数' }),
        '50'
      );
      await waitFor(() =>
        expect(lastListQuery(fetchMock)).toEqual({
          page: '1',
          limit: '50',
          clientId: 'claude-connector',
        })
      );
    });
  });

  describe('取り消し（49.8）', () => {
    it('利用者とアプリを示した確認のダイアログを出し、まだ送らない', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1, conn2])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();
      const dialog = await openRevokeDialog(user, '佐藤 花子', '積算ツール');

      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveTextContent(
        '佐藤 花子（hanako@example.com）の「積算ツール」の接続を取り消しますか？'
      );
      expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toHaveFocus();
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);

      await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    });

    it('確定すると CSRF 付きで DELETE を送り、行を消して表示中のページを読み直し、知らせる', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1, conn2]), page([conn2])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
        [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [new Response(null, { status: 204 })],
      });

      renderRoute();
      const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

      await waitFor(() => expect(findRow('山田 太郎', 'Claude')).toBeNull());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(findRow('佐藤 花子', '積算ツール')).not.toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(
        '山田 太郎の「Claude」の接続を取り消しました。'
      );

      const deletes = callsTo(fetchMock, 'DELETE', `${ADMIN_PATH}/${CONN_1}`);
      expect(deletes).toHaveLength(1);
      const init = deletes[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
      expect(init.body).toBeUndefined();
      // 本人用の経路は使わない
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          new URL(String(input)).pathname.startsWith('/api/v1/external-app-connections')
        )
      ).toHaveLength(0);
      // 表示中のページを同じ条件で読み直す
      await waitFor(() => expect(listQueries(fetchMock)).toHaveLength(2));
      expect(lastListQuery(fetchMock)).toEqual({ page: '1', limit: '20' });

      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 1, name: '外部アプリの接続' })).toHaveFocus()
      );
    });

    it('CSRF の不一致では一度だけ取り直して送り直す', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1]), page([])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
        [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [
          json(403, { error: 'Invalid CSRF token', code: 'CSRF_TOKEN_INVALID' }),
          new Response(null, { status: 204 }),
        ],
      });

      renderRoute();
      const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

      expect(await screen.findByText('外部アプリの接続はありません。')).toBeInTheDocument();
      const deletes = callsTo(fetchMock, 'DELETE', `${ADMIN_PATH}/${CONN_1}`);
      expect(deletes).toHaveLength(2);
      expect(
        ((deletes[1]?.[1] as RequestInit).headers as Record<string, string>)['X-CSRF-Token']
      ).toBe('csrf-2');
    });

    it('すでに終了していた接続（404）は読み直し、読み直せたら終了済みと一覧の更新を知らせる', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1, conn2]), page([conn2])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
        [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [
          json(404, { error: 'External app connection not found', code: 'CONNECTION_NOT_FOUND' }),
        ],
      });

      renderRoute();
      const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          '山田 太郎の「Claude」の接続はすでに終了していました。一覧を更新しました。'
        )
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(findRow('山田 太郎', 'Claude')).toBeNull();
      expect(findRow('佐藤 花子', '積算ツール')).not.toBeNull();
      expect(listQueries(fetchMock)).toHaveLength(2);
    });

    it('404 の後の読み直しに失敗したら「一覧を更新しました」を残さず、失敗の案内へフォーカスを移す', async () => {
      const user = userEvent.setup();
      installFetch({
        [`GET ${ADMIN_PATH}`]: [
          page([conn1, conn2]),
          unavailable(),
          unavailable(),
          unavailable(),
          unavailable(),
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
        [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [
          json(404, { error: 'External app connection not found', code: 'CONNECTION_NOT_FOUND' }),
        ],
      });

      renderRoute();
      const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

      const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
      expect(alert).toHaveTextContent('接続の一覧を読み込めませんでした');
      await waitFor(() => expect(alert).toHaveFocus());
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('山田 太郎の「Claude」の接続はすでに終了していました。');
      expect(status).not.toHaveTextContent('一覧を更新しました');
    });

    it.each([
      ['503', () => unavailable(), '接続を取り消せませんでした。時間をおいて再試行してください。'],
      [
        'システム管理者でない（403）',
        () => json(403, { error: 'Forbidden', code: 'SYSTEM_ADMIN_REQUIRED' }),
        '接続を取り消す権限がありません。接続の取り消しはシステム管理者だけが行えます。',
      ],
      [
        'Origin の不一致（403）',
        () => json(403, { error: 'Forbidden', code: 'CSRF_ORIGIN_MISMATCH' }),
        '接続を取り消せませんでした。ページを読み込み直してから、もう一度お試しください。',
      ],
    ])(
      '取り消しの失敗（%s）はダイアログに案内を出してフォーカスを移し、行を残す',
      async (_label, reply, message) => {
        const user = userEvent.setup();
        const fetchMock = installFetch({
          [`GET ${ADMIN_PATH}`]: [page([conn1])],
          [`GET ${USERS_PATH}`]: [usersResponse()],
          [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [reply()],
        });

        renderRoute();
        const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
        await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent(message);
        await waitFor(() => expect(alert).toHaveFocus());
        expect(alert).toHaveAttribute('tabindex', '-1');
        // 自動で送り直さない
        expect(callsTo(fetchMock, 'DELETE', `${ADMIN_PATH}/${CONN_1}`)).toHaveLength(1);
        expect(findRow('山田 太郎', 'Claude')).not.toBeNull();
        expect(within(dialog).getByRole('button', { name: '取り消す' })).toBeEnabled();
        expect(screen.getByRole('status')).toHaveTextContent('');
      }
    );

    it('取り消しの通信に失敗したらネットワークの確認を促す', async () => {
      const user = userEvent.setup();
      installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });
      const listFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          throw new TypeError('Failed to fetch');
        }
        return listFetch(input, init);
      }) as typeof globalThis.fetch;

      renderRoute();
      const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

      const alert = await within(dialog).findByRole('alert', {}, { timeout: 5000 });
      expect(alert).toHaveTextContent('ネットワーク接続を確認して、もう一度お試しください。');
    });

    it('送信中は二重の送信を受けず、ダイアログを閉じず、フォーカスをダイアログの見出しに置く', async () => {
      const user = userEvent.setup();
      const pending = deferred<Response>();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1]), page([])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
        [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [pending.promise],
      });

      renderRoute();
      const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

      await waitFor(() =>
        expect(callsTo(fetchMock, 'DELETE', `${ADMIN_PATH}/${CONN_1}`)).toHaveLength(1)
      );
      const busy = within(dialog).getByRole('button', { name: '取り消し中...' });
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute('aria-busy', 'true');
      expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      // 押したボタンが無効になってもフォーカスを body へ落とさない
      expect(within(dialog).getByRole('heading', { name: '接続の取り消し' })).toHaveFocus();
      await user.click(busy);
      await user.keyboard('{Escape}');
      expect(screen.getByRole('dialog', { name: '接続の取り消し' })).toBeInTheDocument();

      await act(async () => {
        pending.resolve(new Response(null, { status: 204 }));
      });

      expect(await screen.findByText('外部アプリの接続はありません。')).toBeInTheDocument();
      expect(callsTo(fetchMock, 'DELETE', `${ADMIN_PATH}/${CONN_1}`)).toHaveLength(1);
    });

    it('取り消しの後の古い一覧の応答を捨て、取り消した行を戻さない', async () => {
      const user = userEvent.setup();
      const staleRefresh = deferred<Response>();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [
          page([conn1, conn2, conn3]),
          // 1 件目の取り消しの後の読み直し（conn2 を含む古い応答。後から届く）
          staleRefresh.promise,
          // 2 件目の取り消しの後の読み直し
          page([conn3]),
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
        [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [new Response(null, { status: 204 })],
        [`DELETE ${ADMIN_PATH}/${CONN_2}`]: [new Response(null, { status: 204 })],
      });

      renderRoute();
      let dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));
      await waitFor(() => expect(findRow('山田 太郎', 'Claude')).toBeNull());
      await waitFor(() => expect(listQueries(fetchMock)).toHaveLength(2));

      dialog = await openRevokeDialog(user, '佐藤 花子', '積算ツール');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));
      await waitFor(() => expect(listQueries(fetchMock)).toHaveLength(3));
      await waitFor(() => expect(findRow('佐藤 花子', '積算ツール')).toBeNull());

      await act(async () => {
        staleRefresh.resolve(page([conn2, conn3]));
      });

      expect(findRow('佐藤 花子', '積算ツール')).toBeNull();
      expect(findRow('佐藤 花子', 'Claude')).not.toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(
        '佐藤 花子の「積算ツール」の接続を取り消しました。'
      );
    });

    it('取り消しで表示中のページが空になったら最後のページへ寄せる', async () => {
      const user = userEvent.setup();
      let revoked = false;
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [
          (url) => {
            const current = Number(url.searchParams.get('page'));
            if (!revoked) {
              return current === 1
                ? page([conn2], { page: 1, total: 21 })
                : page([conn1], { page: 2, total: 21 });
            }
            return current === 1
              ? page([conn2], { page: 1, total: 20, totalPages: 1 })
              : page([], { page: 2, total: 20, totalPages: 1 });
          },
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
        [`DELETE ${ADMIN_PATH}/${CONN_1}`]: [
          () => {
            revoked = true;
            return new Response(null, { status: 204 });
          },
        ],
      });

      renderRoute();
      await findRowAsync('佐藤 花子', '積算ツール');
      await user.click(screen.getByRole('button', { name: '次のページ' }));
      await waitFor(() => expect(lastListQuery(fetchMock).page).toBe('2'));
      const dialog = await openRevokeDialog(user, '山田 太郎', 'Claude');
      await user.click(within(dialog).getByRole('button', { name: '取り消す' }));

      await waitFor(() => expect(lastListQuery(fetchMock).page).toBe('1'));
      await findRowAsync('佐藤 花子', '積算ツール');
      expect(listQueries(fetchMock).map((query) => query.get('page'))).toEqual([
        '1',
        '2',
        '2',
        '1',
      ]);
    });
  });

  describe('一覧の失敗', () => {
    it('システム管理者でない（403）なら権限が無いことを示し、絞り込みと再試行を出さない', async () => {
      installFetch({
        [`GET ${ADMIN_PATH}`]: [json(403, { error: 'Forbidden', code: 'SYSTEM_ADMIN_REQUIRED' })],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'この画面を使う権限がありません。接続の管理はシステム管理者だけが行えます。'
      );
      expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
      expect(screen.queryByRole('search')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('条件の不正（400）は条件の見直しを促す', async () => {
      installFetch({
        [`GET ${ADMIN_PATH}`]: [
          json(400, { error: 'Validation failed', code: 'VALIDATION_ERROR' }),
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('絞り込みの条件が正しくありません。条件を見直してください。');
      expect(screen.getByRole('search', { name: '接続の絞り込み' })).toBeInTheDocument();
    });

    it('一時的な障害（503）は再試行を促し、再試行の間と失敗の後にフォーカスを落とさず、成功で一覧を示す', async () => {
      const user = userEvent.setup();
      const firstRetry = deferred<Response>();
      const retried = deferred<Response>();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [
          // API クライアントが GET の 503 を 3 回まで送り直すので 4 回とも 503 にする
          unavailable(),
          unavailable(),
          unavailable(),
          unavailable(),
          // 1 回目の再試行も失敗（最初の応答を止めて、待っている間のフォーカスを確かめる）
          firstRetry.promise,
          unavailable(),
          unavailable(),
          unavailable(),
          retried.promise,
        ],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      renderRoute();

      let alert = await screen.findByRole('alert', {}, { timeout: 5000 });
      expect(alert).toHaveTextContent(
        '接続の一覧を読み込めませんでした。時間をおいて再試行してください。'
      );
      await user.click(within(alert).getByRole('button', { name: '再試行' }));
      // 押したボタンが消えても見出しにフォーカスを置く
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: '外部アプリの接続' })).toHaveFocus();
      await act(async () => {
        firstRetry.resolve(unavailable());
      });

      alert = await screen.findByRole('alert', {}, { timeout: 5000 });
      await waitFor(() => expect(alert).toHaveFocus());
      expect(alert).toHaveAttribute('tabindex', '-1');

      await user.click(within(alert).getByRole('button', { name: '再試行' }));
      await act(async () => {
        retried.resolve(page([conn1]));
      });
      expect(await findRowAsync('山田 太郎', 'Claude')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(callsTo(fetchMock, 'GET', ADMIN_PATH)).toHaveLength(9);
    });

    it('通信に失敗したらネットワークの確認を促す', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        if (new URL(String(input)).pathname === USERS_PATH) return usersResponse();
        throw new TypeError('Failed to fetch');
      }) as typeof globalThis.fetch;

      renderRoute();

      const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
      expect(alert).toHaveTextContent('ネットワーク接続を確認してください');
      expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });
  });

  describe('経路の保護と管理メニュー', () => {
    it('admin のロールを持たない利用者には既存の管理者ルートと同じ権限なしの表示を出し、一覧を要求しない', async () => {
      const fetchMock = installFetch({});

      renderRoute({ ...adminUser, id: 'user-1', roles: ['user'] });

      expect(
        await screen.findByRole('heading', { name: 'アクセス権限がありません' })
      ).toBeInTheDocument();
      expect(callsTo(fetchMock, 'GET', ADMIN_PATH)).toHaveLength(0);
      expect(
        screen.queryByRole('heading', { level: 1, name: '外部アプリの接続' })
      ).not.toBeInTheDocument();
    });

    it('管理メニューの「外部アプリの接続」から開け、システム設定は末尾のまま', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetch({
        [`GET ${ADMIN_PATH}`]: [page([conn1])],
        [`GET ${USERS_PATH}`]: [usersResponse()],
      });

      const router = renderRoute(adminUser, '/admin/audit-logs');
      // 監査ログの画面の要求は扱わないので、遷移の前に fetch を差し替える
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname === ADMIN_PATH || pathname === USERS_PATH || pathname === '/csrf-token') {
          return fetchMock(input, init);
        }
        // 監査ログの一覧（配列）
        return json(200, []);
      }) as typeof globalThis.fetch;

      await user.click(await screen.findByRole('button', { name: /管理メニュー/ }));
      const items = screen.getAllByRole('menuitem');
      const item = screen.getByRole('menuitem', { name: '外部アプリの接続' });
      expect(item).toHaveAttribute('data-testid', 'admin-menu-external-app-connections');
      expect(items[items.length - 1]).toHaveTextContent('システム設定');
      expect(items[items.length - 2]).toBe(item);
      await user.click(item);

      await waitFor(() => expect(router.state.location.pathname).toBe(PAGE_PATH));
      expect(
        await screen.findByRole('heading', { level: 1, name: '外部アプリの接続' })
      ).toBeInTheDocument();
      await findRowAsync('山田 太郎', 'Claude');
    });
  });
});
