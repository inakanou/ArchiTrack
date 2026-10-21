/**
 * @fileoverview 利用者の状態による API の拒否と画面の遷移の制限の E2E テスト
 *
 * user-authentication タスク47.6。design.md「利用者の状態の照合」「AuthContext・ProtectedRoute（変更）」。
 * - 2FA 未登録の利用者はログインの後に 2FA 設定の画面へ進み、他の画面へ遷移できず、2FA の設定と
 *   ログアウト以外の API は 403 になる。設定の完了で元の遷移先へ戻る（要件34.1〜34.4）
 * - 2FA を再設定された利用者も、次のログインで 2FA 設定の画面へ進む（要件34.8。管理者の再設定の操作は
 *   47.8 で入るため、ここでは DB で再設定の結果（2FA 未登録）を作る）
 * - 初回のパスワード変更を要する利用者は `/setup/password` だけを開け、変更の完了でログイン画面へ戻り、
 *   再びログインした後に 2FA 設定の画面へ進む（要件37.7・34.1）
 * - 無効化された利用者の API とリフレッシュは 401 になり、画面はログイン画面へ戻る（要件36.1。無効化の
 *   操作は 49.2 で入るため、ここでは DB で無効化し、状態のキャッシュを無効化する）
 *
 * 状態を変える検証は専用の利用者（DEDICATED_USERS）で行い、各テストの開始時に初期化する（47.4）。
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { resetDedicatedUser, type CreatedUser } from '../../fixtures/auth.fixtures';
import { loginAsUser, loginWithCredentials, submitLoginForm } from '../../helpers/auth-actions';
import { invalidateUserStateCache } from '../../helpers/user-state-cache';
import { fillTotpCode, totpCodeFromSetupPage } from '../../helpers/two-factor-totp';
import { getTimeout } from '../../helpers/wait-helpers';

const TWO_FACTOR_SETUP_URL = /\/profile\/2fa-setup$/;
const PASSWORD_SETUP_URL = /\/setup\/password$/;

/** 応答が指定のパスへの要求か（オリジンは問わない） */
function isPath(response: Response, method: string, path: string): boolean {
  return response.request().method() === method && new URL(response.url()).pathname === path;
}

/** 画面の API クライアントで要求を送り、状態コードとエラーコードを返す */
async function requestFromPage(
  page: Page,
  path: string
): Promise<{ status: number; code: string | null }> {
  return page.evaluate(async (target) => {
    const client = (window as unknown as { __apiClient?: { get: (p: string) => Promise<unknown> } })
      .__apiClient;
    if (!client) {
      return { status: -1, code: null };
    }
    try {
      await client.get(target);
      return { status: 200, code: null };
    } catch (error) {
      const failure = error as { statusCode?: number; response?: { code?: unknown } };
      return {
        status: Number(failure.statusCode ?? 0),
        code: typeof failure.response?.code === 'string' ? failure.response.code : null,
      };
    }
  }, path);
}

/** 制限中の画面にナビゲーションが無く、ログアウトだけが置かれていることを確かめる */
async function expectRestrictedLayout(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
}

/**
 * 2FA 設定の画面が設定の開始（秘密鍵の発行と監査の記録の取引）を終えるまで待つ
 *
 * 取引が残ったまま次の検証が DB を初期化するとデッドロックしうるため、画面に秘密鍵が出るまで待つ
 */
async function waitForTwoFactorSetupStarted(page: Page): Promise<void> {
  await expect(page).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
  await expect(page.getByTestId('secret-key')).toBeVisible({ timeout: getTimeout(15000) });
}

/** 2FA 設定の画面で 2FA を設定し、完了する */
async function completeTwoFactorSetup(page: Page): Promise<void> {
  await fillTotpCode(page, await totpCodeFromSetupPage(page, getTimeout(15000)));
  await page.getByRole('button', { name: /検証|確認/i }).click();
  await page.getByRole('checkbox', { name: /保存しました|確認しました/i }).check();
  await page.getByRole('button', { name: /完了/i }).click();
}

test.describe('利用者の状態による API の拒否と画面の遷移の制限', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * @requirement user-authentication/REQ-34.1
   * @requirement user-authentication/REQ-34.2
   * @requirement user-authentication/REQ-34.3
   * @requirement user-authentication/REQ-34.4
   * @requirement user-authentication/REQ-33.9
   */
  test('2FA 未登録の利用者はログインの後に 2FA 設定の画面だけを開け、設定の完了で元の遷移先へ戻る', async ({
    page,
  }) => {
    const user: CreatedUser = await resetDedicatedUser('TWO_FA_NOT_ENROLLED_USER');

    // 保護された画面を開くとログイン画面へ移り、遷移先が保存される
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
    const loginResponsePromise = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/login')
    );
    await submitLoginForm(page, user);
    const loginResponse = await loginResponsePromise;

    // ログインの応答（2FA 未登録の利用者はトークンを返す）: 状態を載せ、リフレッシュトークンを本文に含めない（要件33.9）
    expect(loginResponse.status()).toBe(200);
    const loginBody = (await loginResponse.json()) as Record<string, unknown>;
    expect(loginBody.requires2FA).toBeUndefined();
    expect(typeof loginBody.accessToken).toBe('string');
    expect(loginBody).not.toHaveProperty('refreshToken');
    expect(loginBody.user).toMatchObject({
      email: user.email,
      twoFactorEnabled: false,
      mustChangePassword: false,
    });

    // 要件34.1: パスワードの検証の後、2FA 設定の画面へ進む
    await expect(page).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    await expect(page.getByRole('heading', { name: '2要素認証の設定' })).toBeVisible();
    await expectRestrictedLayout(page);

    // 要件34.2: 2FA の設定とログアウト以外の API は 403 で拒否される（/me も含む）
    expect(await requestFromPage(page, '/api/projects')).toEqual({
      status: 403,
      code: 'TWO_FACTOR_SETUP_REQUIRED',
    });
    expect(await requestFromPage(page, '/api/v1/auth/me')).toEqual({
      status: 403,
      code: 'TWO_FACTOR_SETUP_REQUIRED',
    });

    // 要件34.3: 他の画面の URL を開いても 2FA 設定の画面へ置き換わる
    for (const path of ['/dashboard', '/profile', '/setup/password', '/trading-partners']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    }

    // 要件34.4: 設定を完了すると、置き換えの前に開こうとした画面へ戻る
    await page.goto('/projects');
    await expect(page).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    await completeTwoFactorSetup(page);
    await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });
    await expect(page.getByRole('navigation').first()).toBeVisible();
    expect(await requestFromPage(page, '/api/projects')).toEqual({ status: 200, code: null });
  });

  /**
   * @requirement user-authentication/REQ-34.8
   */
  test('2FA を再設定された利用者は、次のログインで 2FA 設定の画面へ進む', async ({ page }) => {
    const user = await resetDedicatedUser('STATE_CHANGE_USER');
    const prisma = getPrismaClient();
    // 管理者による 2FA の再設定（47.8）の結果を DB で作る: 秘密鍵とバックアップコードを消し、全セッションを失効させる
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastUsedStep: null },
      }),
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);
    await invalidateUserStateCache([user.id]);

    await loginAsUser(page, { ...user, twoFactorEnabled: false });

    await expect(page).toHaveURL(TWO_FACTOR_SETUP_URL, { timeout: getTimeout(15000) });
    await expectRestrictedLayout(page);
    await page.goto('/dashboard');
    await waitForTwoFactorSetupStarted(page);
  });

  /**
   * @requirement user-authentication/REQ-37.7
   * @requirement user-authentication/REQ-34.1
   * @requirement user-authentication/REQ-34.2
   */
  test('初回のパスワード変更を要する利用者は変更の画面だけを開け、変更の後に再びログインすると 2FA 設定の画面へ進む', async ({
    page,
  }) => {
    const user = await resetDedicatedUser('PASSWORD_CHANGE_REQUIRED_USER');
    const newPassword = 'ChangedInitial456!';

    await loginAsUser(page, user);

    // 要件37.7: パスワード変更の画面へ進み、他の画面へは遷移させない
    await expect(page).toHaveURL(PASSWORD_SETUP_URL, { timeout: getTimeout(15000) });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('初回のパスワード変更');
    await expectRestrictedLayout(page);
    for (const path of ['/dashboard', '/profile', '/profile/2fa-setup', '/admin/users']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(PASSWORD_SETUP_URL, { timeout: getTimeout(15000) });
    }

    // 要件34.2 の例外: パスワード変更とログアウト以外（2FA の設定を含む）は 403 で拒否される
    expect(await requestFromPage(page, '/api/v1/auth/me')).toEqual({
      status: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
    });

    // 変更の完了でログイン画面へ戻る（全てのリフレッシュトークンが失効する）
    const changeResponsePromise = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/password/change')
    );
    await page.getByLabel('現在のパスワード').fill(user.password);
    await page.getByLabel('新しいパスワード', { exact: true }).fill(newPassword);
    await page.getByLabel('パスワード確認').fill(newPassword);
    await page.getByRole('button', { name: 'パスワードを変更' }).click();
    await page.getByRole('button', { name: 'はい、変更する' }).click();
    const changeResponse = await changeResponsePromise;
    expect(changeResponse.status()).toBe(200);
    expect(((await changeResponse.json()) as { user?: unknown }).user).toMatchObject({
      mustChangePassword: false,
    });
    await expect(page).toHaveURL(/\/login$/, { timeout: getTimeout(15000) });
    await expect(page.getByText('パスワードを変更しました。')).toBeVisible();
    const stored = await getPrismaClient().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mustChangePassword: true },
    });
    expect(stored.mustChangePassword).toBe(false);

    // 要件34.1: 新しいパスワードで再びログインすると、2FA 設定の画面へ進む
    await loginWithCredentials(page, user.email, newPassword, true, { twoFactorEnabled: false });
    await waitForTwoFactorSetupStarted(page);
  });

  test('初回のパスワード変更の画面は 375px の幅で横にはみ出さず、入力は 16px・操作は 44px 以上で表示する', async ({
    page,
  }) => {
    const user = await resetDedicatedUser('PASSWORD_CHANGE_REQUIRED_USER');
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsUser(page, user);
    await expect(page).toHaveURL(PASSWORD_SETUP_URL, { timeout: getTimeout(15000) });
    await expect(page.getByLabel('現在のパスワード')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    for (const label of ['現在のパスワード', '新しいパスワード', 'パスワード確認']) {
      await expect(page.getByLabel(label, { exact: true })).toHaveCSS('font-size', '16px');
    }
    for (const name of ['パスワードを変更', 'ログアウト']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    }
  });

  /**
   * @requirement user-authentication/REQ-36.1
   */
  test('無効化された利用者の API とリフレッシュは 401 で拒否され、画面はログイン画面へ戻る', async ({
    page,
  }) => {
    const user = await resetDedicatedUser('STATE_CHANGE_USER');
    await loginAsUser(page, user);
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/projects$/);
    expect(await requestFromPage(page, '/api/projects')).toEqual({ status: 200, code: null });

    // 管理者による無効化（49.2）の結果を DB で作り、状態を変える処理と同じく状態のキャッシュを無効化する
    await getPrismaClient().user.update({
      where: { id: user.id },
      data: { isActive: false, deactivatedAt: new Date(), deactivationReason: 'E2E の検証' },
    });
    await invalidateUserStateCache([user.id]);

    // API は 401 ACCOUNT_DISABLED、続くリフレッシュも 401 ACCOUNT_DISABLED（後継のトークンを発行しない）
    const apiResponsePromise = page.waitForResponse(
      (r) => isPath(r, 'GET', '/api/projects') && r.status() === 401
    );
    const refreshResponsePromise = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/refresh')
    );
    const result = await requestFromPage(page, '/api/projects');
    const apiResponse = await apiResponsePromise;
    const refreshResponse = await refreshResponsePromise;
    expect(((await apiResponse.json()) as { code?: unknown }).code).toBe('ACCOUNT_DISABLED');
    expect(refreshResponse.status()).toBe(401);
    expect(((await refreshResponse.json()) as { code?: unknown }).code).toBe('ACCOUNT_DISABLED');
    expect(result.status).toBe(401);

    // 再読み込みでセッションは復元されず、ログイン画面へ戻る
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });
  });
});
