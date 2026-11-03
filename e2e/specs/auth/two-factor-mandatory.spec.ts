/**
 * @fileoverview 2FA の全ユーザー必須化と初回のパスワード変更の E2E テスト（通しの流れ）
 *
 * user-authentication タスク47.10。design.md「利用者の状態の照合」「AuthContext・ProtectedRoute（変更）」
 * 「TwoFactorService（再登録）」。
 *
 * Requirements coverage (user-authentication):
 * - 37.7: 初期管理者（初回の変更を要する管理者の専用の利用者）の初回ログインでパスワード変更の画面だけが開く
 * - 34.1: パスワードの変更と再ログインの後、2FA 設定の画面へ進む
 * - 34.2: 2FA 未登録の間、2FA の設定とログアウト以外の API（管理者の API・書き込み・再登録・
 *   パスワード変更を含む）が 403 になる
 * - 34.3: 2FA 未登録の間、他の画面の URL を開いても 2FA 設定の画面へ戻る
 * - 34.4: 2FA の設定の後、置き換えの前に開こうとした画面へ進む
 * - 34.6: 必須化の流れで登録した利用者の 2FA の無効化の要求が 403 になり、2FA が有効のまま残る
 * - 34.11: 再登録（現在のコード → 新しい QR → 新しいコード → 新しいバックアップコード）の後、
 *   新しい秘密鍵とバックアップコードだけが通り、以前のものは拒否される
 *
 * 既存の spec との分担: 一般の利用者の 2FA 未登録のログインの応答本文と制限（34.1〜34.4・33.9）と
 * 初回変更の画面の 375px の表示は user-state-restriction.spec.ts、招待経由の登録の直後の 2FA 設定の
 * 画面（34.5）は register.spec.ts、共有の 2FA 利用者の無効化の拒否と画面の導線（34.6）は
 * two-factor.spec.ts が主張する。本 spec は、初期管理者の初回ログインから 2FA の登録・無効化の拒否
 * までを一続きで、また再登録の前後の秘密鍵とバックアップコードの切り替わりを主張する。
 *
 * 状態を変える検証は専用の利用者（DEDICATED_USERS）で行い、各テストの開始時に初期化する（47.4）。
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 */

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Response,
} from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createTwoFactorBackupCodes, resetDedicatedUser } from '../../fixtures/auth.fixtures';
import { loginAsUser, loginWithCredentials, submitLoginForm } from '../../helpers/auth-actions';
import { SAME_ORIGIN_API_BASE_URL } from '../../config';
import { assertPrepared } from '../../helpers/preconditions';
import {
  E2E_TOTP_SECRET,
  fillTotpCode,
  generateTotpCode,
  prepareTotpCode,
  totpCodeFromSetupPage,
} from '../../helpers/two-factor-totp';
import { getTimeout } from '../../helpers/wait-helpers';

const TWO_FACTOR_SETUP_URL = /\/profile\/2fa-setup$/;
const PASSWORD_SETUP_URL = /\/setup\/password$/;
const BASE32_SECRET = /^[A-Z2-7]+=*$/;

/** 応答が指定のパスへの要求か（オリジンは問わない） */
function isPath(response: Response, method: string, path: string): boolean {
  return response.request().method() === method && new URL(response.url()).pathname === path;
}

/** 画面の API クライアントで要求を送り、状態コードとエラーコードを返す */
async function requestFromPage(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; code: string | null }> {
  return page.evaluate(
    async ({ method: m, path: target, body: payload }) => {
      const client = (
        window as unknown as {
          __apiClient?: {
            get: (p: string) => Promise<unknown>;
            post: (p: string, b?: unknown) => Promise<unknown>;
          };
        }
      ).__apiClient;
      if (!client) {
        return { status: -1, code: null };
      }
      try {
        if (m === 'GET') {
          await client.get(target);
        } else {
          await client.post(target, payload ?? {});
        }
        return { status: 200, code: null };
      } catch (error) {
        const failure = error as { statusCode?: number; response?: { code?: unknown } };
        return {
          status: Number(failure.statusCode ?? 0),
          code: typeof failure.response?.code === 'string' ? failure.response.code : null,
        };
      }
    },
    { method, path, body }
  );
}

/** 制限中の画面にナビゲーションが無く、ログアウトだけが置かれていることを確かめる */
async function expectRestrictedLayout(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
}

/** 応答本文のエラーのコード */
async function errorCodeOf(response: APIResponse): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

/** パスワードの検証を通し、ログインの応答の 2FA 待ちの資格を返す */
async function issueChallenge(
  context: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const response = await context.post(`${SAME_ORIGIN_API_BASE_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { requires2FA?: unknown; challengeToken?: unknown };
  expect(body.requires2FA).toBe(true);
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : null;
  assertPrepared(challengeToken, 'ログインの応答の 2FA 待ちの資格');
  return challengeToken;
}

test.describe('2FA の全ユーザー必須化と初回のパスワード変更（通しの流れ）', () => {
  test.describe.configure({ mode: 'serial' });

  const openedRequestContexts: APIRequestContext[] = [];

  test.afterEach(async () => {
    while (openedRequestContexts.length > 0) {
      await openedRequestContexts.pop()?.dispose();
    }
  });

  /**
   * @requirement user-authentication/REQ-37.7
   * @requirement user-authentication/REQ-34.1
   * @requirement user-authentication/REQ-34.2
   * @requirement user-authentication/REQ-34.3
   * @requirement user-authentication/REQ-34.4
   * @requirement user-authentication/REQ-34.6
   */
  test('初期管理者は初回ログインでパスワード変更の画面だけを開け、変更・再ログインの後に 2FA を設定して元の画面へ進み、2FA を無効化できない', async ({
    page,
  }) => {
    const user = await resetDedicatedUser('PASSWORD_CHANGE_REQUIRED_USER');
    // 初期管理者と同じく、管理者のロールを持ち、初回の変更を要し、2FA 未登録である（前提の確認）
    expect(user.roles).toContain('admin');
    expect(user.mustChangePassword).toBe(true);
    expect(user.twoFactorEnabled).toBe(false);
    const newPassword = 'MandatoryFlow789!';

    // 管理者の画面を開くとログイン画面へ移り、そこからログインする
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login/);
    await submitLoginForm(page, user);

    // 要件37.7: 初回ログインではパスワード変更の画面だけが開く（要求した管理者の画面へも 2FA 設定へも進まない）
    await expect(page).toHaveURL(PASSWORD_SETUP_URL, { timeout: getTimeout(15000) });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('初回のパスワード変更');
    await expectRestrictedLayout(page);
    for (const path of ['/admin/users', '/profile/2fa-setup', '/projects']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(PASSWORD_SETUP_URL, { timeout: getTimeout(15000) });
    }
    await expect(page.getByLabel('現在のパスワード')).toBeVisible();

    // パスワードを変更すると、ログイン画面へ戻る
    const changeResponsePromise = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/password/change')
    );
    await page.getByLabel('現在のパスワード').fill(user.password);
    await page.getByLabel('新しいパスワード', { exact: true }).fill(newPassword);
    await page.getByLabel('パスワード確認').fill(newPassword);
    await page.getByRole('button', { name: 'パスワードを変更' }).click();
    await page.getByRole('button', { name: 'はい、変更する' }).click();
    expect((await changeResponsePromise).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: getTimeout(15000) });

    // 要件34.1: 新しいパスワードで再びログインすると、2FA 設定の画面へ進む
    await loginWithCredentials(page, user.email, newPassword, true, { twoFactorEnabled: false });
    await expect(page).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    await expect(page.getByRole('heading', { name: '2要素認証の設定' })).toBeVisible();
    await expectRestrictedLayout(page);

    // 要件34.3: 他の画面（初回の変更の画面を含む）の URL を開いても 2FA 設定の画面へ戻る
    for (const path of ['/dashboard', '/admin/audit-logs', '/setup/password', '/profile']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    }

    // 最後に管理者の画面を開いて置き換えさせる（この画面が設定の後の遷移先として保存される）。
    // 2FA の設定の開始の API は許され、画面に秘密鍵が出る（セッションの復元の完了も兼ねて待つ）
    const setupResponsePromise = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/2fa/setup')
    );
    await page.goto('/admin/users');
    await expect(page).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    expect((await setupResponsePromise).status()).toBe(200);
    await expect(page.getByTestId('secret-key')).toHaveText(BASE32_SECRET, {
      timeout: getTimeout(15000),
    });

    // 要件34.2: 2FA の設定とログアウト以外の API は、管理者の API・書き込み・再登録・パスワード変更も
    // 含めて 403 で拒否される（初回の変更を終えた後は、パスワード変更の例外も無い）
    const rejectedRequests: Array<{
      method: 'GET' | 'POST';
      path: string;
      body?: Record<string, unknown>;
    }> = [
      { method: 'GET', path: '/api/v1/audit-logs' },
      { method: 'GET', path: '/api/v1/roles' },
      { method: 'GET', path: '/api/trading-partners' },
      { method: 'POST', path: '/api/projects', body: { name: '制限中の書き込み' } },
      { method: 'POST', path: '/api/v1/auth/2fa/reenroll/start', body: { currentCode: '000000' } },
      {
        method: 'POST',
        path: '/api/v1/auth/password/change',
        body: { currentPassword: newPassword, newPassword: 'Another123456!' },
      },
    ];
    for (const { method, path, body } of rejectedRequests) {
      expect(await requestFromPage(page, method, path, body), `${method} ${path}`).toEqual({
        status: 403,
        code: 'TWO_FACTOR_SETUP_REQUIRED',
      });
    }

    // 要件34.4: 2FA を設定すると、置き換えの前に開こうとした管理者の画面へ進む
    await fillTotpCode(page, await totpCodeFromSetupPage(page, getTimeout(15000)));
    await page.getByRole('button', { name: /検証|確認/i }).click();
    await page.getByRole('checkbox', { name: /保存しました|確認しました/i }).check();
    await page.getByRole('button', { name: /完了/i }).click();
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: getTimeout(15000) });
    await expect(page.getByRole('navigation').first()).toBeVisible();
    // 制限が解け、拒否されていた管理者の API が通る
    expect(await requestFromPage(page, 'GET', '/api/v1/audit-logs')).toEqual({
      status: 200,
      code: null,
    });

    // 要件34.6: 必須化の流れで登録した 2FA は、利用者自身の無効化の要求で外せない
    expect(
      await requestFromPage(page, 'POST', '/api/v1/auth/2fa/disable', { password: newPassword })
    ).toEqual({ status: 403, code: 'TWO_FACTOR_DISABLE_NOT_ALLOWED' });
    const stored = await getPrismaClient().user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        mustChangePassword: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        _count: { select: { twoFactorBackupCodes: true } },
      },
    });
    expect(stored.mustChangePassword).toBe(false);
    expect(stored.twoFactorEnabled).toBe(true);
    expect(stored.twoFactorSecret).not.toBeNull();
    expect(stored._count.twoFactorBackupCodes).toBe(10);
  });

  /**
   * @requirement user-authentication/REQ-34.11
   */
  test('認証アプリの再登録で新しい秘密鍵とバックアップコードに置き換わり、以前の秘密鍵とバックアップコードは拒否される', async ({
    page,
  }) => {
    const user = await resetDedicatedUser('STATE_CHANGE_USER');
    expect(user.twoFactorEnabled).toBe(true);
    // 再登録の前のバックアップコード（再登録で使えなくなることを確かめる）
    const [oldBackupCode] = await createTwoFactorBackupCodes({ userId: user.id, count: 2 });
    assertPrepared(oldBackupCode, '再登録の前のバックアップコード');
    const prisma = getPrismaClient();
    const readTwoFactor = () =>
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          twoFactorEnabled: true,
          twoFactorSecret: true,
          twoFactorPendingSecret: true,
          twoFactorBackupCodes: { select: { usedAt: true } },
        },
      });
    const before = await readTwoFactor();
    assertPrepared(before.twoFactorSecret, '再登録の前の秘密鍵');

    await loginAsUser(page, user);
    await page.goto('/profile');
    await page.getByRole('link', { name: '認証アプリを変更する' }).click();
    await expect(page).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    await expect(page.getByRole('heading', { name: '認証アプリを変更する' })).toBeVisible();

    // 段1: 現在の認証アプリのコードで再登録を始める
    await expect(page.getByRole('heading', { name: '現在の認証コードを入力' })).toBeVisible();
    await page
      .getByLabel('現在の認証コード')
      .fill(await prepareTotpCode(user.email, E2E_TOTP_SECRET));
    const startResponsePromise = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/2fa/reenroll/start')
    );
    await page.getByRole('button', { name: '次へ' }).click();
    expect((await startResponsePromise).status()).toBe(200);

    // 段2: 新しい QR コードと手入力用の秘密鍵が出る（以前の秘密鍵と異なる）
    await expect(
      page.getByRole('heading', { name: '新しい認証アプリでQRコードをスキャン' })
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: '新しい認証アプリ用の二要素認証QRコード' })
    ).toHaveAttribute('src', /^data:image\//);
    const secretText = page.getByTestId('reenroll-secret-key');
    await expect(secretText).toHaveText(BASE32_SECRET);
    const newSecret = (await secretText.textContent())?.trim() ?? '';
    expect(newSecret).not.toBe(E2E_TOTP_SECRET);
    // 確認までは以前の秘密鍵が採用されたまま
    const pending = await readTwoFactor();
    expect(pending.twoFactorSecret).toBe(before.twoFactorSecret);
    expect(pending.twoFactorPendingSecret).not.toBeNull();
    await page.getByRole('button', { name: '次へ' }).click();

    // 段3: 新しい認証アプリのコードで確かめる
    await expect(page.getByRole('heading', { name: '新しい認証コードを入力' })).toBeVisible();
    await page
      .getByLabel('新しい認証アプリの認証コード')
      .fill(await prepareTotpCode(user.email, newSecret));
    const confirmResponsePromise = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/2fa/reenroll/confirm')
    );
    await page.getByRole('button', { name: '確認', exact: true }).click();
    expect((await confirmResponsePromise).status()).toBe(200);

    // 段4: 新しいバックアップコードが 10 個出る
    await expect(page.getByRole('heading', { name: 'バックアップコードを保存' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: '認証アプリを変更しました。' })
    ).toBeVisible();
    const backupItems = page.getByTestId('backup-code-item');
    await expect(backupItems).toHaveCount(10);
    const newBackupCodes = (await backupItems.allTextContents()).map((code) => code.trim());
    expect(newBackupCodes).not.toContain(oldBackupCode.code);
    await page.getByRole('checkbox', { name: /保存しました/ }).check();
    await page.getByRole('button', { name: '完了' }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: getTimeout(15000) });

    // 秘密鍵が置き換わり、バックアップコードは新しい 10 個だけになる
    const after = await readTwoFactor();
    expect(after.twoFactorEnabled).toBe(true);
    expect(after.twoFactorSecret).not.toBe(before.twoFactorSecret);
    expect(after.twoFactorPendingSecret).toBeNull();
    expect(after.twoFactorBackupCodes).toHaveLength(10);
    expect(after.twoFactorBackupCodes.every((c) => c.usedAt === null)).toBe(true);

    // 以前の秘密鍵のコードはログインの 2FA の検証で拒否され、新しい秘密鍵のコードは受理される
    const totpContext = await playwrightRequest.newContext();
    openedRequestContexts.push(totpContext);
    const totpChallenge = await issueChallenge(totpContext, user.email, user.password);
    const oldCode = await prepareTotpCode(user.email, E2E_TOTP_SECRET);
    expect(oldCode, '以前と新しい秘密鍵のコードが偶然一致した').not.toBe(
      generateTotpCode(newSecret)
    );
    const rejectedTotp = await totpContext.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/v1/auth/verify-2fa`,
      {
        data: { challengeToken: totpChallenge, code: oldCode },
      }
    );
    expect(rejectedTotp.status()).toBe(401);
    expect(await errorCodeOf(rejectedTotp)).toBe('INVALID_2FA_CODE');
    const acceptedTotp = await totpContext.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/v1/auth/verify-2fa`,
      {
        data: { challengeToken: totpChallenge, code: await prepareTotpCode(user.email, newSecret) },
      }
    );
    expect(acceptedTotp.status()).toBe(200);

    // 以前のバックアップコードは拒否され、新しいバックアップコードは受理される
    const backupContext = await playwrightRequest.newContext();
    openedRequestContexts.push(backupContext);
    const backupChallenge = await issueChallenge(backupContext, user.email, user.password);
    const rejectedBackup = await backupContext.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/v1/auth/verify-2fa/backup`,
      { data: { challengeToken: backupChallenge, backupCode: oldBackupCode.code } }
    );
    expect(rejectedBackup.status()).toBe(401);
    expect(await errorCodeOf(rejectedBackup)).toBe('INVALID_BACKUP_CODE');
    const acceptedBackup = await backupContext.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/v1/auth/verify-2fa/backup`,
      { data: { challengeToken: backupChallenge, backupCode: newBackupCodes[0] } }
    );
    expect(acceptedBackup.status()).toBe(200);
  });
});
