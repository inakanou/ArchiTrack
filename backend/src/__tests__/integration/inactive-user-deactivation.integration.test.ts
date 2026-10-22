/**
 * @fileoverview 90 日の自動無効化と復旧のスクリプトの統合検証（user-authentication タスク49.4）
 *
 * Requirements (user-authentication):
 * - REQ-36.8: 最終ログイン・作成・最後の再有効化のうち最も新しい日時から 90 日を過ぎた有効な利用者を自動で無効化する
 * - REQ-36.9: 自動無効化を一通の通知で全システム管理者へ送り、監査に自動無効化であることを記録する
 * - REQ-36.3: 復旧のスクリプトで再有効化され、再び利用できる
 *
 * モックを使わず、定期処理と同じ組み立ての AccountStatusService（createAccountStatusServiceForJob）を実
 * PostgreSQL・実 Redis で動かし、本物のアプリで API の拒否を確かめる。通知は本物の AdminNotificationService の
 * 呼び出しを観測する（送信はそのまま行う）。
 *
 * 共有のデータベース（E2E と同じ）の他の利用者を無効化しないよう、判定の基準の時刻を過去（2001-01-01）に置き、
 * 本試験の利用者の日時だけをその基準からの日数で作る。基準の 90 日前より前の日時だけを持つ利用者は、本試験の
 * 利用者の他にいない（作成日時は既定で現在）。
 */

import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { AdminNotificationService } from '../../services/admin-notification.service.js';
import {
  AUTO_DEACTIVATION_REASON,
  type AccountStatusService,
} from '../../services/account-status.service.js';
import { createAccountStatusServiceForJob } from '../../jobs/inactive-user-deactivation.job.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { loginForTokens } from './auth-login-client.js';
import { issuedRefreshToken, refreshWithCookie } from './refresh-cookie-client.js';
import { createTestUser } from './test-user-factory.js';

const execFileAsync = promisify(execFile);

const MARK = 'test-49-4-inactive-deactivation';
const PASSWORD = 'InactiveDeactivation!Passphrase-2026';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 判定の基準の時刻（共有のデータベースの他の利用者を対象にしないため過去に置く） */
const NOW = new Date('2001-01-01T00:00:00.000Z');

function daysBeforeNow(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

describe('90 日の自動無効化と復旧のスクリプト（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let passwordHash: string;
  let service: AccountStatusService;
  let notifySpy: ReturnType<typeof vi.spyOn>;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await redisClient.del(...ids.map(authUserStateCacheKey));
    }
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function clearRateLimits(): Promise<void> {
    const keys = await redisClient.keys('rl:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }

  /** 作成・最終ログイン・最後の再有効化の日時を与えた user ロールの利用者を作る */
  async function createUserAt(
    label: string,
    dates: { createdAt: Date; lastLoginAt?: Date | null; reactivatedAt?: Date | null }
  ) {
    const user = await createTestUser(
      prisma,
      {
        email: `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`,
        displayName: `${MARK}-${label}`,
        passwordHash,
        createdAt: dates.createdAt,
        lastLoginAt: dates.lastLoginAt ?? null,
        reactivatedAt: dates.reactivatedAt ?? null,
      },
      {}
    );
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'user' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  async function isActive(userId: string): Promise<boolean> {
    return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).isActive;
  }

  async function autoDeactivationAudits(userId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'USER_AUTO_DEACTIVATED', targetId: userId },
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    service = createAccountStatusServiceForJob(prisma);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    await clearRateLimits();
    notifySpy = vi.spyOn(AdminNotificationService.prototype, 'notifyAllAdmins');
  });

  afterEach(() => {
    notifySpy.mockRestore();
  });

  /**
   * @requirement user-authentication/REQ-36.8
   * @requirement user-authentication/REQ-36.9
   */
  it('最も新しい日時から 89 日の利用者は残り、91 日の利用者と 91 日前に作られ一度もログインしていない利用者が無効化され、最終ログインが 91 日前でも 1 日前に再有効化された利用者は残る。二度目の実行で監査と通知が重複しない', async () => {
    const day89 = await createUserAt('day89', {
      createdAt: daysBeforeNow(200),
      lastLoginAt: daysBeforeNow(89),
    });
    const day91 = await createUserAt('day91', {
      createdAt: daysBeforeNow(200),
      lastLoginAt: daysBeforeNow(91),
    });
    const reactivated = await createUserAt('reactivated', {
      createdAt: daysBeforeNow(200),
      lastLoginAt: daysBeforeNow(91),
      reactivatedAt: daysBeforeNow(1),
    });
    const neverLoggedIn = await createUserAt('never', { createdAt: daysBeforeNow(91) });
    const newcomer = await createUserAt('newcomer', { createdAt: daysBeforeNow(89) });

    const first = await service.deactivateInactiveUsers(NOW);

    expect([...first.deactivatedUserIds].sort()).toEqual([day91.id, neverLoggedIn.id].sort());
    expect(await isActive(day89.id)).toBe(true);
    expect(await isActive(reactivated.id)).toBe(true);
    expect(await isActive(newcomer.id)).toBe(true);
    for (const target of [day91, neverLoggedIn]) {
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(stored.isActive).toBe(false);
      expect(stored.deactivatedAt).toBeInstanceOf(Date);
      expect(stored.deactivationReason).toBe(AUTO_DEACTIVATION_REASON);
      // 最終ログイン日時は事実の記録として変えない
      expect(stored.lastLoginAt?.getTime() ?? null).toBe(target.lastLoginAt?.getTime() ?? null);
    }

    // 実行者の無い監査に自動無効化であることを記録する（要件36.9）
    const audits = await autoDeactivationAudits(day91.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: null,
      actorEmail: null,
      actorDisplayName: null,
      targetType: 'User',
      before: { isActive: true },
      after: { isActive: false },
      metadata: expect.objectContaining({
        trigger: 'inactivity',
        targetEmail: day91.email,
        lastActivityAt: daysBeforeNow(91).toISOString(),
        inactivityDays: 90,
      }),
    });
    expect(await autoDeactivationAudits(neverLoggedIn.id)).toHaveLength(1);
    for (const survivor of [day89, reactivated, newcomer]) {
      expect(await autoDeactivationAudits(survivor.id)).toHaveLength(0);
    }

    // 対象の一覧を一通の通知で全システム管理者へ送る
    expect(notifySpy).toHaveBeenCalledTimes(1);
    const notification = notifySpy.mock.calls[0]?.[0] as {
      kind: string;
      subject: string;
      lines: string[];
    };
    expect(notification.kind).toBe('USERS_AUTO_DEACTIVATED');
    expect(notification.subject).toContain('2 名');
    expect(notification.lines.join('\n')).toContain(day91.email);
    expect(notification.lines.join('\n')).toContain(neverLoggedIn.email);
    expect(notification.lines.join('\n')).not.toContain(day89.email);

    // 二度目の実行は何もしない（冪等）
    const second = await service.deactivateInactiveUsers(NOW);
    expect(second.deactivatedUserIds).toEqual([]);
    expect(await autoDeactivationAudits(day91.id)).toHaveLength(1);
    expect(await autoDeactivationAudits(neverLoggedIn.id)).toHaveLength(1);
    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  /**
   * @requirement user-authentication/REQ-36.8
   */
  it('自動無効化の直後に対象者の API とリフレッシュが状態のキャッシュの TTL を待たずに 401 になり、リフレッシュトークンが残らない', async () => {
    const target = await createUserAt('session', { createdAt: daysBeforeNow(200) });
    const login = await loginForTokens(app, { email: target.email, password: PASSWORD });
    const bearer: [string, string] = ['Authorization', `Bearer ${login.body.accessToken}`];

    // 有効な間に状態をキャッシュへ載せる
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set(...bearer)
      ).status
    ).toBe(200);
    expect(await redisClient.get(authUserStateCacheKey(target.id))).not.toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBeGreaterThan(0);

    // ログインが記録した最終ログイン日時を、基準の 91 日前へ戻す（キャッシュは有効なまま残る）
    await prisma.user.update({
      where: { id: target.id },
      data: { lastLoginAt: daysBeforeNow(91) },
    });
    expect(await redisClient.get(authUserStateCacheKey(target.id))).not.toBeNull();

    const result = await service.deactivateInactiveUsers(NOW);
    expect(result.deactivatedUserIds).toEqual([target.id]);

    expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBe(0);
    for (const path of ['/api/v1/auth/me', '/api/projects']) {
      const denied = await request(app)
        .get(path)
        .set(...bearer);
      expect(denied.status, path).toBe(401);
      expect(denied.body.code, path).toBe('ACCOUNT_DISABLED');
    }
    const refresh = await refreshWithCookie(app, issuedRefreshToken(login));
    expect(refresh.status).toBe(401);
  });

  /**
   * @requirement user-authentication/REQ-36.3
   * @requirement user-authentication/REQ-36.8
   */
  it('復旧のスクリプト（npm run user:reactivate）で再有効化され、最後の再有効化の日時が書かれ、監査に operator_script として残り、再びログインできる。不在のメールアドレスは 0 以外で終わる', async () => {
    const target = await createUserAt('script', {
      createdAt: daysBeforeNow(200),
      lastLoginAt: daysBeforeNow(91),
    });
    expect((await service.deactivateInactiveUsers(NOW)).deactivatedUserIds).toEqual([target.id]);
    const denied = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: target.email, password: PASSWORD });
    expect(denied.status).toBe(401);

    const before = Date.now();
    const { stdout } = await execFileAsync(
      'npm',
      [
        'run',
        '--silent',
        'user:reactivate',
        '--',
        '--email',
        target.email,
        '--reason',
        '復旧の検証',
      ],
      { cwd: process.cwd(), env: process.env }
    );
    expect(stdout).toContain(`再有効化しました: ${target.email}`);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.isActive).toBe(true);
    expect(stored.deactivatedAt).toBeNull();
    expect(stored.deactivationReason).toBeNull();
    expect(stored.reactivatedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(stored.lastLoginAt?.getTime()).toBe(daysBeforeNow(91).getTime());

    const audits = await prisma.auditLog.findMany({
      where: { action: 'USER_REACTIVATED', targetId: target.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: null,
      metadata: expect.objectContaining({
        trigger: 'operator_script',
        reason: '復旧の検証',
        targetEmail: target.email,
      }),
    });

    // 再びログインでき、ログインの前と同じ基準で判定しても最後の再有効化の日時が起点になり対象にならない
    const login = await loginForTokens(app, { email: target.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect((await service.deactivateInactiveUsers(NOW)).deactivatedUserIds).toEqual([]);
    expect(await isActive(target.id)).toBe(true);

    // 既に有効な利用者は何もしないことを明示して 0 で終わる
    const again = await execFileAsync(
      'npm',
      ['run', '--silent', 'user:reactivate', '--', '--email', target.email],
      { cwd: process.cwd(), env: process.env }
    );
    expect(again.stdout).toContain('既に有効です');
    expect(
      await prisma.auditLog.count({ where: { action: 'USER_REACTIVATED', targetId: target.id } })
    ).toBe(1);

    // 不在のメールアドレスは 0 以外で終わる
    const unknownEmail = `${MARK}-unknown-${randomBytes(4).toString('hex')}@example.com`;
    const failure = await execFileAsync(
      'npm',
      ['run', '--silent', 'user:reactivate', '--', '--email', unknownEmail],
      { cwd: process.cwd(), env: process.env }
    ).then(
      () => null,
      (error: { code?: number; stderr?: string }) => error
    );
    expect(failure, '不在のメールアドレスで 0 で終わった').not.toBeNull();
    expect(failure?.code).toBe(1);
    expect(failure?.stderr).toContain(`該当する利用者がいません: ${unknownEmail}`);
  }, 120_000);
});
