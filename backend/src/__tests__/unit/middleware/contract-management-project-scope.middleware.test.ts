/**
 * @fileoverview 契約書の ID から案件 ID を引く解決関数と範囲の判定部品の単体テスト
 * （contract-management タスク19.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（contract-management-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  contract: { findUnique: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  findProjectIdOfContract,
  requireContractProjectScope,
  requireProjectParamScope,
} from '../../../middleware/contract-management-project-scope.middleware.js';
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

describe('契約書の ID からの解決関数（14.2・14.3・14.4）', () => {
  it('契約書の ID から案件 ID を引き、契約書が無いか論理的に取り除かれていれば null を返す', async () => {
    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    expect(await findProjectIdOfContract('ct-1')).toBe('project-in-scope');
    expect(mockPrisma.contract.findUnique).toHaveBeenCalledWith({
      where: { id: 'ct-1' },
      select: { projectId: true, deletedAt: true },
    });
    mockPrisma.contract.findUnique.mockResolvedValueOnce(null);
    expect(await findProjectIdOfContract('ct-2')).toBeNull();
    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: new Date(),
    });
    expect(await findProjectIdOfContract('ct-3')).toBeNull();
  });

  it('契約書の案件が範囲内なら通し、範囲外・契約書の不在は同じ汎用の 404 にして範囲外だけを記録する', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/contracts/:id'],
      requireContractProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    await request(app).get('/contracts/ct-1').expect(200);

    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
      deletedAt: null,
    });
    const outOfScope = await request(app).get('/contracts/ct-2').expect(404);
    mockPrisma.contract.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/contracts/ct-3').expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('論理的に取り除かれた契約書は、案件が範囲外でも範囲を判定せずに不在と同じ 404 にし、記録しない', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/contracts/:id'],
      requireContractProjectScope('id', { scopeService: scope, auditLogService: audit })
    );
    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
      deletedAt: new Date(),
    });
    expectGenericNotFound((await request(app).get('/contracts/ct-4').expect(404)).body);
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();
    expect(reached).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it('二重マウントで経路の案件 ID と契約書の案件が食い違うときは、範囲を判定せずに不在と同じ 404 にし、記録しない（14.4）', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/projects/:projectId/contracts/:id'],
      requireContractProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    await request(app).get('/projects/project-in-scope/contracts/ct-1').expect(200);

    // 経路の案件も範囲内だが、契約書はその案件に属さない
    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
      deletedAt: null,
    });
    expectGenericNotFound(
      (await request(app).get('/projects/project-other/contracts/ct-1').expect(404)).body
    );
    // 契約書の案件が範囲外で、経路の案件とも食い違う
    mockPrisma.contract.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
      deletedAt: null,
    });
    expectGenericNotFound(
      (await request(app).get('/projects/project-in-scope/contracts/ct-2').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(1);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it('案件の ID を経路のパラメータから読んで判定する（14.7）', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      ['/projects/:projectId/contracts'],
      requireProjectParamScope('projectId', { scopeService: scope, auditLogService: audit })
    );
    await request(app).get('/projects/project-in-scope/contracts').expect(200);
    expectGenericNotFound(
      (await request(app).get('/projects/project-out-of-scope/contracts').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
  });
});
