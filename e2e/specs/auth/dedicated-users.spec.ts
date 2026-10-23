/**
 * @fileoverview 状態を変える検証の専用の利用者と初期化の補助の E2E テスト
 *
 * user-authentication タスク47.4。2FA 未登録の検証用・初回のパスワード変更の検証用・状態を変える
 * 検証用（無効化・ロック・2FA の再設定・削除・パスワードの変更とリセット）の専用の利用者
 * （`DEDICATED_USERS`）が、初期化の補助（`resetDedicatedUser`）で既定の状態へ戻ることを、
 * DB の状態と実際のログイン（API）で確かめる。
 *
 * 受入基準の被覆の印は掲げない（34.2 の強制（47.6）の前提の準備であり、印は振る舞いを完成させる
 * タスクで掲げる）。
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from '../../config';
import { getPrismaClient } from '../../fixtures/database';
import {
  createPasswordResetToken,
  createRefreshToken,
  createTwoFactorBackupCodes,
  resetDedicatedUser,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginViaApi } from '../../helpers/auth-api';
import { assertPrepared } from '../../helpers/preconditions';
import { DEDICATED_USERS, hashPassword, type DedicatedUserKey } from '../../helpers/test-users';
import { E2E_TOTP_SECRET, generateTotpCode } from '../../helpers/two-factor-totp';

/** 開いた要求のコンテキスト（テストの終わりに閉じる） */
const openedRequestContexts: APIRequestContext[] = [];

async function newRequestContext(): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext();
  openedRequestContexts.push(context);
  return context;
}

/** 利用者の状態の列と、状態に連なる行の件数 */
async function readStoredState(userId: string) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      displayName: true,
      mustChangePassword: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorLastUsedStep: true,
      twoFactorPendingSecret: true,
      twoFactorFailures: true,
      twoFactorLockedUntil: true,
      isActive: true,
      deactivatedAt: true,
      deactivationReason: true,
      isLocked: true,
      lockedUntil: true,
      loginFailures: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  assertPrepared(user, `専用の利用者（ID ${userId}）`);
  const [backupCodes, refreshTokens, passwordHistories, passwordResetTokens] = await Promise.all([
    prisma.twoFactorBackupCode.count({ where: { userId } }),
    prisma.refreshToken.count({ where: { userId } }),
    prisma.passwordHistory.count({ where: { userId } }),
    prisma.passwordResetToken.count({ where: { userId } }),
  ]);
  const { userRoles, twoFactorSecret, ...columns } = user;
  return {
    ...columns,
    hasTwoFactorSecret: twoFactorSecret !== null,
    roles: userRoles.map((userRole) => userRole.role.name).sort(),
    backupCodes,
    refreshTokens,
    passwordHistories,
    passwordResetTokens,
  };
}

/** 定義どおりの既定の状態 */
function expectedDefaultState(key: DedicatedUserKey) {
  const definition = DEDICATED_USERS[key];
  return {
    email: definition.email,
    displayName: definition.displayName,
    mustChangePassword: definition.mustChangePassword,
    twoFactorEnabled: definition.twoFactorEnabled,
    twoFactorLastUsedStep: null,
    twoFactorPendingSecret: null,
    twoFactorFailures: 0,
    twoFactorLockedUntil: null,
    isActive: true,
    deactivatedAt: null,
    deactivationReason: null,
    isLocked: false,
    lockedUntil: null,
    loginFailures: 0,
    hasTwoFactorSecret: definition.twoFactorEnabled,
    roles: [...definition.roles].sort(),
    backupCodes: 0,
    refreshTokens: 0,
    passwordHistories: 0,
    passwordResetTokens: 0,
  };
}

/**
 * 既定から外れた状態にする（パスワード・初回の変更の要否・2FA と最後に使った時間ステップ・
 * 有効状態・ロック・ロール・セッション・履歴・リセットのトークン・バックアップコード）
 */
async function scrambleState(user: CreatedUser): Promise<void> {
  const prisma = getPrismaClient();
  const later = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: '状態を変えた後の表示名',
      passwordHash: await hashPassword('ChangedPassword987!'),
      mustChangePassword: !user.mustChangePassword,
      twoFactorEnabled: !user.twoFactorEnabled,
      twoFactorSecret: user.twoFactorEnabled ? null : 'not-a-valid-secret',
      // 遠い将来の時間ステップ（戻されなければ、現在のコードは全て再使用として拒否される）
      twoFactorLastUsedStep: 2_000_000_000,
      twoFactorPendingSecret: 'pending-secret',
      twoFactorFailures: 5,
      twoFactorLockedUntil: later,
      isActive: false,
      deactivatedAt: new Date(),
      deactivationReason: '検証のための無効化',
      isLocked: true,
      lockedUntil: later,
      loginFailures: 5,
    },
  });
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.passwordHistory.create({
    data: { userId: user.id, passwordHash: await hashPassword('OldPassword987!') },
  });
  await createPasswordResetToken(
    {
      userId: user.id,
      token: `dedicated-reset-${Date.now()}`,
      expiresAt: later,
    },
    prisma
  );
  await createTwoFactorBackupCodes({ userId: user.id, count: 2 });
  await createRefreshToken({ userId: user.id });
}

test.describe('状態を変える検証の専用の利用者と初期化の補助', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    while (openedRequestContexts.length > 0) {
      await openedRequestContexts.pop()?.dispose();
    }
  });

  for (const key of Object.keys(DEDICATED_USERS) as DedicatedUserKey[]) {
    test(`${key}: 状態を変えた後に初期化の補助で既定の状態へ戻り、定義の資格でログインできる`, async () => {
      const user = await resetDedicatedUser(key);
      await scrambleState(user);
      expect(await readStoredState(user.id)).not.toEqual(expectedDefaultState(key));

      const reset = await resetDedicatedUser(key);

      // 同じ利用者を初期化する（ID を保ち、状態の列と連なる行が定義どおりになる）
      expect(reset.id).toBe(user.id);
      expect(await readStoredState(reset.id)).toEqual(expectedDefaultState(key));

      // 定義のパスワード（と 2FA 登録済みなら既知の秘密鍵）でログインが完了する
      const session = await loginViaApi(await newRequestContext(), reset);
      expect(session.user.email).toBe(DEDICATED_USERS[key].email);
      expect(session.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });
  }

  test('2FA 登録済みの専用の利用者は、初期化の直後に最後に使った時間ステップを戻さずに現在のコードで検証できる', async () => {
    const user = await resetDedicatedUser('STATE_CHANGE_USER');
    await getPrismaClient().user.update({
      where: { id: user.id },
      data: { twoFactorLastUsedStep: 2_000_000_000 },
    });

    const reset = await resetDedicatedUser('STATE_CHANGE_USER');

    // ログインの補助を経ず（補助は時間ステップを戻すため）、資格と現在のコードで直接検証する
    const api = await newRequestContext();
    const login = await api.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: { email: reset.email, password: reset.password },
    });
    expect(login.status()).toBe(200);
    const loginBody = (await login.json()) as { requires2FA?: unknown; challengeToken?: unknown };
    expect(loginBody.requires2FA).toBe(true);
    const challengeToken =
      typeof loginBody.challengeToken === 'string' ? loginBody.challengeToken : null;
    assertPrepared(challengeToken, 'ログインの応答の 2FA 待ちの資格');

    const verified = await api.post(`${API_BASE_URL}/api/v1/auth/verify-2fa`, {
      data: { challengeToken, code: generateTotpCode(E2E_TOTP_SECRET) },
    });
    expect(verified.status()).toBe(200);
  });

  test('削除された専用の利用者は、初期化の補助で既定の状態で作り直される', async () => {
    const user = await resetDedicatedUser('STATE_CHANGE_USER');
    await getPrismaClient().user.delete({ where: { id: user.id } });
    expect(await getPrismaClient().user.count({ where: { id: user.id } })).toBe(0);

    const recreated = await resetDedicatedUser('STATE_CHANGE_USER');

    expect(recreated.id).not.toBe(user.id);
    expect(await readStoredState(recreated.id)).toEqual(expectedDefaultState('STATE_CHANGE_USER'));
    const session = await loginViaApi(await newRequestContext(), recreated);
    expect(session.user.email).toBe(DEDICATED_USERS.STATE_CHANGE_USER.email);
  });
});
