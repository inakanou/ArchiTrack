/**
 * @fileoverview 経路の案件と対象の実際の案件の食い違いの記録の統合検証（user-authentication タスク63.2）
 *
 * 要件39.8 の判定と記録（判定部品 requireProjectScope が解決関数から projectMismatch を受けたとき）を、
 * 本物の authenticate・共有の ProjectScopeService と監査ログ・テスト用の実データベースの上で確かめる。
 * 本 spec の案件の経路には入れ子が無いため、案件の配下の子（状態の履歴 ProjectStatusHistory）を指す
 * 入れ子の経路をこのテストの中だけで組み立てる（本番の経路は変えない）。
 * 39.8 の被覆の印は、最初に切り替える業務 spec の E2E が担うため、ここには置かない（タスク63.2）。
 *
 * 記録の数は、このテストの利用者の前後の差で数える（他のテストの記録に左右されない）。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、ミドルウェアとサービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { authenticate } from '../../middleware/authenticate.middleware.js';
import {
  requireProjectScope,
  projectMismatch,
  type ProjectIdResolver,
} from '../../middleware/project-scope.middleware.js';
import { errorHandler } from '../../middleware/errorHandler.middleware.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua632-project-mismatch';
/** 版 4・変種 8 の整った UUID（子としては存在しない） */
const MISSING_CHILD_ID = '00000000-0000-4000-8000-000000000632';

/**
 * 入れ子の経路の子（状態の履歴）から案件を解決する。子が無い・実際の案件が論理削除なら不在、
 * 経路の案件と子の実際の案件が食い違えば projectMismatch（要件39.8）
 */
function childProjectResolver(prisma: PrismaClient): ProjectIdResolver {
  return async (req) => {
    const routeProjectId = req.params.projectId as string;
    const child = await prisma.projectStatusHistory.findUnique({
      where: { id: req.params.childId as string },
      select: { projectId: true, project: { select: { deletedAt: true } } },
    });
    if (!child || child.project.deletedAt !== null) {
      return null;
    }
    if (child.projectId !== routeProjectId) {
      return projectMismatch(child.projectId);
    }
    return routeProjectId;
  };
}

function buildNestedApp(prisma: PrismaClient): express.Express {
  const app = express();
  app.get(
    '/test/projects/:projectId/children/:childId',
    authenticate,
    requireProjectScope(childProjectResolver(prisma)),
    (_req: Request, res: Response) => {
      res.status(200).json({ reached: true });
    }
  );
  app.use(errorHandler);
  return app;
}

function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
  const { instance: _instance, ...rest } = body;
  return rest;
}

describe('経路の案件と子の実際の案件の食い違いの記録（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let app: express.Express;
  let member: { id: string; token: string };
  let owner: { id: string };
  /** 利用者が担当する案件（経路で指す） */
  let routeProjectId: string;
  let routeChildId: string;
  /** 利用者が担当する別の案件の子 */
  let otherInScopeProjectId: string;
  let otherInScopeChildId: string;
  /** 利用者が担当しない案件の子 */
  let outOfScopeProjectId: string;
  let outOfScopeChildId: string;

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
      ],
    });
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function createUser(suffix: string): Promise<{ id: string; token: string }> {
    const email = `${MARK}-${suffix}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [],
    });
    return { id: user.id, token };
  }

  async function createProjectWithChild(
    suffix: string,
    salesPersonId: string
  ): Promise<{ projectId: string; childId: string }> {
    const project = await prisma.project.create({
      data: { name: `${MARK}-${suffix}`, salesPersonId, createdById: salesPersonId },
      select: { id: true },
    });
    const child = await prisma.projectStatusHistory.create({
      data: {
        projectId: project.id,
        toStatus: 'PREPARING',
        transitionType: 'initial',
        changedById: salesPersonId,
      },
      select: { id: true },
    });
    return { projectId: project.id, childId: child.id };
  }

  /** この利用者の PROJECT_SCOPE_DENIED の記録 */
  function deniedLogsOfMember() {
    return prisma.auditLog.findMany({
      where: { action: 'PROJECT_SCOPE_DENIED', actorId: member.id },
      select: { id: true, targetType: true, targetId: true, metadata: true },
    });
  }

  function getChild(projectId: string, childId: string) {
    return request(app)
      .get(`/test/projects/${projectId}/children/${childId}`)
      .set('Authorization', `Bearer ${member.token}`);
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    app = buildNestedApp(prisma);

    // 役割を持たない利用者（project:read_all を持たない）。担当する案件だけが範囲内
    member = await createUser('member');
    owner = await createUser('owner');

    ({ projectId: routeProjectId, childId: routeChildId } = await createProjectWithChild(
      'route',
      member.id
    ));
    ({ projectId: otherInScopeProjectId, childId: otherInScopeChildId } =
      await createProjectWithChild('other-in-scope', member.id));
    ({ projectId: outOfScopeProjectId, childId: outOfScopeChildId } = await createProjectWithChild(
      'out-of-scope',
      owner.id
    ));
  });

  afterAll(async () => {
    await cleanup();
  });

  it('前提: 経路の案件の自分の子は本体へ進み、記録されない', async () => {
    const before = (await deniedLogsOfMember()).length;

    const res = await getChild(routeProjectId, routeChildId).expect(200);

    expect(res.body).toEqual({ reached: true });
    expect((await deniedLogsOfMember()).length).toBe(before);
  });

  it('範囲外の案件の子を範囲内の案件の経路で指すと、不在と同じ 404 で、子の実際の案件を対象に 1 件記録される', async () => {
    const beforeIds = new Set((await deniedLogsOfMember()).map((log) => log.id));

    const missing = await getChild(routeProjectId, MISSING_CHILD_ID).expect(404);
    const mismatch = await getChild(routeProjectId, outOfScopeChildId).expect(404);

    expect(mismatch.body.code).toBe('NOT_FOUND');
    expect(mismatch.body).not.toHaveProperty('reached');
    expect(withoutInstance(mismatch.body)).toEqual(withoutInstance(missing.body));
    // 本文に子の実際の案件の ID を含めない
    expect(JSON.stringify(mismatch.body)).not.toContain(outOfScopeProjectId);

    const added = (await deniedLogsOfMember()).filter((log) => !beforeIds.has(log.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ targetType: 'Project', targetId: outOfScopeProjectId });
    // 経路の案件の ID は path に残る
    expect(added[0]?.metadata).toMatchObject({
      method: 'GET',
      path: `/test/projects/${routeProjectId}/children/${outOfScopeChildId}`,
    });
  });

  it('範囲内の別の案件の子を指すと、不在と同じ 404 で記録は増えない', async () => {
    const before = (await deniedLogsOfMember()).length;

    const missing = await getChild(routeProjectId, MISSING_CHILD_ID).expect(404);
    const mismatch = await getChild(routeProjectId, otherInScopeChildId).expect(404);

    expect(mismatch.body.code).toBe('NOT_FOUND');
    expect(mismatch.body).not.toHaveProperty('reached');
    expect(withoutInstance(mismatch.body)).toEqual(withoutInstance(missing.body));
    expect(JSON.stringify(mismatch.body)).not.toContain(otherInScopeProjectId);
    expect((await deniedLogsOfMember()).length).toBe(before);
  });

  it('不在の子を指すと、同じ 404 で記録は増えない', async () => {
    // 比べる相手の範囲外の食い違いの 404 を先に得る（その記録は数える前に済ませる）
    const mismatch = await getChild(routeProjectId, outOfScopeChildId).expect(404);
    const before = (await deniedLogsOfMember()).length;

    const missing = await getChild(routeProjectId, MISSING_CHILD_ID).expect(404);

    expect(missing.body.code).toBe('NOT_FOUND');
    expect(missing.body).not.toHaveProperty('reached');
    // 不在と範囲外の食い違いの本文が一致する（見分けられない）
    expect(withoutInstance(missing.body)).toEqual(withoutInstance(mismatch.body));
    expect((await deniedLogsOfMember()).length).toBe(before);
  });
});
