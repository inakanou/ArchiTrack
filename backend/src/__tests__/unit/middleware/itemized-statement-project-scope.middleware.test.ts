/**
 * @fileoverview 内訳書の ID から案件 ID を引く解決関数と範囲の判定部品の単体テスト
 * （itemized-statement-generation タスク27.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（itemized-statement-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  itemizedStatement: { findUnique: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  findProjectIdOfItemizedStatement,
  requireItemizedStatementProjectScope,
  requireProjectParamScope,
} from '../../../middleware/itemized-statement-project-scope.middleware.js';
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

describe('内訳書の ID からの解決関数（18.2・18.3）', () => {
  it('内訳書の ID から案件 ID を引き、内訳書が無ければ null を返す（論理削除は区別しない）', async () => {
    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
    });
    expect(await findProjectIdOfItemizedStatement('is-1')).toBe('project-in-scope');
    expect(mockPrisma.itemizedStatement.findUnique).toHaveBeenCalledWith({
      where: { id: 'is-1' },
      select: { projectId: true },
    });
    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce(null);
    expect(await findProjectIdOfItemizedStatement('is-2')).toBeNull();
  });

  it('内訳書の案件が範囲内なら通し、範囲外・内訳書の不在は同じ汎用の 404 にして範囲外だけを記録する', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/itemized-statements/:id'],
      requireItemizedStatementProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
    });
    await request(app).get('/itemized-statements/is-1').expect(200);

    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
    });
    const outOfScope = await request(app).get('/itemized-statements/is-2').expect(404);
    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/itemized-statements/is-3').expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('二重マウントで経路の案件 ID と内訳書の案件が食い違うときは、範囲を判定せずに不在と同じ 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      ['/projects/:projectId/itemized-statements/:id'],
      requireItemizedStatementProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
    });
    await request(app).get('/projects/project-in-scope/itemized-statements/is-1').expect(200);

    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
    });
    expectGenericNotFound(
      (await request(app).get('/projects/project-other/itemized-statements/is-1').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(1);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it('案件の ID を経路のパラメータから読んで判定する（18.6）', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      ['/projects/:projectId/itemized-statements'],
      requireProjectParamScope('projectId', { scopeService: scope, auditLogService: audit })
    );
    await request(app).get('/projects/project-in-scope/itemized-statements').expect(200);
    expectGenericNotFound(
      (await request(app).get('/projects/project-out-of-scope/itemized-statements').expect(404))
        .body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
  });
});
