/**
 * @fileoverview セキュリティ上の異常の検知と通知の統合検証（user-authentication タスク55.4）
 *
 * Requirements (user-authentication):
 * - REQ-26.12: 招待の回数制限は利用者 ID ごとに数える
 * - REQ-39.7: 閲覧範囲外へのアクセスを記録し、異常の検知へ送る
 * - REQ-43.1: ログインの失敗の件数が閾値を超えると全システム管理者へ通知する
 * - REQ-43.2: 権限の拒否（403）と閲覧範囲外へのアクセスの件数が閾値を超えると通知する
 * - REQ-43.3: 429 と 5xx の件数が閾値を超えると通知する
 * - REQ-43.4: 同一利用者のデータ出力の件数が閾値を超えると通知する
 * - REQ-43.5: 通知に検知の種類・期間・件数・主な送信元と利用者を含める
 * - REQ-43.6: 同じ種類の通知を抑止の時間内に重複して送らない
 * - REQ-43.7: 閾値を環境ごとの設定で変えられる
 *
 * 試験・CI の環境は `SECURITY_ALERT_*` の閾値を全件の実行で超えない値にしているため、検知の振る舞いは
 * ここで閾値を下げた部品（環境変数と同じ形の設定から読む）を共有の部品と差し替えて確かめる。
 * 観測は本物の経路（app.ts の認証・権限の検査・閲覧範囲・出力の記録）から送らせ、計数は実 Redis、
 * 宛先は実 DB の有効なシステム管理者で決める（メールの投入だけを記録の部品で代える）。
 * 429 と 5xx は app.ts の制限が試験の実行環境で外れるため、本番の判定で組み立てた招待の制限と
 * 共通のエラーハンドラーを載せた試験用のアプリで起こす。
 * Redis の鍵は本検証だけの接頭辞で数え、E2E や他の統合検証の計数と混ぜない。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createRuntimeMode } from '../../config/runtime-mode.js';
import { loadSecurityAlertConfig } from '../../config/security-alert.js';
import { configureTrustProxy } from '../../middleware/client-ip.js';
import { authenticate } from '../../middleware/authenticate.middleware.js';
import { createRateLimiters } from '../../middleware/rateLimit.middleware.js';
import {
  errorHandler,
  observeServerErrorResponses,
} from '../../middleware/errorHandler.middleware.js';
import logger from '../../utils/logger.js';
import { AdminNotificationService } from '../../services/admin-notification.service.js';
import {
  SecurityAnomalyMonitor,
  setSharedSecurityAnomalyMonitor,
} from '../../services/security-anomaly-monitor.service.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua554-anomaly';
/** 本検証だけの Redis の鍵の接頭辞 */
const KEY_PREFIX = `${MARK}:${randomUUID()}:`;
/** 下げた閾値（4 件目で超える） */
const THRESHOLD = 3;

interface TestUser {
  id: string;
  email: string;
  token: string;
}

interface SentEmail {
  to: string;
  subject: string;
  lines: string[];
}

describe('セキュリティ上の異常の検知と通知（統合・実 DB・実 Redis）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let monitor: SecurityAnomalyMonitor;
  let sent: SentEmail[];
  let admin: TestUser;
  let member: TestUser;
  let other: TestUser;
  let projectId: string;
  let probeApp: Express;

  const emailSender = {
    sendAdminNotificationEmail: vi.fn(async (to: string, subject: string, lines: string[]) => {
      sent.push({ to, subject, lines });
    }),
  };

  async function cleanup(): Promise<void> {
    if (redisClient) {
      const keys = await redisClient.keys(`${KEY_PREFIX}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      const users = await prisma.user.findMany({
        where: { email: { contains: MARK } },
        select: { id: true },
      });
      const limiterKeys = users.map((u) => `rl:invitation:user:${u.id}`);
      if (limiterKeys.length > 0) {
        await redisClient.del(...limiterKeys);
      }
    }
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const rbac = getSharedRBACService();
    for (const id of userIds) {
      await rbac.invalidateUserPermissionsCache(id);
    }
    const projects = await prisma.project.findMany({
      where: { name: { contains: MARK } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: projectIds } },
        { targetId: { contains: MARK } },
      ],
    });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function createUser(suffix: string, roleName: string): Promise<TestUser> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`前提の欠落: ロール ${roleName} が試験 DB に無い`);
    }
    const email = `${MARK}-${suffix}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [roleName],
    });
    return { id: user.id, email, token };
  }

  /** 有効なシステム管理者のメールアドレス（通知の宛先の期待値） */
  async function activeAdminEmails(): Promise<string[]> {
    const admins = await prisma.user.findMany({
      where: { isActive: true, userRoles: { some: { role: { name: 'admin' } } } },
      select: { email: true },
    });
    return admins.map((a) => a.email).sort();
  }

  /** 送った通知の件名ごとの数（宛先ごとの重複を除く） */
  function notificationsAbout(label: string): SentEmail[] {
    const first = sent.filter((m) => m.subject.includes(label));
    const recipients = new Set(first.map((m) => m.to));
    return first.filter((m) => m.to === [...recipients][0]);
  }

  /** 観測の計数と通知を待つ */
  async function settle(): Promise<void> {
    // 5xx の観測は応答の完了の後に送られるため、受け付けが届くまで少し待ってから計数を待つ
    await new Promise((resolve) => setTimeout(resolve, 20));
    await monitor.flush();
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ計数は捨てられ、ここでの観測にならないため赤にする）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;

    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    admin = await createUser('admin', 'admin');
    member = await createUser('member', 'user');
    other = await createUser('other', 'user');
    expect(await getSharedRBACService().hasPermission(member.id, 'project:read_all')).toBe(false);
    expect(await getSharedRBACService().hasPermission(member.id, 'ops:manage')).toBe(false);

    const project = await prisma.project.create({
      data: { name: `${MARK}-project`, salesPersonId: other.id, createdById: other.id },
      select: { id: true },
    });
    projectId = project.id;

    // 環境変数と同じ形の設定から閾値を下げる（要件43.7）
    monitor = new SecurityAnomalyMonitor({
      getRedisClient: () => redis.getClient(),
      getNotifier: () => new AdminNotificationService(prisma, emailSender),
      config: loadSecurityAlertConfig({
        SECURITY_ALERT_LOGIN_FAILED_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_PERMISSION_DENIED_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_RATE_LIMITED_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_SERVER_ERROR_THRESHOLD: String(THRESHOLD),
        SECURITY_ALERT_DATA_EXPORT_THRESHOLD: String(THRESHOLD),
      }),
      keyPrefix: KEY_PREFIX,
    });
    setSharedSecurityAnomalyMonitor(monitor);

    // 本番の判定で組み立てた招待の制限（authenticate の後）と、5xx を返す経路
    const limiters = createRateLimiters({
      runtimeMode: createRuntimeMode({ NODE_ENV: 'production' }),
      getRedisClient: () => redis.getClient(),
    });
    probeApp = express();
    configureTrustProxy(probeApp, 1);
    probeApp.use((req: Request, _res: Response, next: NextFunction) => {
      req.log ??= logger.child({}) as unknown as Request['log'];
      next();
    });
    probeApp.use(observeServerErrorResponses);
    probeApp.post('/probe/invitations', authenticate, limiters.invitation, (_req, res) => {
      res.status(201).json({ ok: true });
    });
    probeApp.get('/probe/failure', authenticate, () => {
      throw new Error('probe failure');
    });
    probeApp.use(errorHandler);
  });

  beforeEach(() => {
    sent = [];
    emailSender.sendAdminNotificationEmail.mockClear();
  });

  afterAll(async () => {
    setSharedSecurityAnomalyMonitor(null);
    await cleanup();
    await redis.disconnect();
  });

  /**
   * @requirement user-authentication/REQ-43.1
   * @requirement user-authentication/REQ-43.5
   * @requirement user-authentication/REQ-43.6
   * @requirement user-authentication/REQ-43.7
   */
  it('ログインの失敗が閾値を超えると全システム管理者へ一度だけ通知し、抑止の時間内は再送しない', async () => {
    const login = (suffix: number) =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${MARK}-unknown-${suffix}@example.com`, password: 'WrongPassword123!' });

    for (let i = 0; i < THRESHOLD; i++) {
      expect((await login(i)).status).toBe(401);
    }
    await settle();
    expect(sent).toHaveLength(0);

    expect((await login(THRESHOLD)).status).toBe(401);
    await settle();
    const expectedRecipients = await activeAdminEmails();
    expect(expectedRecipients).toContain(admin.email);
    expect(sent.map((m) => m.to).sort()).toEqual(expectedRecipients);
    const [first] = sent;
    expect(first!.subject).toBe('【重要】セキュリティ上の異常の検知: ログインの失敗');
    const body = first!.lines.join('\n');
    expect(body).toContain('検知の種類: ログインの失敗（login_failed）');
    expect(body).toMatch(/期間: \S+ 〜 \S+（時間窓 300 秒）/);
    expect(body).toContain(`件数: ${THRESHOLD + 1} 件（閾値 ${THRESHOLD} 件）`);
    expect(body).toMatch(/主な送信元 IP: \S+（4 件）/);

    // 抑止の時間内は超過が続いても再送しない
    for (let i = 0; i < 5; i++) {
      await login(100 + i);
    }
    await settle();
    expect(notificationsAbout('ログインの失敗')).toHaveLength(1);
  });

  /**
   * @requirement user-authentication/REQ-43.2
   * @requirement user-authentication/REQ-39.7
   * @requirement user-authentication/REQ-43.6
   */
  it('権限の拒否と閲覧範囲外のアクセスを合算して閾値を超えると一度だけ通知する', async () => {
    const forbidden = () =>
      request(app).get('/api/v1/admin/log-level').set('Authorization', `Bearer ${member.token}`);
    const outOfScope = () =>
      request(app).get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${member.token}`);

    expect((await forbidden()).status).toBe(403);
    expect((await forbidden()).status).toBe(403);
    expect((await outOfScope()).status).toBe(404);
    await settle();
    expect(sent).toHaveLength(0);

    expect((await outOfScope()).status).toBe(404);
    await settle();
    const notices = notificationsAbout('権限の拒否');
    expect(notices).toHaveLength(1);
    const body = notices[0]!.lines.join('\n');
    expect(body).toContain('内訳: permission_denied（2 件）, scope_denied（2 件）');
    expect(body).toContain(`主な利用者 ID: ${member.id}（4 件）`);

    // 範囲外のアクセスはセキュリティログ（監査）にも利用者・対象・日時とともに残る（要件39.7）
    const denials = await prisma.auditLog.findMany({
      where: { action: 'PROJECT_SCOPE_DENIED', actorId: member.id, targetId: projectId },
    });
    expect(denials).toHaveLength(2);

    for (let i = 0; i < 3; i++) {
      await forbidden();
      await outOfScope();
    }
    await settle();
    expect(notificationsAbout('権限の拒否')).toHaveLength(1);
  });

  /**
   * @requirement user-authentication/REQ-43.4
   * @requirement user-authentication/REQ-43.6
   */
  it('データの出力は利用者ごとに数え、閾値を超えた利用者を通知する', async () => {
    const recordExport = (user: TestUser) =>
      request(app)
        .post('/api/v1/audit-logs/exports')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ kind: 'audit_log_json', projectId: null, targetIds: [], itemCount: 0 });

    for (let i = 0; i < THRESHOLD; i++) {
      expect((await recordExport(other)).status).toBe(201);
      expect((await recordExport(member)).status).toBe(201);
    }
    await settle();
    // 合わせて 6 件でも、利用者ごとには閾値を超えていない
    expect(sent).toHaveLength(0);

    expect((await recordExport(member)).status).toBe(201);
    await settle();
    const notices = notificationsAbout('同一利用者のデータ出力');
    expect(notices).toHaveLength(1);
    const body = notices[0]!.lines.join('\n');
    expect(body).toContain(`対象の利用者 ID: ${member.id}`);
    expect(body).toContain(`件数: ${THRESHOLD + 1} 件（閾値 ${THRESHOLD} 件）`);
    expect(body).not.toContain(other.id);

    await recordExport(member);
    await settle();
    expect(notificationsAbout('同一利用者のデータ出力')).toHaveLength(1);
  });

  /**
   * @requirement user-authentication/REQ-26.12
   * @requirement user-authentication/REQ-43.3
   * @requirement user-authentication/REQ-43.6
   */
  it('招待の回数制限は利用者ごとに数え、429 が閾値を超えると一度だけ通知する', async () => {
    const invite = (user: TestUser) =>
      request(probeApp)
        .post('/probe/invitations')
        .set('Authorization', `Bearer ${user.token}`)
        .set('X-Forwarded-For', '192.0.2.154');

    for (let i = 0; i < 5; i++) {
      expect((await invite(member)).status).toBe(201);
    }
    for (let i = 0; i < THRESHOLD; i++) {
      expect((await invite(member)).status).toBe(429);
    }
    // 同じ送信元の別の利用者は利用者 member の超過に巻き込まれない（要件26.12）
    expect((await invite(other)).status).toBe(201);
    await settle();
    expect(sent).toHaveLength(0);

    expect((await invite(member)).status).toBe(429);
    await settle();
    const notices = notificationsAbout('試行回数の制限による拒否（429）');
    expect(notices).toHaveLength(1);
    const body = notices[0]!.lines.join('\n');
    expect(body).toContain('主な送信元 IP: 192.0.2.154（4 件）');
    expect(body).toContain(`主な利用者 ID: ${member.id}（4 件）`);

    await invite(member);
    await settle();
    expect(notificationsAbout('試行回数の制限による拒否（429）')).toHaveLength(1);
  });

  /**
   * @requirement user-authentication/REQ-43.3
   * @requirement user-authentication/REQ-43.6
   */
  it('5xx が閾値を超えると一度だけ通知する', async () => {
    const fail = () =>
      request(probeApp)
        .get('/probe/failure')
        .set('Authorization', `Bearer ${member.token}`)
        .set('X-Forwarded-For', '192.0.2.155');

    for (let i = 0; i < THRESHOLD; i++) {
      expect((await fail()).status).toBe(500);
    }
    await settle();
    expect(sent).toHaveLength(0);

    expect((await fail()).status).toBe(500);
    await vi.waitFor(async () => {
      await settle();
      expect(notificationsAbout('サーバーエラー（5xx）')).toHaveLength(1);
    });
    const body = notificationsAbout('サーバーエラー（5xx）')[0]!.lines.join('\n');
    expect(body).toContain('主な送信元 IP: 192.0.2.155（4 件）');
    expect(body).toContain(`主な利用者 ID: ${member.id}（4 件）`);

    await fail();
    await settle();
    expect(notificationsAbout('サーバーエラー（5xx）')).toHaveLength(1);
  });
});
