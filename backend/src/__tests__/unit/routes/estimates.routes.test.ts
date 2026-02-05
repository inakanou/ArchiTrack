/**
 * @fileoverview 見積書ルートのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-11.5: 見積書に見積名称を設定可能とする
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 *
 * Task 4.1: 見積書CRUD APIエンドポイントの実装
 * Task 4.2: 見積項目CRUD APIエンドポイントの実装
 * Task 4.3: 計算・転記APIエンドポイントの実装
 *
 * @module __tests__/unit/routes/estimates.routes
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
  mockCreateItem,
  mockGetHierarchy,
  mockDeleteItem,
  mockDuplicateItem,
  mockReorderItems,
  mockMoveItem,
  mockTransferFromQuotation,
  mockPreviewNetAllocation,
  mockPreviewProfitRate,
  mockCalculateCommonTemporaryCost,
  mockCalculateSiteManagementCost,
  mockCalculateGeneralAdminCost,
  mockGetPresetValues,
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
  mockCreateItem: vi.fn(),
  mockGetHierarchy: vi.fn(),
  mockDeleteItem: vi.fn(),
  mockDuplicateItem: vi.fn(),
  mockReorderItems: vi.fn(),
  mockMoveItem: vi.fn(),
  mockTransferFromQuotation: vi.fn(),
  mockPreviewNetAllocation: vi.fn(),
  mockPreviewProfitRate: vi.fn(),
  mockCalculateCommonTemporaryCost: vi.fn(),
  mockCalculateSiteManagementCost: vi.fn(),
  mockCalculateGeneralAdminCost: vi.fn(),
  mockGetPresetValues: vi.fn(),
  mockCreateLog: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockState: { shouldRejectPermission: false },
}));

// Mock dependencies before importing the routes
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    $transaction: vi.fn(),
    estimate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    estimateItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    estimateItemLine: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  })),
}));

vi.mock('../../../services/estimate.service.js', () => ({
  EstimateService: class {
    create = mockCreate;
    findById = mockFindById;
    findByProjectId = mockFindByProjectId;
    findLatestByProjectId = mockFindLatestByProjectId;
    update = mockUpdate;
    delete = mockDelete;
  },
}));

vi.mock('../../../services/estimate-item.service.js', () => ({
  EstimateItemService: class {
    createItem = mockCreateItem;
    getHierarchy = mockGetHierarchy;
    deleteItem = mockDeleteItem;
    duplicateItem = mockDuplicateItem;
    reorderItems = mockReorderItems;
    moveItem = mockMoveItem;
    transferFromQuotation = mockTransferFromQuotation;
  },
}));

vi.mock('../../../services/estimate-calculation.service.js', () => ({
  EstimateCalculationService: class {
    previewNetAllocation = mockPreviewNetAllocation;
    previewProfitRate = mockPreviewProfitRate;
  },
}));

vi.mock('../../../services/overhead-cost.service.js', () => ({
  OverheadCostService: class {
    calculateCommonTemporaryCost = mockCalculateCommonTemporaryCost;
    calculateSiteManagementCost = mockCalculateSiteManagementCost;
    calculateGeneralAdminCost = mockCalculateGeneralAdminCost;
    getPresetValues = mockGetPresetValues;
  },
  OverheadCostType: {
    COMMON_TEMPORARY: 'COMMON_TEMPORARY',
    SITE_MANAGEMENT: 'SITE_MANAGEMENT',
    GENERAL_ADMIN: 'GENERAL_ADMIN',
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
import estimatesRoutes from '../../../routes/estimates.routes.js';
import {
  EstimateNotFoundError,
  EstimateConflictError,
  DuplicateEstimateNameError,
  EstimateItemHasChildrenError,
} from '../../../errors/estimateError.js';
import { ProjectNotFoundError } from '../../../errors/projectError.js';
import { ValidationError } from '../../../errors/apiError.js';

describe('estimates.routes', () => {
  let app: express.Express;

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const projectId = '550e8400-e29b-41d4-a716-446655440001';
  const itemizedStatementId = '550e8400-e29b-41d4-a716-446655440002';
  const estimateItemId = '550e8400-e29b-41d4-a716-446655440003';

  const mockEstimate = {
    id: validUUID,
    projectId,
    name: 'テスト見積書',
    sourceItemizedStatementId: itemizedStatementId,
    sourceItemizedStatementName: 'テスト内訳書',
    itemCount: 3,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockEstimateDetail = {
    ...mockEstimate,
    project: {
      id: projectId,
      name: 'テストプロジェクト',
    },
    items: [
      {
        id: estimateItemId,
        estimateId: validUUID,
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            id: '550e8400-e29b-41d4-a716-446655440004',
            estimateItemId,
            lineType: 'ESTIMATE' as const,
            name: 'テスト項目',
            specification: 'テスト規格',
            unit: '式',
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440005',
            estimateItemId,
            lineType: 'EXECUTION' as const,
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440006',
            estimateItemId,
            lineType: 'VENDOR' as const,
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
        ],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ],
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // ネストルート（プロジェクト配下）
    app.use('/api/projects/:projectId/estimates', estimatesRoutes);
    // 単体リソースルート
    app.use('/api/estimates', estimatesRoutes);

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

  describe('POST /api/projects/:projectId/estimates', () => {
    const validCreateInput = {
      name: 'テスト見積書',
    };

    it('見積書を作成できること', async () => {
      mockCreate.mockResolvedValue(mockEstimate);

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimates`)
        .send(validCreateInput);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('テスト見積書');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          name: 'テスト見積書',
        }),
        'test-user-id'
      );
    });

    it('内訳書IDを指定して見積書を作成できること', async () => {
      mockCreate.mockResolvedValue(mockEstimate);

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimates`)
        .send({
          ...validCreateInput,
          sourceItemizedStatementId: itemizedStatementId,
        });

      expect(response.status).toBe(201);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceItemizedStatementId: itemizedStatementId,
        }),
        'test-user-id'
      );
    });

    it('プロジェクトが存在しない場合は404を返すこと', async () => {
      mockCreate.mockRejectedValue(new ProjectNotFoundError(projectId));

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimates`)
        .send(validCreateInput);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('PROJECT_NOT_FOUND');
    });

    it('同名の見積書が存在する場合は409を返すこと', async () => {
      mockCreate.mockRejectedValue(new DuplicateEstimateNameError('テスト見積書', projectId));

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimates`)
        .send(validCreateInput);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DUPLICATE_ESTIMATE_NAME');
    });

    it('名称が空の場合は400を返すこと', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/estimates`)
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    it('権限がない場合は403を返すこと', async () => {
      mockState.shouldRejectPermission = true;

      const response = await request(app)
        .post(`/api/projects/${projectId}/estimates`)
        .send(validCreateInput);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/projects/:projectId/estimates', () => {
    it('見積書一覧を取得できること', async () => {
      mockFindByProjectId.mockResolvedValue({
        data: [mockEstimate],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });

      const response = await request(app).get(`/api/projects/${projectId}/estimates`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
    });

    it('ページネーションパラメータを指定できること', async () => {
      mockFindByProjectId.mockResolvedValue({
        data: [],
        pagination: {
          page: 2,
          limit: 10,
          total: 15,
          totalPages: 2,
        },
      });

      const response = await request(app)
        .get(`/api/projects/${projectId}/estimates`)
        .query({ page: 2, limit: 10 });

      expect(response.status).toBe(200);
      expect(mockFindByProjectId).toHaveBeenCalledWith(
        projectId,
        expect.any(Object),
        expect.objectContaining({ page: 2, limit: 10 }),
        expect.any(Object)
      );
    });

    it('検索クエリを指定できること', async () => {
      mockFindByProjectId.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const response = await request(app)
        .get(`/api/projects/${projectId}/estimates`)
        .query({ search: 'テスト' });

      expect(response.status).toBe(200);
      expect(mockFindByProjectId).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ search: 'テスト' }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('GET /api/projects/:projectId/estimates/latest', () => {
    it('直近の見積書一覧とカウントを取得できること', async () => {
      // サービスは { estimates, totalCount } を返すが、ルートは { latestEstimates, totalCount } にマッピング
      mockFindLatestByProjectId.mockResolvedValue({
        totalCount: 5,
        estimates: [mockEstimate],
      });

      const response = await request(app).get(`/api/projects/${projectId}/estimates/latest`);

      expect(response.status).toBe(200);
      expect(response.body.totalCount).toBe(5);
      expect(response.body.latestEstimates).toHaveLength(1);
    });
  });

  describe('GET /api/estimates/:id', () => {
    it('見積書詳細を取得できること', async () => {
      mockFindById.mockResolvedValue(mockEstimateDetail);

      const response = await request(app).get(`/api/estimates/${validUUID}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(validUUID);
      expect(response.body.items).toHaveLength(1);
    });

    it('見積書が存在しない場合は404を返すこと', async () => {
      mockFindById.mockResolvedValue(null);

      const response = await request(app).get(`/api/estimates/${validUUID}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_NOT_FOUND');
    });
  });

  describe('PUT /api/estimates/:id', () => {
    const validUpdateInput = {
      name: '更新後の見積書',
      expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('見積書を更新できること', async () => {
      mockUpdate.mockResolvedValue({ ...mockEstimate, name: '更新後の見積書' });

      const response = await request(app).put(`/api/estimates/${validUUID}`).send(validUpdateInput);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('更新後の見積書');
    });

    it('楽観的排他制御エラーの場合は409を返すこと', async () => {
      mockUpdate.mockRejectedValue(new EstimateConflictError());

      const response = await request(app).put(`/api/estimates/${validUUID}`).send(validUpdateInput);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ESTIMATE_CONFLICT');
    });

    it('見積書が存在しない場合は404を返すこと', async () => {
      mockUpdate.mockRejectedValue(new EstimateNotFoundError(validUUID));

      const response = await request(app).put(`/api/estimates/${validUUID}`).send(validUpdateInput);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/estimates/:id', () => {
    const validDeleteInput = {
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('見積書を削除できること', async () => {
      mockDelete.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .send(validDeleteInput);

      expect(response.status).toBe(204);
    });

    it('見積書が存在しない場合は404を返すこと', async () => {
      mockDelete.mockRejectedValue(new EstimateNotFoundError(validUUID));

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .send(validDeleteInput);

      expect(response.status).toBe(404);
    });

    it('楽観的排他制御エラーの場合は409を返すこと', async () => {
      mockDelete.mockRejectedValue(new EstimateConflictError());

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .send(validDeleteInput);

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/estimates/:id/items', () => {
    it('見積項目一覧を取得できること', async () => {
      mockGetHierarchy.mockResolvedValue([mockEstimateDetail.items[0]]);

      const response = await request(app).get(`/api/estimates/${validUUID}/items`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('階層構造で取得できること', async () => {
      const hierarchyItem = { ...mockEstimateDetail.items[0], children: [] };
      mockGetHierarchy.mockResolvedValue([hierarchyItem]);

      const response = await request(app)
        .get(`/api/estimates/${validUUID}/items`)
        .query({ hierarchy: true });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/estimates/:id/items', () => {
    const validCreateItemInput = {
      displayOrder: 0,
      lines: [
        { lineType: 'ESTIMATE', name: 'テスト項目', unit: '式', quantity: 1, unitPrice: 10000 },
        { lineType: 'EXECUTION' },
        { lineType: 'VENDOR' },
      ],
    };

    it('見積項目を作成できること', async () => {
      mockCreateItem.mockResolvedValue(mockEstimateDetail.items[0]);

      const response = await request(app)
        .post(`/api/estimates/${validUUID}/items`)
        .send(validCreateItemInput);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('見積書が存在しない場合は404を返すこと', async () => {
      mockCreateItem.mockRejectedValue(new EstimateNotFoundError(validUUID));

      const response = await request(app)
        .post(`/api/estimates/${validUUID}/items`)
        .send(validCreateItemInput);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/estimates/:id/items/:itemId', () => {
    it('見積項目を削除できること', async () => {
      mockDeleteItem.mockResolvedValue(undefined);

      const response = await request(app).delete(
        `/api/estimates/${validUUID}/items/${estimateItemId}`
      );

      expect(response.status).toBe(204);
    });

    it('子項目がある場合は422を返すこと', async () => {
      mockDeleteItem.mockRejectedValue(new EstimateItemHasChildrenError(estimateItemId, 2));

      const response = await request(app).delete(
        `/api/estimates/${validUUID}/items/${estimateItemId}`
      );

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('ESTIMATE_ITEM_HAS_CHILDREN');
    });

    it('forceDeleteオプションで強制削除できること', async () => {
      mockDeleteItem.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}/items/${estimateItemId}`)
        .send({ forceDelete: true });

      expect(response.status).toBe(204);
      expect(mockDeleteItem).toHaveBeenCalledWith(estimateItemId, true);
    });
  });

  describe('POST /api/estimates/:id/items/:itemId/duplicate', () => {
    it('見積項目を複製できること', async () => {
      const duplicatedItem = { ...mockEstimateDetail.items[0], id: 'new-item-id' };
      mockDuplicateItem.mockResolvedValue(duplicatedItem);

      const response = await request(app).post(
        `/api/estimates/${validUUID}/items/${estimateItemId}/duplicate`
      );

      expect(response.status).toBe(201);
      expect(mockDuplicateItem).toHaveBeenCalledWith(estimateItemId);
    });
  });

  describe('PUT /api/estimates/:id/items/reorder', () => {
    it('見積項目の順序を変更できること', async () => {
      mockReorderItems.mockResolvedValue(undefined);
      const anotherItemId = '550e8400-e29b-41d4-a716-446655440009';

      const response = await request(app)
        .put(`/api/estimates/${validUUID}/items/reorder`)
        .send({
          itemOrders: [
            { id: estimateItemId, displayOrder: 1 },
            { id: anotherItemId, displayOrder: 0 },
          ],
        });

      expect(response.status).toBe(204);
    });
  });

  describe('POST /api/estimates/:id/transfer-quotation', () => {
    const receivedQuotationId = '550e8400-e29b-41d4-a716-446655440007';
    const lineItemId = '550e8400-e29b-41d4-a716-446655440008';

    it('受領見積書から転記できること', async () => {
      mockTransferFromQuotation.mockResolvedValue([mockEstimateDetail.items[0]]);

      const response = await request(app)
        .post(`/api/estimates/${validUUID}/transfer-quotation`)
        .send({
          receivedQuotationId,
          lineItemIds: [lineItemId],
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('転記先を指定して転記できること', async () => {
      mockTransferFromQuotation.mockResolvedValue([mockEstimateDetail.items[0]]);

      const response = await request(app)
        .post(`/api/estimates/${validUUID}/transfer-quotation`)
        .send({
          receivedQuotationId,
          lineItemIds: [lineItemId],
          targetEstimateItemId: estimateItemId,
        });

      expect(response.status).toBe(200);
      expect(mockTransferFromQuotation).toHaveBeenCalledWith(
        expect.objectContaining({
          targetEstimateItemId: estimateItemId,
        })
      );
    });
  });

  describe('POST /api/estimates/:id/calculate-net', () => {
    it('NET金額案分計算ができること', async () => {
      mockPreviewNetAllocation.mockReturnValue([
        {
          lineId: estimateItemId,
          originalAmount: '10000',
          allocatedAmount: '8000',
          ratio: '0.8',
        },
      ]);

      const response = await request(app)
        .post(`/api/estimates/${validUUID}/calculate-net`)
        .send({
          vendorName: 'テスト業者',
          targetLineIds: [estimateItemId],
          excludeLineIds: [],
          netAmount: '8000',
        });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/estimates/:id/apply-profit-rate', () => {
    it('利益率を適用できること', async () => {
      mockPreviewProfitRate.mockReturnValue([
        {
          lineId: estimateItemId,
          originalUnitPrice: '10000',
          newUnitPrice: '11000',
        },
      ]);

      const response = await request(app)
        .post(`/api/estimates/${validUUID}/apply-profit-rate`)
        .send({
          profitRate: '10',
          overwriteOption: 'all',
        });

      expect(response.status).toBe(200);
    });

    it('利益率が範囲外の場合は400を返すこと', async () => {
      const response = await request(app)
        .post(`/api/estimates/${validUUID}/apply-profit-rate`)
        .send({
          profitRate: '600',
          overwriteOption: 'all',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/estimates/:id/calculate-overhead', () => {
    it('諸経費を計算できること', async () => {
      mockCalculateCommonTemporaryCost.mockReturnValue({
        costType: 'COMMON_TEMPORARY',
        rate: '5.5',
        amount: '5500000',
        formula: '[新営] Kr = ...',
      });

      const response = await request(app)
        .post(`/api/estimates/${validUUID}/calculate-overhead`)
        .send({
          costType: 'COMMON_TEMPORARY',
          directCost: '100000',
          constructionPeriod: 6,
          isRenovation: false,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('costType');
    });
  });

  describe('POST /api/estimates/:id/overhead-items', () => {
    it('諸経費行を追加できること', async () => {
      mockGetPresetValues.mockReturnValue({
        name: '共通仮設費',
        specification: '',
        unit: '式',
        quantity: 1,
      });
      mockCreateItem.mockResolvedValue(mockEstimateDetail.items[0]);

      const response = await request(app).post(`/api/estimates/${validUUID}/overhead-items`).send({
        costType: 'COMMON_TEMPORARY',
      });

      expect(response.status).toBe(201);
    });
  });
});
