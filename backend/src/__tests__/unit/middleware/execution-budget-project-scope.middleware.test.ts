/**
 * @fileoverview 実行予算まわりの案件の閲覧範囲の判定部品と、子リソース・一括の対象の所属の照合の単体テスト
 * （execution-budget-management タスク17.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（execution-budget-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  executionBudgetItem: { findUnique: vi.fn(), count: vi.fn() },
  order: { findUnique: vi.fn() },
  progressRecord: { findUnique: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  orderItemIdsOf,
  progressItemIdsOf,
  requireBodyExecutionBudgetItemsInProject,
  requireExecutionBudgetItemInProject,
  requireExecutionBudgetProjectScope,
  requireOrderInProject,
  requireProgressRecordInProject,
} from '../../../middleware/execution-budget-project-scope.middleware.js';
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
  method: 'get' | 'put' | 'post',
  path: string,
  guards: express.RequestHandler[]
): { app: express.Express; reached: ReturnType<typeof vi.fn> } {
  const reached = vi.fn();
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: USER_ID, email: 'user@example.com' } as Request['user'];
    next();
  });
  app[method](path, ...guards, (_req: Request, res: Response) => {
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

/** 404 が汎用の本文で、案件 ID を含まないことを確かめる */
function expectGenericNotFound(body: Record<string, unknown>): void {
  expect(body.code).toBe('NOT_FOUND');
  const { instance: _instance, ...rest } = body;
  expect(JSON.stringify(rest)).not.toContain('project-');
}

describe('経路の案件の範囲の判定（requireExecutionBudgetProjectScope）', () => {
  it('範囲内なら通し、範囲外と不在は同じ汎用の 404 にして範囲外だけを記録する', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp('get', '/projects/:projectId/execution-budget', [
      requireExecutionBudgetProjectScope({ scopeService: scope, auditLogService: audit }),
    ]);

    await request(app).get('/projects/project-in-scope/execution-budget').expect(200);
    expect(reached).toHaveBeenCalledTimes(1);

    const outOfScope = await request(app)
      .get('/projects/project-out-of-scope/execution-budget')
      .expect(404);
    const missing = await request(app)
      .get('/projects/project-missing/execution-budget')
      .expect(404);
    expectGenericNotFound(outOfScope.body);
    const { instance: _a, ...outOfScopeRest } = outOfScope.body;
    const { instance: _b, ...missingRest } = missing.body;
    expect(outOfScopeRest).toEqual(missingRest);
    expect(reached).toHaveBeenCalledTimes(1);

    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROJECT_SCOPE_DENIED',
        actorId: USER_ID,
        targetId: 'project-out-of-scope',
      })
    );
  });
});

describe('経路の子リソースの所属の照合（20.4）', () => {
  const cases = [
    {
      name: '実行予算項目',
      path: '/projects/:projectId/items/:itemId',
      guard: () => requireExecutionBudgetItemInProject('itemId'),
      find: () => mockPrisma.executionBudgetItem.findUnique,
      url: (project: string) => `/projects/${project}/items/child-1`,
    },
    {
      name: '発注',
      path: '/projects/:projectId/orders/:orderId',
      guard: () => requireOrderInProject('orderId'),
      find: () => mockPrisma.order.findUnique,
      url: (project: string) => `/projects/${project}/orders/child-1`,
    },
    {
      name: '出来高記録',
      path: '/projects/:projectId/progress/:progressRecordId',
      guard: () => requireProgressRecordInProject('progressRecordId'),
      find: () => mockPrisma.progressRecord.findUnique,
      url: (project: string) => `/projects/${project}/progress/child-1`,
    },
  ];

  for (const c of cases) {
    it(`${c.name}が経路の案件に属せば通し、他の案件に属するか不在なら同じ汎用の 404 にして記録しない`, async () => {
      const { app, reached } = buildApp('get', c.path, [c.guard()]);

      c.find().mockResolvedValueOnce({ executionBudget: { projectId: 'project-a' } });
      await request(app).get(c.url('project-a')).expect(200);
      expect(reached).toHaveBeenCalledTimes(1);
      expect(c.find()).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'child-1' } })
      );

      c.find().mockResolvedValueOnce({ executionBudget: { projectId: 'project-b' } });
      const crossed = await request(app).get(c.url('project-a')).expect(404);
      c.find().mockResolvedValueOnce(null);
      const missing = await request(app).get(c.url('project-a')).expect(404);

      expectGenericNotFound(crossed.body);
      const { instance: _a, ...crossedRest } = crossed.body;
      const { instance: _b, ...missingRest } = missing.body;
      expect(crossedRest).toEqual(missingRest);
      expect(reached).toHaveBeenCalledTimes(1);
      expect(audit.createLog).not.toHaveBeenCalled();
    });
  }
});

describe('一括の対象の所属の照合（20.5）', () => {
  it('発注のチェック済み項目の全件が経路の案件の実行予算に属せば通し、1 件でも属さなければ要求全体を汎用の 404 にする', async () => {
    const { app, reached } = buildApp('put', '/projects/:projectId/orders/:orderId/items', [
      requireBodyExecutionBudgetItemsInProject(orderItemIdsOf),
    ]);

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(2);
    await request(app)
      .put('/projects/project-a/orders/o-1/items')
      .send({ itemIds: ['i-1', 'i-2', 'i-1'] })
      .expect(200);
    // 重複を除いた件数で照合し、経路の案件の実行予算で絞る
    expect(mockPrisma.executionBudgetItem.count).toHaveBeenLastCalledWith({
      where: { id: { in: ['i-1', 'i-2'] }, executionBudget: { projectId: 'project-a' } },
    });

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(1);
    const crossed = await request(app)
      .put('/projects/project-a/orders/o-1/items')
      .send({ itemIds: ['i-1', 'i-foreign'] })
      .expect(404);
    expectGenericNotFound(crossed.body);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('対象が 0 件の発注のチェック済み項目の更新は照合せずに通す', async () => {
    const { app, reached } = buildApp('put', '/projects/:projectId/orders/:orderId/items', [
      requireBodyExecutionBudgetItemsInProject(orderItemIdsOf),
    ]);
    await request(app)
      .put('/projects/project-a/orders/o-1/items')
      .send({ itemIds: [] })
      .expect(200);
    expect(mockPrisma.executionBudgetItem.count).not.toHaveBeenCalled();
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('出来高の保存の items[].itemId の 1 件でも経路の案件の実行予算に属さなければ要求全体を汎用の 404 にする', async () => {
    const { app, reached } = buildApp('post', '/projects/:projectId/progress', [
      requireBodyExecutionBudgetItemsInProject(progressItemIdsOf),
    ]);
    const body = {
      constructionDate: '2026-10-01',
      items: [
        { itemId: 'i-1', amount: '1' },
        { itemId: 'i-foreign', amount: '2' },
      ],
    };

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(1);
    const crossed = await request(app).post('/projects/project-a/progress').send(body).expect(404);
    expectGenericNotFound(crossed.body);
    expect(mockPrisma.executionBudgetItem.count).toHaveBeenLastCalledWith({
      where: { id: { in: ['i-1', 'i-foreign'] }, executionBudget: { projectId: 'project-a' } },
    });

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(2);
    await request(app).post('/projects/project-a/progress').send(body).expect(200);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
