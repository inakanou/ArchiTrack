/**
 * @fileoverview 運用設定（ログレベル）の変更・参照の保護と監査の統合検証（user-authentication タスク55.1）
 *
 * Requirements (user-authentication):
 * - REQ-42.1: 認証されていない、またはシステム管理者権限を持たない利用者の運用設定の変更・参照を拒否する
 * - REQ-42.2: 運用設定が変更されると、監査ログに実行者と変更前後の値を記録する
 *
 * 本物のアプリ（app.ts のルート・authenticate・RBAC）と実 PostgreSQL で動かす。ログレベルは試験の
 * プロセスの logger そのものを変えるため、各テストの終了時に元の値へ戻す。
 * 共有のデータベースの他の行を対象にしないよう、本試験の利用者はメールアドレスに印を持ち、
 * 後始末はアーカイブの許可の設定の取引で本試験の利用者を実行者とする監査の行だけを消す。
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import logger from '../../utils/logger.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua551-log-level';
const LOG_LEVEL_PATH = '/api/v1/admin/log-level';
const OLD_LOG_LEVEL_PATH = '/admin/log-level';
const USER_AGENT = `${MARK}-agent`;

interface TestUser {
  id: string;
  token: string;
}

describe('運用設定（ログレベル）の変更・参照の保護と監査（統合）', () => {
  let prisma: PrismaClient;
  let admin: TestUser;
  let member: TestUser;
  let originalLevel: string;

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

  async function settingAudits(actorId?: string) {
    return prisma.auditLog.findMany({
      where: {
        action: 'OPERATIONAL_SETTING_CHANGED',
        ...(actorId ? { actorId } : { actorId: { in: [admin.id, member.id] } }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 元の値と異なる、変更に使うログレベル */
  function anotherLevel(): string {
    return originalLevel === 'debug' ? 'warn' : 'debug';
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    admin = await createUser('admin', 'admin');
    member = await createUser('member', 'user');
    expect(await getSharedRBACService().hasPermission(admin.id, 'ops:manage')).toBe(true);
    expect(await getSharedRBACService().hasPermission(member.id, 'ops:manage')).toBe(false);
  });

  beforeEach(() => {
    originalLevel = logger.level;
  });

  afterEach(() => {
    // 変更したログレベルは各テストの終了時に元の値へ戻す
    logger.level = originalLevel;
  });

  afterAll(async () => {
    await cleanup();
  });

  /**
   * @requirement user-authentication/REQ-42.1
   */
  it('未認証の利用者のログレベルの変更・参照は 401 で拒否され、ログレベルは変わらない', async () => {
    await request(app).get(LOG_LEVEL_PATH).expect(401);
    await request(app).post(LOG_LEVEL_PATH).send({ level: anotherLevel() }).expect(401);

    expect(logger.level).toBe(originalLevel);
  });

  /**
   * @requirement user-authentication/REQ-42.1
   */
  it('運用設定の管理の権限を持たない一般ユーザーのログレベルの変更・参照は 403 で拒否され、ログレベルは変わらず監査の変更の記録も残らない', async () => {
    const getResponse = await request(app)
      .get(LOG_LEVEL_PATH)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);
    expect(getResponse.body).not.toHaveProperty('level');

    await request(app)
      .post(LOG_LEVEL_PATH)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ level: anotherLevel() })
      .expect(403);

    expect(logger.level).toBe(originalLevel);
    expect(await settingAudits(member.id)).toHaveLength(0);
  });

  /**
   * @requirement user-authentication/REQ-42.1
   */
  it('認証の無い旧経路（/admin/log-level）は公開されておらず、ログレベルを変更・参照できない', async () => {
    const getResponse = await request(app).get(OLD_LOG_LEVEL_PATH).expect(404);
    expect(getResponse.body).not.toHaveProperty('level');
    await request(app).post(OLD_LOG_LEVEL_PATH).send({ level: anotherLevel() }).expect(404);

    expect(logger.level).toBe(originalLevel);
  });

  /**
   * @requirement user-authentication/REQ-42.1
   * @requirement user-authentication/REQ-42.2
   */
  it('システム管理者はログレベルを変更・参照でき、変更は実行者と変更前後の値とともに監査に記録される', async () => {
    const auditsBefore = (await settingAudits(admin.id)).length;
    const level = anotherLevel();

    const current = await request(app)
      .get(LOG_LEVEL_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(current.body.level).toBe(originalLevel);

    const changed = await request(app)
      .post(LOG_LEVEL_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('User-Agent', USER_AGENT)
      .send({ level })
      .expect(200);
    expect(changed.body).toMatchObject({ success: true, level });
    expect(logger.level).toBe(level);

    const after = await request(app)
      .get(LOG_LEVEL_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(after.body.level).toBe(level);

    const audits = await settingAudits(admin.id);
    expect(audits).toHaveLength(auditsBefore + 1);
    const audit = audits.at(-1)!;
    expect(audit).toMatchObject({
      action: 'OPERATIONAL_SETTING_CHANGED',
      actorId: admin.id,
      actorEmail: `${MARK}-admin@example.com`,
      targetType: 'OperationalSetting',
      targetId: 'logLevel',
      before: { logLevel: originalLevel },
      after: { logLevel: level },
    });
    expect(audit.metadata).toMatchObject({ userAgent: USER_AGENT });
    expect((audit.metadata as Record<string, unknown>).ipAddress).toEqual(expect.any(String));
  });

  /**
   * @requirement user-authentication/REQ-42.2
   */
  it('許可された値に無いログレベルは 400 で拒否され、ログレベルは変わらず監査の変更の記録も残らない', async () => {
    const auditsBefore = (await settingAudits(admin.id)).length;

    for (const level of ['silent', 'DEBUG', ' debug ', '', null, 123, ['debug']]) {
      const response = await request(app)
        .post(LOG_LEVEL_PATH)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ level })
        .expect(400);
      expect(response.body.code).toBe('INVALID_LOG_LEVEL');
    }

    expect(logger.level).toBe(originalLevel);
    expect(await settingAudits(admin.id)).toHaveLength(auditsBefore);
  });
});
