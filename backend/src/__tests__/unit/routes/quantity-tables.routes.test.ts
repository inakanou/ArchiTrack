/**
 * @fileoverview 数量表APIルートのテスト
 *
 * TDD: RED phase - テストを先に作成
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表名を入力して作成を確定する
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 * - 1.2: 数量表セクションが表示されている状態で、数量表の総数を表示する
 * - 1.3: プロジェクトに数量表が存在する場合、直近の数量表カードを一覧表示する
 *
 * @module __tests__/unit/routes/quantity-tables.routes
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

vi.mock('../../../services/quantity-table.service.js', () => ({
  QuantityTableService: vi.fn(),
}));
vi.mock('../../../middleware/authenticate.middleware.js');
vi.mock('../../../middleware/authorize.middleware.js');

import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { QuantityTableService } from '../../../services/quantity-table.service.js';

// Type for mocked middleware
const mockAuthenticate = authenticate as Mock;
const mockRequirePermission = requirePermission as Mock;
const MockQuantityTableService = QuantityTableService as unknown as Mock;

describe('QuantityTablesRoutes', () => {
  let app: Express;
  let mockService: {
    create: Mock;
    findById: Mock;
    findByProjectId: Mock;
    findLatestByProjectId: Mock;
    update: Mock;
    delete: Mock;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock service
    mockService = {
      create: vi.fn(),
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      findLatestByProjectId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    MockQuantityTableService.mockImplementation(() => mockService);

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

    vi.doMock('../../../services/quantity-table.service.js', () => ({
      QuantityTableService: class MockQuantityTableService {
        create = mockService.create;
        findById = mockService.findById;
        findByProjectId = mockService.findByProjectId;
        findLatestByProjectId = mockService.findLatestByProjectId;
        update = mockService.update;
        delete = mockService.delete;
      },
    }));

    vi.doMock('../../../middleware/authenticate.middleware.js', () => ({
      authenticate: mockAuthenticate,
    }));

    vi.doMock('../../../middleware/authorize.middleware.js', () => ({
      requirePermission: mockRequirePermission,
    }));

    // Import route after mocks are setup
    const { default: quantityTablesRoutes } = await import(
      '../../../routes/quantity-tables.routes.js'
    );

    // Setup express app
    app = express();
    app.use(express.json());
    app.use('/api/projects/:projectId/quantity-tables', quantityTablesRoutes);
    app.use('/api/quantity-tables', quantityTablesRoutes);
  });

  describe('POST /api/projects/:projectId/quantity-tables', () => {
    it('should create a new quantity table (Req 2.1, 2.2)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = { name: 'テスト数量表' };
      const createdTable = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        projectId,
        name: 'テスト数量表',
        groupCount: 0,
        itemCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.create.mockResolvedValue(createdTable);

      const response = await request(app)
        .post(`/api/projects/${projectId}/quantity-tables`)
        .send(requestBody)
        .expect(201);

      expect(response.body).toMatchObject({
        id: createdTable.id,
        projectId,
        name: 'テスト数量表',
      });
      expect(mockService.create).toHaveBeenCalledWith(
        { projectId, name: 'テスト数量表' },
        'test-user-id'
      );
    });

    it('should return 400 for invalid request body', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';

      // Send request with missing required 'name' field
      await request(app)
        .post(`/api/projects/${projectId}/quantity-tables`)
        .send({}) // Missing required name
        .expect(400);

      // Validation error response is handled by the validation middleware
    });

    it('should return 404 when project not found', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const { ProjectNotFoundForQuantityTableError } = await import(
        '../../../errors/quantityTableError.js'
      );
      mockService.create.mockRejectedValue(new ProjectNotFoundForQuantityTableError(projectId));

      const response = await request(app)
        .post(`/api/projects/${projectId}/quantity-tables`)
        .send({ name: 'テスト数量表' })
        .expect(404);

      expect(response.body).toHaveProperty('code', 'PROJECT_NOT_FOUND');
    });
  });

  describe('GET /api/projects/:projectId/quantity-tables', () => {
    it('should list quantity tables with pagination (Req 2.3)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const paginatedResult = {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174001',
            projectId,
            name: 'テスト数量表1',
            groupCount: 2,
            itemCount: 5,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockService.findByProjectId.mockResolvedValue(paginatedResult);

      const response = await request(app)
        .get(`/api/projects/${projectId}/quantity-tables`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual(paginatedResult.pagination);
    });

    it('should support search filter', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      mockService.findByProjectId.mockResolvedValue({ data: [], pagination: {} });

      await request(app).get(`/api/projects/${projectId}/quantity-tables?search=test`).expect(200);

      expect(mockService.findByProjectId).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ search: 'test' }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('GET /api/projects/:projectId/quantity-tables/summary', () => {
    it('should return summary with total count and latest tables (Req 1.2, 1.3)', async () => {
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const summary = {
        totalCount: 5,
        latestTables: [
          {
            id: '123e4567-e89b-12d3-a456-426614174001',
            projectId,
            name: 'テスト数量表1',
            groupCount: 2,
            itemCount: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      mockService.findLatestByProjectId.mockResolvedValue(summary);

      const response = await request(app)
        .get(`/api/projects/${projectId}/quantity-tables/summary`)
        .expect(200);

      expect(response.body.totalCount).toBe(5);
      expect(response.body.latestTables).toHaveLength(1);
    });
  });

  describe('GET /api/quantity-tables/:id', () => {
    it('should return quantity table detail', async () => {
      const tableId = '123e4567-e89b-12d3-a456-426614174001';
      const detail = {
        id: tableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        groupCount: 2,
        itemCount: 10,
        project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テストプロジェクト' },
        groups: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.findById.mockResolvedValue(detail);

      const response = await request(app).get(`/api/quantity-tables/${tableId}`).expect(200);

      expect(response.body.id).toBe(tableId);
      expect(response.body.project).toBeDefined();
    });

    it('should return 404 when quantity table not found', async () => {
      const tableId = '123e4567-e89b-12d3-a456-426614174001';
      mockService.findById.mockResolvedValue(null);

      const response = await request(app).get(`/api/quantity-tables/${tableId}`).expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });
  });

  describe('PUT /api/quantity-tables/:id', () => {
    it('should update quantity table name (Req 2.5)', async () => {
      const tableId = '123e4567-e89b-12d3-a456-426614174001';
      const updatedAt = new Date();
      const updateBody = {
        name: '更新後の数量表名',
        expectedUpdatedAt: updatedAt.toISOString(),
      };
      const updatedTable = {
        id: tableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '更新後の数量表名',
        groupCount: 0,
        itemCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.update.mockResolvedValue(updatedTable);

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}`)
        .send(updateBody)
        .expect(200);

      expect(response.body.name).toBe('更新後の数量表名');
    });

    it('should return 409 on conflict', async () => {
      const tableId = '123e4567-e89b-12d3-a456-426614174001';
      const { QuantityTableConflictError } = await import('../../../errors/quantityTableError.js');
      mockService.update.mockRejectedValue(
        new QuantityTableConflictError('競合エラー', { detail: 'test' })
      );

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}`)
        .send({
          name: '更新後の数量表名',
          expectedUpdatedAt: new Date().toISOString(),
        })
        .expect(409);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_CONFLICT');
    });
  });

  describe('DELETE /api/quantity-tables/:id', () => {
    it('should delete quantity table (Req 2.4)', async () => {
      const tableId = '123e4567-e89b-12d3-a456-426614174001';
      mockService.delete.mockResolvedValue(undefined);

      await request(app).delete(`/api/quantity-tables/${tableId}`).expect(204);

      expect(mockService.delete).toHaveBeenCalledWith(tableId, 'test-user-id');
    });

    it('should return 404 when quantity table not found', async () => {
      const tableId = '123e4567-e89b-12d3-a456-426614174001';
      const { QuantityTableNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.delete.mockRejectedValue(new QuantityTableNotFoundError(tableId));

      const response = await request(app).delete(`/api/quantity-tables/${tableId}`).expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });
  });
});
