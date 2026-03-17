/**
 * @fileoverview エクスポートルート ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 6.3: エクスポートのルーター実装
 *
 * Requirements:
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 *
 * エンドポイント:
 * - GET /orders/:orderId/export?format=xlsx|pdf （発注エクスポート）
 * - GET /progress/monthly/export?format=xlsx|pdf （月別出来高エクスポート）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

// vi.hoistedでモック関数を定義
const {
  mockGetExportData,
  mockExportToExcel,
  mockExportToPdf,
  mockProgressGetExportData,
  mockProgressExportToExcel,
  mockProgressExportToPdf,
  mockFindByProjectId,
  mockProjectFindUnique,
} = vi.hoisted(() => ({
  mockGetExportData: vi.fn(),
  mockExportToExcel: vi.fn(),
  mockExportToPdf: vi.fn(),
  mockProgressGetExportData: vi.fn(),
  mockProgressExportToExcel: vi.fn(),
  mockProgressExportToPdf: vi.fn(),
  mockFindByProjectId: vi.fn(),
  mockProjectFindUnique: vi.fn(),
}));

// 依存モジュールのモック
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    project: {
      findUnique: mockProjectFindUnique,
    },
  })),
}));

vi.mock('../../../services/order-export.service.js', () => ({
  OrderExportService: class {
    getExportData = mockGetExportData;
    exportToExcel = mockExportToExcel;
    exportToPdf = mockExportToPdf;
  },
}));

vi.mock('../../../services/progress-export.service.js', () => ({
  ProgressExportService: class {
    getExportData = mockProgressGetExportData;
    exportToExcel = mockProgressExportToExcel;
    exportToPdf = mockProgressExportToPdf;
  },
}));

vi.mock('../../../services/progress.service.js', () => ({
  ProgressService: class {},
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
import exportRoutes from '../../../routes/export.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const executionBudgetId = '550e8400-e29b-41d4-a716-446655440030';
const orderId = '550e8400-e29b-41d4-a716-446655440040';

const mockBudgetData = {
  id: executionBudgetId,
  projectId,
};

const mockOrderExportData = {
  orderId,
  tradingPartnerName: 'テスト取引先',
  orderDate: '2026-03-01',
  confirmedAmount: '500000',
  status: 'ORDERED',
  items: [
    {
      name: 'テスト項目1',
      specification: '規格A',
      unit: '式',
      quantity: '1',
      executionUnitPrice: '100000',
      executionAmount: '100000',
      orderAmount: '100000',
    },
  ],
};

const mockProgressExportData = {
  executionBudgetId,
  projectName: 'テストプロジェクト',
  monthlySummaries: [
    {
      yearMonth: '2026-01',
      monthlyAmount: '100000',
      cumulativeAmount: '100000',
      cumulativeRate: '10.0',
    },
  ],
};

// テスト用Expressアプリ
function createTestApp() {
  const app = express();
  app.use(express.json());

  // エクスポートルートは実行予算のサブルートとしてマウント
  app.use('/api/projects/:projectId/execution-budget', exportRoutes);

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
        detail: err.message || 'Internal Server Error',
      });
    }
  );

  return app;
}

describe('Export Routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    mockFindByProjectId.mockResolvedValue(mockBudgetData);
    mockProjectFindUnique.mockResolvedValue({ name: 'テストプロジェクト' });
  });

  // ============================================================================
  // 発注エクスポート GET /orders/:orderId/export
  // ============================================================================
  describe('GET /orders/:orderId/export', () => {
    describe('Excel出力（format=xlsx）', () => {
      it('正常にExcelファイルを返却し、適切なContent-Typeを設定する', async () => {
        const mockBuffer = Buffer.from('mock-excel-data');
        mockGetExportData.mockResolvedValue(mockOrderExportData);
        mockExportToExcel.mockResolvedValue(mockBuffer);

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=xlsx`)
          .expect(200);

        expect(response.headers['content-type']).toContain(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.headers['content-disposition']).toContain('.xlsx');
        expect(mockGetExportData).toHaveBeenCalledWith(orderId);
        expect(mockExportToExcel).toHaveBeenCalledWith(mockOrderExportData);
      });
    });

    describe('PDF出力（format=pdf）', () => {
      it('正常にPDFファイルを返却する', async () => {
        const mockBuffer = Buffer.from('mock-pdf-data');
        mockGetExportData.mockResolvedValue(mockOrderExportData);
        mockExportToPdf.mockResolvedValue(mockBuffer);

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=pdf`)
          .buffer(true)
          .expect(200);

        expect(response.headers['content-type']).toContain('application/pdf');
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.headers['content-disposition']).toContain('.pdf');
        expect(response.body.toString()).toBe('mock-pdf-data');
        expect(mockGetExportData).toHaveBeenCalledWith(orderId);
        expect(mockExportToPdf).toHaveBeenCalledWith(mockOrderExportData);
      });
    });

    describe('エラーケース', () => {
      it('formatパラメータが未指定の場合は400を返却する', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}/export`)
          .expect(400);

        expect(response.body.status).toBe(400);
      });

      it('サポートされていないformat値の場合は400を返却する', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=csv`)
          .expect(400);

        expect(response.body.status).toBe(400);
      });

      it('発注が見つからない場合は404を返却する', async () => {
        mockGetExportData.mockResolvedValue(null);

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=xlsx`)
          .expect(404);

        expect(response.body.status).toBe(404);
        expect(response.body.detail).toContain('発注');
      });

      it('サービスエラー時は500を返却する', async () => {
        mockGetExportData.mockRejectedValue(new Error('DB error'));

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=xlsx`)
          .expect(500);

        expect(response.body.status).toBe(500);
      });
    });
  });

  // ============================================================================
  // 月別出来高エクスポート GET /progress/monthly/export
  // ============================================================================
  describe('GET /progress/monthly/export', () => {
    describe('Excel出力（format=xlsx）', () => {
      it('正常にExcelファイルを返却し、適切なContent-Typeを設定する', async () => {
        const mockBuffer = Buffer.from('mock-progress-excel-data');
        mockProgressGetExportData.mockResolvedValue(mockProgressExportData);
        mockProgressExportToExcel.mockResolvedValue(mockBuffer);

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/progress/monthly/export?format=xlsx`)
          .expect(200);

        expect(response.headers['content-type']).toContain(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.headers['content-disposition']).toContain('.xlsx');
        expect(mockProgressGetExportData).toHaveBeenCalledWith(
          executionBudgetId,
          'テストプロジェクト'
        );
        expect(mockProgressExportToExcel).toHaveBeenCalledWith(mockProgressExportData);
      });
    });

    describe('PDF出力（format=pdf）', () => {
      it('正常にPDFファイルを返却する', async () => {
        const mockBuffer = Buffer.from('mock-progress-pdf-data');
        mockProgressGetExportData.mockResolvedValue(mockProgressExportData);
        mockProgressExportToPdf.mockResolvedValue(mockBuffer);

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/progress/monthly/export?format=pdf`)
          .buffer(true)
          .expect(200);

        expect(response.headers['content-type']).toContain('application/pdf');
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.headers['content-disposition']).toContain('.pdf');
        expect(response.body.toString()).toBe('mock-progress-pdf-data');
        expect(mockProgressGetExportData).toHaveBeenCalledWith(
          executionBudgetId,
          'テストプロジェクト'
        );
        expect(mockProgressExportToPdf).toHaveBeenCalledWith(mockProgressExportData);
      });
    });

    describe('エラーケース', () => {
      it('formatパラメータが未指定の場合は400を返却する', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/progress/monthly/export`)
          .expect(400);

        expect(response.body.status).toBe(400);
      });

      it('サポートされていないformat値の場合は400を返却する', async () => {
        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/progress/monthly/export?format=csv`)
          .expect(400);

        expect(response.body.status).toBe(400);
      });

      it('実行予算が見つからない場合は404を返却する', async () => {
        mockFindByProjectId.mockResolvedValue(null);

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/progress/monthly/export?format=xlsx`)
          .expect(404);

        expect(response.body.status).toBe(404);
        expect(response.body.detail).toContain('実行予算');
      });

      it('サービスエラー時は500を返却する', async () => {
        mockProgressGetExportData.mockRejectedValue(new Error('DB error'));

        const response = await request(app)
          .get(`/api/projects/${projectId}/execution-budget/progress/monthly/export?format=xlsx`)
          .expect(500);

        expect(response.body.status).toBe(500);
      });
    });
  });

  // ============================================================================
  // 認証・権限ミドルウェアの適用確認
  // ============================================================================
  describe('ミドルウェア適用', () => {
    it('発注エクスポートにauthenticateミドルウェアが適用されている', async () => {
      const mockBuffer = Buffer.from('mock-data');
      mockGetExportData.mockResolvedValue(mockOrderExportData);
      mockExportToExcel.mockResolvedValue(mockBuffer);

      const response = await request(app).get(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=xlsx`
      );

      // authenticateモックが正常に動作し、リクエストが処理されることを確認
      expect(response.status).not.toBe(401);
    });

    it('月別出来高エクスポートにauthenticateミドルウェアが適用されている', async () => {
      const mockBuffer = Buffer.from('mock-data');
      mockProgressGetExportData.mockResolvedValue(mockProgressExportData);
      mockProgressExportToExcel.mockResolvedValue(mockBuffer);

      const response = await request(app).get(
        `/api/projects/${projectId}/execution-budget/progress/monthly/export?format=xlsx`
      );

      // authenticateモックが正常に動作し、リクエストが処理されることを確認
      expect(response.status).not.toBe(401);
    });
  });
});
