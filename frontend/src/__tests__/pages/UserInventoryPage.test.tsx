/**
 * ユーザー棚卸し画面（UserInventoryPage）・管理メニューの入口・管理者のルートのテスト
 *
 * タスク49.6: 列・絞り込み・ページ送り・各操作の要求（理由を含む）・自分自身の行の操作の無効・
 * 失敗の文言・一般ユーザーにメニューの入口が無くルートも開けないことを確かめる。
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 管理者が他の利用者の 2FA を再設定する操作が `POST /api/v1/users/:id/2fa/reset` を送る
 * - REQ-36.10: 表示名・メールアドレス・ロール・状態・2FA 登録の有無・最終ログイン日時・作成日時・招待者を表示する
 * - REQ-36.11: 状態と最終ログインからの経過日数で絞り込む
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue, type User } from '../../contexts/AuthContext';
import { UserInventoryPage } from '../../pages/UserInventoryPage';
import { AppHeader } from '../../components/Navigation/AppHeader';
import { routes } from '../../routes';
import { ApiError, apiClient } from '../../api/client';
import type { UserInventoryItem, UserInventoryResponse } from '../../api/user-inventory';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

const INVENTORY_PATH = '/api/v1/users/inventory';

const adminUser: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: '管理者',
  roles: ['admin'],
  permissions: ['*:*'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};

function createAuthValue(user: User | null = adminUser): AuthContextValue {
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

const selfItem: UserInventoryItem = {
  id: 'admin-1',
  displayName: '管理者',
  email: 'admin@example.com',
  roles: ['admin'],
  status: 'active',
  twoFactorEnabled: true,
  lastLoginAt: '2026-10-20T01:02:03.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  invitedBy: null,
};

const activeItem: UserInventoryItem = {
  id: 'user-2',
  displayName: '山田太郎',
  email: 'yamada@example.com',
  roles: ['admin', 'user'],
  status: 'active',
  twoFactorEnabled: true,
  lastLoginAt: '2026-09-01T09:30:00.000Z',
  createdAt: '2026-02-03T04:05:06.000Z',
  invitedBy: { id: 'admin-1', displayName: '管理者' },
};

const inactiveItem: UserInventoryItem = {
  id: 'user-3',
  displayName: '佐藤花子',
  email: 'sato@example.com',
  roles: ['user'],
  status: 'inactive',
  twoFactorEnabled: false,
  lastLoginAt: null,
  createdAt: '2026-03-04T05:06:07.000Z',
  invitedBy: null,
};

function inventoryResponse(
  data: UserInventoryItem[],
  pagination: Partial<UserInventoryResponse['pagination']> = {}
): UserInventoryResponse {
  return {
    data,
    pagination: {
      page: 1,
      limit: 20,
      total: data.length,
      totalPages: data.length > 0 ? 1 : 0,
      ...pagination,
    },
  };
}

function renderPage(user: User | null = adminUser) {
  return render(
    <AuthContext.Provider value={createAuthValue(user)}>
      <MemoryRouter>
        <UserInventoryPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

/** 一覧の取得の要求の URL（呼び出しの順） */
function inventoryRequests(): string[] {
  return mockedGet.mock.calls
    .map(([path]) => path)
    .filter((path) => path.startsWith(INVENTORY_PATH));
}

/** 最後の一覧の取得の要求の URL */
function lastInventoryRequest(): string | undefined {
  const requests = inventoryRequests();
  return requests[requests.length - 1];
}

async function findRow(item: UserInventoryItem): Promise<HTMLElement> {
  return screen.findByTestId(`user-inventory-row-${item.id}`);
}

describe('UserInventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(inventoryResponse([selfItem, activeItem, inactiveItem]));
    mockedPost.mockResolvedValue(undefined);
  });

  describe('列の表示（要件36.10）', () => {
    it('全ての列の見出しと各利用者の値を表示する', async () => {
      renderPage();

      const table = await screen.findByRole('table', { name: 'ユーザー棚卸しの一覧' });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
      expect(headers).toEqual([
        '表示名',
        'メールアドレス',
        'ロール',
        '状態',
        '2FA登録',
        '最終ログイン日時',
        '作成日時',
        '招待者',
        '操作',
      ]);

      const row = within(await findRow(activeItem));
      expect(row.getByRole('rowheader', { name: '山田太郎' })).toBeInTheDocument();
      expect(row.getByText('yamada@example.com')).toBeInTheDocument();
      expect(row.getByText('admin、user')).toBeInTheDocument();
      expect(row.getByText('有効')).toBeInTheDocument();
      expect(row.getByText('登録済み')).toBeInTheDocument();
      expect(
        row.getByText(new Date('2026-09-01T09:30:00.000Z').toLocaleString('ja-JP'))
      ).toBeInTheDocument();
      expect(
        row.getByText(new Date('2026-02-03T04:05:06.000Z').toLocaleString('ja-JP'))
      ).toBeInTheDocument();
      expect(row.getByText('管理者')).toBeInTheDocument();
    });

    it('無効・2FA 未登録・ログインの実績なし・招待者なしの利用者を表示する', async () => {
      renderPage();

      const rowElement = await findRow(inactiveItem);
      const row = within(rowElement);
      expect(row.getByText('無効')).toBeInTheDocument();
      expect(row.getByText('未登録')).toBeInTheDocument();
      expect(row.getByText('ログインの実績なし')).toBeInTheDocument();
      const cells = row.getAllByRole('cell');
      // 最終ログイン日時（5 番目のデータの列）と招待者（7 番目）は「—」
      expect(cells[4]).toHaveTextContent('—');
      expect(cells[6]).toHaveTextContent('—');
    });

    it('API の並び順のまま表示する', async () => {
      renderPage();

      await findRow(activeItem);
      const rowHeaders = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
      expect(rowHeaders).toEqual(['管理者', '山田太郎', '佐藤花子']);
    });

    it('一覧の取得に失敗すると利用者向けの文言を表示する', async () => {
      mockedGet.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'ユーザーの一覧を取得できませんでした'
      );
    });

    it('条件に合う利用者がいなければその旨を表示する', async () => {
      mockedGet.mockResolvedValue(inventoryResponse([]));
      renderPage();

      expect(await screen.findByText('条件に合うユーザーはいません')).toBeInTheDocument();
    });
  });

  describe('絞り込み（要件36.11）', () => {
    it('最初は条件なしで 1 ページ目を 20 件で要求する', async () => {
      renderPage();

      await findRow(activeItem);
      expect(inventoryRequests()).toEqual([`${INVENTORY_PATH}?page=1&limit=20`]);
    });

    it('状態を選ぶと status を付けて要求する', async () => {
      const user = userEvent.setup();
      renderPage();
      await findRow(activeItem);

      await user.selectOptions(screen.getByLabelText('状態'), '無効');
      await waitFor(() =>
        expect(lastInventoryRequest()).toBe(`${INVENTORY_PATH}?status=inactive&page=1&limit=20`)
      );

      await user.selectOptions(screen.getByLabelText('状態'), '有効');
      await waitFor(() =>
        expect(lastInventoryRequest()).toBe(`${INVENTORY_PATH}?status=active&page=1&limit=20`)
      );
    });

    it('経過日数を入れて絞り込むと inactiveDaysAtLeast を付けて要求する（全角の数字も受け付ける）', async () => {
      const user = userEvent.setup();
      renderPage();
      await findRow(activeItem);

      await user.type(screen.getByLabelText('最終ログインからの経過日数（以上）'), '９０');
      await user.click(screen.getByRole('button', { name: '絞り込む' }));

      await waitFor(() =>
        expect(lastInventoryRequest()).toBe(
          `${INVENTORY_PATH}?inactiveDaysAtLeast=90&page=1&limit=20`
        )
      );
    });

    it('状態と経過日数を組み合わせ、条件のクリアで条件なしへ戻す', async () => {
      const user = userEvent.setup();
      renderPage();
      await findRow(activeItem);

      await user.selectOptions(screen.getByLabelText('状態'), '有効');
      await user.type(screen.getByLabelText('最終ログインからの経過日数（以上）'), '0');
      await user.click(screen.getByRole('button', { name: '絞り込む' }));
      await waitFor(() =>
        expect(lastInventoryRequest()).toBe(
          `${INVENTORY_PATH}?status=active&inactiveDaysAtLeast=0&page=1&limit=20`
        )
      );

      await user.click(screen.getByRole('button', { name: '条件をクリア' }));
      await waitFor(() => expect(lastInventoryRequest()).toBe(`${INVENTORY_PATH}?page=1&limit=20`));
      expect(screen.getByLabelText('最終ログインからの経過日数（以上）')).toHaveValue('');
    });

    it.each(['abc', '-1', '1.5', '36501'])(
      '経過日数が不正（%s）なら要求せずに入力の誤りを示す',
      async (value) => {
        const user = userEvent.setup();
        renderPage();
        await findRow(activeItem);
        const before = inventoryRequests().length;

        const input = screen.getByLabelText('最終ログインからの経過日数（以上）');
        await user.type(input, value);
        await user.click(screen.getByRole('button', { name: '絞り込む' }));

        expect(
          await screen.findByText('経過日数は0〜36500の整数で入力してください')
        ).toBeInTheDocument();
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(inventoryRequests()).toHaveLength(before);
      }
    );

    it('日本語入力の変換中も経過日数の入力を拒まない', async () => {
      renderPage();
      await findRow(activeItem);

      const input = screen.getByLabelText('最終ログインからの経過日数（以上）');
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'きゅう' } });
      expect(input).toHaveValue('きゅう');
      fireEvent.change(input, { target: { value: '９' } });
      fireEvent.compositionEnd(input);
      expect(input).toHaveValue('９');
    });
  });

  describe('ページ送り', () => {
    it('ページ情報を表示し、次へ・前へで page を変えて要求する', async () => {
      const user = userEvent.setup();
      mockedGet.mockImplementation(async (path: string) => {
        const page = Number(new URL(path, 'http://localhost').searchParams.get('page'));
        return inventoryResponse(page === 1 ? [activeItem] : [inactiveItem], {
          page,
          total: 45,
          totalPages: 3,
        });
      });
      renderPage();

      await findRow(activeItem);
      expect(screen.getByText('1 / 3 ページ（全 45 件）')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();

      await user.click(screen.getByRole('button', { name: '次へ' }));
      await findRow(inactiveItem);
      expect(lastInventoryRequest()).toBe(`${INVENTORY_PATH}?page=2&limit=20`);
      expect(screen.getByText('2 / 3 ページ（全 45 件）')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '前へ' }));
      await findRow(activeItem);
      expect(lastInventoryRequest()).toBe(`${INVENTORY_PATH}?page=1&limit=20`);
    });

    it('絞り込みを変えると 1 ページ目へ戻す', async () => {
      const user = userEvent.setup();
      mockedGet.mockImplementation(async (path: string) => {
        const page = Number(new URL(path, 'http://localhost').searchParams.get('page'));
        return inventoryResponse([page === 1 ? activeItem : inactiveItem], {
          page,
          total: 45,
          totalPages: 3,
        });
      });
      renderPage();
      await findRow(activeItem);
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await findRow(inactiveItem);

      await user.selectOptions(screen.getByLabelText('状態'), '無効');
      await waitFor(() =>
        expect(lastInventoryRequest()).toBe(`${INVENTORY_PATH}?status=inactive&page=1&limit=20`)
      );
    });

    it('最後のページが操作で空になると、範囲内の最後のページを取り直す', async () => {
      const user = userEvent.setup();
      let total = 21;
      mockedGet.mockImplementation(async (path: string) => {
        const page = Number(new URL(path, 'http://localhost').searchParams.get('page'));
        const totalPages = Math.ceil(total / 20);
        if (page > totalPages) {
          return inventoryResponse([], { page, total, totalPages });
        }
        return inventoryResponse(page === 1 ? [activeItem] : [inactiveItem], {
          page,
          total,
          totalPages,
        });
      });
      renderPage();
      await findRow(activeItem);
      await user.click(screen.getByRole('button', { name: '次へ' }));
      const row = await findRow(inactiveItem);

      total = 20;
      await user.click(within(row).getByRole('button', { name: '佐藤花子を再有効化' }));
      await user.type(screen.getByLabelText('理由（必須）'), '復職');
      await user.click(screen.getByRole('button', { name: '再有効化する' }));

      await waitFor(() =>
        expect(inventoryRequests().slice(-2)).toEqual([
          `${INVENTORY_PATH}?page=2&limit=20`,
          `${INVENTORY_PATH}?page=1&limit=20`,
        ])
      );
      await findRow(activeItem);
    });
  });

  describe('操作（要件36.1・36.3・34.7）', () => {
    it('無効化は理由を必須とし、前後の空白を除いた理由を送って一覧を取り直す', async () => {
      const user = userEvent.setup();
      renderPage();
      const row = await findRow(activeItem);

      await user.click(within(row).getByRole('button', { name: '山田太郎を無効化' }));
      const dialog = screen.getByRole('dialog', { name: 'ユーザーを無効化' });
      expect(within(dialog).getByText('対象: 山田太郎（yamada@example.com）')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('理由（必須）')).toHaveFocus();

      // 空・空白だけの理由は送らない
      await user.type(within(dialog).getByLabelText('理由（必須）'), '   ');
      await user.click(within(dialog).getByRole('button', { name: '無効化する' }));
      expect(await within(dialog).findByText('理由を入力してください')).toBeInTheDocument();
      expect(mockedPost).not.toHaveBeenCalled();

      await user.type(within(dialog).getByLabelText('理由（必須）'), '退職のため  ');
      const requestsBefore = inventoryRequests().length;
      await user.click(within(dialog).getByRole('button', { name: '無効化する' }));

      await waitFor(() =>
        expect(mockedPost).toHaveBeenCalledWith('/api/v1/users/user-2/deactivate', {
          reason: '退職のため',
        })
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByRole('status')).toHaveTextContent('山田太郎を無効化しました');
      await waitFor(() => expect(inventoryRequests().length).toBe(requestsBefore + 1));
    });

    it('1000 文字を超える理由は送らない', async () => {
      const user = userEvent.setup();
      renderPage();
      const row = await findRow(activeItem);

      await user.click(within(row).getByRole('button', { name: '山田太郎を無効化' }));
      const reasonInput = screen.getByLabelText('理由（必須）');
      fireEvent.change(reasonInput, { target: { value: 'あ'.repeat(1001) } });
      await user.click(screen.getByRole('button', { name: '無効化する' }));

      expect(await screen.findByText('理由は1000文字以内で入力してください')).toBeInTheDocument();
      expect(mockedPost).not.toHaveBeenCalled();

      fireEvent.change(reasonInput, { target: { value: 'あ'.repeat(1000) } });
      await user.click(screen.getByRole('button', { name: '無効化する' }));
      await waitFor(() =>
        expect(mockedPost).toHaveBeenCalledWith('/api/v1/users/user-2/deactivate', {
          reason: 'あ'.repeat(1000),
        })
      );
    });

    it('無効な利用者には再有効化の操作を置き、理由を送る', async () => {
      const user = userEvent.setup();
      renderPage();
      const row = await findRow(inactiveItem);

      expect(
        within(row).queryByRole('button', { name: '佐藤花子を無効化' })
      ).not.toBeInTheDocument();
      await user.click(within(row).getByRole('button', { name: '佐藤花子を再有効化' }));
      const dialog = screen.getByRole('dialog', { name: 'ユーザーを再有効化' });
      await user.type(within(dialog).getByLabelText('理由（必須）'), '復職');
      await user.click(within(dialog).getByRole('button', { name: '再有効化する' }));

      await waitFor(() =>
        expect(mockedPost).toHaveBeenCalledWith('/api/v1/users/user-3/reactivate', {
          reason: '復職',
        })
      );
      expect(await screen.findByRole('status')).toHaveTextContent('佐藤花子を再有効化しました');
    });

    it('2FA の再設定は影響を確認してから要求を送る（要件34.7）', async () => {
      const user = userEvent.setup();
      renderPage();
      const row = await findRow(activeItem);

      await user.click(within(row).getByRole('button', { name: '山田太郎の2FAを再設定' }));
      const dialog = screen.getByRole('dialog', { name: '2FAを再設定' });
      expect(within(dialog).queryByLabelText('理由（必須）')).not.toBeInTheDocument();
      expect(within(dialog).getByText(/全ての端末からログアウト/)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toHaveFocus();
      expect(mockedPost).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: '2FAを再設定する' }));
      await waitFor(() =>
        expect(mockedPost).toHaveBeenCalledWith('/api/v1/users/user-2/2fa/reset')
      );
      expect(await screen.findByRole('status')).toHaveTextContent('山田太郎の2FAを再設定しました');
    });

    it('キャンセルと Escape では要求を送らずに閉じる', async () => {
      const user = userEvent.setup();
      renderPage();
      const row = await findRow(activeItem);

      await user.click(within(row).getByRole('button', { name: '山田太郎を無効化' }));
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(within(row).getByRole('button', { name: '山田太郎の2FAを再設定' }));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it('理由の日本語入力の変換中の Escape ではダイアログを閉じない', async () => {
      const user = userEvent.setup();
      renderPage();
      const row = await findRow(activeItem);

      await user.click(within(row).getByRole('button', { name: '山田太郎を無効化' }));
      const reasonInput = screen.getByLabelText('理由（必須）');
      fireEvent.compositionStart(reasonInput);
      fireEvent.change(reasonInput, { target: { value: 'たいしょく' } });
      fireEvent.keyDown(document, { key: 'Escape', isComposing: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(reasonInput).toHaveValue('たいしょく');

      fireEvent.change(reasonInput, { target: { value: '退職' } });
      fireEvent.compositionEnd(reasonInput);
      expect(reasonInput).toHaveValue('退職');
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('自分自身の行の操作は無効にする', async () => {
      renderPage();
      const row = within(await findRow(selfItem));

      const toggle = row.getByRole('button', { name: '管理者を無効化' });
      const reset = row.getByRole('button', { name: '管理者の2FAを再設定' });
      expect(toggle).toBeDisabled();
      expect(reset).toBeDisabled();
      expect(toggle).toHaveAccessibleDescription(
        '自分自身のアカウントはこの画面から操作できません'
      );

      // 他の利用者の行は操作できる
      const other = within(await findRow(activeItem));
      expect(other.getByRole('button', { name: '山田太郎を無効化' })).toBeEnabled();
      expect(other.getByRole('button', { name: '山田太郎の2FAを再設定' })).toBeEnabled();
    });

    it('user:manage を持たない利用者には操作の列を置かない', async () => {
      renderPage({ ...adminUser, permissions: ['user:read'] });

      const table = await screen.findByRole('table', { name: 'ユーザー棚卸しの一覧' });
      expect(within(table).queryByRole('columnheader', { name: '操作' })).not.toBeInTheDocument();
      expect(within(table).queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('操作の失敗の文言', () => {
    async function openDeactivateAndSubmit(user: ReturnType<typeof userEvent.setup>) {
      const row = await findRow(activeItem);
      await user.click(within(row).getByRole('button', { name: '山田太郎を無効化' }));
      await user.type(screen.getByLabelText('理由（必須）'), '退職');
      await user.click(screen.getByRole('button', { name: '無効化する' }));
    }

    it.each([
      [
        new ApiError(409, 'x', { code: 'LAST_ACTIVE_ADMIN_PROTECTED' }),
        '最後の有効なシステム管理者は無効化できません。先に他のシステム管理者を有効にしてください。',
      ],
      [
        new ApiError(409, 'x', { code: 'SELF_DEACTIVATION_FORBIDDEN' }),
        '自分自身のアカウントは無効化できません。',
      ],
      [
        new ApiError(400, 'x', { code: 'VALIDATION_ERROR' }),
        '理由を1000文字以内で入力してください。',
      ],
      [new ApiError(403, 'Forbidden', { code: 'FORBIDDEN' }), 'この操作を行う権限がありません。'],
      [
        new ApiError(500, 'Internal Server Error'),
        '無効化に失敗しました。時間をおいて再度お試しください。',
      ],
      [new ApiError(0, 'Network error'), '無効化に失敗しました。時間をおいて再度お試しください。'],
    ])('無効化の失敗 %#: ダイアログを開いたまま文言を示し、入力を保つ', async (error, message) => {
      const user = userEvent.setup();
      mockedPost.mockRejectedValue(error);
      renderPage();

      await openDeactivateAndSubmit(user);

      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
      expect(within(dialog).getByLabelText('理由（必須）')).toHaveValue('退職');
    });

    it.each([
      [
        new ApiError(409, 'x', { code: 'ALREADY_IN_STATE' }),
        'このユーザーは既に無効化されています。一覧を最新の状態に更新しました。',
      ],
      [
        new ApiError(404, 'x', { code: 'USER_NOT_FOUND' }),
        '対象のユーザーが見つかりません。削除された可能性があります。一覧を最新の状態に更新しました。',
      ],
    ])('表示と食い違う失敗 %#: 文言を示し、一覧を取り直す', async (error, message) => {
      const user = userEvent.setup();
      mockedPost.mockRejectedValue(error);
      renderPage();
      await findRow(activeItem);
      const before = inventoryRequests().length;

      await openDeactivateAndSubmit(user);

      expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
        message
      );
      await waitFor(() => expect(inventoryRequests().length).toBe(before + 1));
    });

    it('再有効化の ALREADY_IN_STATE は「既に有効」と示す', async () => {
      const user = userEvent.setup();
      mockedPost.mockRejectedValue(new ApiError(409, 'x', { code: 'ALREADY_IN_STATE' }));
      renderPage();
      const row = await findRow(inactiveItem);

      await user.click(within(row).getByRole('button', { name: '佐藤花子を再有効化' }));
      await user.type(screen.getByLabelText('理由（必須）'), '復職');
      await user.click(screen.getByRole('button', { name: '再有効化する' }));

      expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
        'このユーザーは既に有効です。一覧を最新の状態に更新しました。'
      );
    });

    it.each([
      [
        new ApiError(403, 'x', { code: 'SELF_RESET_FORBIDDEN' }),
        '自分自身の2FAは再設定できません。',
      ],
      [
        new ApiError(404, 'x', { code: 'USER_NOT_FOUND' }),
        '対象のユーザーが見つかりません。削除された可能性があります。一覧を最新の状態に更新しました。',
      ],
      [
        new ApiError(500, 'Internal Server Error'),
        '2FAの再設定に失敗しました。時間をおいて再度お試しください。',
      ],
    ])('2FA の再設定の失敗 %#: 文言を示す', async (error, message) => {
      const user = userEvent.setup();
      mockedPost.mockRejectedValue(error);
      renderPage();
      const row = await findRow(activeItem);

      await user.click(within(row).getByRole('button', { name: '山田太郎の2FAを再設定' }));
      await user.click(screen.getByRole('button', { name: '2FAを再設定する' }));

      expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
        message
      );
    });
  });
});

describe('管理メニューの入口', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('管理者の管理メニューに「ユーザー棚卸し」を置き、棚卸し画面へ遷移する', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/dashboard', element: <AppHeader /> },
        { path: '/admin/user-inventory', element: <div>棚卸し画面へ遷移した</div> },
      ],
      { initialEntries: ['/dashboard'] }
    );
    render(
      <AuthContext.Provider value={createAuthValue(adminUser)}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    );

    await user.click(screen.getByRole('button', { name: /管理メニュー/ }));
    await user.click(screen.getByRole('menuitem', { name: 'ユーザー棚卸し' }));

    expect(await screen.findByText('棚卸し画面へ遷移した')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/user-inventory');
  });

  it('一般ユーザーには管理メニューも「ユーザー棚卸し」も表示しない', () => {
    render(
      <AuthContext.Provider
        value={createAuthValue({
          ...adminUser,
          id: 'user-9',
          roles: ['user'],
          permissions: ['project:read'],
        })}
      >
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.queryByRole('button', { name: /管理メニュー/ })).not.toBeInTheDocument();
    expect(screen.queryByText('ユーザー棚卸し')).not.toBeInTheDocument();
  });
});

describe('/admin/user-inventory のルート', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(inventoryResponse([activeItem]));
  });

  function renderRoute(user: User) {
    const router = createMemoryRouter(routes, { initialEntries: ['/admin/user-inventory'] });
    render(
      <AuthContext.Provider value={createAuthValue(user)}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    );
    return router;
  }

  it('管理者は棚卸し画面を開ける', async () => {
    renderRoute(adminUser);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ユーザー棚卸し' })
    ).toBeInTheDocument();
    await findRow(activeItem);
  });

  it('一般ユーザーは開けず、一覧も要求しない', async () => {
    renderRoute({
      ...adminUser,
      id: 'user-9',
      roles: ['user'],
      permissions: ['project:read'],
    });

    expect(
      await screen.findByRole('heading', { name: 'アクセス権限がありません' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ユーザー棚卸し' })).not.toBeInTheDocument();
    // 画面が開かれていないことを、描画の後の非同期の取得の機会を与えてから確かめる
    await act(async () => {
      await Promise.resolve();
    });
    expect(inventoryRequests()).toHaveLength(0);
  });
});
