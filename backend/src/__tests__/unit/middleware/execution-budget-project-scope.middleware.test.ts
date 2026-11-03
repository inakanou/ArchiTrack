/**
 * @fileoverview 実行予算まわりの案件の閲覧範囲の判定部品と、子リソース・一括の対象の所属の照合の単体テスト
 * （execution-budget-management タスク17.1。食い違いの記録はタスク18.1、20.9）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（execution-budget-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  executionBudgetItem: { findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn() },
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

describe('経路の子リソースの所属の照合（20.4・20.9）', () => {
  const cases = [
    {
      name: '実行予算項目',
      path: '/projects/:projectId/items/:itemId',
      guard: (options: Parameters<typeof requireExecutionBudgetItemInProject>[1]) =>
        requireExecutionBudgetItemInProject('itemId', options),
      find: () => mockPrisma.executionBudgetItem.findUnique,
      url: (project: string) => `/projects/${project}/items/child-1`,
    },
    {
      name: '発注',
      path: '/projects/:projectId/orders/:orderId',
      guard: (options: Parameters<typeof requireOrderInProject>[1]) =>
        requireOrderInProject('orderId', options),
      find: () => mockPrisma.order.findUnique,
      url: (project: string) => `/projects/${project}/orders/child-1`,
    },
    {
      name: '出来高記録',
      path: '/projects/:projectId/progress/:progressRecordId',
      guard: (options: Parameters<typeof requireProgressRecordInProject>[1]) =>
        requireProgressRecordInProject('progressRecordId', options),
      find: () => mockPrisma.progressRecord.findUnique,
      url: (project: string) => `/projects/${project}/progress/child-1`,
    },
  ];

  for (const c of cases) {
    it(`${c.name}が経路の案件に属せば通し、他の案件に属するか不在なら同じ汎用の 404 にし、他の案件が範囲外のときだけ子の実際の案件を対象に 1 件記録する`, async () => {
      const scope = fakeScope();
      const { app, reached } = buildApp('get', c.path, [
        c.guard({ scopeService: scope, auditLogService: audit }),
      ]);

      // 経路の案件に属する子は通し、判定も記録もしない
      c.find().mockResolvedValueOnce({ executionBudget: { projectId: 'project-in-scope' } });
      await request(app).get(c.url('project-in-scope')).expect(200);
      expect(reached).toHaveBeenCalledTimes(1);
      expect(c.find()).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'child-1' } })
      );
      expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();

      // 不在: 汎用の 404。判定も記録もしない
      c.find().mockResolvedValueOnce(null);
      const missing = await request(app).get(c.url('project-in-scope')).expect(404);
      expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();
      expect(audit.createLog).not.toHaveBeenCalled();
      const { instance: _m, ...missingRest } = missing.body;

      // 範囲内の他の案件に属する: 不在と同じ 404。子の実際の案件を判定するが記録しない
      c.find().mockResolvedValueOnce({ executionBudget: { projectId: 'project-other-in-scope' } });
      DECISIONS['project-other-in-scope'] = 'allowed';
      let inScope: request.Response;
      try {
        inScope = await request(app).get(c.url('project-in-scope')).expect(404);
      } finally {
        delete DECISIONS['project-other-in-scope'];
      }
      expect(scope.evaluateProjectAccess).toHaveBeenLastCalledWith(
        USER_ID,
        'project-other-in-scope'
      );
      expect(audit.createLog).not.toHaveBeenCalled();
      const { instance: _i, ...inScopeRest } = inScope.body;
      expect(inScopeRest).toEqual(missingRest);

      // 範囲外の案件に属する: 不在と同じ 404。子の実際の案件を対象に 1 件記録する（経路の案件は判定しない）
      c.find().mockResolvedValueOnce({ executionBudget: { projectId: 'project-out-of-scope' } });
      const crossed = await request(app).get(c.url('project-in-scope')).expect(404);
      expectGenericNotFound(crossed.body);
      const { instance: _a, ...crossedRest } = crossed.body;
      expect(crossedRest).toEqual(missingRest);
      expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(2);
      expect(scope.evaluateProjectAccess).not.toHaveBeenCalledWith(USER_ID, 'project-in-scope');
      expect(audit.createLog).toHaveBeenCalledTimes(1);
      expect(audit.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_SCOPE_DENIED',
          actorId: USER_ID,
          targetId: 'project-out-of-scope',
        })
      );
      expect(reached).toHaveBeenCalledTimes(1);
    });

    it(`${c.name}の食い違いの判定が失敗したら 404 にせずエラーハンドラーへ渡す`, async () => {
      const scope = {
        evaluateProjectAccess: vi.fn().mockRejectedValue(new Error('db down')),
      };
      const { app, reached } = buildApp('get', c.path, [
        c.guard({ scopeService: scope, auditLogService: audit }),
      ]);
      c.find().mockResolvedValueOnce({ executionBudget: { projectId: 'project-out-of-scope' } });
      const response = await request(app).get(c.url('project-in-scope'));
      expect(response.status).toBe(500);
      expect(reached).not.toHaveBeenCalled();
      expect(audit.createLog).not.toHaveBeenCalled();
    });
  }
});

describe('一括の対象の所属の照合（20.5）', () => {
  it('発注のチェック済み項目の全件が経路の案件の実行予算に属せば通し、1 件でも属さなければ要求全体を汎用の 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp('put', '/projects/:projectId/orders/:orderId/items', [
      requireBodyExecutionBudgetItemsInProject(orderItemIdsOf, {
        scopeService: scope,
        auditLogService: audit,
      }),
    ]);

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(2);
    await request(app)
      .put('/projects/project-a/orders/o-1/items')
      .send({ itemIds: ['i-1', 'i-2', 'i-1'] })
      .expect(200);
    // 重複を除いた件数で照合し、経路の案件の実行予算で絞る。通る要求では所属を引かず、判定も記録もしない
    expect(mockPrisma.executionBudgetItem.count).toHaveBeenLastCalledWith({
      where: { id: { in: ['i-1', 'i-2'] }, executionBudget: { projectId: 'project-a' } },
    });
    expect(mockPrisma.executionBudgetItem.findMany).not.toHaveBeenCalled();
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(1);
    mockPrisma.executionBudgetItem.findMany.mockResolvedValueOnce([
      { executionBudget: { projectId: 'project-out-of-scope' } },
    ]);
    const crossed = await request(app)
      .put('/projects/project-a/orders/o-1/items')
      .send({ itemIds: ['i-1', 'i-foreign'] })
      .expect(404);
    expectGenericNotFound(crossed.body);
    expect(reached).toHaveBeenCalledTimes(1);
    // 属さない項目の実際の案件を引き、範囲外の案件を対象に 1 件記録する
    expect(mockPrisma.executionBudgetItem.findMany).toHaveBeenLastCalledWith({
      where: {
        id: { in: ['i-1', 'i-foreign'] },
        executionBudget: { projectId: { not: 'project-a' } },
      },
      select: { executionBudget: { select: { projectId: true } } },
    });
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROJECT_SCOPE_DENIED',
        actorId: USER_ID,
        targetId: 'project-out-of-scope',
      })
    );
  });

  it('一括の照合で欠けたとき、範囲外の案件ごとに 1 件だけ記録し、範囲内の他の案件・不在の項目・不在の案件は記録しない', async () => {
    const scope = fakeScope();
    DECISIONS['project-other-in-scope'] = 'allowed';
    const { app, reached } = buildApp('put', '/projects/:projectId/orders/:orderId/items', [
      requireBodyExecutionBudgetItemsInProject(orderItemIdsOf, {
        scopeService: scope,
        auditLogService: audit,
      }),
    ]);
    try {
      // 同じ範囲外の案件の項目 2 件・範囲内の他の案件の項目・案件の不在の項目・存在しない項目が混じる
      mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(1);
      mockPrisma.executionBudgetItem.findMany.mockResolvedValueOnce([
        { executionBudget: { projectId: 'project-out-of-scope' } },
        { executionBudget: { projectId: 'project-out-of-scope' } },
        { executionBudget: { projectId: 'project-other-in-scope' } },
        { executionBudget: { projectId: 'project-deleted' } },
      ]);
      const crossed = await request(app)
        .put('/projects/project-a/orders/o-1/items')
        .send({ itemIds: ['i-own', 'i-out-1', 'i-out-2', 'i-in', 'i-deleted', 'i-missing'] })
        .expect(404);
      expectGenericNotFound(crossed.body);
      expect(reached).not.toHaveBeenCalled();
      // 案件は重複なく 1 回ずつ判定し、経路の案件は判定しない
      expect(scope.evaluateProjectAccess.mock.calls.map(([, projectId]) => projectId)).toEqual([
        'project-out-of-scope',
        'project-other-in-scope',
        'project-deleted',
      ]);
      expect(audit.createLog).toHaveBeenCalledTimes(1);
      expect(audit.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_SCOPE_DENIED',
          targetId: 'project-out-of-scope',
        })
      );

      // 存在しない項目だけが欠ける: 所属の引きは何も返さず、判定も記録もしない
      mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(1);
      mockPrisma.executionBudgetItem.findMany.mockResolvedValueOnce([]);
      const missing = await request(app)
        .put('/projects/project-a/orders/o-1/items')
        .send({ itemIds: ['i-own', 'i-missing'] })
        .expect(404);
      const { instance: _a, ...crossedRest } = crossed.body;
      const { instance: _b, ...missingRest } = missing.body;
      expect(crossedRest).toEqual(missingRest);
      expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(3);
      expect(audit.createLog).toHaveBeenCalledTimes(1);
    } finally {
      delete DECISIONS['project-other-in-scope'];
    }
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
    const scope = fakeScope();
    const { app, reached } = buildApp('post', '/projects/:projectId/progress', [
      requireBodyExecutionBudgetItemsInProject(progressItemIdsOf, {
        scopeService: scope,
        auditLogService: audit,
      }),
    ]);
    const body = {
      constructionDate: '2026-10-01',
      items: [
        { itemId: 'i-1', amount: '1' },
        { itemId: 'i-foreign', amount: '2' },
      ],
    };

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(1);
    mockPrisma.executionBudgetItem.findMany.mockResolvedValueOnce([
      { executionBudget: { projectId: 'project-out-of-scope' } },
    ]);
    const crossed = await request(app).post('/projects/project-a/progress').send(body).expect(404);
    expectGenericNotFound(crossed.body);
    expect(mockPrisma.executionBudgetItem.count).toHaveBeenLastCalledWith({
      where: { id: { in: ['i-1', 'i-foreign'] }, executionBudget: { projectId: 'project-a' } },
    });
    // 範囲外の案件を対象に 1 件記録する（20.9）
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROJECT_SCOPE_DENIED', targetId: 'project-out-of-scope' })
    );

    mockPrisma.executionBudgetItem.count.mockResolvedValueOnce(2);
    await request(app).post('/projects/project-a/progress').send(body).expect(200);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
