/**
 * @fileoverview 原価・月次締めルート ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.3: 原価・月次締めのルーター実装
 *
 * Requirements:
 * - 17.5: 原価（支出実績）の入力・月次締めをEDITOR以上のロールに許可する
 * - 19.5: 原価（支出実績）データのCRUD操作にRESTful APIを提供する
 * - 19.6: 月次締めデータのCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
  MonthlyCloseAlreadyExistsError,
} from '../../../errors/executionBudgetError.js';

// vi.hoistedでモック関数を定義
const { mockUpdateCost, mockClose, mockGetHistory, mockFindByProjectId } = vi.hoisted(() => ({
  mockUpdateCost: vi.fn(),
  mockClose: vi.fn(),
  mockGetHistory: vi.fn(),
  mockFindByProjectId: vi.fn(),
}));

// 依存モジュールのモック
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/cost.service.js', () => ({
  CostService: class {
    updateCost = mockUpdateCost;
  },
}));

vi.mock('../../../services/monthly-close.service.js', () => ({
  MonthlyCloseService: class {
    close = mockClose;
    getHistory = mockGetHistory;
  },
}));

vi.mock('../../../services/execution-budget.service.js', () => ({
  ExecutionBudgetService: class {
    findByProjectId = mockFindByProjectId;
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
import costMonthlyCloseRoutes from '../../../routes/cost-monthly-close.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const itemId = '550e8400-e29b-41d4-a716-446655440020';
const budgetId = '550e8400-e29b-41d4-a716-446655440030';

const mockCostUpdateResult = {
  id: itemId,
  currentMonthExpense: '50000',
  previousMonthExpense: '100000',
  totalExpense: '150000',
  remainingBudget: '850000',
  isOverBudget: false,
  progressToExpenseRatio: '120.5',
  version: 1,
};

const mockMonthlyCloseResult = {
  id: '550e8400-e29b-41d4-a716-446655440050',
  executionBudgetId: budgetId,
  targetMonth: '2026-03',
  closedById: 'test-user-id',
  closedAt: new Date('2026-03-18T00:00:00.000Z'),
};

const mockHistoryList = [
  {
    id: '550e8400-e29b-41d4-a716-446655440050',
    executionBudgetId: budgetId,
    targetMonth: '2026-03',
    closedById: 'test-user-id',
    closedAt: new Date('2026-03-18T00:00:00.000Z'),
    closedBy: { id: 'test-user-id', displayName: 'テストユーザー' },
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440051',
    executionBudgetId: budgetId,
    targetMonth: '2026-02',
    closedById: 'test-user-id',
    closedAt: new Date('2026-02-28T00:00:00.000Z'),
    closedBy: { id: 'test-user-id', displayName: 'テストユーザー' },
  },
];

// テスト用Expressアプリ
function createApp() {
  const app = express();
  app.use(express.json());
  // 実際のマウントパスと同じ構造をシミュレート
  app.use('/api/projects/:projectId/execution-budget', costMonthlyCloseRoutes);
  return app;
}

describe('原価・月次締めルート (Task 5.3)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    // デフォルトで実行予算が存在する設定
    mockFindByProjectId.mockResolvedValue({ id: budgetId });
  });

  // ==========================================
  // PATCH /items/:itemId/cost - 原価入力
  // ==========================================
  describe('PATCH /api/projects/:projectId/execution-budget/items/:itemId/cost', () => {
    const costUrl = `/api/projects/${projectId}/execution-budget/items/${itemId}/cost`;
    const validCostBody = {
      currentMonthExpense: '50000',
      version: 0,
    };

    it('正常に原価を更新し200を返す', async () => {
      mockUpdateCost.mockResolvedValue(mockCostUpdateResult);

      const response = await request(app).patch(costUrl).send(validCostBody).expect(200);

      expect(response.body).toEqual(mockCostUpdateResult);
      expect(mockUpdateCost).toHaveBeenCalledWith(itemId, {
        currentMonthExpense: '50000',
        version: 0,
      });
    });

    it('項目が存在しない場合404を返す', async () => {
      mockUpdateCost.mockRejectedValue(new ExecutionBudgetNotFoundError());

      const response = await request(app).patch(costUrl).send(validCostBody).expect(404);

      expect(response.body.status).toBe(404);
      expect(response.body.code).toBe('EXECUTION_BUDGET_NOT_FOUND');
    });

    it('バージョン不一致の場合409を返す', async () => {
      mockUpdateCost.mockRejectedValue(
        new ExecutionBudgetConflictError(undefined, {
          expectedVersion: 0,
          actualVersion: 1,
        })
      );

      const response = await request(app).patch(costUrl).send(validCostBody).expect(409);

      expect(response.body.status).toBe(409);
      expect(response.body.code).toBe('EXECUTION_BUDGET_CONFLICT');
    });

    it('currentMonthExpenseが未指定の場合バリデーションエラーを返す', async () => {
      const response = await request(app).patch(costUrl).send({ version: 0 }).expect(400);

      expect(response.body).toBeDefined();
    });

    it('versionが未指定の場合バリデーションエラーを返す', async () => {
      const response = await request(app)
        .patch(costUrl)
        .send({ currentMonthExpense: '50000' })
        .expect(400);

      expect(response.body).toBeDefined();
    });

    it('currentMonthExpenseが不正な文字列の場合バリデーションエラーを返す', async () => {
      const response = await request(app)
        .patch(costUrl)
        .send({ currentMonthExpense: 'abc', version: 0 })
        .expect(400);

      expect(response.body).toBeDefined();
    });
  });

  // ==========================================
  // POST /monthly-close - 月次締め
  // ==========================================
  describe('POST /api/projects/:projectId/execution-budget/monthly-close', () => {
    const monthlyCloseUrl = `/api/projects/${projectId}/execution-budget/monthly-close`;
    const validCloseBody = {
      targetMonth: '2026-03',
    };

    it('正常に月次締めを実行し201を返す', async () => {
      mockClose.mockResolvedValue(mockMonthlyCloseResult);

      const response = await request(app).post(monthlyCloseUrl).send(validCloseBody).expect(201);

      expect(response.body.executionBudgetId).toBe(budgetId);
      expect(response.body.targetMonth).toBe('2026-03');
      expect(mockClose).toHaveBeenCalledWith(budgetId, '2026-03', 'test-user-id');
    });

    it('実行予算が存在しない場合404を返す', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      const response = await request(app).post(monthlyCloseUrl).send(validCloseBody).expect(404);

      expect(response.body.status).toBe(404);
    });

    it('サービス層で実行予算が見つからない場合404を返す', async () => {
      mockClose.mockRejectedValue(new ExecutionBudgetNotFoundError());

      const response = await request(app).post(monthlyCloseUrl).send(validCloseBody).expect(404);

      expect(response.body.status).toBe(404);
      expect(response.body.code).toBe('EXECUTION_BUDGET_NOT_FOUND');
    });

    it('同月の重複締めの場合409を返す', async () => {
      mockClose.mockRejectedValue(new MonthlyCloseAlreadyExistsError('2026-03'));

      const response = await request(app).post(monthlyCloseUrl).send(validCloseBody).expect(409);

      expect(response.body.status).toBe(409);
      expect(response.body.code).toBe('MONTHLY_CLOSE_ALREADY_EXISTS');
    });

    it('targetMonthが未指定の場合バリデーションエラーを返す', async () => {
      const response = await request(app).post(monthlyCloseUrl).send({}).expect(400);

      expect(response.body).toBeDefined();
    });

    it('targetMonthが不正な形式の場合バリデーションエラーを返す', async () => {
      const response = await request(app)
        .post(monthlyCloseUrl)
        .send({ targetMonth: '2026/03' })
        .expect(400);

      expect(response.body).toBeDefined();
    });

    it('targetMonthの月が不正な場合バリデーションエラーを返す', async () => {
      const response = await request(app)
        .post(monthlyCloseUrl)
        .send({ targetMonth: '2026-13' })
        .expect(400);

      expect(response.body).toBeDefined();
    });

    it('projectIdが未指定の場合400を返す', async () => {
      // projectIdなしのパスでテスト
      const appNoParam = express();
      appNoParam.use(express.json());
      appNoParam.use('/api/execution-budget', costMonthlyCloseRoutes);

      const response = await request(appNoParam)
        .post('/api/execution-budget/monthly-close')
        .send(validCloseBody)
        .expect(400);

      expect(response.body.status).toBe(400);
    });
  });

  // ==========================================
  // GET /monthly-close - 月次締め履歴一覧
  // ==========================================
  describe('GET /api/projects/:projectId/execution-budget/monthly-close', () => {
    const monthlyCloseUrl = `/api/projects/${projectId}/execution-budget/monthly-close`;

    it('正常に月次締め履歴一覧を取得し200を返す', async () => {
      mockGetHistory.mockResolvedValue(mockHistoryList);

      const response = await request(app).get(monthlyCloseUrl).expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].targetMonth).toBe('2026-03');
      expect(response.body[1].targetMonth).toBe('2026-02');
      expect(mockGetHistory).toHaveBeenCalledWith(budgetId);
    });

    it('実行予算が存在しない場合404を返す', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      const response = await request(app).get(monthlyCloseUrl).expect(404);

      expect(response.body.status).toBe(404);
    });

    it('サービス層で実行予算が見つからない場合404を返す', async () => {
      mockGetHistory.mockRejectedValue(new ExecutionBudgetNotFoundError());

      const response = await request(app).get(monthlyCloseUrl).expect(404);

      expect(response.body.status).toBe(404);
      expect(response.body.code).toBe('EXECUTION_BUDGET_NOT_FOUND');
    });

    it('空の一覧を正常に返す', async () => {
      mockGetHistory.mockResolvedValue([]);

      const response = await request(app).get(monthlyCloseUrl).expect(200);

      expect(response.body).toEqual([]);
    });

    it('projectIdが未指定の場合400を返す', async () => {
      const appNoParam = express();
      appNoParam.use(express.json());
      appNoParam.use('/api/execution-budget', costMonthlyCloseRoutes);

      const response = await request(appNoParam)
        .get('/api/execution-budget/monthly-close')
        .expect(400);

      expect(response.body.status).toBe(400);
    });
  });
});
