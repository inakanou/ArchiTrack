/**
 * @fileoverview 内訳書APIルートのテスト
 *
 * TDD: RED phase - テストを先に作成
 *
 * Requirements:
 * - 1.1: 内訳書作成（数量表選択）
 * - 1.4: 数量表未選択エラー
 * - 1.5: 数量表1つのみ選択可能
 * - 1.6: 内訳書名未入力エラー
 * - 1.7: 内訳書名最大200文字
 * - 1.9: 数量表に項目がない場合エラー
 * - 1.10: 同名内訳書重複エラー
 * - 3.1: 内訳書一覧表示
 * - 3.2: 作成日時降順
 * - 3.3: 内訳書なしメッセージ
 * - 3.4: 一覧の各行に情報を表示
 * - 3.5: 内訳書詳細画面への遷移
 * - 4.1: 内訳書詳細取得
 * - 7.1: 削除ボタン
 * - 7.2: 削除確認ダイアログ
 * - 7.4: 削除エラー表示
 * - 10.2: updatedAtフィールド
 * - 10.3: updatedAt比較（楽観的排他制御）
 * - 10.4: 409 Conflictエラー
 *
 * Task 3.1: 内訳書APIエンドポイントの実装（テスト）
 * Task 3.2: エラーハンドリングの実装（テスト）
 *
 * @module __tests__/unit/routes/itemized-statements.routes
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Mock dependencies before importing routes
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class MockAuditLogService {
    createLog = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../../services/itemized-statement.service.js', () => ({
  ItemizedStatementService: vi.fn(),
}));

vi.mock('../../../services/itemized-statement-pivot.service.js', () => ({
  ItemizedStatementPivotService: vi.fn(),
}));

vi.mock('../../../middleware/authenticate.middleware.js');
vi.mock('../../../middleware/authorize.middleware.js');

import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { ItemizedStatementService } from '../../../services/itemized-statement.service.js';

// Type for mocked middleware
const mockAuthenticate = authenticate as Mock;
const mockRequirePermission = requirePermission as Mock;
const MockItemizedStatementService = ItemizedStatementService as unknown as Mock;

describe('ItemizedStatementsRoutes', () => {
  let app: Express;
  let mockService: {
    create: Mock;
    findById: Mock;
    findByProjectId: Mock;
    findLatestByProjectId: Mock;
    delete: Mock;
    updateItemOrder: Mock;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock service
    mockService = {
      create: vi.fn(),
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      findLatestByProjectId: vi.fn(),
      delete: vi.fn(),
      updateItemOrder: vi.fn(),
    };

    MockItemizedStatementService.mockImplementation(() => mockService);

    // Setup mock middleware
    mockAuthenticate.mockImplementation((req, _res, next) => {
      req.user = { userId: 'test-user-id' };
      next();
    });

    mockRequirePermission.mockImplementation(
      () => (_req: unknown, _res: unknown, next: () => void) => next()
    );

    // Reset modules to get fresh route imports
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock('../../../db.js', () => ({
      default: vi.fn(() => ({})),
    }));

    vi.doMock('../../../services/audit-log.service.js', () => ({
      AuditLogService: class MockAuditLogService {
        createLog = vi.fn().mockResolvedValue(undefined);
      },
    }));

    vi.doMock('../../../services/itemized-statement-pivot.service.js', () => ({
      ItemizedStatementPivotService: class MockItemizedStatementPivotService {},
    }));

    vi.doMock('../../../services/itemized-statement.service.js', () => ({
      ItemizedStatementService: class MockItemizedStatementService {
        create = mockService.create;
        findById = mockService.findById;
        findByProjectId = mockService.findByProjectId;
        findLatestByProjectId = mockService.findLatestByProjectId;
        delete = mockService.delete;
        updateItemOrder = mockService.updateItemOrder;
      },
    }));

    vi.doMock('../../../middleware/authenticate.middleware.js', () => ({
      authenticate: mockAuthenticate,
    }));

    vi.doMock('../../../middleware/authorize.middleware.js', () => ({
      requirePermission: mockRequirePermission,
    }));

    // Import route after mocks are setup
    const { default: itemizedStatementsRoutes } =
      await import('../../../routes/itemized-statements.routes.js');

    // Setup express app
    app = express();
    app.use(express.json());
    app.use('/api/projects/:projectId/itemized-statements', itemizedStatementsRoutes);
    app.use('/api/itemized-statements', itemizedStatementsRoutes);
  });

  // ========================================
  // POST /api/projects/:projectId/itemized-statements
  // ========================================
  describe('POST /api/projects/:projectId/itemized-statements', () => {
    it('should create a new itemized statement (Req 1.1, 1.5)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'テスト内訳書',
        quantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      };
      const createdStatement = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId,
        name: 'テスト内訳書',
        sourceQuantityTableId: requestBody.quantityTableId,
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.create.mockResolvedValue(createdStatement);

      const response = await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(201);

      expect(response.body).toMatchObject({
        id: createdStatement.id,
        projectId,
        name: 'テスト内訳書',
      });
      expect(mockService.create).toHaveBeenCalledWith(
        { projectId, name: 'テスト内訳書', sourceQuantityTableId: requestBody.quantityTableId },
        'test-user-id'
      );
    });

    it('should return 400 for missing name field (Req 1.6)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        quantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      };

      // バリデーションエラーで400が返却される
      await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(400);
    });

    it('should return 400 for missing quantityTableId field (Req 1.4)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'テスト内訳書',
      };

      // バリデーションエラーで400が返却される
      await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(400);
    });

    it('should return 400 for name exceeding 200 characters (Req 1.7)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'あ'.repeat(201),
        quantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      };

      await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(400);
    });

    it('should return 400 for invalid UUID format of quantityTableId', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'テスト内訳書',
        quantityTableId: 'invalid-uuid',
      };

      await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(400);
    });

    it('should return 404 when quantity table not found', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'テスト内訳書',
        quantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      };

      const { QuantityTableNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.create.mockRejectedValue(
        new QuantityTableNotFoundError(requestBody.quantityTableId)
      );

      const response = await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });

    it('should return 409 when duplicate name exists (Req 1.10)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'テスト内訳書',
        quantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      };

      const { DuplicateItemizedStatementNameError } =
        await import('../../../errors/itemizedStatementError.js');
      mockService.create.mockRejectedValue(
        new DuplicateItemizedStatementNameError(requestBody.name, projectId)
      );

      const response = await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(409);

      expect(response.body).toHaveProperty('code', 'DUPLICATE_ITEMIZED_STATEMENT_NAME');
    });

    it('should return 400 when quantity table has no items (Req 1.9)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'テスト内訳書',
        quantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      };

      const { EmptyQuantityItemsError } = await import('../../../errors/itemizedStatementError.js');
      mockService.create.mockRejectedValue(
        new EmptyQuantityItemsError(requestBody.quantityTableId)
      );

      const response = await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(400);

      expect(response.body).toHaveProperty('code', 'EMPTY_QUANTITY_ITEMS');
    });

    it('should return 422 when quantity overflow (Req 2.5)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'テスト内訳書',
        quantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      };

      const { QuantityOverflowError } = await import('../../../errors/itemizedStatementError.js');
      mockService.create.mockRejectedValue(
        new QuantityOverflowError('99999999.99', '-999999.99', '9999999.99')
      );

      const response = await request(app)
        .post(`/api/projects/${projectId}/itemized-statements`)
        .send(requestBody)
        .expect(422);

      expect(response.body).toHaveProperty('code', 'QUANTITY_OVERFLOW');
    });
  });

  // ========================================
  // GET /api/projects/:projectId/itemized-statements
  // ========================================
  describe('GET /api/projects/:projectId/itemized-statements', () => {
    it('should list itemized statements ordered by createdAt desc (Req 3.1, 3.2)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const paginatedResult = {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174002',
            projectId,
            name: 'テスト内訳書1',
            sourceQuantityTableId: '123e4567-e89b-12d3-a456-426614174001',
            sourceQuantityTableName: 'テスト数量表',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      mockService.findByProjectId.mockResolvedValue(paginatedResult);

      const response = await request(app)
        .get(`/api/projects/${projectId}/itemized-statements`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(mockService.findByProjectId).toHaveBeenCalledWith(
        projectId,
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support pagination', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      mockService.findByProjectId.mockResolvedValue({
        data: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });

      await request(app)
        .get(`/api/projects/${projectId}/itemized-statements?page=2&limit=10`)
        .expect(200);

      expect(mockService.findByProjectId).toHaveBeenCalledWith(
        projectId,
        expect.any(Object),
        expect.objectContaining({ page: 2, limit: 10 }),
        expect.any(Object)
      );
    });

    it('should support search filter', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      mockService.findByProjectId.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await request(app)
        .get(`/api/projects/${projectId}/itemized-statements?search=test`)
        .expect(200);

      expect(mockService.findByProjectId).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ search: 'test' }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  // ========================================
  // GET /api/projects/:projectId/itemized-statements/latest
  // ========================================
  describe('GET /api/projects/:projectId/itemized-statements/latest', () => {
    it('should return latest statements summary (Req 3.4)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const summary = {
        totalCount: 5,
        latestStatements: [
          {
            id: '123e4567-e89b-12d3-a456-426614174002',
            projectId,
            name: 'テスト内訳書1',
            sourceQuantityTableId: '123e4567-e89b-12d3-a456-426614174001',
            sourceQuantityTableName: 'テスト数量表',
            itemCount: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      mockService.findLatestByProjectId.mockResolvedValue(summary);

      const response = await request(app)
        .get(`/api/projects/${projectId}/itemized-statements/latest`)
        .expect(200);

      expect(response.body.totalCount).toBe(5);
      expect(response.body.latestStatements).toHaveLength(1);
    });

    it('should support limit query parameter', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      mockService.findLatestByProjectId.mockResolvedValue({
        totalCount: 0,
        latestStatements: [],
      });

      await request(app)
        .get(`/api/projects/${projectId}/itemized-statements/latest?limit=5`)
        .expect(200);

      expect(mockService.findLatestByProjectId).toHaveBeenCalledWith(projectId, 5);
    });
  });

  // ========================================
  // GET /api/itemized-statements/:id
  // ========================================
  describe('GET /api/itemized-statements/:id', () => {
    it('should return itemized statement detail (Req 4.1)', async () => {
      const statementId = '123e4567-e89b-12d3-a456-426614174002';
      const detail = {
        id: statementId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト内訳書',
        sourceQuantityTableId: '123e4567-e89b-12d3-a456-426614174001',
        sourceQuantityTableName: 'テスト数量表',
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: '123e4567-e89b-12d3-a456-426614174003',
            itemizedStatementId: statementId,
            customCategory: '分類A',
            workType: '工種A',
            name: '品名A',
            specification: '規格A',
            unit: '個',
            quantity: 10.5,
            displayOrder: 0,
          },
        ],
      };

      mockService.findById.mockResolvedValue(detail);

      const response = await request(app)
        .get(`/api/itemized-statements/${statementId}`)
        .expect(200);

      expect(response.body.id).toBe(statementId);
      expect(response.body.items).toHaveLength(1);
    });

    it('should return 404 when itemized statement not found', async () => {
      const statementId = '123e4567-e89b-12d3-a456-426614174002';
      mockService.findById.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/itemized-statements/${statementId}`)
        .expect(404);

      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_NOT_FOUND');
    });

    it('should return 400 for invalid UUID format', async () => {
      await request(app).get('/api/itemized-statements/invalid-uuid').expect(400);
    });
  });

  // ========================================
  // DELETE /api/itemized-statements/:id
  // ========================================
  describe('DELETE /api/itemized-statements/:id', () => {
    it('should delete itemized statement (Req 7.1, 7.2)', async () => {
      const statementId = '123e4567-e89b-12d3-a456-426614174002';
      const updatedAt = new Date().toISOString();

      mockService.delete.mockResolvedValue(undefined);

      await request(app)
        .delete(`/api/itemized-statements/${statementId}`)
        .send({ updatedAt })
        .expect(204);

      expect(mockService.delete).toHaveBeenCalledWith(
        statementId,
        'test-user-id',
        expect.any(Date)
      );
    });

    it('should return 400 for missing updatedAt field (Req 10.2)', async () => {
      const statementId = '123e4567-e89b-12d3-a456-426614174002';

      await request(app).delete(`/api/itemized-statements/${statementId}`).send({}).expect(400);
    });

    it('should return 404 when itemized statement not found', async () => {
      const statementId = '123e4567-e89b-12d3-a456-426614174002';
      const { ItemizedStatementNotFoundError } =
        await import('../../../errors/itemizedStatementError.js');
      mockService.delete.mockRejectedValue(new ItemizedStatementNotFoundError(statementId));

      const response = await request(app)
        .delete(`/api/itemized-statements/${statementId}`)
        .send({ updatedAt: new Date().toISOString() })
        .expect(404);

      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_NOT_FOUND');
    });

    it('should return 409 on optimistic lock conflict (Req 10.3, 10.4)', async () => {
      const statementId = '123e4567-e89b-12d3-a456-426614174002';
      const { ItemizedStatementConflictError } =
        await import('../../../errors/itemizedStatementError.js');
      mockService.delete.mockRejectedValue(
        new ItemizedStatementConflictError({
          expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
          actualUpdatedAt: '2024-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .delete(`/api/itemized-statements/${statementId}`)
        .send({ updatedAt: new Date().toISOString() })
        .expect(409);

      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_CONFLICT');
    });
  });

  // ========================================
  // PATCH /api/itemized-statements/:id/items/order
  // ========================================
  describe('PATCH /api/itemized-statements/:id/items/order', () => {
    const statementId = '123e4567-e89b-12d3-a456-426614174002';

    const validRequestBody = {
      items: [
        { id: '123e4567-e89b-12d3-a456-426614174010', displayOrder: 0 },
        { id: '123e4567-e89b-12d3-a456-426614174011', displayOrder: 1 },
        { id: '123e4567-e89b-12d3-a456-426614174012', displayOrder: 2 },
      ],
      updatedAt: '2026-01-23T00:00:00.000Z',
    };

    const mockUpdatedDetail = {
      id: statementId,
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テスト' },
      name: 'テスト内訳書',
      sourceQuantityTableId: '123e4567-e89b-12d3-a456-426614174001',
      sourceQuantityTableName: 'テスト数量表',
      itemCount: 3,
      createdAt: new Date('2026-01-19T00:00:00Z'),
      updatedAt: new Date('2026-01-23T01:00:00Z'),
      items: [
        {
          id: '123e4567-e89b-12d3-a456-426614174010',
          customCategory: '分類A',
          workType: '工種1',
          name: '名称1',
          specification: '規格1',
          unit: 'm',
          quantity: 10,
          displayOrder: 0,
        },
      ],
    };

    it('should update item order successfully (Req 17.8)', async () => {
      mockService.updateItemOrder.mockResolvedValue(mockUpdatedDetail);

      const response = await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send(validRequestBody)
        .expect(200);

      expect(response.body).toHaveProperty('id', statementId);
      expect(mockService.updateItemOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          itemizedStatementId: statementId,
          items: validRequestBody.items,
        }),
        'test-user-id'
      );
    });

    it('should return 400 when items array is empty (Req 17.8)', async () => {
      await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send({
          items: [],
          updatedAt: '2026-01-23T00:00:00.000Z',
        })
        .expect(400);
    });

    it('should return 400 when updatedAt is missing', async () => {
      await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send({
          items: [{ id: '123e4567-e89b-12d3-a456-426614174010', displayOrder: 0 }],
        })
        .expect(400);
    });

    it('should return 400 when displayOrder is negative', async () => {
      await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send({
          items: [{ id: '123e4567-e89b-12d3-a456-426614174010', displayOrder: -1 }],
          updatedAt: '2026-01-23T00:00:00.000Z',
        })
        .expect(400);
    });

    it('should return 400 when displayOrder is not sequential from 0', async () => {
      await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send({
          items: [
            { id: '123e4567-e89b-12d3-a456-426614174010', displayOrder: 0 },
            { id: '123e4567-e89b-12d3-a456-426614174011', displayOrder: 2 }, // gap
          ],
          updatedAt: '2026-01-23T00:00:00.000Z',
        })
        .expect(400);
    });

    it('should return 404 when itemized statement not found', async () => {
      const { ItemizedStatementNotFoundError } =
        await import('../../../errors/itemizedStatementError.js');
      mockService.updateItemOrder.mockRejectedValue(
        new ItemizedStatementNotFoundError(statementId)
      );

      const response = await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send(validRequestBody)
        .expect(404);

      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_NOT_FOUND');
    });

    it('should return 409 on optimistic lock conflict (Req 17.14)', async () => {
      const { ItemizedStatementConflictError } =
        await import('../../../errors/itemizedStatementError.js');
      mockService.updateItemOrder.mockRejectedValue(
        new ItemizedStatementConflictError({
          expectedUpdatedAt: '2026-01-22T00:00:00.000Z',
          actualUpdatedAt: '2026-01-23T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send(validRequestBody)
        .expect(409);

      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_CONFLICT');
    });

    it('should return 400 when item does not belong to statement', async () => {
      const { ItemNotBelongToStatementError } =
        await import('../../../errors/itemizedStatementError.js');
      mockService.updateItemOrder.mockRejectedValue(
        new ItemNotBelongToStatementError('item-999', statementId)
      );

      const response = await request(app)
        .patch(`/api/itemized-statements/${statementId}/items/order`)
        .send(validRequestBody)
        .expect(400);

      expect(response.body).toHaveProperty('code', 'ITEM_NOT_BELONG_TO_STATEMENT');
    });
  });
});
