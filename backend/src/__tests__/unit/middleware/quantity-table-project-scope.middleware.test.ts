/**
 * @fileoverview 数量表・数量グループ・数量項目の ID から案件 ID を引く解決関数と範囲の判定部品の単体テスト
 * （quantity-table-generation タスク104.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（quantity-table-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  quantityTable: { findUnique: vi.fn() },
  quantityGroup: { findUnique: vi.fn(), findMany: vi.fn() },
  quantityItem: { findUnique: vi.fn(), findMany: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  requireBulkQuantityItemsProjectScope,
  requireOrderedQuantityGroupsProjectScope,
  requireOrderedQuantityItemsProjectScope,
  requireProjectParamScope,
  requireQuantityGroupParamProjectScope,
  requireQuantityGroupProjectScope,
  requireQuantityItemProjectScope,
  requireQuantityTableParamProjectScope,
  requireQuantityTableProjectScope,
} from '../../../middleware/quantity-table-project-scope.middleware.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

const USER_ID = 'user-1';
const DECISIONS: Record<string, ProjectAccessDecision> = {
  'project-in-scope': 'allowed',
  'project-in-scope-2': 'allowed',
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
  method: 'get' | 'post' | 'put',
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
  const { instance: _instance, ...rest } = body;
  expect(JSON.stringify(rest)).not.toContain('project-');
}

describe('数量表・数量グループ・数量項目の ID からの解決関数', () => {
  it('数量表の ID から引いた案件が範囲内なら通し、範囲外・不在は同じ汎用の 404 にして範囲外だけを記録する', async () => {
    const { app, reached } = buildApp(
      'get',
      ['/quantity-tables/:id'],
      requireQuantityTableProjectScope('id', { scopeService: fakeScope(), auditLogService: audit })
    );

    mockPrisma.quantityTable.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(app).get('/quantity-tables/qt-1').expect(200);
    expect(mockPrisma.quantityTable.findUnique).toHaveBeenCalledWith({
      where: { id: 'qt-1' },
      select: { projectId: true },
    });

    mockPrisma.quantityTable.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
    });
    const outOfScope = await request(app).get('/quantity-tables/qt-2').expect(404);
    mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/quantity-tables/qt-3').expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('二重マウントで経路の親と対象の親が食い違うときは、範囲を判定せずに不在と同じ 404 にする', async () => {
    const scope = fakeScope();
    const options = { scopeService: scope, auditLogService: audit };
    const tables = buildApp(
      'get',
      ['/projects/:projectId/quantity-tables/:id'],
      requireQuantityTableProjectScope('id', options)
    );
    mockPrisma.quantityTable.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(tables.app).get('/projects/project-in-scope-2/quantity-tables/qt-1').expect(404);

    const groups = buildApp(
      'get',
      ['/quantity-tables/:quantityTableId/groups/:id'],
      requireQuantityGroupProjectScope('id', options)
    );
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce({
      quantityTableId: 'qt-1',
      quantityTable: { projectId: 'project-in-scope' },
    });
    await request(groups.app).get('/quantity-tables/qt-other/groups/g-1').expect(404);
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce({
      quantityTableId: 'qt-1',
      quantityTable: { projectId: 'project-in-scope' },
    });
    await request(groups.app).get('/quantity-tables/qt-1/groups/g-1').expect(200);

    const items = buildApp(
      'get',
      ['/quantity-groups/:groupId/items/:id'],
      requireQuantityItemProjectScope('id', options)
    );
    mockPrisma.quantityItem.findUnique.mockResolvedValueOnce({
      quantityGroupId: 'g-1',
      quantityGroup: { quantityTable: { projectId: 'project-in-scope' } },
    });
    await request(items.app).get('/quantity-groups/g-other/items/i-1').expect(404);
    mockPrisma.quantityItem.findUnique.mockResolvedValueOnce({
      quantityGroupId: 'g-1',
      quantityGroup: { quantityTable: { projectId: 'project-in-scope' } },
    });
    await request(items.app).get('/quantity-groups/g-1/items/i-1').expect(200);

    // 食い違いは範囲の判定に進まない（範囲外の記録も残さない）
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(2);
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it('数量グループ・数量項目は親の数量表の案件で判定する', async () => {
    const options = { scopeService: fakeScope(), auditLogService: audit };
    const groups = buildApp(
      'get',
      ['/quantity-groups/:id'],
      requireQuantityGroupProjectScope('id', options)
    );
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce({
      quantityTableId: 'qt-1',
      quantityTable: { projectId: 'project-out-of-scope' },
    });
    expectGenericNotFound((await request(groups.app).get('/quantity-groups/g-1').expect(404)).body);

    const items = buildApp(
      'get',
      ['/quantity-items/:id'],
      requireQuantityItemProjectScope('id', options)
    );
    mockPrisma.quantityItem.findUnique.mockResolvedValueOnce(null);
    expectGenericNotFound((await request(items.app).get('/quantity-items/i-1').expect(404)).body);

    const groupParam = buildApp(
      'get',
      ['/quantity-groups/:groupId/items'],
      requireQuantityGroupParamProjectScope('groupId', options)
    );
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce({
      quantityTableId: 'qt-1',
      quantityTable: { projectId: 'project-in-scope' },
    });
    await request(groupParam.app).get('/quantity-groups/g-1/items').expect(200);

    const tableParam = buildApp(
      'get',
      ['/quantity-tables/:quantityTableId/groups'],
      requireQuantityTableParamProjectScope('quantityTableId', options)
    );
    mockPrisma.quantityTable.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(tableParam.app).get('/quantity-tables/qt-1/groups').expect(200);

    const projectParam = buildApp(
      'get',
      ['/projects/:projectId/quantity-tables'],
      requireProjectParamScope('projectId', options)
    );
    await request(projectParam.app).get('/projects/project-in-scope/quantity-tables').expect(200);
    expectGenericNotFound(
      (
        await request(projectParam.app)
          .get('/projects/project-out-of-scope/quantity-tables')
          .expect(404)
      ).body
    );
  });
});

describe('複数の対象を一度に扱う要求の全件の判定（50.4）', () => {
  it('一括の項目と移し先のグループが全件範囲内なら通し、1 件でも範囲外・不在なら全体を同じ汎用の 404 にする', async () => {
    const { app, reached } = buildApp(
      'post',
      ['/bulk-move'],
      requireBulkQuantityItemsProjectScope(
        { itemIds: 'itemIds', targetGroupId: 'targetGroupId' },
        { scopeService: fakeScope(), auditLogService: audit }
      )
    );
    const groupOf = (projectId: string) => ({
      quantityTableId: 'qt',
      quantityTable: { projectId },
    });
    const itemOf = (projectId: string) => ({
      quantityGroup: { quantityTable: { projectId } },
    });

    // 全件範囲内（項目は複数の案件にまたがり得る）
    mockPrisma.quantityItem.findMany.mockResolvedValueOnce([
      itemOf('project-in-scope'),
      itemOf('project-in-scope-2'),
    ]);
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce(groupOf('project-in-scope'));
    await request(app)
      .post('/bulk-move')
      .send({ itemIds: ['i-1', 'i-2', 'i-1'], targetGroupId: 'g-1' })
      .expect(200);
    // 重複を除いた ID で 1 回だけ引く
    expect(mockPrisma.quantityItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['i-1', 'i-2'] } },
      select: { quantityGroup: { select: { quantityTable: { select: { projectId: true } } } } },
    });

    // 項目の 1 件が範囲外
    mockPrisma.quantityItem.findMany.mockResolvedValueOnce([
      itemOf('project-in-scope'),
      itemOf('project-out-of-scope'),
    ]);
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce(groupOf('project-in-scope'));
    const outOfScopeItem = await request(app)
      .post('/bulk-move')
      .send({ itemIds: ['i-1', 'i-9'], targetGroupId: 'g-1' })
      .expect(404);

    // 移し先が範囲外
    mockPrisma.quantityItem.findMany.mockResolvedValueOnce([itemOf('project-in-scope')]);
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce(groupOf('project-out-of-scope'));
    const outOfScopeTarget = await request(app)
      .post('/bulk-move')
      .send({ itemIds: ['i-1'], targetGroupId: 'g-9' })
      .expect(404);

    // 項目の 1 件が不在
    mockPrisma.quantityItem.findMany.mockResolvedValueOnce([itemOf('project-in-scope')]);
    const missingItem = await request(app)
      .post('/bulk-move')
      .send({ itemIds: ['i-1', 'i-missing'], targetGroupId: 'g-1' })
      .expect(404);

    // 移し先が不在
    mockPrisma.quantityItem.findMany.mockResolvedValueOnce([itemOf('project-in-scope')]);
    mockPrisma.quantityGroup.findUnique.mockResolvedValueOnce(null);
    const missingTarget = await request(app)
      .post('/bulk-move')
      .send({ itemIds: ['i-1'], targetGroupId: 'g-missing' })
      .expect(404);

    for (const response of [outOfScopeItem, outOfScopeTarget, missingItem, missingTarget]) {
      expectGenericNotFound(response.body);
      expect(response.body.detail).toBe(missingItem.body.detail);
    }
    expect(reached).toHaveBeenCalledTimes(1);
    // 範囲外の 2 件だけが記録される
    expect(audit.createLog).toHaveBeenCalledTimes(2);
  });

  it('表示順の更新は本文の orderUpdates の各 id の案件を判定し、対象が無ければ判定せずに通す', async () => {
    const options = { scopeService: fakeScope(), auditLogService: audit };
    const groups = buildApp(
      'put',
      ['/groups/order'],
      requireOrderedQuantityGroupsProjectScope('orderUpdates', options)
    );
    mockPrisma.quantityGroup.findMany.mockResolvedValueOnce([
      { quantityTable: { projectId: 'project-in-scope' } },
      { quantityTable: { projectId: 'project-out-of-scope' } },
    ]);
    expectGenericNotFound(
      (
        await request(groups.app)
          .put('/groups/order')
          .send({
            orderUpdates: [
              { id: 'g-1', displayOrder: 0 },
              { id: 'g-9', displayOrder: 1 },
            ],
          })
          .expect(404)
      ).body
    );
    await request(groups.app).put('/groups/order').send({ orderUpdates: [] }).expect(200);
    expect(mockPrisma.quantityGroup.findMany).toHaveBeenCalledTimes(1);

    const items = buildApp(
      'put',
      ['/items/order'],
      requireOrderedQuantityItemsProjectScope('orderUpdates', options)
    );
    mockPrisma.quantityItem.findMany.mockResolvedValueOnce([
      { quantityGroup: { quantityTable: { projectId: 'project-in-scope' } } },
    ]);
    await request(items.app)
      .put('/items/order')
      .send({ orderUpdates: [{ id: 'i-1', displayOrder: 0 }] })
      .expect(200);
    mockPrisma.quantityItem.findMany.mockResolvedValueOnce([]);
    expectGenericNotFound(
      (
        await request(items.app)
          .put('/items/order')
          .send({ orderUpdates: [{ id: 'i-missing', displayOrder: 0 }] })
          .expect(404)
      ).body
    );
  });
});
