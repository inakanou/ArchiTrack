/**
 * システム設定の画面（AdminSettingsPage）・管理メニューの入口・管理者のルートのテスト
 *
 * estimate-request の design.md の章「Requirements 43-50」の D8（タスク119.2）。
 * 外部の AI での読み取りの今の状態の表示、停止・再開（確認の後に版を添えて PUT）、
 * 版の競合のときの最新の状態の読み直し、読み込みの失敗と再試行、
 * 管理メニューの「システム設定」からの遷移、管理者でない利用者がルートを開けないことを確かめる。
 */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue, type User } from '../../contexts/AuthContext';
import { AdminSettingsPage } from '../../pages/AdminSettingsPage';
import { AppHeader } from '../../components/Navigation/AppHeader';
import { routes } from '../../routes';
import { ApiError, apiClient } from '../../api/client';

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
const mockedPut = vi.mocked(apiClient.put);

const SETTING_PATH = '/api/v1/admin/settings/external-ai-reading';

const adminUser: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: '管理者',
  roles: ['admin'],
  permissions: ['*:*'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};

const generalUser: User = {
  ...adminUser,
  id: 'user-9',
  roles: ['user'],
  permissions: ['project:read'],
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

function renderPage() {
  return render(
    <AuthContext.Provider value={createAuthValue(adminUser)}>
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

/** 設定の取得の要求の数 */
function settingGetCount(): number {
  return mockedGet.mock.calls.filter(([path]) => path === SETTING_PATH).length;
}

/** 外部の AI での読み取りの欄 */
async function findSettingSection() {
  return screen.findByRole('region', { name: '外部のAIでの読み取り' });
}

function conflictError(expectedVersion: number, actualVersion: number) {
  return new ApiError(409, '設定は他の管理者により変更されました', {
    code: 'SYSTEM_SETTING_CONFLICT',
    details: { expectedVersion, actualVersion },
  });
}

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('今の状態の表示', () => {
    it('有効のときは「有効」と停止の操作を出す', async () => {
      mockedGet.mockResolvedValue({ enabled: true, version: 3 });
      renderPage();

      expect(
        await screen.findByRole('heading', { level: 1, name: 'システム設定' })
      ).toBeInTheDocument();
      const section = await findSettingSection();
      expect(await within(section).findByTestId('external-ai-reading-state')).toHaveTextContent(
        '有効'
      );
      expect(within(section).getByRole('button', { name: '停止する' })).toBeInTheDocument();
      expect(within(section).queryByRole('button', { name: '再開する' })).not.toBeInTheDocument();
      expect(mockedGet).toHaveBeenCalledWith(SETTING_PATH);
    });

    it('止まっているときは「停止中」と再開の操作を出す', async () => {
      mockedGet.mockResolvedValue({ enabled: false, version: 4 });
      renderPage();

      const section = await findSettingSection();
      expect(await within(section).findByTestId('external-ai-reading-state')).toHaveTextContent(
        '停止中'
      );
      expect(within(section).getByRole('button', { name: '再開する' })).toBeInTheDocument();
      expect(within(section).queryByRole('button', { name: '停止する' })).not.toBeInTheDocument();
    });
  });

  describe('停止と再開', () => {
    it('確認で停止を選ぶと、読んだ版を添えて止め、成功を知らせて表示を停止中へ変える', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue({ enabled: true, version: 3 });
      mockedPut.mockResolvedValue({ enabled: false, version: 4 });
      renderPage();

      const section = await findSettingSection();
      await user.click(await within(section).findByRole('button', { name: '停止する' }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('端末での読み取り');
      // 確認の前には要求を送らない
      expect(mockedPut).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: '停止する' }));

      await waitFor(() =>
        expect(mockedPut).toHaveBeenCalledWith(SETTING_PATH, { enabled: false, version: 3 })
      );
      expect(await screen.findByRole('status')).toHaveTextContent('停止しました');
      expect(within(section).getByTestId('external-ai-reading-state')).toHaveTextContent('停止中');
      expect(within(section).getByRole('button', { name: '再開する' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('確認で再開を選ぶと、読んだ版を添えて有効へ戻し、次の操作は新しい版を送る', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue({ enabled: false, version: 4 });
      mockedPut
        .mockResolvedValueOnce({ enabled: true, version: 5 })
        .mockResolvedValueOnce({ enabled: false, version: 6 });
      renderPage();

      const section = await findSettingSection();
      await user.click(await within(section).findByRole('button', { name: '再開する' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: '再開する' })
      );

      await waitFor(() =>
        expect(mockedPut).toHaveBeenCalledWith(SETTING_PATH, { enabled: true, version: 4 })
      );
      expect(await screen.findByRole('status')).toHaveTextContent('再開しました');
      expect(within(section).getByTestId('external-ai-reading-state')).toHaveTextContent('有効');

      await user.click(within(section).getByRole('button', { name: '停止する' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: '停止する' })
      );
      await waitFor(() =>
        expect(mockedPut).toHaveBeenLastCalledWith(SETTING_PATH, { enabled: false, version: 5 })
      );
    });

    it('確認を取り消すと要求を送らず、状態も変えない', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue({ enabled: true, version: 3 });
      renderPage();

      const section = await findSettingSection();
      await user.click(await within(section).findByRole('button', { name: '停止する' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'キャンセル' })
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockedPut).not.toHaveBeenCalled();
      expect(within(section).getByTestId('external-ai-reading-state')).toHaveTextContent('有効');
    });
  });

  describe('版の競合', () => {
    it('他の管理者が先に変えていたら、そのことを示して最新の状態を読み直す', async () => {
      const user = userEvent.setup();
      mockedGet
        .mockResolvedValueOnce({ enabled: true, version: 3 })
        .mockResolvedValueOnce({ enabled: false, version: 4 });
      mockedPut.mockRejectedValue(conflictError(3, 4));
      renderPage();

      const section = await findSettingSection();
      await user.click(await within(section).findByRole('button', { name: '停止する' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: '停止する' })
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('他の管理者');
      expect(alert).toHaveTextContent('最新の状態');
      await waitFor(() => expect(settingGetCount()).toBe(2));
      expect(await within(section).findByTestId('external-ai-reading-state')).toHaveTextContent(
        '停止中'
      );
      expect(within(section).getByRole('button', { name: '再開する' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('失敗', () => {
    it('読み込みに失敗したら誤りを示し、再試行で読み直す', async () => {
      const user = userEvent.setup();
      mockedGet
        .mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'))
        .mockResolvedValueOnce({ enabled: true, version: 1 });
      renderPage();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('読み込めませんでした');
      expect(screen.queryByRole('button', { name: '停止する' })).not.toBeInTheDocument();

      await user.click(within(alert).getByRole('button', { name: '再試行' }));

      const section = await findSettingSection();
      expect(await within(section).findByTestId('external-ai-reading-state')).toHaveTextContent(
        '有効'
      );
      expect(settingGetCount()).toBe(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('変更に失敗したら確認の中に誤りを示し、状態は変えない', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue({ enabled: true, version: 3 });
      mockedPut.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
      renderPage();

      const section = await findSettingSection();
      await user.click(await within(section).findByRole('button', { name: '停止する' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '停止する' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('変更できませんでした');
      expect(within(section).getByTestId('external-ai-reading-state')).toHaveTextContent('有効');
    });

    it('権限が無いと言われたら、その旨を示す', async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue({ enabled: true, version: 3 });
      mockedPut.mockRejectedValue(new ApiError(403, 'Forbidden'));
      renderPage();

      const section = await findSettingSection();
      await user.click(await within(section).findByRole('button', { name: '停止する' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '停止する' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('権限がありません');
    });
  });
});

describe('管理メニューの「システム設定」', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('管理者の管理メニューに置き、システム設定の画面へ遷移する', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/dashboard', element: <AppHeader /> },
        { path: '/admin/settings', element: <div>システム設定の画面へ遷移した</div> },
      ],
      { initialEntries: ['/dashboard'] }
    );
    render(
      <AuthContext.Provider value={createAuthValue(adminUser)}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    );

    await user.click(screen.getByRole('button', { name: /管理メニュー/ }));
    const item = screen.getByRole('menuitem', { name: 'システム設定' });
    expect(item).toHaveAttribute('data-testid', 'admin-menu-settings');
    await user.click(item);

    expect(await screen.findByText('システム設定の画面へ遷移した')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/settings');
  });

  it('一般ユーザーには管理メニューも「システム設定」も出さない', () => {
    render(
      <AuthContext.Provider value={createAuthValue(generalUser)}>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.queryByRole('button', { name: /管理メニュー/ })).not.toBeInTheDocument();
    expect(screen.queryByText('システム設定')).not.toBeInTheDocument();
  });
});

describe('/admin/settings のルート', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue({ enabled: true, version: 1 });
  });

  function renderRoute(user: User) {
    const router = createMemoryRouter(routes, { initialEntries: ['/admin/settings'] });
    render(
      <AuthContext.Provider value={createAuthValue(user)}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    );
    return router;
  }

  it('管理者はシステム設定の画面を開ける', async () => {
    renderRoute(adminUser);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'システム設定' })
    ).toBeInTheDocument();
    const section = await findSettingSection();
    expect(await within(section).findByTestId('external-ai-reading-state')).toHaveTextContent(
      '有効'
    );
  });

  it('一般ユーザーは開けず、設定も要求しない', async () => {
    renderRoute(generalUser);

    expect(
      await screen.findByRole('heading', { name: 'アクセス権限がありません' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'システム設定' })).not.toBeInTheDocument();
    // 描画の後の非同期の取得の機会を与えてから確かめる
    await act(async () => {
      await Promise.resolve();
    });
    expect(settingGetCount()).toBe(0);
  });
});
