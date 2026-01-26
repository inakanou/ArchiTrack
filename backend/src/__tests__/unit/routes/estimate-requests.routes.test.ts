/**
 * @fileoverview 見積依頼ルートのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 3.6: 見積依頼を作成し詳細画面に遷移
 * - 8.1: 見積依頼をプロジェクトに紐付けて保存
 * - 9.3: 見積依頼名の表示
 * - 9.5: 削除確認ダイアログ
 * - 9.6: 変更を保存
 * - 10.1: 見積依頼一覧ページ
 * - 10.2: 各行に見積依頼情報を表示
 * - 10.3: 詳細画面への遷移
 * - 10.4: 見積依頼が0件の場合
 *
 * @module __tests__/unit/routes/estimate-requests.routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

// Use vi.hoisted to create mock functions that are hoisted along with vi.mock
const {
  mockCreate,
  mockFindById,
  mockFindByProjectId,
  mockFindLatestByProjectId,
  mockUpdate,
  mockDelete,
  mockUpdateItemSelection,
  mockFindItemsWithOtherRequestStatus,
  mockGenerateText,
  mockCreateLog,
  mockRequirePermission,
  mockState,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByProjectId: vi.fn(),
  mockFindLatestByProjectId: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdateItemSelection: vi.fn(),
  mockFindItemsWithOtherRequestStatus: vi.fn(),
  mockGenerateText: vi.fn(),
  mockCreateLog: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockState: { shouldRejectPermission: false },
}));

// Mock dependencies before importing the routes
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    $transaction: vi.fn(),
    estimateRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  })),
}));

vi.mock('../../../services/estimate-request.service.js', () => ({
  EstimateRequestService: class {
    create = mockCreate;
    findById = mockFindById;
    findByProjectId = mockFindByProjectId;
    findLatestByProjectId = mockFindLatestByProjectId;
    update = mockUpdate;
    delete = mockDelete;
    updateItemSelection = mockUpdateItemSelection;
    findItemsWithOtherRequestStatus = mockFindItemsWithOtherRequestStatus;
  },
}));

vi.mock('../../../services/estimate-request-text.service.js', () => ({
  EstimateRequestTextService: class {
    generateText = mockGenerateText;
    generateEmailText = vi.fn();
    generateFaxText = vi.fn();
  },
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {
    createLog = mockCreateLog;
  },
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
import estimateRequestsRoutes from '../../../routes/estimate-requests.routes.js';
import {
  EstimateRequestNotFoundError,
  EstimateRequestConflictError,
  TradingPartnerNotSubcontractorError,
  EmptyItemizedStatementItemsError,
  NoItemsSelectedError,
  MissingContactInfoError,
} from '../../../errors/estimateRequestError.js';
import { ItemizedStatementNotFoundError } from '../../../errors/itemizedStatementError.js';
import { ValidationError } from '../../../errors/apiError.js';

describe('estimate-requests.routes', () => {
  let app: express.Express;

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const projectId = '550e8400-e29b-41d4-a716-446655440001';
  const tradingPartnerId = '550e8400-e29b-41d4-a716-446655440002';
  const itemizedStatementId = '550e8400-e29b-41d4-a716-446655440003';

  const mockEstimateRequest = {
    id: validUUID,
    projectId,
    tradingPartnerId,
    tradingPartnerName: 'テスト協力業者',
    itemizedStatementId,
    itemizedStatementName: 'テスト内訳書',
    name: 'テスト見積依頼',
    method: 'EMAIL' as const,
    includeBreakdownInBody: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // ネストルート（プロジェクト配下）
    app.use('/api/projects/:projectId/estimate-requests', estimateRequestsRoutes);
    // 単体リソースルート
    app.use('/api/estimate-requests', estimateRequestsRoutes);

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

  describe('POST /api/projects/:projectId/estimate-requests', () => {
    const validCreateInput = {
      name: 'テスト見積依頼',
      tradingPartnerId,
      itemizedStatementId,
    };

    it('should create estimate request and return 201', async () => {
      mockCreate.mockResolvedValue(mockEstimateRequest);

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimate-requests`)
        .send(validCreateInput);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: validUUID,
          name: 'テスト見積依頼',
          tradingPartnerName: 'テスト協力業者',
        })
      );
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: validCreateInput.name,
          projectId,
          tradingPartnerId: validCreateInput.tradingPartnerId,
          itemizedStatementId: validCreateInput.itemizedStatementId,
        }),
        expect.any(String)
      );
    });

    it('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/estimate-requests`)
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    it('should return 422 when trading partner is not subcontractor', async () => {
      mockCreate.mockRejectedValue(new TradingPartnerNotSubcontractorError(tradingPartnerId));

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimate-requests`)
        .send(validCreateInput);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('TRADING_PARTNER_NOT_SUBCONTRACTOR');
    });

    it('should return 404 when itemized statement not found', async () => {
      mockCreate.mockRejectedValue(new ItemizedStatementNotFoundError(itemizedStatementId));

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimate-requests`)
        .send(validCreateInput);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
    });

    it('should return 422 when itemized statement has no items', async () => {
      mockCreate.mockRejectedValue(new EmptyItemizedStatementItemsError(itemizedStatementId));

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimate-requests`)
        .send(validCreateInput);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('EMPTY_ITEMIZED_STATEMENT_ITEMS');
    });

    it('should require estimate_request:create permission', async () => {
      mockCreate.mockResolvedValue(mockEstimateRequest);

      await request(app)
        .post(`/api/projects/${projectId}/estimate-requests`)
        .send(validCreateInput);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:create');
    });

    it('should return 403 when user lacks permission', async () => {
      mockState.shouldRejectPermission = true;

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimate-requests`)
        .send(validCreateInput);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/projects/:projectId/estimate-requests', () => {
    it('should return paginated list of estimate requests', async () => {
      const mockResult = {
        data: [mockEstimateRequest],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };
      mockFindByProjectId.mockResolvedValue(mockResult);

      const response = await request(app).get(`/api/projects/${projectId}/estimate-requests`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual(mockResult.pagination);
    });

    it('should return empty list when no estimate requests exist', async () => {
      mockFindByProjectId.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      });

      const response = await request(app).get(`/api/projects/${projectId}/estimate-requests`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should accept pagination query parameters', async () => {
      mockFindByProjectId.mockResolvedValue({
        data: [],
        pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
      });

      const response = await request(app)
        .get(`/api/projects/${projectId}/estimate-requests`)
        .query({ page: 2, limit: 10 });

      expect(response.status).toBe(200);
      expect(mockFindByProjectId).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ page: 2, limit: 10 })
      );
    });

    it('should require estimate_request:read permission', async () => {
      mockFindByProjectId.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await request(app).get(`/api/projects/${projectId}/estimate-requests`);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:read');
    });
  });

  describe('GET /api/projects/:projectId/estimate-requests/latest', () => {
    it('should return latest estimate requests with total count', async () => {
      const mockResult = {
        totalCount: 5,
        latestRequests: [mockEstimateRequest],
      };
      mockFindLatestByProjectId.mockResolvedValue(mockResult);

      const response = await request(app).get(
        `/api/projects/${projectId}/estimate-requests/latest`
      );

      expect(response.status).toBe(200);
      expect(response.body.totalCount).toBe(5);
      expect(response.body.latestRequests).toHaveLength(1);
      expect(mockFindLatestByProjectId).toHaveBeenCalledWith(projectId, 2);
    });

    it('should accept limit query parameter', async () => {
      mockFindLatestByProjectId.mockResolvedValue({
        totalCount: 10,
        latestRequests: [],
      });

      const response = await request(app)
        .get(`/api/projects/${projectId}/estimate-requests/latest`)
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(mockFindLatestByProjectId).toHaveBeenCalledWith(projectId, 5);
    });

    it('should return empty list when no estimate requests exist', async () => {
      mockFindLatestByProjectId.mockResolvedValue({
        totalCount: 0,
        latestRequests: [],
      });

      const response = await request(app).get(
        `/api/projects/${projectId}/estimate-requests/latest`
      );

      expect(response.status).toBe(200);
      expect(response.body.totalCount).toBe(0);
      expect(response.body.latestRequests).toHaveLength(0);
    });

    it('should require estimate_request:read permission', async () => {
      mockFindLatestByProjectId.mockResolvedValue({
        totalCount: 0,
        latestRequests: [],
      });

      await request(app).get(`/api/projects/${projectId}/estimate-requests/latest`);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:read');
    });

    it('should return 403 when user lacks permission', async () => {
      mockState.shouldRejectPermission = true;

      const response = await request(app).get(
        `/api/projects/${projectId}/estimate-requests/latest`
      );

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/estimate-requests/:id', () => {
    it('should return estimate request detail', async () => {
      mockFindById.mockResolvedValue(mockEstimateRequest);

      const response = await request(app).get(`/api/estimate-requests/${validUUID}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: validUUID,
          name: 'テスト見積依頼',
        })
      );
    });

    it('should return 404 when estimate request not found', async () => {
      mockFindById.mockResolvedValue(null);

      const response = await request(app).get(`/api/estimate-requests/${validUUID}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app).get('/api/estimate-requests/invalid-uuid');

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/estimate-requests/:id', () => {
    const validUpdateInput = {
      name: '更新後の見積依頼名',
      expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should update estimate request and return 200', async () => {
      const updatedRequest = { ...mockEstimateRequest, name: validUpdateInput.name };
      mockUpdate.mockResolvedValue(updatedRequest);

      const response = await request(app)
        .put(`/api/estimate-requests/${validUUID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('更新後の見積依頼名');
    });

    it('should return 404 when estimate request not found', async () => {
      mockUpdate.mockRejectedValue(new EstimateRequestNotFoundError(validUUID));

      const response = await request(app)
        .put(`/api/estimate-requests/${validUUID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
    });

    it('should return 409 for optimistic lock conflict', async () => {
      mockUpdate.mockRejectedValue(
        new EstimateRequestConflictError({
          expectedUpdatedAt: validUpdateInput.expectedUpdatedAt,
          actualUpdatedAt: '2024-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .put(`/api/estimate-requests/${validUUID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_CONFLICT');
    });

    it('should require estimate_request:update permission', async () => {
      mockUpdate.mockResolvedValue(mockEstimateRequest);

      await request(app).put(`/api/estimate-requests/${validUUID}`).send(validUpdateInput);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:update');
    });
  });

  describe('DELETE /api/estimate-requests/:id', () => {
    it('should delete estimate request and return 204', async () => {
      mockDelete.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/estimate-requests/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(response.status).toBe(204);
    });

    it('should return 404 when estimate request not found', async () => {
      mockDelete.mockRejectedValue(new EstimateRequestNotFoundError(validUUID));

      const response = await request(app)
        .delete(`/api/estimate-requests/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_NOT_FOUND');
    });

    it('should return 409 for optimistic lock conflict', async () => {
      mockDelete.mockRejectedValue(
        new EstimateRequestConflictError({
          expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
          actualUpdatedAt: '2024-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .delete(`/api/estimate-requests/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_CONFLICT');
    });

    it('should require estimate_request:delete permission', async () => {
      mockDelete.mockResolvedValue(undefined);

      await request(app)
        .delete(`/api/estimate-requests/${validUUID}`)
        .send({ updatedAt: '2024-01-01T00:00:00.000Z' });

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:delete');
    });
  });

  describe('PATCH /api/estimate-requests/:id/items', () => {
    const validItemSelection = {
      items: [
        { itemId: validUUID, selected: true },
        { itemId: '550e8400-e29b-41d4-a716-446655440004', selected: false },
      ],
    };

    it('should update item selection and return 204', async () => {
      mockUpdateItemSelection.mockResolvedValue(undefined);

      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/items`)
        .send(validItemSelection);

      expect(response.status).toBe(204);
      expect(mockUpdateItemSelection).toHaveBeenCalledWith(
        validUUID,
        validItemSelection.items,
        expect.any(String)
      );
    });

    it('should return 404 when estimate request not found', async () => {
      mockUpdateItemSelection.mockRejectedValue(new EstimateRequestNotFoundError(validUUID));

      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/items`)
        .send(validItemSelection);

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/items`)
        .send({ items: [] });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/estimate-requests/:id/items-with-status', () => {
    it('should return items with other request status', async () => {
      const mockItems = [
        {
          id: '550e8400-e29b-41d4-a716-446655440005',
          estimateRequestItemId: '550e8400-e29b-41d4-a716-446655440006',
          customCategory: 'カテゴリA',
          workType: '塗装工事',
          name: '外壁塗装',
          specification: 'シリコン系',
          unit: 'm2',
          quantity: 100,
          displayOrder: 1,
          selected: true,
          otherRequests: [
            {
              estimateRequestId: '550e8400-e29b-41d4-a716-446655440007',
              estimateRequestName: '他の見積依頼',
              tradingPartnerName: '他の協力業者',
            },
          ],
        },
      ];
      mockFindItemsWithOtherRequestStatus.mockResolvedValue(mockItems);

      const response = await request(app).get(
        `/api/estimate-requests/${validUUID}/items-with-status`
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockItems);
    });

    it('should return 404 when estimate request not found', async () => {
      mockFindItemsWithOtherRequestStatus.mockRejectedValue(
        new EstimateRequestNotFoundError(validUUID)
      );

      const response = await request(app).get(
        `/api/estimate-requests/${validUUID}/items-with-status`
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/estimate-requests/:id/text', () => {
    it('should return email text for EMAIL method', async () => {
      const mockEmailText = {
        type: 'email' as const,
        to: 'partner@example.com',
        subject: '【お見積りご依頼】テストプロジェクト',
        body: 'お見積り依頼本文',
      };
      mockGenerateText.mockResolvedValue(mockEmailText);

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/text`);

      expect(response.status).toBe(200);
      // Route transforms response to frontend format
      expect(response.body).toEqual({
        recipient: 'partner@example.com',
        subject: '【お見積りご依頼】テストプロジェクト',
        body: 'お見積り依頼本文',
      });
    });

    it('should return fax text for FAX method', async () => {
      const mockFaxText = {
        type: 'fax' as const,
        faxNumber: '03-1234-5678',
        body: 'FAX本文',
      };
      mockGenerateText.mockResolvedValue(mockFaxText);

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/text`);

      expect(response.status).toBe(200);
      // Route transforms response to frontend format (subject is empty for fax)
      expect(response.body).toEqual({
        recipient: '03-1234-5678',
        subject: '',
        body: 'FAX本文',
      });
    });

    it('should return 404 when estimate request not found', async () => {
      mockGenerateText.mockRejectedValue(new EstimateRequestNotFoundError(validUUID));

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/text`);

      expect(response.status).toBe(404);
    });

    it('should return 422 when no items selected', async () => {
      mockGenerateText.mockRejectedValue(new NoItemsSelectedError(validUUID));

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/text`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('NO_ITEMS_SELECTED');
    });

    it('should return 422 when contact info is missing', async () => {
      mockGenerateText.mockRejectedValue(new MissingContactInfoError('email', tradingPartnerId));

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/text`);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('MISSING_CONTACT_INFO');
    });
  });
});
