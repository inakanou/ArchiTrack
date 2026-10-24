/**
 * @fileoverview ログイン・ロック・2FA・ログアウトの監査の記録の統合検証（user-authentication タスク53.1）
 *
 * Requirements (user-authentication):
 * - REQ-40.1: ログインの成功と失敗（パスワード誤り・存在しないメールアドレス）を結果・メールアドレス・送信元 IP・ユーザーエージェントとともに記録する
 * - REQ-40.2: ログイン失敗または 2FA 検証失敗によるロックを記録する
 * - REQ-40.3: 2FA 検証（TOTP またはバックアップコード）の成功と失敗を記録する
 * - REQ-40.4: ログアウトと全デバイスのログアウトを記録する
 *
 * モックを使わず、本物のアプリと実 PostgreSQL・実 Redis を通し、各操作の後に監査ログの行が残ることを確かめる。
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
import { SECURITY_CONFIG } from '../../config/security.constants.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import {
  AUDIT_EMAIL_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
} from '../../services/auth.service.js';
import { createTestUser, invalidateUserStateCache } from './test-user-factory.js';
import { fetchCsrfToken, frontendOrigin, issuedRefreshToken } from './refresh-cookie-client.js';

const MARK = 'test-53-1-auth-audit';
const PASSWORD = 'AuthAudit!Passphrase-2026';
const WRONG_PASSWORD = 'Wrong!Passphrase-2026';
const USER_AGENT = `ArchiTrack-AuthAudit-Test/${MARK}`;
/**
 * 利用者が `X-Forwarded-For` の先頭に偽って足した値。送信元 IP の記録はこれに左右されない（要件35.2）。
 * 末尾は信頼する中継が付けた値に当たる（試験の構成の中継の段数が 0 でも 1 でも、記録は先頭の値にならない）
 */
const SPOOFED_IP = '203.0.113.77';
const FORWARDED_FOR = `${SPOOFED_IP}, 198.51.100.20`;

describe('ログイン・ロック・2FA・ログアウトの監査の記録（統合）', () => {
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
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }, { targetId: { contains: MARK } }],
    });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  function uniqueEmail(label: string): string {
    return `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
  }

  async function createUser(label: string, twoFactor: boolean | { secret: string }) {
    const user = await createTestUser(
      prisma,
      { email: uniqueEmail(label), displayName: `${MARK}-${label}`, passwordHash },
      { twoFactor }
    );
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'user' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  function login(email: string, password: string) {
    return request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', USER_AGENT)
      .set('X-Forwarded-For', FORWARDED_FOR)
      .send({ email, password });
  }

  function verifyTotp(challengeToken: string, code: string) {
    return request(app)
      .post('/api/v1/auth/verify-2fa')
      .set('User-Agent', USER_AGENT)
      .set('X-Forwarded-For', FORWARDED_FOR)
      .send({ challengeToken, code });
  }

  function verifyBackup(challengeToken: string, backupCode: string) {
    return request(app)
      .post('/api/v1/auth/verify-2fa/backup')
      .set('User-Agent', USER_AGENT)
      .set('X-Forwarded-For', FORWARDED_FOR)
      .send({ challengeToken, backupCode });
  }

  /** 現在のコードと異なる 6 桁のコード */
  function wrongCodeFor(secret: string): string {
    const current = Number(authenticator.generate(secret));
    return String((current + 500000) % 1000000).padStart(6, '0');
  }

  async function auditRows(targetId: string, action: string) {
    return prisma.auditLog.findMany({
      where: { targetId, action },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 送信元 IP とユーザーエージェントが記録され、IP が偽の見出しでなく接続の送信元であること */
  function expectRequestOrigin(metadata: unknown): void {
    const meta = metadata as Record<string, unknown>;
    expect(meta.userAgent).toBe(USER_AGENT);
    expect(typeof meta.ipAddress).toBe('string');
    expect(meta.ipAddress).not.toBe('');
    expect(meta.ipAddress).not.toBe(SPOOFED_IP);
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

  describe('ログインの成功と失敗（要件40.1）', () => {
    /**
     * @requirement user-authentication/REQ-40.1
     */
    it('2FA 未登録の利用者のログインの成功を、本人を実行者として結果・メールアドレス・送信元 IP・ユーザーエージェントとともに記録する', async () => {
      const user = await createUser('success', false);

      const response = await login(user.email, PASSWORD);
      expect(response.status).toBe(200);
      expect(response.body.accessToken).toEqual(expect.any(String));

      const rows = await auditRows(user.id, 'LOGIN_SUCCESS');
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorId).toBe(user.id);
      expect(row.actorEmail).toBe(user.email);
      expect(row.targetType).toBe('User');
      expect(row.metadata).toMatchObject({ result: 'success', email: user.email });
      expectRequestOrigin(row.metadata);
    });

    /**
     * @requirement user-authentication/REQ-40.1
     */
    it('パスワードの誤りによるログインの失敗を、実行者なしで結果・メールアドレス・送信元 IP・ユーザーエージェントとともに記録する', async () => {
      const user = await createUser('wrong-password', false);

      const response = await login(user.email, WRONG_PASSWORD);
      expect(response.status).toBe(401);

      const rows = await auditRows(user.id, 'LOGIN_FAILED');
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorId).toBeNull();
      expect(row.actorEmail).toBeNull();
      expect(row.targetType).toBe('User');
      expect(row.metadata).toMatchObject({
        result: 'failure',
        reason: 'invalid_password',
        email: user.email,
      });
      expectRequestOrigin(row.metadata);
      expect(await auditRows(user.id, 'LOGIN_SUCCESS')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-40.1
     */
    it('存在しないメールアドレスによるログインの失敗を、実行者なしで入力されたメールアドレスとともに記録する', async () => {
      const email = uniqueEmail('nonexistent');

      const response = await login(email, PASSWORD);
      expect(response.status).toBe(401);

      const rows = await auditRows(email, 'LOGIN_FAILED');
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorId).toBeNull();
      expect(row.actorEmail).toBeNull();
      expect(row.metadata).toMatchObject({ result: 'failure', reason: 'unknown_email', email });
      expectRequestOrigin(row.metadata);
    });
  });

  describe('ロック（要件40.2）', () => {
    /**
     * @requirement user-authentication/REQ-40.2
     */
    it('ログインの連続の失敗でアカウントがロックされたとき、ロックを記録する', async () => {
      const user = await createUser('login-lock', false);

      const statuses: number[] = [];
      for (let i = 0; i < SECURITY_CONFIG.LOGIN.MAX_FAILURES; i++) {
        statuses.push((await login(user.email, WRONG_PASSWORD)).status);
      }
      // 最後の失敗でロックされる
      expect(statuses.at(-1)).toBe(429);

      const locked = await auditRows(user.id, 'LOGIN_LOCKED');
      expect(locked).toHaveLength(1);
      expect(locked[0]!.actorId).toBeNull();
      expect(locked[0]!.metadata).toMatchObject({
        trigger: 'login_failures',
        email: user.email,
        lockedUntil: expect.any(String),
      });
      expectRequestOrigin(locked[0]!.metadata);
      expect(await auditRows(user.id, 'LOGIN_FAILED')).toHaveLength(
        SECURITY_CONFIG.LOGIN.MAX_FAILURES
      );
    });

    /**
     * @requirement user-authentication/REQ-40.2
     */
    it('2FA の検証の連続の失敗でロックされたとき、ロックを記録する', async () => {
      const secret = authenticator.generateSecret();
      const user = await createUser('two-factor-lock', { secret });

      const loginResponse = await login(user.email, PASSWORD);
      expect(loginResponse.body.requires2FA).toBe(true);
      const challengeToken = loginResponse.body.challengeToken as string;

      const statuses: number[] = [];
      for (let i = 0; i < SECURITY_CONFIG.TWO_FACTOR.MAX_FAILURES; i++) {
        statuses.push((await verifyTotp(challengeToken, wrongCodeFor(secret))).status);
      }
      expect(statuses.at(-1)).toBe(429);

      const locked = await auditRows(user.id, 'LOGIN_LOCKED');
      expect(locked).toHaveLength(1);
      expect(locked[0]!.actorId).toBeNull();
      expect(locked[0]!.metadata).toMatchObject({
        trigger: 'two_factor_failures',
        email: user.email,
      });
      expectRequestOrigin(locked[0]!.metadata);
    });
  });

  describe('2FA の検証（要件40.3）', () => {
    /**
     * @requirement user-authentication/REQ-40.3
     * @requirement user-authentication/REQ-40.1
     */
    it('TOTP の検証の成功を記録し、トークンを発行したログインの成功を記録する', async () => {
      const secret = authenticator.generateSecret();
      const user = await createUser('totp-success', { secret });

      const loginResponse = await login(user.email, PASSWORD);
      expect(loginResponse.body.requires2FA).toBe(true);
      // パスワードの段階ではトークンを発行しないため、ログインの成功はまだ記録しない
      expect(await auditRows(user.id, 'LOGIN_SUCCESS')).toHaveLength(0);

      const verify = await verifyTotp(
        loginResponse.body.challengeToken as string,
        authenticator.generate(secret)
      );
      expect(verify.status).toBe(200);

      const verified = await auditRows(user.id, 'TWO_FACTOR_VERIFIED');
      expect(verified).toHaveLength(1);
      expect(verified[0]!.actorId).toBe(user.id);
      expect(verified[0]!.metadata).toMatchObject({ result: 'success', method: 'totp' });
      expectRequestOrigin(verified[0]!.metadata);

      const success = await auditRows(user.id, 'LOGIN_SUCCESS');
      expect(success).toHaveLength(1);
      expect(success[0]!.actorId).toBe(user.id);
      expect(success[0]!.metadata).toMatchObject({ result: 'success', email: user.email });
      expectRequestOrigin(success[0]!.metadata);
    });

    /**
     * @requirement user-authentication/REQ-40.3
     */
    it('バックアップコードの検証の成功を記録する', async () => {
      const user = await createUser('backup-success', true);
      const backupCode = 'AUDT5310';
      await prisma.twoFactorBackupCode.create({
        data: { userId: user.id, codeHash: await hash(backupCode) },
      });

      const loginResponse = await login(user.email, PASSWORD);
      const verify = await verifyBackup(loginResponse.body.challengeToken as string, backupCode);
      expect(verify.status).toBe(200);

      const verified = await auditRows(user.id, 'TWO_FACTOR_VERIFIED');
      expect(verified).toHaveLength(1);
      expect(verified[0]!.actorId).toBe(user.id);
      expect(verified[0]!.metadata).toMatchObject({ result: 'success', method: 'backup' });
      expectRequestOrigin(verified[0]!.metadata);
    });

    /**
     * @requirement user-authentication/REQ-40.3
     */
    it('TOTP とバックアップコードの誤りによる検証の失敗を、実行者なしで記録する', async () => {
      const secret = authenticator.generateSecret();
      const user = await createUser('two-factor-failure', { secret });

      const loginResponse = await login(user.email, PASSWORD);
      const challengeToken = loginResponse.body.challengeToken as string;
      expect((await verifyTotp(challengeToken, wrongCodeFor(secret))).status).toBe(401);
      expect((await verifyBackup(challengeToken, 'ZZZZ0000')).status).toBe(401);

      const failed = await auditRows(user.id, 'TWO_FACTOR_FAILED');
      expect(failed.map((row) => (row.metadata as Record<string, unknown>).method)).toEqual([
        'totp',
        'backup',
      ]);
      for (const row of failed) {
        expect(row.actorId).toBeNull();
        expect(row.metadata).toMatchObject({ result: 'failure', reason: 'invalid_code' });
        expectRequestOrigin(row.metadata);
      }
      expect(await auditRows(user.id, 'TWO_FACTOR_VERIFIED')).toHaveLength(0);
    });

    /**
     * @requirement user-authentication/REQ-40.3
     */
    it('同じ時間ステップの TOTP の再利用による失敗を、理由 replay で記録する', async () => {
      const secret = authenticator.generateSecret();
      const user = await createUser('two-factor-replay', { secret });
      const code = authenticator.generate(secret);

      const first = await login(user.email, PASSWORD);
      expect((await verifyTotp(first.body.challengeToken as string, code)).status).toBe(200);
      const second = await login(user.email, PASSWORD);
      expect((await verifyTotp(second.body.challengeToken as string, code)).status).toBe(401);

      const failed = await auditRows(user.id, 'TWO_FACTOR_FAILED');
      expect(failed).toHaveLength(1);
      expect(failed[0]!.metadata).toMatchObject({ result: 'failure', reason: 'replay' });
    });
  });

  describe('利用者が与える値の記録の上限（要件40.1）', () => {
    /**
     * @requirement user-authentication/REQ-40.1
     */
    it('索引の上限を超える長さのメールアドレスのログインの失敗も、上限までに切り詰めた値で記録が残る', async () => {
      // 局所部を btree の索引の行の上限（2704 バイト）より長くする
      const prefix = `${MARK}-long-${randomBytes(4).toString('hex')}-`;
      const email = `${prefix}${randomBytes(1600).toString('hex')}@example.com`;
      expect(Buffer.byteLength(email)).toBeGreaterThan(2704);
      const longUserAgent = `${USER_AGENT}-${'u'.repeat(4000)}`;

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', longUserAgent)
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(401);

      const rows = await prisma.auditLog.findMany({
        where: { action: 'LOGIN_FAILED', targetId: { startsWith: prefix } },
      });
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      const meta = row.metadata as Record<string, unknown>;
      expect(row.actorId).toBeNull();
      expect(row.targetId).toBe(email.slice(0, AUDIT_EMAIL_MAX_LENGTH));
      expect(meta).toMatchObject({
        result: 'failure',
        reason: 'unknown_email',
        email: email.slice(0, AUDIT_EMAIL_MAX_LENGTH),
        emailTruncated: true,
        userAgent: longUserAgent.slice(0, AUDIT_USER_AGENT_MAX_LENGTH),
        userAgentTruncated: true,
      });
    });

    /**
     * @requirement user-authentication/REQ-40.1
     * @requirement user-authentication/REQ-40.3
     */
    it('ログインと 2FA の監査の記録は、パスワード・コード・バックアップコード・トークンを含まない', async () => {
      const secret = authenticator.generateSecret();
      const user = await createUser('no-secrets', { secret });
      const backupCode = 'SECR5311';
      await prisma.twoFactorBackupCode.create({
        data: { userId: user.id, codeHash: await hash(backupCode) },
      });
      const wrongCode = wrongCodeFor(secret);

      await login(user.email, WRONG_PASSWORD);
      const first = await login(user.email, PASSWORD);
      const challengeToken = first.body.challengeToken as string;
      await verifyTotp(challengeToken, wrongCode);
      const verified = await verifyBackup(challengeToken, backupCode);
      expect(verified.status).toBe(200);

      const rows = await prisma.auditLog.findMany({ where: { targetId: user.id } });
      const actions = rows.map((row) => row.action).sort();
      expect(actions).toEqual(
        [
          'LOGIN_FAILED',
          'LOGIN_SUCCESS',
          'TWO_FACTOR_BACKUP_CODE_USED',
          'TWO_FACTOR_FAILED',
          'TWO_FACTOR_VERIFIED',
        ].sort()
      );
      const serialized = JSON.stringify(rows);
      for (const secretValue of [
        PASSWORD,
        WRONG_PASSWORD,
        wrongCode,
        backupCode,
        challengeToken,
        verified.body.accessToken as string,
        issuedRefreshToken(verified),
      ]) {
        expect(serialized).not.toContain(secretValue);
      }
    });
  });

  describe('ログアウト（要件40.4）', () => {
    /**
     * @requirement user-authentication/REQ-40.4
     */
    it('ログアウトを本人を実行者として記録する', async () => {
      const user = await createUser('logout', false);
      const loginResponse = await login(user.email, PASSWORD);
      expect(loginResponse.status).toBe(200);

      // 画面と同じ契約（Cookie と CSRF・Origin）でログアウトする
      const csrf = await fetchCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken as string}`)
        .set('Cookie', [`refreshToken=${issuedRefreshToken(loginResponse)}`, `csrf-token=${csrf}`])
        .set('X-CSRF-Token', csrf)
        .set('Origin', frontendOrigin())
        .set('User-Agent', USER_AGENT)
        .set('X-Forwarded-For', FORWARDED_FOR);
      expect(response.status).toBe(200);

      const rows = await auditRows(user.id, 'LOGOUT');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.actorId).toBe(user.id);
      expect(rows[0]!.actorEmail).toBe(user.email);
      expectRequestOrigin(rows[0]!.metadata);
    });

    /**
     * @requirement user-authentication/REQ-40.4
     */
    it('全デバイスのログアウトを本人を実行者として記録する', async () => {
      const user = await createUser('logout-all', false);
      const loginResponse = await login(user.email, PASSWORD);
      expect(loginResponse.status).toBe(200);

      const response = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken as string}`)
        .set('User-Agent', USER_AGENT)
        .set('X-Forwarded-For', FORWARDED_FOR);
      expect(response.status).toBe(200);

      const rows = await auditRows(user.id, 'LOGOUT_ALL');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.actorId).toBe(user.id);
      expect(rows[0]!.actorEmail).toBe(user.email);
      expectRequestOrigin(rows[0]!.metadata);
      expect(await auditRows(user.id, 'LOGOUT')).toHaveLength(0);
    });
  });
});
