/**
 * @fileoverview 受領見積書ルートのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.2: 受領見積書登録フォーム
 * - 11.9, 11.12, 11.13: 一覧取得
 * - 11.14: ファイルプレビュー
 * - 11.15, 11.16, 11.17: 編集・削除
 *
 * Task 13.2: 受領見積書エンドポイントの実装
 *
 * @module __tests__/unit/routes/received-quotation.routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

// Use vi.hoisted to create mock functions that are hoisted along with vi.mock
const {
  mockCreate,
  mockFindById,
  mockFindByEstimateRequestId,
  mockUpdate,
  mockDelete,
  mockGetFilePreviewUrl,
  mockRequirePermission,
  mockState,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByEstimateRequestId: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockGetFilePreviewUrl: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockState: { shouldRejectPermission: false },
}));

// Mock dependencies before importing the routes
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    $transaction: vi.fn(),
    receivedQuotation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    estimateRequest: {
      findUnique: vi.fn(),
    },
  })),
}));

vi.mock('../../../services/received-quotation.service.js', () => ({
  ReceivedQuotationService: class {
    create = mockCreate;
    findById = mockFindById;
    findByEstimateRequestId = mockFindByEstimateRequestId;
    update = mockUpdate;
    delete = mockDelete;
    getFilePreviewUrl = mockGetFilePreviewUrl;
  },
}));

vi.mock('../../../storage/storage-factory.js', () => ({
  getStorageProvider: vi.fn(() => ({
    upload: vi.fn(),
    delete: vi.fn(),
    getSignedUrl: vi.fn(),
  })),
}));

// Mock authenticate middleware
vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    req.user = {
      userId: 'test-user-id',
      email: 'test@example.com',
      roles: ['user'],
    };
    next();
  },
}));

// Mock authorize middleware (controlled by mockState.shouldRejectPermission)
vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: (permission: string) => {
    return (_req: Request, res: Response, next: NextFunction): void => {
      mockRequirePermission(permission);
      if (mockState.shouldRejectPermission) {
        res.status(403).json({
          type: '/problem/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Permission denied',
          code: 'FORBIDDEN',
        });
        return;
      }
      next();
    };
  },
}));

// Import after mocking
import receivedQuotationRoutes from '../../../routes/received-quotation.routes.js';
import {
  ReceivedQuotationNotFoundError,
  ReceivedQuotationConflictError,
  InvalidContentTypeError,
} from '../../../errors/receivedQuotationError.js';
import { EstimateRequestNotFoundError } from '../../../errors/estimateRequestError.js';
import { ValidationError } from '../../../errors/apiError.js';

describe('received-quotation.routes', () => {
  let app: express.Express;

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const estimateRequestId = '550e8400-e29b-41d4-a716-446655440001';

  const mockQuotation = {
    id: validUUID,
    estimateRequestId,
    name: 'テスト受領見積書',
    submittedAt: new Date('2024-01-15T00:00:00Z'),
    contentType: 'TEXT' as const,
    textContent: 'テスト内容',
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // 見積依頼配下の受領見積書ルート
    app.use('/api/estimate-requests/:id/quotations', receivedQuotationRoutes);
    // 単体リソースルート
    app.use('/api/quotations', receivedQuotationRoutes);

    // エラーハンドラー
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof ValidationError) {
        res.status(400).json({
          type: 'https://api.architrack.com/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: err.message,
          code: 'VALIDATION_ERROR',
          errors: err.details,
        });
        return;
      }
      console.error('Test error:', err);
      res.status(500).json({ error: err.message });
    });

    mockState.shouldRejectPermission = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/estimate-requests/:id/quotations', () => {
    const validCreateInput = {
      name: 'テスト受領見積書',
      submittedAt: '2024-01-15T00:00:00.000Z',
      contentType: 'TEXT',
      textContent: 'テスト内容',
    };

    it('should create received quotation and return 201', async () => {
      mockCreate.mockResolvedValue(mockQuotation);

      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .send(validCreateInput);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: validUUID,
          name: 'テスト受領見積書',
        })
      );
    });

    it('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    it('should return 404 when estimate request not found', async () => {
      mockCreate.mockRejectedValue(new EstimateRequestNotFoundError(estimateRequestId));

      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .send(validCreateInput);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
    });

    it('should return 422 for invalid content type integrity', async () => {
      mockCreate.mockRejectedValue(new InvalidContentTypeError('TEXT'));

      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .send(validCreateInput);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('should require estimate_request:update permission', async () => {
      // 受領見積書の追加は見積依頼の更新権限を使用（受領見積書は見積依頼の子リソース）
      mockCreate.mockResolvedValue(mockQuotation);

      await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .send(validCreateInput);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:update');
    });

    it('should return 403 when user lacks permission', async () => {
      mockState.shouldRejectPermission = true;

      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .send(validCreateInput);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/estimate-requests/:id/quotations', () => {
    it('should return list of received quotations', async () => {
      mockFindByEstimateRequestId.mockResolvedValue([mockQuotation]);

      const response = await request(app).get(
        `/api/estimate-requests/${estimateRequestId}/quotations`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toEqual(
        expect.objectContaining({
          id: validUUID,
          name: 'テスト受領見積書',
        })
      );
    });

    it('should return empty list when no quotations exist', async () => {
      mockFindByEstimateRequestId.mockResolvedValue([]);

      const response = await request(app).get(
        `/api/estimate-requests/${estimateRequestId}/quotations`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should require estimate_request:read permission', async () => {
      // 見積依頼詳細画面で受領見積書一覧を表示するため、estimate_request:read権限でアクセス可能
      mockFindByEstimateRequestId.mockResolvedValue([]);

      await request(app).get(`/api/estimate-requests/${estimateRequestId}/quotations`);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:read');
    });
  });

  describe('GET /api/quotations/:id', () => {
    it('should return quotation detail', async () => {
      mockFindById.mockResolvedValue(mockQuotation);

      const response = await request(app).get(`/api/quotations/${validUUID}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: validUUID,
          name: 'テスト受領見積書',
        })
      );
    });

    it('should return 404 when quotation not found', async () => {
      mockFindById.mockResolvedValue(null);

      const response = await request(app).get(`/api/quotations/${validUUID}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_NOT_FOUND');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app).get('/api/quotations/invalid-uuid');

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/quotations/:id', () => {
    const validUpdateInput = {
      name: '更新後の見積書名',
      expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should update quotation and return 200', async () => {
      const updatedQuotation = { ...mockQuotation, name: validUpdateInput.name };
      mockUpdate.mockResolvedValue(updatedQuotation);

      const response = await request(app)
        .put(`/api/quotations/${validUUID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('更新後の見積書名');
    });

    it('should return 404 when quotation not found', async () => {
      mockUpdate.mockRejectedValue(new ReceivedQuotationNotFoundError(validUUID));

      const response = await request(app)
        .put(`/api/quotations/${validUUID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_NOT_FOUND');
    });

    it('should return 409 for optimistic lock conflict', async () => {
      mockUpdate.mockRejectedValue(
        new ReceivedQuotationConflictError({
          expectedUpdatedAt: validUpdateInput.expectedUpdatedAt,
          actualUpdatedAt: '2024-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .put(`/api/quotations/${validUUID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_CONFLICT');
    });

    it('should require estimate_request:update permission', async () => {
      // 受領見積書の更新は見積依頼の更新権限を使用（受領見積書は見積依頼の子リソース）
      mockUpdate.mockResolvedValue(mockQuotation);

      await request(app).put(`/api/quotations/${validUUID}`).send(validUpdateInput);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:update');
    });
  });

  describe('DELETE /api/quotations/:id', () => {
    it('should delete quotation and return 204', async () => {
      mockDelete.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/quotations/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(response.status).toBe(204);
    });

    it('should return 404 when quotation not found', async () => {
      mockDelete.mockRejectedValue(new ReceivedQuotationNotFoundError(validUUID));

      const response = await request(app)
        .delete(`/api/quotations/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_NOT_FOUND');
    });

    it('should return 409 for optimistic lock conflict', async () => {
      mockDelete.mockRejectedValue(
        new ReceivedQuotationConflictError({
          expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
          actualUpdatedAt: '2024-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .delete(`/api/quotations/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_CONFLICT');
    });

    it('should require estimate_request:update permission', async () => {
      // 受領見積書の削除は見積依頼の更新権限を使用（受領見積書は見積依頼の子リソース）
      mockDelete.mockResolvedValue(undefined);

      await request(app)
        .delete(`/api/quotations/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:update');
    });
  });

  /**
   * Task 21.3: 受領見積書APIエンドポイントの明細行対応改修テスト
   *
   * Requirements:
   * - 11.9: 構造化データ入力エリア
   * - 11.22: ファイルまたは明細行データのいずれかが必須
   * - 11.25: レスポンスに明細行データを含める
   * - 11.26: レスポンスに合計金額を含める
   * - 11.27: 一覧レスポンスに明細行データを含める
   * - 14.2: 明細行データをDBに永続化
   */
  describe('POST /api/estimate-requests/:id/quotations - 明細行対応（Task 21.3）', () => {
    it('lineItemsフィールド（JSON文字列）を含むmultipartリクエストで受領見積書を作成する', async () => {
      const lineItems = [
        { name: '工事A', sortOrder: 0, quantity: 1, unitPrice: 50000, amount: 50000 },
        { name: '工事B', sortOrder: 1, quantity: 10, unitPrice: 1000, amount: 10000 },
      ];

      const mockResult = {
        id: validUUID,
        estimateRequestId,
        name: '明細行付き見積書',
        submittedAt: new Date('2024-01-15T00:00:00Z'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: lineItems.map((item, i) => ({
          id: `li-00${i}`,
          receivedQuotationId: validUUID,
          ...item,
          specification: null,
          unit: null,
          remarks: null,
        })),
        totalAmount: 60000,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      mockCreate.mockResolvedValue(mockResult);

      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .field('name', '明細行付き見積書')
        .field('submittedAt', '2024-01-15T00:00:00.000Z')
        .field('lineItems', JSON.stringify(lineItems));

      expect(response.status).toBe(201);
      expect(response.body.lineItems).toHaveLength(2);
      expect(response.body.totalAmount).toBe(60000);
      // サービスにlineItemsが渡されていることを検証
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          lineItems: expect.arrayContaining([
            expect.objectContaining({ name: '工事A', sortOrder: 0 }),
          ]),
        })
      );
    });

    it('lineItemsが不正なJSONの場合に400エラーを返す', async () => {
      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .field('name', 'テスト見積書')
        .field('submittedAt', '2024-01-15T00:00:00.000Z')
        .field('lineItems', 'invalid-json');

      expect(response.status).toBe(400);
    });

    it('ファイルも明細行もない場合にサービスからのエラーを返す', async () => {
      mockCreate.mockRejectedValue(
        new Error('ファイルのアップロードまたは明細行データの入力が必要です')
      );

      const response = await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .field('name', 'テスト見積書')
        .field('submittedAt', '2024-01-15T00:00:00.000Z');

      // サービスからのエラーがnextに渡され、エラーハンドラーで500を返す
      expect(response.status).toBe(500);
    });
  });

  describe('PUT /api/quotations/:id - 明細行全量置換対応（Task 21.3）', () => {
    it('lineItemsフィールドを含むmultipartリクエストで明細行を全量置換する', async () => {
      const newLineItems = [
        { name: '新工事A', sortOrder: 0, quantity: 2, unitPrice: 30000, amount: 60000 },
      ];

      const mockResult = {
        id: validUUID,
        estimateRequestId,
        name: 'テスト受領見積書',
        submittedAt: new Date('2024-01-15T00:00:00Z'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: newLineItems.map((item, i) => ({
          id: `li-new-00${i}`,
          receivedQuotationId: validUUID,
          ...item,
          specification: null,
          unit: null,
          remarks: null,
        })),
        totalAmount: 60000,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      };

      mockUpdate.mockResolvedValue(mockResult);

      const response = await request(app)
        .put(`/api/quotations/${validUUID}`)
        .field('expectedUpdatedAt', '2024-01-01T00:00:00.000Z')
        .field('lineItems', JSON.stringify(newLineItems));

      expect(response.status).toBe(200);
      expect(response.body.lineItems).toHaveLength(1);
      expect(response.body.totalAmount).toBe(60000);
      // サービスにlineItemsが渡されていることを検証
      expect(mockUpdate).toHaveBeenCalledWith(
        validUUID,
        expect.objectContaining({
          lineItems: expect.arrayContaining([expect.objectContaining({ name: '新工事A' })]),
        }),
        expect.any(Date)
      );
    });
  });

  describe('GET /api/quotations/:id - 明細行レスポンス（Task 21.3）', () => {
    it('レスポンスに明細行データとtotalAmountを含める', async () => {
      const mockQuotationWithLineItems = {
        id: validUUID,
        estimateRequestId,
        name: 'テスト受領見積書',
        submittedAt: new Date('2024-01-15T00:00:00Z'),
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        lineItems: [
          {
            id: 'li-001',
            receivedQuotationId: validUUID,
            sortOrder: 0,
            name: '工事A',
            specification: null,
            unit: '式',
            quantity: 1,
            unitPrice: 100000,
            amount: 100000,
            remarks: null,
          },
        ],
        totalAmount: 100000,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      mockFindById.mockResolvedValue(mockQuotationWithLineItems);

      const response = await request(app).get(`/api/quotations/${validUUID}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('lineItems');
      expect(response.body.lineItems).toHaveLength(1);
      expect(response.body.lineItems[0].name).toBe('工事A');
      expect(response.body).toHaveProperty('totalAmount', 100000);
    });
  });

  describe('GET /api/estimate-requests/:id/quotations - 一覧の明細行レスポンス（Task 21.3）', () => {
    it('一覧レスポンスに明細行データとtotalAmountを含める', async () => {
      const mockQuotationsWithLineItems = [
        {
          id: validUUID,
          estimateRequestId,
          name: '受領見積書1',
          submittedAt: new Date('2024-01-15T00:00:00Z'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          lineItems: [
            {
              id: 'li-001',
              receivedQuotationId: validUUID,
              sortOrder: 0,
              name: '工事A',
              specification: null,
              unit: null,
              quantity: 5,
              unitPrice: 20000,
              amount: 100000,
              remarks: null,
            },
          ],
          totalAmount: 100000,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      mockFindByEstimateRequestId.mockResolvedValue(mockQuotationsWithLineItems);

      const response = await request(app).get(
        `/api/estimate-requests/${estimateRequestId}/quotations`
      );

      expect(response.status).toBe(200);
      expect(response.body[0]).toHaveProperty('lineItems');
      expect(response.body[0].lineItems).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('totalAmount', 100000);
    });
  });

  describe('GET /api/quotations/:id/preview', () => {
    it('should return signed URL for file preview', async () => {
      const signedUrl = 'https://example.com/signed-url';
      mockGetFilePreviewUrl.mockResolvedValue(signedUrl);

      const response = await request(app).get(`/api/quotations/${validUUID}/preview`);

      expect(response.status).toBe(200);
      expect(response.body.url).toBe(signedUrl);
    });

    it('should return 404 when quotation not found', async () => {
      mockGetFilePreviewUrl.mockRejectedValue(new ReceivedQuotationNotFoundError(validUUID));

      const response = await request(app).get(`/api/quotations/${validUUID}/preview`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RECEIVED_QUOTATION_NOT_FOUND');
    });

    it('should return 422 when quotation has no file', async () => {
      mockGetFilePreviewUrl.mockRejectedValue(
        new InvalidContentTypeError(
          'FILE',
          'この受領見積書にはプレビュー可能なファイルがありません'
        )
      );

      const response = await request(app).get(`/api/quotations/${validUUID}/preview`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('should require estimate_request:read permission', async () => {
      // 受領見積書の閲覧は見積依頼の閲覧権限を使用（受領見積書は見積依頼の子リソース）
      mockGetFilePreviewUrl.mockResolvedValue('https://example.com/signed-url');

      await request(app).get(`/api/quotations/${validUUID}/preview`);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:read');
    });
  });
});
