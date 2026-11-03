/**
 * @fileoverview 見積書の ID から案件 ID を引く解決関数と範囲の判定部品の単体テスト
 * （estimate-creation タスク62.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（estimate-creation-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  estimate: { findUnique: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  findProjectIdOfEstimate,
  requireEstimateProjectScope,
  requireProjectParamScope,
} from '../../../middleware/estimate-creation-project-scope.middleware.js';
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

describe('見積書の ID からの解決関数（57.2・57.3）', () => {
  it('見積書の ID から案件 ID を引き、見積書が無ければ null を返す（論理削除は区別しない）', async () => {
    mockPrisma.estimate.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    expect(await findProjectIdOfEstimate('est-1')).toBe('project-in-scope');
    expect(mockPrisma.estimate.findUnique).toHaveBeenCalledWith({
      where: { id: 'est-1' },
      select: { projectId: true },
    });
    mockPrisma.estimate.findUnique.mockResolvedValueOnce(null);
    expect(await findProjectIdOfEstimate('est-2')).toBeNull();
  });

  it('見積書の案件が範囲内なら通し、範囲外・見積書の不在は同じ汎用の 404 にして範囲外だけを記録する', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/estimates/:id'],
      requireEstimateProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.estimate.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(app).get('/estimates/est-1').expect(200);

    mockPrisma.estimate.findUnique.mockResolvedValueOnce({ projectId: 'project-out-of-scope' });
    const outOfScope = await request(app).get('/estimates/est-2').expect(404);
    mockPrisma.estimate.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/estimates/est-3').expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('二重マウントで経路の案件 ID と見積書の案件が食い違い、見積書の案件が範囲内のときは、不在と同じ 404 にし、記録しない（57.9）', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/projects/:projectId/estimates/:id'],
      requireEstimateProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.estimate.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(app).get('/projects/project-in-scope/estimates/est-1').expect(200);
    expect(reached).toHaveBeenCalledTimes(1);

    // 見積書の不在: 汎用の 404 で記録しない
    mockPrisma.estimate.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app)
      .get('/projects/project-in-scope/estimates/est-0')
      .expect(404);

    // 見積書の案件は範囲内だが、経路の案件と食い違う（経路の誤り）
    mockPrisma.estimate.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    const misrouted = await request(app).get('/projects/project-other/estimates/est-1').expect(404);
    expectGenericNotFound(misrouted.body);
    expect(misrouted.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).not.toHaveBeenCalled();
    // 経路の案件（project-other）は判定しない
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalledWith(USER_ID, 'project-other');
  });

  it('二重マウントで経路の案件 ID と見積書の案件が食い違い、見積書の案件が範囲外のときは、不在と同じ 404 にし、見積書の案件を対象に 1 件記録する（57.9）', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/projects/:projectId/estimates/:id'],
      requireEstimateProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.estimate.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app)
      .get('/projects/project-in-scope/estimates/est-9')
      .expect(404);

    // 見積書の案件が範囲外で、経路の案件（範囲内）と食い違う
    mockPrisma.estimate.findUnique.mockResolvedValueOnce({ projectId: 'project-out-of-scope' });
    const mismatched = await request(app)
      .get('/projects/project-in-scope/estimates/est-2')
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

  it('案件の ID を経路のパラメータから読んで判定する（57.6）', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      ['/projects/:projectId/estimates'],
      requireProjectParamScope('projectId', { scopeService: scope, auditLogService: audit })
    );
    await request(app).get('/projects/project-in-scope/estimates').expect(200);
    expectGenericNotFound(
      (await request(app).get('/projects/project-out-of-scope/estimates').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
  });
});
