/**
 * 2FA 設定の画面の、認証アプリの変更（再登録）の手順のテスト（user-authentication タスク47.9）
 *
 * - 2FA 登録済みの利用者には「認証アプリを変更する」の手順を表示し、新規の設定の開始（/2fa/setup）を呼ばない
 * - 現在のコードを reenroll/start へ、新しいコードを reenroll/confirm へ送り、応答の QR・秘密鍵・
 *   バックアップコードを各段に表示する
 * - 応答の誤りの code ごとに案内を出し分ける
 * - 2FA 未登録の利用者には新規の設定の手順を表示し、有効化で利用者が更新されても手順を切り替えない
 *
 * Requirements (user-authentication):
 * - 34.11: 2FA 設定画面で現在の TOTP コードによる再登録を行い、新しい秘密鍵とバックアップコードに置き換える
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { TwoFactorSetupPage } from '../../pages/TwoFactorSetupPage';
import { AuthContext, type AuthContextValue, type User } from '../../contexts/AuthContext';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: {
      post: vi.fn(),
    },
  };
});

import { apiClient, ApiError } from '../../api/client';

const NEW_SECRET = 'KRUGS4ZANFZSAYJAONSWG4TFOQQGW2LZEBTG64RANVQW45LBNQQGK3TUOJ4Q';
const QR_CODE_DATA_URL = 'data:image/png;base64,bmV3LXFy';
const NEW_BACKUP_CODES = ['NEWA1111', 'NEWB2222'];

const enrolledUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  roles: ['user'],
  twoFactorEnabled: true,
  mustChangePassword: false,
};

function createAuthValue(user: User): AuthContextValue {
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

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderPage(user: User) {
  const tree = (value: AuthContextValue) => (
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/profile/2fa-setup']}>
        <Routes>
          <Route path="/profile/2fa-setup" element={<TwoFactorSetupPage />} />
          <Route path="*" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  const { rerender } = render(tree(createAuthValue(user)));
  return {
    rerenderWithUser: (next: User) => rerender(tree(createAuthValue(next))),
  };
}

/** 応答の本文の code を持つ API の誤り */
function apiError(statusCode: number, code: string): ApiError {
  return new ApiError(statusCode, 'error', { error: 'error', code });
}

/** reenroll/start と reenroll/confirm の応答を与える（それ以外の経路は失敗させる） */
function mockReenrollApi(options?: {
  start?: () => Promise<unknown>;
  confirm?: () => Promise<unknown>;
}) {
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/v1/auth/2fa/reenroll/start') {
      return options?.start
        ? options.start()
        : { qrCodeDataUrl: QR_CODE_DATA_URL, secretForManualEntry: NEW_SECRET };
    }
    if (path === '/api/v1/auth/2fa/reenroll/confirm') {
      return options?.confirm ? options.confirm() : { backupCodes: NEW_BACKUP_CODES };
    }
    throw new Error(`unexpected path: ${path}`);
  });
}

async function submitCurrentCode(user: ReturnType<typeof userEvent.setup>, code = '123456') {
  await user.type(await screen.findByLabelText('現在の認証コード'), code);
  await user.click(screen.getByRole('button', { name: '次へ' }));
}

async function submitNewCode(user: ReturnType<typeof userEvent.setup>, code = '654321') {
  await screen.findByRole('heading', { name: '新しい認証アプリでQRコードをスキャン' });
  await user.click(screen.getByRole('button', { name: '次へ' }));
  await user.type(screen.getByLabelText('新しい認証アプリの認証コード'), code);
  await user.click(screen.getByRole('button', { name: '確認' }));
}

describe('TwoFactorSetupPage（認証アプリの変更の手順、要件34.11）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('2FA 登録済みの利用者には認証アプリの変更の手順を表示し、新規の設定を開始しない', async () => {
    mockReenrollApi();
    renderPage(enrolledUser);

    expect(
      await screen.findByRole('heading', { name: '認証アプリを変更する' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('現在の認証コード')).toBeInTheDocument();
    // 新規の設定の部品（6 桁の分かれた入力欄）は表示しない
    expect(screen.queryByLabelText('認証コード 1桁目')).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('現在のコードを reenroll/start へ送り、応答の新しい QR と秘密鍵を表示する', async () => {
    const user = userEvent.setup();
    mockReenrollApi();
    renderPage(enrolledUser);

    await submitCurrentCode(user);

    expect(
      await screen.findByRole('img', { name: '新しい認証アプリ用の二要素認証QRコード' })
    ).toHaveAttribute('src', QR_CODE_DATA_URL);
    expect(screen.getByTestId('reenroll-secret-key')).toHaveTextContent(NEW_SECRET);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/2fa/reenroll/start', {
      currentCode: '123456',
    });
  });

  it('新しいコードを reenroll/confirm へ送り、応答の新しいバックアップコードを表示する', async () => {
    const user = userEvent.setup();
    mockReenrollApi();
    renderPage(enrolledUser);

    await submitCurrentCode(user);
    await submitNewCode(user);

    await screen.findByRole('heading', { name: 'バックアップコードを保存' });
    expect(screen.getAllByTestId('backup-code-item').map((el) => el.textContent)).toEqual(
      NEW_BACKUP_CODES
    );
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/auth/2fa/reenroll/confirm', {
      newCode: '654321',
    });
  });

  it('現在のコードの誤り（INVALID_TOTP_CODE）では、現在の認証アプリのコードを求める案内を出す', async () => {
    const user = userEvent.setup();
    mockReenrollApi({ start: () => Promise.reject(apiError(400, 'INVALID_TOTP_CODE')) });
    renderPage(enrolledUser);

    await submitCurrentCode(user, '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証コードが正しくありません。いま使っている認証アプリに表示されているコードを入力してください'
    );
    expect(screen.getByLabelText('現在の認証コード')).toBeInTheDocument();
  });

  it('2FA が未登録（TWO_FACTOR_NOT_ENABLED）のときは変更できないことを知らせる', async () => {
    const user = userEvent.setup();
    mockReenrollApi({ start: () => Promise.reject(apiError(400, 'TWO_FACTOR_NOT_ENABLED')) });
    renderPage(enrolledUser);

    await submitCurrentCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '二要素認証が登録されていないため、認証アプリを変更できません'
    );
  });

  it('開始のその他の失敗では一般の案内を出す', async () => {
    const user = userEvent.setup();
    mockReenrollApi({ start: () => Promise.reject(new Error('network')) });
    renderPage(enrolledUser);

    await submitCurrentCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証アプリの変更を開始できませんでした'
    );
  });

  it('新しいコードの誤り（INVALID_TOTP_CODE）では、新しい認証アプリのコードを求める案内を出す', async () => {
    const user = userEvent.setup();
    mockReenrollApi({ confirm: () => Promise.reject(apiError(400, 'INVALID_TOTP_CODE')) });
    renderPage(enrolledUser);

    await submitCurrentCode(user);
    await submitNewCode(user, '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証コードが正しくありません。新しい認証アプリに表示されているコードを入力してください'
    );
    expect(screen.getByLabelText('新しい認証アプリの認証コード')).toBeInTheDocument();
  });

  it('再登録が開始されていない（REENROLLMENT_NOT_STARTED）ときは、現在のコードの入力からやり直させる', async () => {
    const user = userEvent.setup();
    mockReenrollApi({ confirm: () => Promise.reject(apiError(400, 'REENROLLMENT_NOT_STARTED')) });
    renderPage(enrolledUser);

    await submitCurrentCode(user);
    await submitNewCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証アプリの変更が開始されていません。現在の認証コードの入力からやり直してください'
    );
    expect(screen.getByLabelText('現在の認証コード')).toHaveValue('');
  });

  it('確認のその他の失敗では一般の案内を出す', async () => {
    const user = userEvent.setup();
    mockReenrollApi({ confirm: () => Promise.reject(new Error('network')) });
    renderPage(enrolledUser);

    await submitCurrentCode(user);
    await submitNewCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証アプリの変更を確認できませんでした'
    );
  });

  it('バックアップコードの保存の後の完了で、変更の完了を知らせてプロフィールへ戻る', async () => {
    const user = userEvent.setup();
    mockReenrollApi();
    renderPage(enrolledUser);

    await submitCurrentCode(user);
    await submitNewCode(user);
    await user.click(
      await screen.findByRole('checkbox', { name: 'バックアップコードを安全な場所に保存しました' })
    );
    await user.click(screen.getByRole('button', { name: '完了' }));

    expect(await screen.findByText('認証アプリを変更しました')).toBeInTheDocument();
    expect(await screen.findByTestId('current-path', {}, { timeout: 3000 })).toHaveTextContent(
      '/profile'
    );
  });

  it('キャンセルでプロフィールへ戻り、何も送らない', async () => {
    const user = userEvent.setup();
    mockReenrollApi();
    renderPage(enrolledUser);

    await user.click(await screen.findByRole('button', { name: 'キャンセル' }));

    expect(await screen.findByTestId('current-path')).toHaveTextContent('/profile');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  /**
   * この画面は AuthContext の利用者の更新で再描画される。再描画で手順が最初へ戻ったり、
   * 入力中の段が失われたりしない（タスク47.6 で設定の部品が関数の参照の変化で設定をやり直した欠陥と同型）
   */
  it('利用者の状態の更新で再描画されても、進んだ段を保つ', async () => {
    const user = userEvent.setup();
    mockReenrollApi();
    const { rerenderWithUser } = renderPage(enrolledUser);

    await submitCurrentCode(user);
    await screen.findByTestId('reenroll-secret-key');
    rerenderWithUser({ ...enrolledUser, displayName: 'Renamed' });

    expect(screen.getByTestId('reenroll-secret-key')).toHaveTextContent(NEW_SECRET);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('2FA 未登録の利用者には新規の設定の手順を表示し、有効化で利用者が更新されても変更の手順へ切り替えない', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === '/api/v1/auth/2fa/setup') {
        return { secret: 'JBSWY3DPEHPK3PXP', qrCodeDataUrl: QR_CODE_DATA_URL };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const notEnrolled = { ...enrolledUser, twoFactorEnabled: false };
    const { rerenderWithUser } = renderPage(notEnrolled);

    expect(await screen.findByLabelText('認証コード 1桁目')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '認証アプリを変更する' })).not.toBeInTheDocument();

    rerenderWithUser(enrolledUser);

    expect(screen.getByLabelText('認証コード 1桁目')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '認証アプリを変更する' })).not.toBeInTheDocument();
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/2fa/setup', {}));
    expect(apiClient.post).not.toHaveBeenCalledWith(
      '/api/v1/auth/2fa/reenroll/start',
      expect.anything()
    );
  });
});
