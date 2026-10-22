/**
 * @fileoverview ログインでの無効化の確認と最終ログイン日時の記録の統合検証（user-authentication タスク49.3）
 *
 * Requirements (user-authentication):
 * - REQ-36.2: 無効化された利用者のログインはパスワードの正否に関わらず通常の認証エラーと同じ応答で拒否する
 * - REQ-36.7: ログインの成功で最終ログイン日時を記録する
 *
 * モックを使わず、本物のアプリと実 PostgreSQL・実 Redis を通す。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles } from '../../utils/seed-helpers.js';
import { createTestUser, invalidateUserStateCache } from './test-user-factory.js';

const MARK = 'test-49-3-login-account-status';
const PASSWORD = 'LoginAccountStatus!Passphrase-2026';

/** 要求ごとに変わる見出し（日時・要求 ID） */
const VOLATILE_HEADERS = new Set(['date', 'x-request-id']);

function stableHeaders(response: request.Response): Record<string, string> {
  return Object.fromEntries(
    Object.entries(response.headers as Record<string, string>).filter(
      ([name]) => !VOLATILE_HEADERS.has(name)
    )
  );
}

describe('ログインでの無効化の確認と最終ログイン日時の記録（統合）', () => {
  let prisma: PrismaClient;
  let passwordHash: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    for (const id of ids) {
      await invalidateUserStateCache(id);
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function createUser(
    label: string,
    state: { isActive?: boolean; twoFactor?: boolean | { secret: string } }
  ) {
    const user = await createTestUser(
      prisma,
      {
        email: `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`,
        displayName: `${MARK}-${label}`,
        passwordHash,
      },
      state
    );
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'user' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  function login(email: string, password: string) {
    return request(app).post('/api/v1/auth/login').send({ email, password });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（2FA 待ちの資格の保存先。できなければ赤にする）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    await seedRoles(prisma);
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
  });

  /**
   * @requirement user-authentication/REQ-36.2
   */
  it.each([
    ['2FA 未登録', false],
    ['2FA 登録済み', true],
  ])(
    '%s: 無効化された利用者の正しいパスワードのログインは、有効な利用者のパスワードの誤りと同じ状態・本文・見出しで拒否される',
    async (_, twoFactor) => {
      const active = await createUser('active', { twoFactor });
      const deactivated = await createUser('deactivated', { twoFactor, isActive: false });

      const wrongPassword = await login(active.email, 'Wrong!Passphrase-2026');
      const correctPassword = await login(deactivated.email, PASSWORD);
      const deactivatedWrongPassword = await login(deactivated.email, 'Wrong!Passphrase-2026');

      expect(wrongPassword.status).toBe(401);
      for (const response of [correctPassword, deactivatedWrongPassword]) {
        expect(response.status).toBe(wrongPassword.status);
        expect(response.body).toEqual(wrongPassword.body);
        expect(stableHeaders(response)).toEqual(stableHeaders(wrongPassword));
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      // 無効化された利用者の試行は失敗の回数に数えない（ロックで状態を推測させない）
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: deactivated.id } });
      expect(stored.loginFailures).toBe(0);
      expect(stored.lastLoginAt).toBeNull();
      expect(await prisma.refreshToken.count({ where: { userId: deactivated.id } })).toBe(0);
    }
  );

  /**
   * @requirement user-authentication/REQ-36.2
   */
  it('パスワードの段階の後に無効化された利用者の 2FA の検証は、資格の不正と同じ応答で拒否される', async () => {
    const secret = authenticator.generateSecret();
    const user = await createUser('between-steps', { twoFactor: { secret } });

    const first = await login(user.email, PASSWORD);
    expect(first.status).toBe(200);
    expect(first.body.requires2FA).toBe(true);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await invalidateUserStateCache(user.id);

    const verify = await request(app)
      .post('/api/v1/auth/verify-2fa')
      .send({ challengeToken: first.body.challengeToken, code: authenticator.generate(secret) });
    const unknownChallenge = await request(app)
      .post('/api/v1/auth/verify-2fa')
      .send({ challengeToken: 'unknown-challenge', code: authenticator.generate(secret) });

    expect(verify.status).toBe(401);
    expect(verify.status).toBe(unknownChallenge.status);
    expect(verify.body).toEqual(unknownChallenge.body);
    expect(verify.headers['set-cookie']).toBeUndefined();
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  /**
   * @requirement user-authentication/REQ-36.7
   */
  it('2FA 未登録の利用者はログインの成功で、登録済みの利用者は 2FA の検証の成功で最終ログイン日時が記録される', async () => {
    const withoutTwoFactor = await createUser('no-2fa', { twoFactor: false });
    const secret = authenticator.generateSecret();
    const withTwoFactor = await createUser('with-2fa', { twoFactor: { secret } });
    const before = new Date();

    expect((await login(withoutTwoFactor.email, PASSWORD)).status).toBe(200);
    const recorded = await prisma.user.findUniqueOrThrow({ where: { id: withoutTwoFactor.id } });
    expect(recorded.lastLoginAt).not.toBeNull();
    expect(recorded.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);

    // パスワードの段階（資格の発行）では記録しない
    const first = await login(withTwoFactor.email, PASSWORD);
    expect(first.body.requires2FA).toBe(true);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: withTwoFactor.id } })).lastLoginAt
    ).toBeNull();

    const verify = await request(app)
      .post('/api/v1/auth/verify-2fa')
      .send({ challengeToken: first.body.challengeToken, code: authenticator.generate(secret) });
    expect(verify.status).toBe(200);
    const afterVerify = await prisma.user.findUniqueOrThrow({ where: { id: withTwoFactor.id } });
    expect(afterVerify.lastLoginAt).not.toBeNull();
    expect(afterVerify.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });
});
