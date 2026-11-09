/**
 * @fileoverview 外部の AI での読み取りの経路の停止・権限・回数制限・記録の統合テスト（タスク116.2）
 *
 * estimate-request の design の章「Requirements 43-50」の D7 と Error Handling。
 * 本物のアプリ（app.ts の mount・authenticate・RBAC）と実 PostgreSQL で、画面を経ない要求にも
 * 管理者の停止（503）・専用の権限（403）・利用者ごとの回数制限（429）が効き、送信のたびに利用者つきの
 * 記録が 1 件残り、記録に画像と読み取りの結果が現れないことを主張する。外部の API（Anthropic）は
 * ClaudeVisionService を差し替えて呼ばれたかを数え、実際には送らない。
 *
 * 回数制限: 試験の実行環境では app.ts の制限が外れる（他の制限と同じ判定）。そのため回数制限は本番の判定
 * （production）で組み立てた制限を経路の組み立て（createClaudeVisionRouter）へ渡し、認証・RBAC・設定・
 * 記録は本物のまま確かめる（無効化に頼らない）。時間窓の後の回復は、時計（Date）だけを進めて確かめる。
 *
 * 共有の DB への配慮: 設定の行（key = externalAiReading）は全体で一つの共有の行で、他の試験・E2E も読む。
 * 各テストの前に行を写し、各テストの後に写しへ戻す（行が無かったときは消す）。記録の行は本試験の利用者を
 * 実行者とするものだけを数え、DB 全体の件数は主張しない。
 *
 * @requirement estimate-request/REQ-49.4 管理者の停止中は外部へ送らず受け付けない
 * @requirement estimate-request/REQ-49.6 専用の権限を持つ利用者に限って受け付ける
 * @requirement estimate-request/REQ-49.7 送信を利用者つきで記録し、画像と結果を記録に含めない
 * @requirement estimate-request/REQ-49.8 利用者ごとの上限を超えたら外部へ送らず 429 を返す
 *
 * @module __tests__/integration/claude-vision-controls.api.integration.test
 */

import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

const { mockIsEnabled, mockExtractLineItems, mockExtractQuantityTableData } = vi.hoisted(() => ({
  mockIsEnabled: vi.fn(),
  mockExtractLineItems: vi.fn(),
  mockExtractQuantityTableData: vi.fn(),
}));

// 外部の API へは送らない（呼ばれた回数を数える）
vi.mock('../../services/claude-vision.service.js', () => ({
  ClaudeVisionService: class {
    isEnabled = mockIsEnabled;
    extractLineItems = mockExtractLineItems;
    extractQuantityTableData = mockExtractQuantityTableData;
  },
}));

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { EXTERNAL_AI_READING_SETTING_KEY } from '../../services/system-setting.service.js';
import { createClaudeVisionRouter } from '../../routes/claude-vision.routes.js';
import {
  createRateLimiters,
  CLAUDE_VISION_RATE_LIMIT,
} from '../../middleware/rateLimit.middleware.js';
import { createRuntimeMode } from '../../config/runtime-mode.js';
import { errorHandler } from '../../middleware/errorHandler.middleware.js';
import { CLAUDE_VISION_DISABLED_BY_ADMIN_MESSAGE } from '../../errors/claudeVisionError.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import logger from '../../utils/logger.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-er1162-claude-vision';
const NO_PERMISSION_ROLE = `${MARK}-role`;
const EXTRACT_PATH = '/api/claude-vision/extract';
const STATUS_PATH = '/api/claude-vision/status';

/** 画像の中身（記録に現れないことを確かめる） */
const IMAGE_1 = 'aW50ZWdyYXRpb24taW1hZ2UtcGFnZS0x';
const IMAGE_2 = 'aW50ZWdyYXRpb24taW1hZ2UtcGFnZS0y';
/** 読み取りの結果の目印（記録に現れないことを確かめる） */
const RESULT_NAME = '統合試験の読み取り結果の品名';

const twoImages = {
  images: [
    { base64Data: IMAGE_1, mediaType: 'image/png' },
    { base64Data: IMAGE_2, mediaType: 'image/jpeg' },
  ],
};

const extractionResult = {
  lineItems: [
    {
      customCategory: null,
      workType: '仮設工',
      name: RESULT_NAME,
      specification: '枠組足場',
      unit: 'm2',
      quantity: 500,
      unitPrice: 1200,
      amount: 600000,
      remarks: null,
    },
  ],
  pageCount: 2,
};

interface TestUser {
  id: string;
  email: string;
  roleName: string;
  token: string;
}

interface SettingSnapshot {
  value: unknown;
  version: number;
  updatedById: string | null;
}

describe('外部の AI での読み取りの経路の停止・権限・回数制限・記録（統合）', () => {
  let prisma: PrismaClient;
  /** 専用の権限を持つ一般の利用者（user ロール） */
  let member: TestUser;
  /** 専用の権限を持たない利用者 */
  let outsider: TestUser;
  /** 回数制限の試験の利用者（他の試験の送信の回数と混ぜない） */
  let heavyUser: TestUser;
  let otherUser: TestUser;
  let snapshot: SettingSnapshot | null;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const rbac = getSharedRBACService();
    for (const id of userIds) {
      await rbac.invalidateUserPermissionsCache(id);
    }
    await deleteAuditLogsWithArchivePermission(prisma, { actorId: { in: userIds } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: NO_PERMISSION_ROLE } });
  }

  async function issueToken(user: Omit<TestUser, 'token'>): Promise<string> {
    return tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email: user.email,
      roles: [user.roleName],
    });
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
    const base = { id: user.id, email, roleName };
    return { ...base, token: await issueToken(base) };
  }

  /** 本試験の利用者を実行者とする送信の記録（DB 全体ではなく実行者で絞る） */
  async function sentAudits(actorId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'CLAUDE_VISION_SENT', actorId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function setExternalAiReading(enabled: boolean): Promise<void> {
    await prisma.systemSetting.upsert({
      where: { key: EXTERNAL_AI_READING_SETTING_KEY },
      create: { key: EXTERNAL_AI_READING_SETTING_KEY, value: { enabled }, version: 1 },
      update: { value: { enabled }, version: { increment: 1 } },
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    // 専用の権限を持たないロール（権限を一つも持たない）
    await prisma.role.create({
      data: { name: NO_PERMISSION_ROLE, description: 'タスク116.2 の検証用（権限なし）' },
    });
    member = await createUser('member', 'user');
    outsider = await createUser('outsider', NO_PERMISSION_ROLE);
    heavyUser = await createUser('heavy', 'user');
    otherUser = await createUser('other', 'user');
    const rbac = getSharedRBACService();
    expect(await rbac.hasPermission(member.id, 'claude_vision:use')).toBe(true);
    expect(await rbac.hasPermission(outsider.id, 'claude_vision:use')).toBe(false);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsEnabled.mockReturnValue(true);
    mockExtractLineItems.mockResolvedValue(extractionResult);
    mockExtractQuantityTableData.mockResolvedValue(extractionResult);
    const row = await prisma.systemSetting.findUnique({
      where: { key: EXTERNAL_AI_READING_SETTING_KEY },
    });
    snapshot = row
      ? { value: row.value, version: row.version, updatedById: row.updatedById }
      : null;
    // 各テストは有効の状態から始める
    await setExternalAiReading(true);
  });

  afterEach(async () => {
    vi.useRealTimers();
    // 共有の設定の行をテストの前の状態へ戻す
    if (snapshot === null) {
      await prisma.systemSetting.deleteMany({ where: { key: EXTERNAL_AI_READING_SETTING_KEY } });
      return;
    }
    const data = {
      value: snapshot.value as object,
      version: snapshot.version,
      updatedById: snapshot.updatedById,
    };
    await prisma.systemSetting.upsert({
      where: { key: EXTERNAL_AI_READING_SETTING_KEY },
      create: { key: EXTERNAL_AI_READING_SETTING_KEY, ...data },
      update: data,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('状態の API', () => {
    it('有効・権限あり・鍵ありなら使える', async () => {
      const res = await request(app)
        .get(STATUS_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .expect(200);

      expect(res.body).toEqual({ available: true, reason: null });
    });

    it('管理者が止めていれば、権限のある利用者にも停止を返す', async () => {
      await setExternalAiReading(false);

      const res = await request(app)
        .get(STATUS_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .expect(200);

      expect(res.body).toEqual({ available: false, reason: 'disabled_by_admin' });
    });

    it('専用の権限が無い利用者には権限なしを返す（403 にはしない）', async () => {
      const res = await request(app)
        .get(STATUS_PATH)
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(200);

      expect(res.body).toEqual({ available: false, reason: 'no_permission' });
    });

    it('鍵が無ければ未設定を返す', async () => {
      mockIsEnabled.mockReturnValue(false);

      const res = await request(app)
        .get(STATUS_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .expect(200);

      expect(res.body).toEqual({ available: false, reason: 'not_configured' });
    });

    it('鍵が無い環境でも、停止と権限なしをこの順で観測できる', async () => {
      mockIsEnabled.mockReturnValue(false);
      await setExternalAiReading(false);

      const stopped = await request(app)
        .get(STATUS_PATH)
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(200);
      expect(stopped.body).toEqual({ available: false, reason: 'disabled_by_admin' });

      await setExternalAiReading(true);
      const noPermission = await request(app)
        .get(STATUS_PATH)
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(200);
      expect(noPermission.body).toEqual({ available: false, reason: 'no_permission' });
    });

    it('未認証は 401', async () => {
      await request(app).get(STATUS_PATH).expect(401);
    });
  });

  describe.each([
    { mode: undefined, label: '受領見積書の読み取り', feature: 'received_quotation' },
    { mode: 'quantity-table' as const, label: '数量表の取り込み', feature: 'quantity_table' },
  ])('送信の経路（$label）', ({ mode, feature }) => {
    const body = { ...twoImages, ...(mode !== undefined && { mode }) };

    it('管理者が止めているときは 503 で拒み、外部へ送らず記録も残さない', async () => {
      await setExternalAiReading(false);
      const before = (await sentAudits(member.id)).length;

      const res = await request(app)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .send(body)
        .expect(503);

      expect(res.body.code).toBe('CLAUDE_VISION_DISABLED_BY_ADMIN');
      expect(res.body.detail).toBe(CLAUDE_VISION_DISABLED_BY_ADMIN_MESSAGE);
      expect(res.body.errorType).toBe('service_unavailable');
      expect(mockExtractLineItems).not.toHaveBeenCalled();
      expect(mockExtractQuantityTableData).not.toHaveBeenCalled();
      expect(await sentAudits(member.id)).toHaveLength(before);
    });

    it('専用の権限が無い利用者は 403 で拒まれ、外部へ送られない', async () => {
      await request(app)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send(body)
        .expect(403);

      expect(mockExtractLineItems).not.toHaveBeenCalled();
      expect(mockExtractQuantityTableData).not.toHaveBeenCalled();
      expect(await sentAudits(outsider.id)).toHaveLength(0);
    });

    it('送信のたびに利用者つきの記録が 1 件残り、画像と結果を含めない', async () => {
      const before = (await sentAudits(member.id)).length;

      const res = await request(app)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .send(body)
        .expect(200);
      expect(res.body.lineItems[0].name).toBe(RESULT_NAME);

      const audits = await sentAudits(member.id);
      expect(audits).toHaveLength(before + 1);
      const recorded = audits[audits.length - 1]!;
      expect(recorded.actorId).toBe(member.id);
      expect(recorded.actorEmail).toBe(member.email);
      expect(recorded.targetType).toBe('ClaudeVision');
      expect(recorded.targetId).toBe(feature);
      expect(recorded.metadata).toEqual({ feature, imageCount: 2, outcome: 'success' });
      expect(recorded.before).toBeNull();
      expect(recorded.after).toBeNull();
      const serialized = JSON.stringify(recorded);
      expect(serialized).not.toContain(IMAGE_1);
      expect(serialized).not.toContain(IMAGE_2);
      expect(serialized).not.toContain(RESULT_NAME);

      // 二度目の送信でもう 1 件
      await request(app)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .send(body)
        .expect(200);
      expect(await sentAudits(member.id)).toHaveLength(before + 2);
    });

    it('外部の API の失敗も結果「失敗」と種別つきで記録する', async () => {
      const { ClaudeVisionError } = await import('../../errors/claudeVisionError.js');
      const failing =
        mode === 'quantity-table' ? mockExtractQuantityTableData : mockExtractLineItems;
      failing.mockRejectedValueOnce(ClaudeVisionError.timeout());
      const before = (await sentAudits(member.id)).length;

      await request(app)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .send(body)
        .expect(504);

      const audits = await sentAudits(member.id);
      expect(audits).toHaveLength(before + 1);
      expect(audits[audits.length - 1]!.metadata).toEqual({
        feature,
        imageCount: 2,
        outcome: 'failure',
        errorType: 'timeout',
      });
    });
  });

  describe('記録の失敗', () => {
    it('記録に失敗したら結果を返さず 500 にする', async () => {
      const failingAuditApp = express();
      failingAuditApp.use(
        '/api/claude-vision',
        createClaudeVisionRouter({
          auditLogService: {
            createLog: () => Promise.reject(new Error('audit write failed')),
          },
        })
      );
      failingAuditApp.use(errorHandler);

      const res = await request(failingAuditApp)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${member.token}`)
        .send(twoImages)
        .expect(500);

      expect(res.body.code).toBe('CLAUDE_VISION_AUDIT_FAILED');
      expect(res.body.lineItems).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(RESULT_NAME);
    });
  });

  describe('利用者ごとの回数制限', () => {
    /** 本番の判定で組み立てた回数制限を掛けたアプリ（認証・RBAC・設定・記録は本物） */
    function createLimitedApp() {
      const limiter = createRateLimiters({
        runtimeMode: createRuntimeMode({ NODE_ENV: 'production' }),
        getRedisClient: () => null,
      }).claudeVision;
      const limitedApp = express();
      // 超過の記録は req.log へ書く（本番は pino-http が設定する）
      limitedApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as { log: typeof logger }).log = logger;
        next();
      });
      limitedApp.use('/api/claude-vision', createClaudeVisionRouter({ limiter }));
      limitedApp.use(errorHandler);
      return limitedApp;
    }

    it('31 回目は外部へ送らず 429 と専用の code を返し、記録は送った 30 回分だけ残る。時間窓の後に回復する', async () => {
      const start = new Date();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(start);
      const limitedApp = createLimitedApp();

      for (let i = 0; i < CLAUDE_VISION_RATE_LIMIT.limit; i++) {
        const payload = i % 2 === 0 ? twoImages : { ...twoImages, mode: 'quantity-table' };
        await request(limitedApp)
          .post(EXTRACT_PATH)
          .set('Authorization', `Bearer ${heavyUser.token}`)
          .send(payload)
          .expect(200);
      }

      const limited = await request(limitedApp)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${heavyUser.token}`)
        .send(twoImages)
        .expect(429);
      expect(limited.body.code).toBe('CLAUDE_VISION_USER_RATE_LIMITED');
      expect(limited.body.retryAfter).toBeDefined();
      expect(
        mockExtractLineItems.mock.calls.length + mockExtractQuantityTableData.mock.calls.length
      ).toBe(30);
      expect(await sentAudits(heavyUser.id)).toHaveLength(30);

      // 別の利用者は巻き込まれない
      await request(limitedApp)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${otherUser.token}`)
        .send(twoImages)
        .expect(200);

      // 時間窓が過ぎれば回復する（進めた時計で発行し直したトークンで送る）
      vi.setSystemTime(new Date(start.getTime() + CLAUDE_VISION_RATE_LIMIT.windowMs + 1000));
      const freshToken = await issueToken(heavyUser);
      await request(limitedApp)
        .post(EXTRACT_PATH)
        .set('Authorization', `Bearer ${freshToken}`)
        .send(twoImages)
        .expect(200);
      expect(await sentAudits(heavyUser.id)).toHaveLength(31);
    });
  });
});
