/**
 * @fileoverview 出来高ルート ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 4.3: 出来高のルーター実装
 *
 * Requirements:
 * - 17.4: 出来高の入力・編集・削除をEDITOR以上のロールに許可する
 * - 19.4: 出来高データのCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ProgressRecordNotFoundError,
  ExecutionBudgetNotFoundForProgressError,
  ProgressAmountNegativeError,
} from '../../../errors/progressError.js';

// vi.hoistedでモック関数を定義
const {
  mockSave,
  mockFindByExecutionBudgetId,
  mockGetByDate,
  mockDeleteProgress,
  mockGetMonthlyAggregation,
  mockGetMonthlyDetail,
  mockFindByProjectId,
} = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockFindByExecutionBudgetId: vi.fn(),
  mockGetByDate: vi.fn(),
  mockDeleteProgress: vi.fn(),
  mockGetMonthlyAggregation: vi.fn(),
  mockGetMonthlyDetail: vi.fn(),
  mockFindByProjectId: vi.fn(),
}));

// 依存モジュールのモック
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/progress.service.js', () => ({
  ProgressService: class {
    save = mockSave;
    findByExecutionBudgetId = mockFindByExecutionBudgetId;
    getByDate = mockGetByDate;
    delete = mockDeleteProgress;
    getMonthlyAggregation = mockGetMonthlyAggregation;
    getMonthlyDetail = mockGetMonthlyDetail;
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
import progressRoutes from '../../../routes/progress.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const executionBudgetId = '550e8400-e29b-41d4-a716-446655440030';
const progressRecordId = '550e8400-e29b-41d4-a716-446655440080';
const itemId1 = '550e8400-e29b-41d4-a716-446655440090';

const mockBudgetData = {
  id: executionBudgetId,
  projectId,
};

const mockProgressRecordResult = {
  id: progressRecordId,
  executionBudgetId,
  constructionDate: '2026-03-15T00:00:00.000Z',
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  items: [
    {
      id: '550e8400-e29b-41d4-a716-446655440091',
      progressRecordId,
      executionBudgetItemId: itemId1,
      amount: '50000',
      progressRate: '50.0',
    },
  ],
  totalAmount: '50000',
  totalRate: '50.0',
};

const mockProgressSummaryList = [
  {
    id: progressRecordId,
    executionBudgetId,
    constructionDate: '2026-03-15T00:00:00.000Z',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    itemCount: 1,
  },
];

const mockMonthlySummaryList = [
  {
    yearMonth: '2026-03',
    monthlyAmount: '50000',
    cumulativeAmount: '50000',
    cumulativeRate: '50.0',
  },
];

const mockMonthlyDetailList = [
  {
    id: progressRecordId,
    executionBudgetId,
    constructionDate: '2026-03-15T00:00:00.000Z',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    items: [
      {
        id: '550e8400-e29b-41d4-a716-446655440091',
        progressRecordId,
        executionBudgetItemId: itemId1,
        amount: '50000',
        progressRate: '50.0',
      },
    ],
    totalAmount: '50000',
    totalRate: '50.0',
  },
];

// テスト用Expressアプリ
function createTestApp() {
  const app = express();
  app.use(express.json());

  // 出来高ルートは実行予算のサブルートとしてマウント
  app.use('/api/projects/:projectId/execution-budget/progress', progressRoutes);

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

describe('出来高ルート', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // デフォルトで実行予算が存在する前提
    mockFindByProjectId.mockResolvedValue(mockBudgetData);
  });

  // =================================================================
  // POST /api/projects/:projectId/execution-budget/progress - 出来高保存
  // Requirements: 17.4, 19.4, 19.9
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget/progress', () => {
    const validPayload = {
      constructionDate: '2026-03-15',
      items: [{ itemId: itemId1, amount: '50000' }],
    };

    it('出来高を保存できること（201 Created）', async () => {
      mockSave.mockResolvedValue(mockProgressRecordResult);

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget/progress`)
        .send(validPayload)
        .expect(201);

      expect(res.body.id).toBe(progressRecordId);
      expect(res.body.totalAmount).toBe('50000');
      expect(res.body.totalRate).toBe('50.0');
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId);
      expect(mockSave).toHaveBeenCalledWith(executionBudgetId, validPayload);
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget/progress`)
        .send(validPayload)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.detail).toBe('実行予算が見つかりません');
    });

    it('サービスがExecutionBudgetNotFoundForProgressErrorを投げた場合404エラーが返ること', async () => {
      mockSave.mockRejectedValue(new ExecutionBudgetNotFoundForProgressError());

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget/progress`)
        .send(validPayload)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.code).toBe('EXECUTION_BUDGET_NOT_FOUND_FOR_PROGRESS');
    });

    it('サービスがProgressAmountNegativeErrorを投げた場合400エラーが返ること', async () => {
      mockSave.mockRejectedValue(new ProgressAmountNegativeError());

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget/progress`)
        .send(validPayload)
        .expect(400);

      expect(res.body.status).toBe(400);
      expect(res.body.code).toBe('PROGRESS_AMOUNT_NEGATIVE');
    });

    it('バリデーションエラー：施工日が未指定の場合400エラーが返ること', async () => {
      const invalidPayload = {
        items: [{ itemId: itemId1, amount: '50000' }],
      };

      await request(app)
        .post(`/api/projects/${projectId}/execution-budget/progress`)
        .send(invalidPayload)
        .expect(400);
    });

    it('バリデーションエラー：項目が空配列の場合400エラーが返ること', async () => {
      const invalidPayload = {
        constructionDate: '2026-03-15',
        items: [],
      };

      await request(app)
        .post(`/api/projects/${projectId}/execution-budget/progress`)
        .send(invalidPayload)
        .expect(400);
    });

    it('バリデーションエラー：金額が負の値の場合400エラーが返ること', async () => {
      const invalidPayload = {
        constructionDate: '2026-03-15',
        items: [{ itemId: itemId1, amount: '-100' }],
      };

      await request(app)
        .post(`/api/projects/${projectId}/execution-budget/progress`)
        .send(invalidPayload)
        .expect(400);
    });

    it('projectIdが未指定の場合400エラーが返ること', async () => {
      const appWithoutParam = express();
      appWithoutParam.use(express.json());
      appWithoutParam.use('/api/progress', progressRoutes);

      await request(appWithoutParam).post('/api/progress').send(validPayload).expect(400);
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/progress - 出来高履歴一覧
  // Requirements: 17.4, 19.4, 19.9
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/progress', () => {
    it('出来高履歴一覧を取得できること（200 OK）', async () => {
      mockFindByExecutionBudgetId.mockResolvedValue(mockProgressSummaryList);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(progressRecordId);
      expect(res.body[0].itemCount).toBe(1);
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId);
      expect(mockFindByExecutionBudgetId).toHaveBeenCalledWith(executionBudgetId);
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.detail).toBe('実行予算が見つかりません');
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/progress/:date - 施工日指定取得
  // Requirements: 17.4, 19.4, 19.9
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/progress/:date', () => {
    it('施工日指定で出来高レコードを取得できること（200 OK）', async () => {
      mockGetByDate.mockResolvedValue(mockProgressRecordResult);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/2026-03-15`)
        .expect(200);

      expect(res.body.id).toBe(progressRecordId);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.totalAmount).toBe('50000');
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId);
      expect(mockGetByDate).toHaveBeenCalledWith(executionBudgetId, expect.any(Date));
    });

    it('出来高レコードが存在しない場合404エラーが返ること', async () => {
      mockGetByDate.mockRejectedValue(new ProgressRecordNotFoundError());

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/2026-03-15`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.code).toBe('PROGRESS_RECORD_NOT_FOUND');
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/2026-03-15`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.detail).toBe('実行予算が見つかりません');
    });
  });

  // =================================================================
  // DELETE /api/projects/:projectId/execution-budget/progress/:progressRecordId - 出来高削除
  // Requirements: 17.4, 19.4, 19.9
  // =================================================================
  describe('DELETE /api/projects/:projectId/execution-budget/progress/:progressRecordId', () => {
    it('出来高レコードを削除できること（204 No Content）', async () => {
      mockDeleteProgress.mockResolvedValue(undefined);

      await request(app)
        .delete(`/api/projects/${projectId}/execution-budget/progress/${progressRecordId}`)
        .expect(204);

      expect(mockDeleteProgress).toHaveBeenCalledWith(progressRecordId);
    });

    it('出来高レコードが存在しない場合404エラーが返ること', async () => {
      mockDeleteProgress.mockRejectedValue(new ProgressRecordNotFoundError());

      const res = await request(app)
        .delete(`/api/projects/${projectId}/execution-budget/progress/${progressRecordId}`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.code).toBe('PROGRESS_RECORD_NOT_FOUND');
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/progress/monthly - 月別集計
  // Requirements: 17.4, 19.4, 19.9
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/progress/monthly', () => {
    it('月別出来高集計を取得できること（200 OK）', async () => {
      mockGetMonthlyAggregation.mockResolvedValue(mockMonthlySummaryList);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/monthly`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].yearMonth).toBe('2026-03');
      expect(res.body[0].monthlyAmount).toBe('50000');
      expect(res.body[0].cumulativeAmount).toBe('50000');
      expect(res.body[0].cumulativeRate).toBe('50.0');
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId);
      expect(mockGetMonthlyAggregation).toHaveBeenCalledWith(executionBudgetId);
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/monthly`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.detail).toBe('実行予算が見つかりません');
    });

    it('サービスがExecutionBudgetNotFoundForProgressErrorを投げた場合404エラーが返ること', async () => {
      mockGetMonthlyAggregation.mockRejectedValue(new ExecutionBudgetNotFoundForProgressError());

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/monthly`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.code).toBe('EXECUTION_BUDGET_NOT_FOUND_FOR_PROGRESS');
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/progress/monthly/:yearMonth - 月別明細
  // Requirements: 17.4, 19.4, 19.9
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/progress/monthly/:yearMonth', () => {
    it('月別出来高明細を取得できること（200 OK）', async () => {
      mockGetMonthlyDetail.mockResolvedValue(mockMonthlyDetailList);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/monthly/2026-03`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(progressRecordId);
      expect(res.body[0].items).toHaveLength(1);
      expect(res.body[0].totalAmount).toBe('50000');
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId);
      expect(mockGetMonthlyDetail).toHaveBeenCalledWith(executionBudgetId, '2026-03');
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/monthly/2026-03`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.detail).toBe('実行予算が見つかりません');
    });

    it('サービスがExecutionBudgetNotFoundForProgressErrorを投げた場合404エラーが返ること', async () => {
      mockGetMonthlyDetail.mockRejectedValue(new ExecutionBudgetNotFoundForProgressError());

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/progress/monthly/2026-03`)
        .expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.code).toBe('EXECUTION_BUDGET_NOT_FOUND_FOR_PROGRESS');
    });
  });
});
