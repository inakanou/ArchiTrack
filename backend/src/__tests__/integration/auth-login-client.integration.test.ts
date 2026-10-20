/**
 * @fileoverview 統合テスト用のログインの補助（`auth-login-client.ts`）の検証（タスク47.2）
 *
 * 補助は、ログインの応答が 2FA の検証を求めるとき（2FA 登録済みの利用者）は資格と計算した TOTP で
 * 検証してトークンを得て、求めないとき（未登録の利用者）はログインの応答のトークンをそのまま返す。
 * 同じ利用者の 30 秒以内の再ログインが TOTP の再利用の拒否（要件32.7）に当たらないことも確かめる。
 *
 * モックを使わず、本物のアプリ（ログイン・2FA の検証・現在の利用者の API）と実 PostgreSQL・実 Redis を通す。
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
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { TwoFactorService } from '../../services/two-factor.service.js';
import { loginForAccessToken, loginForTokens } from './auth-login-client.js';
import { issuedRefreshToken } from './refresh-cookie-client.js';

const MARK = 'test-ua472-login-client';
const PASSWORD = 'LoginClient!Passphrase-2026';

describe('統合テスト用のログインの補助', () => {
  let prisma: PrismaClient;
  let passwordHash: string;
  let plainEmail: string;
  let twoFactorEmail: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function clearRateLimits(): Promise<void> {
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('rl:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  }

  /** アクセストークンで現在の利用者を取得し、メールアドレスを返す */
  async function currentEmail(accessToken: string): Promise<string> {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    return response.body.email as string;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    await clearRateLimits();
    const suffix = randomBytes(4).toString('hex');
    plainEmail = `${MARK}-plain-${suffix}@example.com`;
    twoFactorEmail = `${MARK}-2fa-${suffix}@example.com`;
    await prisma.user.create({
      data: { email: plainEmail, displayName: 'Login Client Plain User', passwordHash },
    });
    await prisma.user.create({
      data: {
        email: twoFactorEmail,
        displayName: 'Login Client 2FA User',
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: await new TwoFactorService().encryptSecret(authenticator.generateSecret()),
      },
    });
  });

  it('2FA 未登録の利用者では、ログインの応答のアクセストークンを返す', async () => {
    const accessToken = await loginForAccessToken(app, {
      email: plainEmail,
      password: PASSWORD,
    });

    expect(await currentEmail(accessToken)).toBe(plainEmail);
  });

  it('2FA 登録済みの利用者では、資格と計算した TOTP で検証してアクセストークンを返す', async () => {
    // 前提: ログインの応答そのものはトークンを持たず 2FA の検証を求める
    const challenge = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: twoFactorEmail, password: PASSWORD });
    expect(challenge.status).toBe(200);
    expect(challenge.body.requires2FA).toBe(true);
    expect(challenge.body).not.toHaveProperty('accessToken');

    const accessToken = await loginForAccessToken(app, {
      email: twoFactorEmail,
      password: PASSWORD,
    });

    expect(await currentEmail(accessToken)).toBe(twoFactorEmail);
  });

  it('2FA 登録済みの利用者の続けての再ログインも、TOTP の再利用で拒否されずにトークンを返す', async () => {
    const first = await loginForTokens(app, { email: twoFactorEmail, password: PASSWORD });
    const second = await loginForTokens(app, { email: twoFactorEmail, password: PASSWORD });

    expect(await currentEmail(first.body.accessToken as string)).toBe(twoFactorEmail);
    expect(await currentEmail(second.body.accessToken as string)).toBe(twoFactorEmail);
    // トークンを発行した応答を返すので、リフレッシュトークンの Cookie も読める
    expect(issuedRefreshToken(first)).not.toBe(issuedRefreshToken(second));
  });

  it('パスワードが誤っていれば、トークンを返さずに失敗する', async () => {
    await expect(
      loginForAccessToken(app, { email: twoFactorEmail, password: 'Wrong!Passphrase-2026' })
    ).rejects.toThrow(/ログイン/);
  });
});
