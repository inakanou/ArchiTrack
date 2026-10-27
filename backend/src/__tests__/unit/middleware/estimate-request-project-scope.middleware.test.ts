/**
 * @fileoverview 見積依頼・受領見積書・内訳書の ID から案件 ID を引く解決関数と範囲の判定部品の単体テスト
 * （estimate-request タスク103.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（estimate-request-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  estimateRequest: { findUnique: vi.fn() },
  receivedQuotation: { findUnique: vi.fn() },
  itemizedStatement: { findUnique: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  requireBodyItemizedStatementProjectScope,
  requireEstimateRequestProjectScope,
  requireProjectParamScope,
  requireReceivedQuotationProjectScope,
} from '../../../middleware/estimate-request-project-scope.middleware.js';
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
  method: 'get' | 'post',
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
  app[method](paths, guard, (_req: Request, res: Response) => {
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

describe('見積依頼・受領見積書・案件の ID からの解決関数', () => {
  it('見積依頼の ID から引いた案件が範囲内なら通し、範囲外・見積依頼の不在は同じ汎用の 404 にして範囲外だけを記録する', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'get',
      ['/estimate-requests/:id'],
      requireEstimateRequestProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.estimateRequest.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(app).get('/estimate-requests/er-1').expect(200);
    expect(mockPrisma.estimateRequest.findUnique).toHaveBeenCalledWith({
      where: { id: 'er-1' },
      select: { projectId: true },
    });

    mockPrisma.estimateRequest.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
    });
    const outOfScope = await request(app).get('/estimate-requests/er-2').expect(404);
    mockPrisma.estimateRequest.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/estimate-requests/er-3').expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('二重マウントで経路の案件 ID と見積依頼の案件が食い違うときは、範囲を判定せずに不在と同じ 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'get',
      ['/projects/:projectId/estimate-requests/:id'],
      requireEstimateRequestProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.estimateRequest.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(app).get('/projects/project-in-scope/estimate-requests/er-1').expect(200);

    mockPrisma.estimateRequest.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    expectGenericNotFound(
      (await request(app).get('/projects/project-other/estimate-requests/er-1').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(1);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('受領見積書の ID は親の見積依頼を経て案件を引く', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'get',
      ['/quotations/:id'],
      requireReceivedQuotationProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.receivedQuotation.findUnique.mockResolvedValueOnce({
      estimateRequest: { projectId: 'project-in-scope' },
    });
    await request(app).get('/quotations/q-1').expect(200);
    expect(mockPrisma.receivedQuotation.findUnique).toHaveBeenCalledWith({
      where: { id: 'q-1' },
      select: { estimateRequest: { select: { projectId: true } } },
    });

    mockPrisma.receivedQuotation.findUnique.mockResolvedValueOnce({
      estimateRequest: { projectId: 'project-out-of-scope' },
    });
    expectGenericNotFound((await request(app).get('/quotations/q-2').expect(404)).body);
    mockPrisma.receivedQuotation.findUnique.mockResolvedValueOnce(null);
    expectGenericNotFound((await request(app).get('/quotations/q-3').expect(404)).body);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('案件の ID を経路のパラメータから読んで判定する', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      'get',
      ['/projects/:projectId/estimate-requests'],
      requireProjectParamScope('projectId', { scopeService: scope, auditLogService: audit })
    );
    await request(app).get('/projects/project-in-scope/estimate-requests').expect(200);
    expectGenericNotFound(
      (await request(app).get('/projects/project-out-of-scope/estimate-requests').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
  });
});

describe('作成の要求が指す内訳書の判定（42.4）', () => {
  it('内訳書を指さない要求は判定せずに通し、指す要求は内訳書の案件を判定して範囲外と不在を同じ 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'post',
      ['/estimate-requests'],
      requireBodyItemizedStatementProjectScope('itemizedStatementId', {
        scopeService: scope,
        auditLogService: audit,
      })
    );

    await request(app).post('/estimate-requests').send({ name: 'x' }).expect(200);
    await request(app)
      .post('/estimate-requests')
      .send({ name: 'x', itemizedStatementId: null })
      .expect(200);
    expect(mockPrisma.itemizedStatement.findUnique).not.toHaveBeenCalled();

    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
    });
    await request(app).post('/estimate-requests').send({ itemizedStatementId: 'is-1' }).expect(200);
    expect(mockPrisma.itemizedStatement.findUnique).toHaveBeenCalledWith({
      where: { id: 'is-1' },
      select: { projectId: true },
    });

    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
    });
    const outOfScope = await request(app)
      .post('/estimate-requests')
      .send({ itemizedStatementId: 'is-2' })
      .expect(404);
    mockPrisma.itemizedStatement.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app)
      .post('/estimate-requests')
      .send({ itemizedStatementId: 'is-3' })
      .expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(JSON.stringify(outOfScope.body)).not.toContain('is-2');
    expect(reached).toHaveBeenCalledTimes(3);
  });
});
