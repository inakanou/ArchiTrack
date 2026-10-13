/**
 * @fileoverview パスワードと二要素認証のエンドポイントが DB 接続のタイムアウトで 503 を返すことの統合検証（タスク36.3）
 *
 * モックを使わず、本物のアプリ（app.ts の認証ルート・authenticate・AuthService・PasswordService・
 * TwoFactorService）と、db.ts の getPrismaClient が組み立てる本物の PrismaClient・@prisma/adapter-pg・
 * RetryingPool、エラーハンドラーを通す。各要求を速く終えるため、DATABASE_RETRY_COUNT を 0（再試行なし）、
 * DATABASE_CONNECTION_TIMEOUT を 200ms とする（35.11 の統合検証と同じ）。
 *
 * 接続先は、無応答（TCP 接続は受け付けるが一切応答しない。35.11 の統合検証の無応答のサーバーと同じ振る舞い）と
 * テスト用の実データベースへの転送を切り替えられるローカルの TCP の中継（switchable-database-relay.ts）とする。
 *
 * 確かめること:
 * - 最初から DB に到達できないとき、パスワードの変更・リセットの要求と確定・2FA の設定・有効化・無効化・
 *   バックアップコードの再生成と状態の取得・2FA のログインの検証が 503 と Problem Details を返す
 * - 2FA のログインの検証（TOTP・バックアップコード）の途中で DB に到達できなくなったとき、
 *   検証の失敗として扱わずに 503 を返し、失敗回数（twoFactorFailures）を加算しない。
 *   途中の切断は、TwoFactorService の検証メソッドの前後に中継の切り替えを差し込んで作る
 *   （検証メソッドそのものは本物を呼ぶ）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { PrismaPg } from '@prisma/adapter-pg';
import { authenticator } from 'otplib';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { TwoFactorService } from '../../services/two-factor.service.js';
import { SwitchableDatabaseRelay } from './switchable-database-relay.js';

/** 接続の確立を待つ時間（ミリ秒） */
const CONNECTION_TIMEOUT_MS = 200;

/** beforeAll の上限（ミリ秒）。起動直後のコンテナでは app.js の動的 import に 10 秒前後かかる */
const BEFORE_ALL_TIMEOUT_MS = 60000;

/** 本ファイルが書き換える環境変数（afterAll で元へ戻す） */
const OVERRIDDEN_ENV = [
  'DATABASE_URL',
  'DATABASE_CONNECTION_TIMEOUT',
  'DATABASE_RETRY_COUNT',
] as const;

const SERVICE_UNAVAILABLE = {
  type: 'https://api.architrack.com/errors/internal-server-error',
  title: 'Service Unavailable',
  status: 503,
  detail: 'Database connection error',
};

const MARK = 'test-ua363-pw2fa-timeout';

describe('パスワードと二要素認証のエンドポイントの DB 接続タイムアウト時の 503（統合）', () => {
  const savedEnv: Partial<Record<(typeof OVERRIDDEN_ENV)[number], string | undefined>> = {};
  let relay: SwitchableDatabaseRelay;
  let directPrisma: PrismaClient;
  let app: Express;
  let disconnectPrisma: () => Promise<void>;
  let TwoFactorServiceClass: typeof TwoFactorService;
  let generateAccessToken: (payload: {
    userId: string;
    email: string;
    roles: string[];
  }) => Promise<string>;

  beforeAll(async () => {
    const realUrl = process.env.DATABASE_URL;
    expect(realUrl).toBeDefined();
    const parsed = new URL(realUrl as string);
    relay = new SwitchableDatabaseRelay(parsed.hostname, Number(parsed.port || 5432));
    const relayPort = await relay.listen();
    directPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: realUrl as string }),
    });

    for (const key of OVERRIDDEN_ENV) {
      savedEnv[key] = process.env[key];
    }
    const relayUrl = new URL(realUrl as string);
    relayUrl.hostname = '127.0.0.1';
    relayUrl.port = String(relayPort);
    process.env.DATABASE_URL = relayUrl.toString();
    process.env.DATABASE_CONNECTION_TIMEOUT = String(CONNECTION_TIMEOUT_MS);
    process.env.DATABASE_RETRY_COUNT = '0';

    // 環境変数を書き換えた後に読み込み、db.ts のシングルトンを中継へ向けて組み立てさせる
    const { validateEnv } = await import('../../config/env.js');
    validateEnv();
    app = (await import('../../app.js')).default;
    const db = await import('../../db.js');
    disconnectPrisma = db.disconnectPrisma;
    TwoFactorServiceClass = (await import('../../services/two-factor.service.js')).TwoFactorService;
    const tokenService = (await import('../../services/token.service.js')).default;
    generateAccessToken = (payload) => tokenService.generateAccessToken(payload);
  }, BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await disconnectPrisma?.();
    await directPrisma?.$disconnect();
    await relay?.close();
    for (const key of OVERRIDDEN_ENV) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('最初から DB に到達できないとき', () => {
    let accessToken: string;

    beforeAll(async () => {
      await relay.cut();
      accessToken = await generateAccessToken({
        userId: 'ua363-user',
        email: 'ua363@example.com',
        roles: ['user'],
      });
    });

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('パスワードの変更（POST /api/v1/auth/password/change）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'Current!Pass-2026',
          newPassword: 'Str0ng!Passphrase-2026',
          newPasswordConfirm: 'Str0ng!Passphrase-2026',
        });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/password/change',
      });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('パスワードのリセットの要求（POST /api/v1/auth/password/reset-request）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/password/reset-request')
        .send({ email: 'ua363@example.com' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/password/reset-request',
      });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('パスワードのリセットの確定（POST /api/v1/auth/password/reset）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: 'ua363-reset-token', newPassword: 'Str0ng!Passphrase-2026' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/password/reset',
      });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('2FA の設定の開始（POST /api/v1/auth/2fa/setup）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/2fa/setup' });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('2FA の有効化（POST /api/v1/auth/2fa/enable）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ totpCode: '123456' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/2fa/enable',
      });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('2FA の無効化（POST /api/v1/auth/2fa/disable）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password: 'Current!Pass-2026' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/2fa/disable',
      });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('バックアップコードの再生成（POST /api/v1/auth/2fa/backup-codes/regenerate）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/2fa/backup-codes/regenerate',
      });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('バックアップコードの状態の取得（GET /api/v1/auth/2fa/backup-codes）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .get('/api/v1/auth/2fa/backup-codes')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/2fa/backup-codes',
      });
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('2FA のログインの検証（POST /api/v1/auth/verify-2fa）は 503 と Problem Details を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .send({ tempToken: accessToken, token: '123456' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/verify-2fa',
      });
    }, 30000);
  });

  describe('2FA のログインの検証の途中で DB に到達できなくなったとき', () => {
    let userId: string;
    let email: string;
    let tempToken: string;
    let invalidTotpCode: string;

    async function failures(): Promise<number | null> {
      const user = await directPrisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorFailures: true },
      });
      return user?.twoFactorFailures ?? null;
    }

    async function cleanup(): Promise<void> {
      const users = await directPrisma.user.findMany({
        where: { email: { contains: MARK } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      await directPrisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
      await directPrisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await directPrisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
      await directPrisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    beforeAll(async () => {
      relay.forward();
      await cleanup();
      const secret = authenticator.generateSecret();
      const twoFactorSecret = await new TwoFactorServiceClass().encryptSecret(secret);
      // 現在の正しいコードの先頭の桁を変え、形式は正しいが一致しないコードにする
      const current = authenticator.generate(secret);
      invalidTotpCode = `${(Number(current[0]) + 5) % 10}${current.slice(1)}`;
      email = `${MARK}@example.com`;
      const user = await directPrisma.user.create({
        data: {
          email,
          displayName: MARK,
          passwordHash: 'not-used',
          twoFactorEnabled: true,
          twoFactorSecret,
        },
      });
      userId = user.id;
      tempToken = await generateAccessToken({ userId, email, roles: [] });
    });

    beforeEach(async () => {
      relay.forward();
      await directPrisma.user.update({
        where: { id: userId },
        data: { twoFactorFailures: 0, twoFactorLockedUntil: null },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      relay.forward();
    });

    afterAll(async () => {
      relay.forward();
      await cleanup();
    });

    /**
     * TwoFactorService の検証メソッドの呼び出しの間だけ DB を無応答にする。
     * 検証の中のユーザーの取得が接続のタイムアウトで失敗し、呼び出しが返った後は DB が戻る
     * （失敗回数の加算を DB が受け付ける状態で、加算が起きないことを観測する）
     */
    function cutDuring(method: 'verifyTOTP' | 'verifyBackupCode'): void {
      const original = TwoFactorServiceClass.prototype[method];
      vi.spyOn(TwoFactorServiceClass.prototype, method).mockImplementation(async function (
        this: TwoFactorService,
        ...args: [string, string]
      ) {
        await relay.cut();
        try {
          return await original.apply(this, args);
        } finally {
          relay.forward();
        }
      });
    }

    /**
     * TwoFactorService の検証メソッドが返った後に DB を無応答にする（失敗回数の加算が接続のタイムアウトになる）
     */
    function cutAfter(method: 'verifyTOTP' | 'verifyBackupCode'): void {
      const original = TwoFactorServiceClass.prototype[method];
      vi.spyOn(TwoFactorServiceClass.prototype, method).mockImplementation(async function (
        this: TwoFactorService,
        ...args: [string, string]
      ) {
        const result = await original.apply(this, args);
        await relay.cut();
        return result;
      });
    }

    it('前提: DB に到達できるとき、一致しない TOTP コードは 401 を返し失敗回数を 1 加算する', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .send({ tempToken, token: invalidTotpCode });

      expect(response.status).toBe(401);
      expect(await failures()).toBe(1);
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('TOTP の検証の中の接続のタイムアウトは 503 と Problem Details を返し、失敗回数を加算しない', async () => {
      cutDuring('verifyTOTP');

      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .send({ tempToken, token: invalidTotpCode });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/verify-2fa',
      });
      expect(await failures()).toBe(0);
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('バックアップコードの検証の中の接続のタイムアウトは 503 と Problem Details を返し、失敗回数を加算しない', async () => {
      cutDuring('verifyBackupCode');

      const response = await request(app)
        .post('/api/v1/auth/verify-2fa/backup')
        .send({ email, backupCode: 'ZZZZ9999' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/verify-2fa/backup',
      });
      expect(await failures()).toBe(0);
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('TOTP の検証の失敗の後、失敗回数の加算が接続のタイムアウトになると 503 と Problem Details を返す', async () => {
      cutAfter('verifyTOTP');

      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .send({ tempToken, token: invalidTotpCode });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/verify-2fa',
      });
      relay.forward();
      expect(await failures()).toBe(0);
    }, 30000);

    /**
     * @requirement user-authentication/REQ-24.1
     */
    it('バックアップコードの検証の失敗の後、失敗回数の加算が接続のタイムアウトになると 503 と Problem Details を返す', async () => {
      cutAfter('verifyBackupCode');

      const response = await request(app)
        .post('/api/v1/auth/verify-2fa/backup')
        .send({ email, backupCode: 'ZZZZ9999' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE,
        instance: '/api/v1/auth/verify-2fa/backup',
      });
      relay.forward();
      expect(await failures()).toBe(0);
    }, 30000);
  });
});
