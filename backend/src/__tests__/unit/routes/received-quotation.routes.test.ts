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

    it('should require received_quotation:create permission', async () => {
      mockCreate.mockResolvedValue(mockQuotation);

      await request(app)
        .post(`/api/estimate-requests/${estimateRequestId}/quotations`)
        .send(validCreateInput);

      expect(mockRequirePermission).toHaveBeenCalledWith('received_quotation:create');
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

    it('should require received_quotation:update permission', async () => {
      mockUpdate.mockResolvedValue(mockQuotation);

      await request(app).put(`/api/quotations/${validUUID}`).send(validUpdateInput);

      expect(mockRequirePermission).toHaveBeenCalledWith('received_quotation:update');
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

    it('should require received_quotation:delete permission', async () => {
      mockDelete.mockResolvedValue(undefined);

      await request(app)
        .delete(`/api/quotations/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(mockRequirePermission).toHaveBeenCalledWith('received_quotation:delete');
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

    it('should require received_quotation:read permission', async () => {
      mockGetFilePreviewUrl.mockResolvedValue('https://example.com/signed-url');

      await request(app).get(`/api/quotations/${validUUID}/preview`);

      expect(mockRequirePermission).toHaveBeenCalledWith('received_quotation:read');
    });
  });
});
