/**
 * @fileoverview パスワードと二要素認証の対話型トランザクションの開始が DB 接続のタイムアウトで打ち切られる経路を 503 にすることの統合検証（タスク36.3）
 *
 * PasswordService・TwoFactorService の対話型トランザクションは、開始の前に同じ要求の中で DB へ問い合わせる。
 * その問い合わせの後に接続が失われ DB に到達できなくなると、トランザクションの開始は新しい接続の確立を待つ。
 * 接続の再試行の予算が Prisma の既定の maxWait（2000ms）より長いと、開始が P2028 で先に打ち切られ、
 * catch が自前のエラー（400 / 404）へ変えていた。各トランザクションは予算を覆う maxWait を渡し
 * （タスク35.12 の connectBudgetTransactionOptions）、接続のタイムアウトとして 503 を返す。
 *
 * モックを使わず、本物のアプリ・PrismaClient・@prisma/adapter-pg・RetryingPool・エラーハンドラーを通す。
 * 予算が 2000ms を超えるよう、DATABASE_RETRY_COUNT を 1、DATABASE_CONNECTION_TIMEOUT を 1000ms とする
 * （予算 3000ms。35.12 の統合検証と同じ）。接続先は実データベースへの転送と無応答を切り替えられる TCP の中継
 * （switchable-database-relay.ts）とし、トランザクションの直前に呼ばれるサービスのメソッドが返った後に
 * 無応答へ切り替える（メソッドそのものは本物を呼ぶ）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { PrismaPg } from '@prisma/adapter-pg';
import { authenticator } from 'otplib';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { PasswordService } from '../../services/password.service.js';
import type { TwoFactorService } from '../../services/two-factor.service.js';
import { SwitchableDatabaseRelay } from './switchable-database-relay.js';

/** 1 回の試行の接続タイムアウト（ミリ秒） */
const CONNECTION_TIMEOUT_MS = 1000;

/** 再試行回数（1 回目の再試行は 1000ms 後） */
const RETRY_COUNT = 1;

/** 接続の取得が失敗を返すまでの時間（ミリ秒）。2 回の試行 × 1000ms + 間隔 1000ms */
const CONNECT_BUDGET_MS = 3000;

/** 計時の誤差の許容（ミリ秒） */
const TIMING_TOLERANCE_MS = 200;

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

const MARK = 'test-ua363-pw2fa-tx-timeout';
const CURRENT_PASSWORD = 'Current!Passphrase-2026';
const NEW_PASSWORD = 'Str0ng!Passphrase-2026x';

describe('パスワードと二要素認証のトランザクションの開始の DB 接続タイムアウト時の 503（統合）', () => {
  const savedEnv: Partial<Record<(typeof OVERRIDDEN_ENV)[number], string | undefined>> = {};
  let relay: SwitchableDatabaseRelay;
  let directPrisma: PrismaClient;
  let app: Express;
  let disconnectPrisma: () => Promise<void>;
  let PasswordServiceClass: typeof PasswordService;
  let TwoFactorServiceClass: typeof TwoFactorService;
  let userId: string;
  let email: string;
  let accessToken: string;
  let currentPasswordHash: string;
  /** 中継を無応答へ切り替え終えた時刻（performance.now） */
  let cutAt: number | undefined;

  async function cleanup(): Promise<void> {
    const users = await directPrisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await directPrisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await directPrisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await directPrisma.passwordHistory.deleteMany({ where: { userId: { in: ids } } });
    await directPrisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await directPrisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
    await directPrisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  /**
   * サービスのメソッドが返った後に中継を無応答へ切り替える（直後のトランザクションの開始が新しい接続を待つ）
   */
  function cutAfter<T extends object>(prototype: T, method: keyof T & string): void {
    const original = prototype[method] as unknown as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(prototype, method as never).mockImplementation(async function (
      this: unknown,
      ...args: unknown[]
    ) {
      const result = await original.apply(this, args);
      await relay.cut();
      cutAt = performance.now();
      return result;
    } as never);
  }

  /** 無応答へ切り替えてから応答までの時間が、接続の取得の予算を経たことを確かめる */
  function expectAnsweredAfterConnectBudget(respondedAt: number): void {
    expect(cutAt).toBeDefined();
    expect(respondedAt - (cutAt as number)).toBeGreaterThanOrEqual(
      CONNECT_BUDGET_MS - TIMING_TOLERANCE_MS
    );
  }

  beforeAll(async () => {
    const realUrl = process.env.DATABASE_URL;
    expect(realUrl).toBeDefined();
    const parsed = new URL(realUrl as string);
    relay = new SwitchableDatabaseRelay(parsed.hostname, Number(parsed.port || 5432));
    const relayPort = await relay.listen();
    relay.forward();
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
    process.env.DATABASE_RETRY_COUNT = String(RETRY_COUNT);

    // 環境変数を書き換えた後に読み込み、db.ts のシングルトンを中継へ向けて組み立てさせる
    const { validateEnv } = await import('../../config/env.js');
    validateEnv();
    app = (await import('../../app.js')).default;
    const db = await import('../../db.js');
    disconnectPrisma = db.disconnectPrisma;
    PasswordServiceClass = (await import('../../services/password.service.js')).PasswordService;
    TwoFactorServiceClass = (await import('../../services/two-factor.service.js')).TwoFactorService;
    const tokenService = (await import('../../services/token.service.js')).default;

    await cleanup();
    email = `${MARK}@example.com`;
    currentPasswordHash = await new PasswordServiceClass(directPrisma).hashPassword(
      CURRENT_PASSWORD
    );
    const user = await directPrisma.user.create({
      data: { email, displayName: MARK, passwordHash: currentPasswordHash },
    });
    userId = user.id;
    accessToken = await tokenService.generateAccessToken({ userId, email, roles: [] });
  }, BEFORE_ALL_TIMEOUT_MS);

  beforeEach(async () => {
    relay.forward();
    cutAt = undefined;
    await directPrisma.user.update({
      where: { id: userId },
      data: { passwordHash: currentPasswordHash, twoFactorEnabled: false, twoFactorSecret: null },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    relay.forward();
  });

  afterAll(async () => {
    relay?.forward();
    if (directPrisma) {
      await cleanup();
    }
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

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('パスワードの変更（POST /api/v1/auth/password/change）は 503 と Problem Details を返し、パスワードを変えない', async () => {
    cutAfter(PasswordServiceClass.prototype, 'hashPassword');

    const response = await request(app)
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
        newPasswordConfirm: NEW_PASSWORD,
      });
    const respondedAt = performance.now();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ...SERVICE_UNAVAILABLE,
      instance: '/api/v1/auth/password/change',
    });
    expectAnsweredAfterConnectBudget(respondedAt);
    relay.forward();
    const user = await directPrisma.user.findUnique({ where: { id: userId } });
    expect(user?.passwordHash).toBe(currentPasswordHash);
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('パスワードのリセットの確定（POST /api/v1/auth/password/reset）は 503 と Problem Details を返し、トークンを使用済みにしない', async () => {
    const token = `${MARK}-reset-token`;
    await directPrisma.passwordResetToken.deleteMany({ where: { userId } });
    const resetToken = await directPrisma.passwordResetToken.create({
      data: { userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    cutAfter(PasswordServiceClass.prototype, 'hashPassword');

    const response = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: NEW_PASSWORD });
    const respondedAt = performance.now();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ...SERVICE_UNAVAILABLE,
      instance: '/api/v1/auth/password/reset',
    });
    expectAnsweredAfterConnectBudget(respondedAt);
    relay.forward();
    const stored = await directPrisma.passwordResetToken.findUnique({
      where: { id: resetToken.id },
    });
    expect(stored?.usedAt).toBeNull();
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('2FA の設定の開始（POST /api/v1/auth/2fa/setup）は 503 と Problem Details を返し、秘密鍵を保存しない', async () => {
    cutAfter(TwoFactorServiceClass.prototype, 'generateQRCode');

    const response = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken}`);
    const respondedAt = performance.now();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/2fa/setup' });
    expectAnsweredAfterConnectBudget(respondedAt);
    relay.forward();
    const user = await directPrisma.user.findUnique({ where: { id: userId } });
    expect(user?.twoFactorSecret).toBeNull();
  }, 30000);

  /**
   * @requirement user-authentication/REQ-24.1
   */
  it('2FA の有効化（POST /api/v1/auth/2fa/enable）は 503 と Problem Details を返し、2FA を有効にしない', async () => {
    const secret = authenticator.generateSecret();
    const twoFactorSecret = await new TwoFactorServiceClass().encryptSecret(secret);
    await directPrisma.user.update({ where: { id: userId }, data: { twoFactorSecret } });
    cutAfter(TwoFactorServiceClass.prototype, 'decryptSecret');

    const response = await request(app)
      .post('/api/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ totpCode: authenticator.generate(secret) });
    const respondedAt = performance.now();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ...SERVICE_UNAVAILABLE, instance: '/api/v1/auth/2fa/enable' });
    expectAnsweredAfterConnectBudget(respondedAt);
    relay.forward();
    const user = await directPrisma.user.findUnique({ where: { id: userId } });
    expect(user?.twoFactorEnabled).toBe(false);
  }, 30000);
});
