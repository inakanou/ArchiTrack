/**
 * @fileoverview 2FA を伴うログインの 2FA 待ちの資格の統合検証（タスク46.1）
 *
 * 確かめる振る舞い（要件32.1〜32.6、42.7）: 2FA 登録済みの利用者のパスワードの検証が成功すると、ログインの
 * 応答は利用者 ID を含まず、5 分・一回限りの不透明な資格だけを返す。TOTP とバックアップコードの検証は
 * その資格を要求し、メールアドレスやアクセストークン・リフレッシュトークンを資格として受理しない。成功で
 * 資格を消費し、同時の二重成功ではトークンを一度しか発行しない。資格の保存先（Redis）が使えないときは
 * 503 を返す。
 *
 * モックを使わず、本物のアプリ（ログイン・2FA の検証の API）と実 PostgreSQL・実 Redis を通す。
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
import {
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  twoFactorChallengeKey,
} from '../../services/two-factor-challenge.service.js';
import { issuedRefreshToken } from './refresh-cookie-client.js';

const MARK = 'test-ua461-2fa-challenge';
const PASSWORD = 'Challenge!Passphrase-2026';

describe('2FA 待ちの資格（統合）', () => {
  let prisma: PrismaClient;
  let passwordHash: string;
  let userId: string;
  let email: string;
  let secret: string;
  let backupCode: string;

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
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  /** パスワードでログインし、2FA 待ちの資格を返す */
  async function loginForChallenge(): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.requires2FA).toBe(true);
    return response;
  }

  async function challengeToken(): Promise<string> {
    const response = await loginForChallenge();
    expect(typeof response.body.challengeToken).toBe('string');
    return response.body.challengeToken as string;
  }

  function verifyTotp(body: Record<string, unknown>) {
    return request(app).post('/api/v1/auth/verify-2fa').send(body);
  }

  function verifyBackup(body: Record<string, unknown>) {
    return request(app).post('/api/v1/auth/verify-2fa/backup').send(body);
  }

  /** 応答が Set-Cookie でリフレッシュトークンを発行していないこと */
  function expectNoTokens(response: request.Response): void {
    expect(response.body).not.toHaveProperty('accessToken');
    const lines = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    expect(lines.filter((line) => /^refreshToken=[^;]+/.test(line))).toEqual([]);
  }

  function expectInvalidChallenge(response: request.Response): void {
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CHALLENGE');
    expectNoTokens(response);
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
    email = `${MARK}-${randomBytes(4).toString('hex')}@example.com`;
    secret = authenticator.generateSecret();
    const twoFactorService = new TwoFactorService();
    const user = await prisma.user.create({
      data: {
        email,
        displayName: '2FA Challenge User',
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: await twoFactorService.encryptSecret(secret),
      },
    });
    userId = user.id;
    backupCode = 'QWER5678';
    await prisma.twoFactorBackupCode.create({
      data: { userId, codeHash: await hash(backupCode) },
    });
  });

  describe('ログインの応答', () => {
    /**
     * @requirement user-authentication/REQ-32.1
     * @requirement user-authentication/REQ-42.7
     */
    it('2FA 登録済みの利用者のパスワードの成功は、利用者 ID を含まず 2FA 待ちの資格を返し、トークンを発行しない', async () => {
      const response = await loginForChallenge();

      expect(response.body).toEqual({
        requires2FA: true,
        challengeToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
      });
      expect(response.body).not.toHaveProperty('userId');
      expect(JSON.stringify(response.body)).not.toContain(userId);
      expectNoTokens(response);
    });

    /**
     * @requirement user-authentication/REQ-32.3
     */
    it('資格は 300 秒以内の期限で Redis に置かれる', async () => {
      const token = await challengeToken();

      const ttl = await redis.getClient()!.ttl(twoFactorChallengeKey(token));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    /**
     * @requirement user-authentication/REQ-42.7
     */
    it('ログインの失敗の応答は利用者 ID を含まない', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Wrong!Passphrase-2026' });

      expect(response.status).toBe(401);
      expect(response.body).not.toHaveProperty('userId');
      expect(JSON.stringify(response.body)).not.toContain(userId);
    });
  });

  describe('資格を伴う検証', () => {
    /**
     * @requirement user-authentication/REQ-32.1
     */
    it('ログインの応答の資格と正しい TOTP コードで、トークンを発行する', async () => {
      const token = await challengeToken();

      const response = await verifyTotp({
        challengeToken: token,
        code: authenticator.generate(secret),
      });

      expect(response.status).toBe(200);
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.user.id).toBe(userId);
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(issuedRefreshToken(response)).toEqual(expect.any(String));
    });

    /**
     * @requirement user-authentication/REQ-32.4
     */
    it('一度成功した資格による二度目の検証は 401 INVALID_CHALLENGE を返す', async () => {
      const token = await challengeToken();
      const first = await verifyTotp({
        challengeToken: token,
        code: authenticator.generate(secret),
      });
      expect(first.status).toBe(200);

      const second = await verifyTotp({
        challengeToken: token,
        code: authenticator.generate(secret),
      });

      expectInvalidChallenge(second);
    });

    /**
     * @requirement user-authentication/REQ-32.4
     */
    it('同じ資格による同時の二つの正しい検証は、一方だけがトークンを発行する', async () => {
      const token = await challengeToken();
      const code = authenticator.generate(secret);

      const responses = await Promise.all([
        verifyTotp({ challengeToken: token, code }),
        verifyTotp({ challengeToken: token, code }),
        verifyTotp({ challengeToken: token, code }),
      ]);

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 401, 401]);
      for (const response of responses.filter((r) => r.status === 401)) {
        expectInvalidChallenge(response);
      }
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
    });

    /**
     * @requirement user-authentication/REQ-32.3
     */
    it('期限を過ぎた資格による検証は 401 INVALID_CHALLENGE を返す', async () => {
      const token = await challengeToken();
      // 期限の経過を作る（鍵の残りの期限を 1ms にして消えるのを待つ）
      const client = redis.getClient()!;
      await client.pexpire(twoFactorChallengeKey(token), 1);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const response = await verifyTotp({
        challengeToken: token,
        code: authenticator.generate(secret),
      });

      expectInvalidChallenge(response);
    });

    it('コードの誤りでは資格を消費せず、同じ資格で正しいコードを再試行できる', async () => {
      const token = await challengeToken();
      const current = authenticator.generate(secret);
      const wrong = `${(Number(current[0]) + 5) % 10}${current.slice(1)}`;

      const failed = await verifyTotp({ challengeToken: token, code: wrong });
      expect(failed.status).toBe(401);
      expect(failed.body.code).toBe('INVALID_2FA_CODE');

      const retried = await verifyTotp({ challengeToken: token, code: current });
      expect(retried.status).toBe(200);
    });
  });

  describe('資格の無い・取り違えた検証', () => {
    /**
     * @requirement user-authentication/REQ-32.2
     */
    it('メールアドレスと正しい TOTP コードだけの検証は 401 INVALID_CHALLENGE を返す', async () => {
      await loginForChallenge();

      const response = await verifyTotp({ email, code: authenticator.generate(secret) });

      expectInvalidChallenge(response);
    });

    /**
     * @requirement user-authentication/REQ-32.2
     */
    it('発行していない資格による検証は 401 INVALID_CHALLENGE を返す', async () => {
      const response = await verifyTotp({
        challengeToken: randomBytes(32).toString('base64url'),
        code: authenticator.generate(secret),
      });

      expectInvalidChallenge(response);
    });

    /**
     * @requirement user-authentication/REQ-32.5
     */
    it('アクセストークン・リフレッシュトークンを資格として送った検証は 401 INVALID_CHALLENGE を返す', async () => {
      const token = await challengeToken();
      const login = await verifyTotp({
        challengeToken: token,
        code: authenticator.generate(secret),
      });
      expect(login.status).toBe(200);
      const accessToken = login.body.accessToken as string;
      const refreshToken = issuedRefreshToken(login);

      for (const presented of [accessToken, refreshToken]) {
        const totp = await verifyTotp({
          challengeToken: presented,
          code: authenticator.generate(secret),
        });
        expectInvalidChallenge(totp);

        const backup = await verifyBackup({ challengeToken: presented, backupCode });
        expectInvalidChallenge(backup);
      }

      const bearer = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: authenticator.generate(secret) });
      expectInvalidChallenge(bearer);
    });
  });

  describe('バックアップコード', () => {
    /**
     * @requirement user-authentication/REQ-32.6
     */
    it('メールアドレスと正しいバックアップコードだけの検証は 401 INVALID_CHALLENGE を返し、コードを消費しない', async () => {
      await loginForChallenge();

      const response = await verifyBackup({ email, backupCode });

      expectInvalidChallenge(response);
      const unused = await prisma.twoFactorBackupCode.count({ where: { userId, usedAt: null } });
      expect(unused).toBe(1);
    });

    /**
     * @requirement user-authentication/REQ-32.6
     */
    it('ログインの応答の資格と正しいバックアップコードでトークンを発行し、資格を消費する', async () => {
      const token = await challengeToken();

      const response = await verifyBackup({ challengeToken: token, backupCode });

      expect(response.status).toBe(200);
      expect(typeof response.body.accessToken).toBe('string');

      const again = await verifyTotp({
        challengeToken: token,
        code: authenticator.generate(secret),
      });
      expectInvalidChallenge(again);
    });
  });

  describe('資格の保存先が使えないとき', () => {
    afterAll(async () => {
      await initRedis();
    });

    it('ログインと 2FA の検証は 503 を返し、トークンを発行しない', async () => {
      const token = await challengeToken();
      await redis.disconnect();

      try {
        const login = await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: PASSWORD });
        expect(login.status).toBe(503);
        expect(login.body.code).toBe('SERVICE_UNAVAILABLE');
        expect(login.body).not.toHaveProperty('challengeToken');
        expect(login.body).not.toHaveProperty('userId');
        expectNoTokens(login);

        const totp = await verifyTotp({
          challengeToken: token,
          code: authenticator.generate(secret),
        });
        expect(totp.status).toBe(503);
        expect(totp.body.code).toBe('SERVICE_UNAVAILABLE');
        expectNoTokens(totp);

        const backup = await verifyBackup({ challengeToken: token, backupCode });
        expect(backup.status).toBe(503);
        expectNoTokens(backup);
      } finally {
        await initRedis();
      }
    });
  });
});
