/**
 * @fileoverview 工程表の ID から案件 ID を引く解決関数と範囲の判定部品の単体テスト
 * （construction-schedule タスク22.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（construction-schedule-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  constructionSchedule: { findUnique: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  findProjectIdOfSchedule,
  requireScheduleProjectScope,
  requireProjectParamScope,
} from '../../../middleware/construction-schedule-project-scope.middleware.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

const USER_ID = 'user-1';
const DECISIONS: Record<string, ProjectAccessDecision> = {
  'project-in-scope': 'allowed',
  'project-out-of-scope': 'out_of_scope',
};

function fakeScope() {
  return {
    evaluateProjectAccess: vi.fn(
      async (_userId: string, projectId: string): Promise<ProjectAccessDecision> =>
        DECISIONS[projectId] ?? 'not_found'
    ),
  };
}

function buildApp(
  paths: string[],
  guard: express.RequestHandler
): { app: express.Express; reached: ReturnType<typeof vi.fn> } {
  const reached = vi.fn();
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: USER_ID, email: 'user@example.com' } as Request['user'];
    next();
  });
  app.get(paths, guard, (_req: Request, res: Response) => {
    reached();
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return { app, reached };
}

const audit = { createLog: vi.fn().mockResolvedValue({}) };

beforeEach(() => {
  vi.clearAllMocks();
});

/** 範囲外の 404 が不在の 404 と同じ汎用の本文で、案件 ID を含まないことを確かめる */
function expectGenericNotFound(body: Record<string, unknown>): void {
  expect(body.code).toBe('NOT_FOUND');
  // 要求の経路を写す instance を除いて、案件 ID を含まない
  const { instance: _instance, ...rest } = body;
  expect(JSON.stringify(rest)).not.toContain('project-');
}

describe('工程表の ID からの解決関数（13.2・13.3）', () => {
  it('工程表の ID から案件 ID を引き、工程表が無いときだけ null を返し、論理的に取り除かれていれば案件 ID と取り除きの印を返す（13.8・13.9）', async () => {
    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    expect(await findProjectIdOfSchedule('cs-1')).toEqual({
      projectId: 'project-in-scope',
      deleted: false,
    });
    expect(mockPrisma.constructionSchedule.findUnique).toHaveBeenCalledWith({
      where: { id: 'cs-1' },
      select: { projectId: true, deletedAt: true },
    });
    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce(null);
    expect(await findProjectIdOfSchedule('cs-2')).toBeNull();
    // 論理的に取り除かれていても行が実在する限り null にしない（user-authentication の要件39.8 の改訂）
    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: new Date(),
    });
    expect(await findProjectIdOfSchedule('cs-3')).toEqual({
      projectId: 'project-in-scope',
      deleted: true,
    });
  });

  it('工程表の案件が範囲内なら通し、範囲外・工程表の不在は同じ汎用の 404 にして範囲外だけを記録する', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/schedules/:id'],
      requireScheduleProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    await request(app).get('/schedules/cs-1').expect(200);

    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
      deletedAt: null,
    });
    const outOfScope = await request(app).get('/schedules/cs-2').expect(404);
    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/schedules/cs-3').expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  /**
   * 論理的に取り除かれた工程表は、経路の形（`/schedules/:id`、二重マウントの同じ案件・食い違い）を問わず
   * 工程表の実際の案件を判定し、範囲外のときだけ記録する。応答はどれも不在と同じ汎用の 404 で、
   * 範囲内の利用者でも本体へ進めない（本体の不在の応答と本文を分けない。design.md の
   * 「2026-10-30 の追加」の「決定」）
   */
  describe('論理的に取り除かれた工程表（13.8・13.9）', () => {
    const DELETED_ROUTES: Array<[string, (projectId: string) => string]> = [
      ['/schedules/:id', () => '/schedules/cs-4'],
      ['二重マウントの同じ案件', (projectId) => `/projects/${projectId}/schedules/cs-4`],
      ['二重マウントの食い違い', () => '/projects/project-other/schedules/cs-4'],
    ];

    function buildDeletedApp() {
      const scope = fakeScope();
      const built = buildApp(
        ['/schedules/:id', '/projects/:projectId/schedules/:id'],
        requireScheduleProjectScope('id', { scopeService: scope, auditLogService: audit })
      );
      return { scope, ...built };
    }

    async function missingBody(app: express.Express): Promise<Record<string, unknown>> {
      mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce(null);
      return (await request(app).get('/schedules/cs-9').expect(404)).body;
    }

    it.each(DELETED_ROUTES)(
      '工程表の案件が範囲外なら、不在と同じ汎用の 404 にし、本体へ進めず、工程表の案件を対象に 1 件記録する（%s）',
      async (_label, pathOf) => {
        const { app, reached, scope } = buildDeletedApp();
        const missing = await missingBody(app);
        mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
          projectId: 'project-out-of-scope',
          deletedAt: new Date(),
        });
        const response = await request(app).get(pathOf('project-out-of-scope')).expect(404);
        expectGenericNotFound(response.body);
        expect(response.body.detail).toBe(missing.detail);
        expect(reached).not.toHaveBeenCalled();
        expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
        expect(scope.evaluateProjectAccess).not.toHaveBeenCalledWith(USER_ID, 'project-other');
        expect(audit.createLog).toHaveBeenCalledTimes(1);
        expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
          action: 'PROJECT_SCOPE_DENIED',
          targetId: 'project-out-of-scope',
        });
      }
    );

    it.each(DELETED_ROUTES)(
      '工程表の案件が範囲内なら、従来どおり不在と同じ汎用の 404 にし、本体へ進めず、記録しない（%s）',
      async (_label, pathOf) => {
        const { app, reached, scope } = buildDeletedApp();
        const missing = await missingBody(app);
        mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
          projectId: 'project-in-scope',
          deletedAt: new Date(),
        });
        const response = await request(app).get(pathOf('project-in-scope')).expect(404);
        expectGenericNotFound(response.body);
        expect(response.body.detail).toBe(missing.detail);
        expect(reached).not.toHaveBeenCalled();
        expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-in-scope');
        expect(audit.createLog).not.toHaveBeenCalled();
      }
    );

    it.each(DELETED_ROUTES)(
      '工程表の案件そのものが不在か論理削除済み（判定が not_found）なら、不在と同じ汎用の 404 にし、本体へ進めず、記録しない（%s）',
      async (_label, pathOf) => {
        const { app, reached, scope } = buildDeletedApp();
        mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
          projectId: 'project-gone',
          deletedAt: new Date(),
        });
        expectGenericNotFound((await request(app).get(pathOf('project-gone')).expect(404)).body);
        expect(reached).not.toHaveBeenCalled();
        expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-gone');
        expect(audit.createLog).not.toHaveBeenCalled();
      }
    );
  });

  it('二重マウントで経路の案件 ID と工程表の案件が食い違い、工程表の案件が範囲内のときは、不在と同じ 404 にし、記録しない（13.8）', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/projects/:projectId/schedules/:id'],
      requireScheduleProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    await request(app).get('/projects/project-in-scope/schedules/cs-1').expect(200);
    expect(reached).toHaveBeenCalledTimes(1);

    // 工程表の案件は範囲内だが、経路の案件と食い違う（経路の誤り）
    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    expectGenericNotFound(
      (await request(app).get('/projects/project-other/schedules/cs-1').expect(404)).body
    );
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).not.toHaveBeenCalled();
    // 経路の案件（project-other）は判定しない
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalledWith(USER_ID, 'project-other');
  });

  it('二重マウントで経路の案件 ID と工程表の案件が食い違い、工程表の案件が範囲外のときは、不在と同じ 404 にし、工程表の案件を対象に 1 件記録する（13.8）', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/projects/:projectId/schedules/:id'],
      requireScheduleProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/projects/project-in-scope/schedules/cs-9').expect(404);

    // 工程表の案件が範囲外で、経路の案件（範囲内）と食い違う
    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
      deletedAt: null,
    });
    const mismatched = await request(app)
      .get('/projects/project-in-scope/schedules/cs-2')
      .expect(404);
    expectGenericNotFound(mismatched.body);
    expect(mismatched.body.detail).toBe(missing.body.detail);
    expect(reached).not.toHaveBeenCalled();
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalledWith(USER_ID, 'project-in-scope');
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('二重マウントで論理的に取り除かれた工程表を指し、工程表の案件が範囲外で経路の案件と食い違うときは、経路の案件でなく工程表の案件を判定し、不在と同じ 404 にし、工程表の案件を対象に 1 件記録する（13.8）', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/projects/:projectId/schedules/:id'],
      requireScheduleProjectScope('id', { scopeService: scope, auditLogService: audit })
    );
    mockPrisma.constructionSchedule.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
      deletedAt: new Date(),
    });
    expectGenericNotFound(
      (await request(app).get('/projects/project-in-scope/schedules/cs-5').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalledWith(USER_ID, 'project-in-scope');
    expect(reached).not.toHaveBeenCalled();
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('案件の ID を経路のパラメータから読んで判定する（13.5）', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      ['/projects/:projectId/schedules'],
      requireProjectParamScope('projectId', { scopeService: scope, auditLogService: audit })
    );
    await request(app).get('/projects/project-in-scope/schedules').expect(200);
    expectGenericNotFound(
      (await request(app).get('/projects/project-out-of-scope/schedules').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
  });
});
