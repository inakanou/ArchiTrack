/**
 * @fileoverview 外部の AI での読み取りの設定の管理の API の統合テスト（タスク116.1）
 *
 * design の章「Requirements 43-50」の D8 と Error Handling（設定の変更の競合は 409）。
 * 本物のアプリ（app.ts の mount・authenticate・RBAC）と実 PostgreSQL で、システム管理者が設定を止め・戻せ、
 * 変更が同じトランザクションで監査ログ（OPERATIONAL_SETTING_CHANGED の before・after）に残り、
 * 一般の利用者は読むことも変えることもできないことを主張する。監査の記録が失敗したときに設定の変更も
 * 巻き戻ることは、サービスを実 DB で動かして確かめる。
 *
 * 共有の DB への配慮: 設定の行（key = externalAiReading）は全体で一つの共有の行で、他の試験・E2E も読む。
 * 各テストの前に行の有無と中身を写し、各テストの後に写しへ戻す（行が無かったときは消す）。
 * 停止の状態は一つのテストの中だけに留め、戻すまでの時間を短くする。統合テストのファイルは
 * vitest の設定で 1 本ずつ流れるため（maxWorkers: 1）、他の統合テストとは同時に動かない。
 * 監査の行の件数は本試験の利用者を実行者とするものだけを数え、DB 全体の件数は主張しない。
 *
 * @requirement estimate-request/REQ-49.5 管理者が外部 AI の読み取りを止め・戻し、その変更が監査に残る
 *
 * @module __tests__/integration/admin-settings.api.integration.test
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import {
  SystemSettingService,
  EXTERNAL_AI_READING_SETTING_KEY,
} from '../../services/system-setting.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import type { IAuditLogService } from '../../types/audit-log.types.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-er1161-admin-settings';
const SETTING_PATH = '/api/v1/admin/settings/external-ai-reading';

interface TestUser {
  id: string;
  token: string;
}

interface SettingSnapshot {
  value: unknown;
  version: number;
  updatedById: string | null;
}

describe('外部の AI での読み取りの設定の管理の API（統合）', () => {
  let prisma: PrismaClient;
  let admin: TestUser;
  let member: TestUser;
  /** 各テストの前の設定の行（null は行が無かった） */
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
    return { id: user.id, token };
  }

  /** 本試験の利用者を実行者とする設定の変更の監査（DB 全体ではなく実行者で絞る） */
  async function settingAudits(actorId: string) {
    return prisma.auditLog.findMany({
      where: {
        action: 'OPERATIONAL_SETTING_CHANGED',
        actorId,
        targetType: 'SystemSetting',
        targetId: EXTERNAL_AI_READING_SETTING_KEY,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function readRow() {
    return prisma.systemSetting.findUnique({ where: { key: EXTERNAL_AI_READING_SETTING_KEY } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    admin = await createUser('admin', 'admin');
    member = await createUser('member', 'user');
    expect(await getSharedRBACService().hasPermission(admin.id, 'settings:update')).toBe(true);
    expect(await getSharedRBACService().hasPermission(member.id, 'settings:update')).toBe(false);
  });

  beforeEach(async () => {
    const row = await readRow();
    snapshot = row
      ? { value: row.value, version: row.version, updatedById: row.updatedById }
      : null;
  });

  afterEach(async () => {
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

  it('未認証の要求は取得・変更とも 401 で拒まれ、設定の行は変わらない', async () => {
    const before = await readRow();

    await request(app).get(SETTING_PATH).expect(401);
    await request(app).put(SETTING_PATH).send({ enabled: false, version: 0 }).expect(401);

    expect(await readRow()).toEqual(before);
  });

  it('一般の利用者は取得・変更とも 403 で拒まれ、設定の行も監査の記録も変わらない', async () => {
    const before = await readRow();
    const version = before?.version ?? 0;

    const getResponse = await request(app)
      .get(SETTING_PATH)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);
    expect(getResponse.body).not.toHaveProperty('enabled');

    await request(app)
      .put(SETTING_PATH)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ enabled: false, version })
      .expect(403);

    expect(await readRow()).toEqual(before);
    expect(await settingAudits(member.id)).toHaveLength(0);
  });

  it('システム管理者は止めて戻せ、変更のたびに実行者と before・after が監査に残る', async () => {
    const auditsBefore = (await settingAudits(admin.id)).length;

    const current = await request(app)
      .get(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(current.body).toEqual({
      enabled: expect.any(Boolean),
      version: expect.any(Number),
    });
    const startVersion = current.body.version as number;
    const startEnabled = current.body.enabled as boolean;

    // 止める
    const stopped = await request(app)
      .put(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ enabled: false, version: startVersion })
      .expect(200);
    expect(stopped.body).toEqual({ enabled: false, version: startVersion + 1 });

    const afterStop = await request(app)
      .get(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(afterStop.body).toEqual({ enabled: false, version: startVersion + 1 });
    const stoppedRow = await readRow();
    expect(stoppedRow).toMatchObject({
      value: { enabled: false },
      version: startVersion + 1,
      updatedById: admin.id,
    });

    // 戻す
    const resumed = await request(app)
      .put(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ enabled: true, version: startVersion + 1 })
      .expect(200);
    expect(resumed.body).toEqual({ enabled: true, version: startVersion + 2 });

    const audits = await settingAudits(admin.id);
    expect(audits).toHaveLength(auditsBefore + 2);
    const [stopAudit, resumeAudit] = audits.slice(-2);
    expect(stopAudit).toMatchObject({
      action: 'OPERATIONAL_SETTING_CHANGED',
      actorId: admin.id,
      actorEmail: `${MARK}-admin@example.com`,
      targetType: 'SystemSetting',
      targetId: 'externalAiReading',
      before: { enabled: startEnabled },
      after: { enabled: false },
    });
    expect(resumeAudit).toMatchObject({
      actorId: admin.id,
      before: { enabled: false },
      after: { enabled: true },
    });
  });

  it('設定の行が無いときは有効・版 0 を返し、版 0 での停止で行を作って版 1 にする', async () => {
    // 行の無い状態を作る（afterEach がテストの前の行へ戻す）
    await prisma.systemSetting.deleteMany({ where: { key: EXTERNAL_AI_READING_SETTING_KEY } });

    const initial = await request(app)
      .get(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(initial.body).toEqual({ enabled: true, version: 0 });

    const created = await request(app)
      .put(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ enabled: false, version: 0 })
      .expect(200);
    expect(created.body).toEqual({ enabled: false, version: 1 });
    expect(await readRow()).toMatchObject({
      value: { enabled: false },
      version: 1,
      updatedById: admin.id,
    });
  });

  it('古い版での変更は 409 で拒まれ、設定の行も監査の記録も変わらない', async () => {
    const current = await request(app)
      .get(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    const startVersion = current.body.version as number;

    // 先に一度変えて版を進める
    await request(app)
      .put(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ enabled: true, version: startVersion })
      .expect(200);
    const rowAfterFirst = await readRow();
    const auditsAfterFirst = (await settingAudits(admin.id)).length;

    // 古い版のまま止めようとする
    const conflict = await request(app)
      .put(SETTING_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ enabled: false, version: startVersion })
      .expect(409);
    expect(conflict.body.code).toBe('SYSTEM_SETTING_CONFLICT');
    expect(conflict.body.details).toEqual({
      expectedVersion: startVersion,
      actualVersion: startVersion + 1,
    });

    expect(await readRow()).toEqual(rowAfterFirst);
    expect(await settingAudits(admin.id)).toHaveLength(auditsAfterFirst);
  });

  it('監査の記録が失敗すると、同じトランザクションの設定の変更も巻き戻る', async () => {
    const before = await readRow();
    const version = before?.version ?? 0;
    const auditsBefore = (await settingAudits(admin.id)).length;
    const realAuditLogService = new AuditLogService({ prisma });
    const failingAuditLogService = {
      createLog: async (...args: Parameters<IAuditLogService['createLog']>) => {
        // 記録の行を同じトランザクションで書いた後に失敗させ、行と変更の両方が残らないことを見る
        await realAuditLogService.createLog(...args);
        throw new Error('監査の記録の失敗（試験の模擬）');
      },
    } as unknown as IAuditLogService;
    const service = new SystemSettingService({ prisma, auditLogService: failingAuditLogService });

    await expect(service.setExternalAiReading(false, version, admin.id)).rejects.toThrow(
      '監査の記録の失敗（試験の模擬）'
    );

    expect(await readRow()).toEqual(before);
    expect(await settingAudits(admin.id)).toHaveLength(auditsBefore);
  });
});
