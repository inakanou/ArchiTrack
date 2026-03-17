/**
 * @fileoverview 実行予算ルート ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 2.3: 実行予算のルーター実装
 *
 * Requirements:
 * - 17.1: 実行予算の閲覧をVIEWER以上のロールに許可する
 * - 17.2: 実行予算の作成・編集・削除をEDITOR以上のロールに許可する
 * - 19.2: 実行予算のCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ExecutionBudgetAlreadyExistsError,
  ContractNotFoundForBudgetError,
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
  ExecutionBudgetDeletionBlockedError,
} from '../../../errors/executionBudgetError.js';

// vi.hoistedでモック関数を定義
const { mockCreate, mockGetWithItems, mockUpdateItem, mockDelete } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockGetWithItems: vi.fn(),
  mockUpdateItem: vi.fn(),
  mockDelete: vi.fn(),
}));

// 依存モジュールのモック
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/execution-budget.service.js', () => ({
  ExecutionBudgetService: class {
    create = mockCreate;
    getWithItems = mockGetWithItems;
    updateItem = mockUpdateItem;
    delete = mockDelete;
  },
}));

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    req.user = { userId: 'test-user-id', email: 'test@example.com', roles: ['user'] };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
}));

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ルートモジュールをインポート（モックが適用された状態）
import executionBudgetRoutes from '../../../routes/execution-budget.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const contractId = '550e8400-e29b-41d4-a716-446655440010';
const itemId = '550e8400-e29b-41d4-a716-446655440020';

const mockBudgetCreateResult = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  projectId,
  contractId,
  version: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const mockBudgetWithItems = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  projectId,
  contractId,
  version: 0,
  contractAmount: '10000000',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  items: [
    {
      id: itemId,
      parentId: null,
      displayOrder: 1,
      name: 'テスト項目',
      specification: '規格A',
      unit: '式',
      quantity: '1',
      estimateUnitPrice: '100000',
      estimateAmount: '100000',
      executionUnitPrice: '90000',
      executionAmount: '90000',
      amendmentAmount: '0',
      previousMonthExpense: '0',
      currentMonthExpense: '0',
      plannedVendorId: null,
      plannedVendor: null,
      remarks: null,
      amendmentStatus: null,
      orderAmount: null,
      orderStatus: null,
      children: [],
      calculatedEstimateAmount: null,
      calculatedExecutionAmount: null,
      calculatedAmendmentAmount: null,
      calculatedOrderAmount: null,
      calculatedTotalExpense: null,
      calculatedProgressAmount: null,
    },
  ],
  totals: {
    estimateAmount: '100000',
    executionAmount: '90000',
    amendmentAmount: '0',
    orderAmount: '0',
    totalExpense: '0',
    remainingBudget: '90000',
    progressAmount: '0',
    expectedProfit: '9910000',
  },
  orderProgressRate: 0,
};

const mockUpdateItemResult = {
  id: itemId,
  version: 1,
};

// テスト用Expressアプリ
function createTestApp() {
  const app = express();
  app.use(express.json());

  // プロジェクトサブルートとしてマウント
  app.use('/api/projects/:projectId/execution-budget', executionBudgetRoutes);

  // エラーハンドラー
  app.use(
    (
      err: Error & { statusCode?: number; status?: number },
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      const statusCode = err.statusCode || err.status || 500;
      res.status(statusCode).json({
        status: statusCode,
        detail: err.message,
      });
    }
  );

  return app;
}

describe('実行予算ルート', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  // =================================================================
  // POST /api/projects/:projectId/execution-budget - 実行予算作成
  // Requirements: 17.2, 19.2, 19.9
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget', () => {
    it('実行予算を作成できること（201 Created）', async () => {
      mockCreate.mockResolvedValue(mockBudgetCreateResult);

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget`)
        .send({ contractId })
        .expect(201);

      expect(res.body.id).toBe(mockBudgetCreateResult.id);
      expect(res.body.projectId).toBe(projectId);
      expect(res.body.contractId).toBe(contractId);
      expect(mockCreate).toHaveBeenCalledWith(projectId, contractId);
    });

    it('contractIdが不正な形式で400エラーが返ること', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/execution-budget`)
        .send({ contractId: 'invalid-uuid' })
        .expect(400);
    });

    it('contractIdが未指定で400エラーが返ること', async () => {
      await request(app).post(`/api/projects/${projectId}/execution-budget`).send({}).expect(400);
    });

    it('既に実行予算が存在する場合409エラーが返ること', async () => {
      mockCreate.mockRejectedValue(new ExecutionBudgetAlreadyExistsError(projectId));

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget`)
        .send({ contractId })
        .expect(409);

      expect(res.body.status).toBe(409);
    });

    it('契約書が存在しない場合404エラーが返ること', async () => {
      mockCreate.mockRejectedValue(new ContractNotFoundForBudgetError(contractId));

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget`)
        .send({ contractId })
        .expect(404);

      expect(res.body.status).toBe(404);
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget - 実行予算取得
  // Requirements: 17.1, 19.2, 19.9
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget', () => {
    it('実行予算を項目一覧とともに取得できること（200 OK）', async () => {
      mockGetWithItems.mockResolvedValue(mockBudgetWithItems);

      const res = await request(app).get(`/api/projects/${projectId}/execution-budget`).expect(200);

      expect(res.body.id).toBe(mockBudgetWithItems.id);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.totals).toBeDefined();
      expect(res.body.orderProgressRate).toBe(0);
      expect(mockGetWithItems).toHaveBeenCalledWith(projectId);
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockGetWithItems.mockResolvedValue(null);

      await request(app).get(`/api/projects/${projectId}/execution-budget`).expect(404);
    });
  });

  // =================================================================
  // DELETE /api/projects/:projectId/execution-budget - 実行予算削除
  // Requirements: 17.2, 19.2, 19.9
  // =================================================================
  describe('DELETE /api/projects/:projectId/execution-budget', () => {
    it('実行予算を論理削除できること（204 No Content）', async () => {
      mockDelete.mockResolvedValue(undefined);

      await request(app).delete(`/api/projects/${projectId}/execution-budget`).expect(204);

      expect(mockDelete).toHaveBeenCalledWith(projectId);
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockDelete.mockRejectedValue(new ExecutionBudgetNotFoundError());

      await request(app).delete(`/api/projects/${projectId}/execution-budget`).expect(404);
    });

    it('発注済みの発注が存在する場合422エラーが返ること', async () => {
      mockDelete.mockRejectedValue(new ExecutionBudgetDeletionBlockedError());

      const res = await request(app)
        .delete(`/api/projects/${projectId}/execution-budget`)
        .expect(422);

      expect(res.body.status).toBe(422);
    });
  });

  // =================================================================
  // PATCH /api/projects/:projectId/execution-budget/items/:itemId - 項目編集
  // Requirements: 17.2, 19.2, 19.9
  // =================================================================
  describe('PATCH /api/projects/:projectId/execution-budget/items/:itemId', () => {
    it('実行単価を更新できること（200 OK）', async () => {
      mockUpdateItem.mockResolvedValue(mockUpdateItemResult);

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/items/${itemId}`)
        .send({ executionUnitPrice: '85000', version: 0 })
        .expect(200);

      expect(res.body.id).toBe(itemId);
      expect(res.body.version).toBe(1);
      expect(mockUpdateItem).toHaveBeenCalledWith(itemId, {
        executionUnitPrice: '85000',
        version: 0,
      });
    });

    it('備考を更新できること（200 OK）', async () => {
      mockUpdateItem.mockResolvedValue(mockUpdateItemResult);

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/items/${itemId}`)
        .send({ remarks: 'テスト備考', version: 0 })
        .expect(200);

      expect(res.body.id).toBe(itemId);
      expect(mockUpdateItem).toHaveBeenCalledWith(itemId, {
        remarks: 'テスト備考',
        version: 0,
      });
    });

    it('versionが未指定で400エラーが返ること', async () => {
      await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/items/${itemId}`)
        .send({ executionUnitPrice: '85000' })
        .expect(400);
    });

    it('executionUnitPriceが不正な値で400エラーが返ること', async () => {
      await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/items/${itemId}`)
        .send({ executionUnitPrice: 'not-a-number', version: 0 })
        .expect(400);
    });

    it('項目が存在しない場合404エラーが返ること', async () => {
      mockUpdateItem.mockRejectedValue(new ExecutionBudgetNotFoundError());

      await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/items/${itemId}`)
        .send({ executionUnitPrice: '85000', version: 0 })
        .expect(404);
    });

    it('バージョン競合で409エラーが返ること', async () => {
      mockUpdateItem.mockRejectedValue(
        new ExecutionBudgetConflictError(undefined, {
          expectedVersion: 0,
          actualVersion: 1,
        })
      );

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/items/${itemId}`)
        .send({ executionUnitPrice: '85000', version: 0 })
        .expect(409);

      expect(res.body.status).toBe(409);
    });
  });
});
