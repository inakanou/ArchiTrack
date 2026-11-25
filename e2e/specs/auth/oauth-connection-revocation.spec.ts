/**
 * @fileoverview 利用者の状態の変化による外部アプリの接続の失効の E2E テスト
 *
 * user-authentication タスク79.4。design.md「Requirements 46-51」の ExternalAppConnectionService（利用者の
 * 全ての接続の終了 `endAllForUser` と、その呼び出し元のパスワードの変更・全デバイスのログアウト・無効化・削除・
 * 権限の喪失・2FA の再設定）の節。試験の compose の実際の nginx（画面の配信元）・backend・DB を通す。
 * 接続はタスク79.2 と同じ同意の画面の流れ（ログイン・次の TOTP の 2FA・同意）で作る。
 *
 * Requirements coverage (user-authentication):
 * - REQ-50.1: パスワードの変更で、その利用者の全ての接続が直ちに失効する
 * - REQ-50.2: 全デバイスからのログアウトで、その利用者の全ての接続が直ちに失効する
 * - REQ-50.3: 管理者による無効化と削除で、その利用者の全ての接続が直ちに失効する
 * - REQ-50.4: ロールの解除で権限「外部アプリの接続」を失うと、その利用者の全ての接続が直ちに失効する
 * - REQ-50.5: 1 つの端末からのログアウトでは接続は失効しない
 * - REQ-50.7: 管理者による 2FA の再設定で、その利用者の全ての接続が直ちに失効する
 *
 * 観測の方針:
 * - ArchiTrack の応答は差し替えない。外部アプリの戻り先は試験の工程の中の loopback の受け口で受ける
 * - 状態の変化は、ログイン中の画面が持つ画面用のアクセストークンと CSRF のトークンで画面の API へ送る
 * - 失効は、外部アプリ用のアクセストークンの 401、接続の行の消滅、監査の理由の 3 つで確かめる
 * - 接続は利用者ごとの別のブラウザのコンテキストで並行して作る（次の TOTP の待ちを重ねる）
 * - 50.4 の権限を与えるロールは、この spec が DB に作って利用者に割り当て、後始末で消す
 */

import { randomBytes } from 'crypto';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import {
  OAUTH_APP_ORIGIN,
  OAUTH_TEST_CLIENT,
  cleanupOAuthArtifacts,
  connectViaConsent,
  findConnectionEndedAudits,
  findConnections,
  screenApiHeadersOf,
  whoamiStatus,
  type OAuthCallbackServer,
  type OAuthTokenResponse,
  type ScreenApiHeaders,
  startOAuthCallbackServer,
} from '../../helpers/oauth-consent-flow';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  deleteSessionUsers,
  type SessionUser,
} from '../../fixtures/auth.fixtures';

const NEW_PASSWORD = 'E2e-Rotated!Passphrase-2026-oauth';

const createdUserIds: string[] = [];
const createdRoleIds: string[] = [];
const consentUids: string[] = [];
const openedContexts: BrowserContext[] = [];

function recordUid(uid: string): void {
  consentUids.push(uid);
}

async function createUser(role: 'REGULAR_USER' | 'ADMIN_USER') {
  const user: SessionUser = await createSessionUser(role);
  createdUserIds.push(user.id);
  return user;
}

/** 権限「外部アプリの接続」だけを与えるロールを作り、一般の利用者に割り当てる（50.4） */
async function grantConnectPermissionByRole(userId: string): Promise<string> {
  const prisma = getPrismaClient();
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { resource_action: { resource: 'external_app', action: 'connect' } },
  });
  const role = await prisma.role.create({
    data: {
      name: `e2e-oauth-connect-${randomBytes(6).toString('hex')}`,
      description: 'E2E: 外部アプリの接続の権限だけを与えるロール',
      rolePermissions: { create: { permissionId: permission.id } },
    },
  });
  createdRoleIds.push(role.id);
  await prisma.userRole.create({ data: { userId, roleId: role.id } });
  return role.id;
}

/** 別のブラウザのコンテキスト（未ログイン）を開く（後始末で閉じる） */
async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  openedContexts.push(context);
  return context.newPage();
}

interface ConnectedUser {
  readonly user: SessionUser;
  readonly page: Page;
  readonly token: OAuthTokenResponse;
}

/** 利用者ごとの別のコンテキストで、同意の画面の流れを並行に通して接続を作る */
async function connectAll(browser: Browser, users: SessionUser[]): Promise<ConnectedUser[]> {
  return Promise.all(
    users.map(async (user) => {
      const page = await openPage(browser);
      const token = await connectViaConsent(page, user, { recordUid });
      return { user, page, token };
    })
  );
}

/** 画面の API へ状態を変える要求を送り、応答の状態を返す */
async function sendScreenApi(
  page: Page,
  headers: ScreenApiHeaders,
  method: 'POST' | 'DELETE',
  path: string,
  data?: Record<string, unknown>
): Promise<number> {
  const response = await page.request.fetch(`${OAUTH_APP_ORIGIN}${path}`, {
    method,
    headers: { ...headers },
    ...(data !== undefined ? { data } : {}),
  });
  return response.status();
}

/** 接続が失効したこと（トークンの 401・接続の行の消滅・監査の理由）を主張する */
async function expectAllConnectionsEnded(
  connected: ConnectedUser,
  since: Date,
  expected: { reason: string; actorId: string | null }
) {
  expect(await whoamiStatus(connected.token.access_token), '失効した接続のトークンは 401').toBe(
    401
  );
  expect(await findConnections(connected.user.id)).toEqual([]);
  expect(await findConnectionEndedAudits(connected.user.id, since)).toEqual([
    {
      actorId: expected.actorId,
      targetId: connected.user.id,
      metadata: expect.objectContaining({
        clientId: OAUTH_TEST_CLIENT.clientId,
        scopes: ['read'],
        reason: expected.reason,
      }),
    },
  ]);
}

test.describe('利用者の状態の変化による外部アプリの接続の失効（user-authentication 79.4）', () => {
  let callbackServer: OAuthCallbackServer;

  test.beforeEach(async () => {
    callbackServer = await startOAuthCallbackServer();
  });

  test.afterEach(async () => {
    await Promise.all(openedContexts.map((context) => context.close()));
    openedContexts.length = 0;
    await callbackServer.close();
    await cleanupOAuthArtifacts(createdUserIds, consentUids);
    await deleteSessionUsers();
    await getPrismaClient().role.deleteMany({ where: { id: { in: createdRoleIds } } });
    createdUserIds.length = 0;
    createdRoleIds.length = 0;
    consentUids.length = 0;
  });

  /**
   * @requirement user-authentication/REQ-50.1
   * @requirement user-authentication/REQ-50.2
   * @requirement user-authentication/REQ-50.5
   */
  test('本人のパスワードの変更と全デバイスのログアウトで接続が失効し、1 つの端末のログアウトでは残る', async ({
    browser,
  }) => {
    // 3 人の同意で次の TOTP の時間ステップを並行に実際に待つ（最大 30 秒）
    test.setTimeout(getTimeout(240_000));
    const startedAt = new Date(Date.now() - 5000);
    const [singleLogout, allLogout, passwordChange] = await connectAll(browser, [
      await createUser('ADMIN_USER'),
      await createUser('ADMIN_USER'),
      await createUser('ADMIN_USER'),
    ]);

    // 50.5: 1 つの端末からのログアウトでは接続は残り、外部アプリ用のトークンは使える
    const singleHeaders = await screenApiHeadersOf(singleLogout!.page);
    expect(
      await sendScreenApi(singleLogout!.page, singleHeaders, 'POST', '/api/v1/auth/logout')
    ).toBe(200);
    expect(await whoamiStatus(singleLogout!.token.access_token)).toBe(200);
    expect(await findConnections(singleLogout!.user.id)).toHaveLength(1);
    expect(await findConnectionEndedAudits(singleLogout!.user.id, startedAt)).toEqual([]);

    // 50.2: 全デバイスからのログアウトで、その利用者の接続が直ちに失効する
    const allHeaders = await screenApiHeadersOf(allLogout!.page);
    expect(
      await sendScreenApi(allLogout!.page, allHeaders, 'POST', '/api/v1/auth/logout-all')
    ).toBe(200);
    await expectAllConnectionsEnded(allLogout!, startedAt, {
      reason: 'LOGOUT_ALL',
      actorId: allLogout!.user.id,
    });

    // 50.1: パスワードの変更で、その利用者の接続が直ちに失効する
    const passwordHeaders = await screenApiHeadersOf(passwordChange!.page);
    expect(
      await sendScreenApi(
        passwordChange!.page,
        passwordHeaders,
        'POST',
        '/api/v1/auth/password/change',
        {
          currentPassword: passwordChange!.user.password,
          newPassword: NEW_PASSWORD,
          newPasswordConfirm: NEW_PASSWORD,
        }
      )
    ).toBe(200);
    await expectAllConnectionsEnded(passwordChange!, startedAt, {
      reason: 'PASSWORD_CHANGED',
      actorId: passwordChange!.user.id,
    });

    // 他の利用者の状態の変化は、ログアウトした 1 人目の接続に及ばない
    expect(await whoamiStatus(singleLogout!.token.access_token)).toBe(200);
  });

  /**
   * @requirement user-authentication/REQ-50.3
   * @requirement user-authentication/REQ-50.4
   * @requirement user-authentication/REQ-50.7
   */
  test('管理者による無効化・削除・ロールの解除による権限の喪失・2FA の再設定で、対象の利用者の接続が失効する', async ({
    browser,
    page,
  }) => {
    // 4 人の同意で次の TOTP の時間ステップを並行に実際に待つ（最大 30 秒）
    test.setTimeout(getTimeout(240_000));
    const startedAt = new Date(Date.now() - 5000);
    const roleMember = await createUser('REGULAR_USER');
    const roleId = await grantConnectPermissionByRole(roleMember.id);
    const [deactivated, deleted, permissionLost, twoFactorReset] = await connectAll(browser, [
      await createUser('ADMIN_USER'),
      await createUser('ADMIN_USER'),
      roleMember,
      await createUser('ADMIN_USER'),
    ]);

    const admin = await createUser('ADMIN_USER');
    await loginAsUser(page, admin);
    const adminHeaders = await screenApiHeadersOf(page);

    // 50.3: 無効化で、その利用者の接続が直ちに失効する
    expect(
      await sendScreenApi(
        page,
        adminHeaders,
        'POST',
        `/api/v1/users/${deactivated!.user.id}/deactivate`,
        { reason: 'E2E: 外部アプリの接続の失効の確認' }
      )
    ).toBe(204);
    await expectAllConnectionsEnded(deactivated!, startedAt, {
      reason: 'ACCOUNT_DEACTIVATED',
      actorId: admin.id,
    });

    // 50.3: 削除で、その利用者の接続が直ちに失効する
    expect(
      await sendScreenApi(page, adminHeaders, 'DELETE', `/api/v1/users/${deleted!.user.id}`)
    ).toBe(204);
    await expectAllConnectionsEnded(deleted!, startedAt, {
      reason: 'ACCOUNT_DELETED',
      actorId: admin.id,
    });

    // 50.4: 権限「外部アプリの接続」を与える唯一のロールを外すと、その利用者の接続が直ちに失効する
    expect(
      await sendScreenApi(
        page,
        adminHeaders,
        'DELETE',
        `/api/v1/users/${permissionLost!.user.id}/roles/${roleId}`
      )
    ).toBe(204);
    await expectAllConnectionsEnded(permissionLost!, startedAt, {
      reason: 'PERMISSION_LOST',
      actorId: admin.id,
    });

    // 50.7: 管理者による 2FA の再設定で、その利用者の接続が直ちに失効する
    expect(
      await sendScreenApi(
        page,
        adminHeaders,
        'POST',
        `/api/v1/users/${twoFactorReset!.user.id}/2fa/reset`
      )
    ).toBe(204);
    await expectAllConnectionsEnded(twoFactorReset!, startedAt, {
      reason: 'TWO_FACTOR_RESET',
      actorId: admin.id,
    });
  });
});
