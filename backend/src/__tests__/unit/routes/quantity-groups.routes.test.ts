/**
 * @fileoverview 数量グループAPIルートのテスト
 *
 * TDD: RED phase - テストを先に作成
 *
 * Requirements:
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.2: 数量グループが追加される場合、同一プロジェクトの注釈付き現場調査写真選択機能を提供する
 * - 4.3: 数量グループ内で写真選択操作を行う
 * - 4.4: 数量グループに写真が紐づけられている状態で、注釈付き写真と数量項目の関連性を視覚的に表示する
 * - 4.5: 数量グループの削除操作を行う
 *
 * @module __tests__/unit/routes/quantity-groups.routes
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

vi.mock('../../../services/quantity-group.service.js', () => ({
  QuantityGroupService: vi.fn(),
}));
vi.mock('../../../middleware/authenticate.middleware.js');
vi.mock('../../../middleware/authorize.middleware.js');

import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { QuantityGroupService } from '../../../services/quantity-group.service.js';

// Type for mocked middleware
const mockAuthenticate = authenticate as Mock;
const mockRequirePermission = requirePermission as Mock;
const MockQuantityGroupService = QuantityGroupService as unknown as Mock;

describe('QuantityGroupsRoutes', () => {
  let app: Express;
  let mockService: {
    create: Mock;
    findById: Mock;
    findByQuantityTableId: Mock;
    update: Mock;
    updateDisplayOrder: Mock;
    delete: Mock;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock service
    mockService = {
      create: vi.fn(),
      findById: vi.fn(),
      findByQuantityTableId: vi.fn(),
      update: vi.fn(),
      updateDisplayOrder: vi.fn(),
      delete: vi.fn(),
    };

    MockQuantityGroupService.mockImplementation(() => mockService);

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

    vi.doMock('../../../services/quantity-group.service.js', () => ({
      QuantityGroupService: class MockQuantityGroupService {
        create = mockService.create;
        findById = mockService.findById;
        findByQuantityTableId = mockService.findByQuantityTableId;
        update = mockService.update;
        updateDisplayOrder = mockService.updateDisplayOrder;
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
    const { default: quantityGroupsRoutes } = await import(
      '../../../routes/quantity-groups.routes.js'
    );

    // Setup express app
    app = express();
    app.use(express.json());
    app.use('/api/quantity-tables/:quantityTableId/groups', quantityGroupsRoutes);
    app.use('/api/quantity-groups', quantityGroupsRoutes);
  });

  describe('POST /api/quantity-tables/:quantityTableId/groups', () => {
    it('should create a new quantity group (Req 4.1)', async () => {
      const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        name: 'グループ1',
        surveyImageId: '123e4567-e89b-12d3-a456-426614174002',
      };
      const createdGroup = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        quantityTableId,
        name: 'グループ1',
        surveyImageId: '123e4567-e89b-12d3-a456-426614174002',
        displayOrder: 0,
        itemCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.create.mockResolvedValue(createdGroup);

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups`)
        .send(requestBody)
        .expect(201);

      expect(response.body).toMatchObject({
        id: createdGroup.id,
        quantityTableId,
        name: 'グループ1',
      });
    });

    it('should create group with survey image (Req 4.2, 4.3)', async () => {
      const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174002';
      const requestBody = {
        surveyImageId,
      };
      const createdGroup = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        quantityTableId,
        name: null,
        surveyImageId,
        displayOrder: 0,
        itemCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.create.mockResolvedValue(createdGroup);

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups`)
        .send(requestBody)
        .expect(201);

      expect(response.body.surveyImageId).toBe(surveyImageId);
    });

    it('should return 404 when quantity table not found', async () => {
      const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
      const { QuantityTableNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.create.mockRejectedValue(new QuantityTableNotFoundError(quantityTableId));

      const response = await request(app)
        .post(`/api/quantity-tables/${quantityTableId}/groups`)
        .send({})
        .expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });
  });

  describe('GET /api/quantity-tables/:quantityTableId/groups', () => {
    it('should list groups for a quantity table', async () => {
      const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
      const groups = [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          quantityTableId,
          name: 'グループ1',
          surveyImageId: null,
          displayOrder: 0,
          itemCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockService.findByQuantityTableId.mockResolvedValue(groups);

      const response = await request(app)
        .get(`/api/quantity-tables/${quantityTableId}/groups`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('グループ1');
    });
  });

  describe('GET /api/quantity-groups/:id', () => {
    it('should return group detail (Req 4.4)', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174001';
      const detail = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'グループ1',
        surveyImageId: '123e4567-e89b-12d3-a456-426614174002',
        displayOrder: 0,
        itemCount: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        surveyImage: {
          id: '123e4567-e89b-12d3-a456-426614174002',
          thumbnailPath: '/path/to/thumb.jpg',
          originalPath: '/path/to/original.jpg',
          fileName: 'test.jpg',
        },
        items: [],
      };

      mockService.findById.mockResolvedValue(detail);

      const response = await request(app).get(`/api/quantity-groups/${groupId}`).expect(200);

      expect(response.body.id).toBe(groupId);
      expect(response.body.surveyImage).toBeDefined();
    });

    it('should return 404 when group not found', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174001';
      mockService.findById.mockResolvedValue(null);

      const response = await request(app).get(`/api/quantity-groups/${groupId}`).expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_GROUP_NOT_FOUND');
    });
  });

  describe('PUT /api/quantity-groups/:id', () => {
    it('should update group', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174001';
      const updatedAt = new Date();
      const updateBody = {
        name: '更新後のグループ名',
        expectedUpdatedAt: updatedAt.toISOString(),
      };
      const updatedGroup = {
        id: groupId,
        quantityTableId: '123e4567-e89b-12d3-a456-426614174000',
        name: '更新後のグループ名',
        surveyImageId: null,
        displayOrder: 0,
        itemCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.update.mockResolvedValue(updatedGroup);

      const response = await request(app)
        .put(`/api/quantity-groups/${groupId}`)
        .send(updateBody)
        .expect(200);

      expect(response.body.name).toBe('更新後のグループ名');
    });

    it('should return 409 on conflict', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174001';
      const { QuantityGroupConflictError } = await import('../../../errors/quantityTableError.js');
      mockService.update.mockRejectedValue(
        new QuantityGroupConflictError('競合エラー', { detail: 'test' })
      );

      const response = await request(app)
        .put(`/api/quantity-groups/${groupId}`)
        .send({
          name: '更新後のグループ名',
          expectedUpdatedAt: new Date().toISOString(),
        })
        .expect(409);

      expect(response.body).toHaveProperty('code', 'QUANTITY_GROUP_CONFLICT');
    });
  });

  describe('PUT /api/quantity-tables/:quantityTableId/groups/order', () => {
    it('should update display order of groups', async () => {
      const quantityTableId = '123e4567-e89b-12d3-a456-426614174000';
      const orderUpdates = [
        { id: '123e4567-e89b-12d3-a456-426614174001', displayOrder: 1 },
        { id: '123e4567-e89b-12d3-a456-426614174002', displayOrder: 0 },
      ];

      mockService.updateDisplayOrder.mockResolvedValue(undefined);

      await request(app)
        .put(`/api/quantity-tables/${quantityTableId}/groups/order`)
        .send({ orderUpdates })
        .expect(204);

      expect(mockService.updateDisplayOrder).toHaveBeenCalledWith(
        quantityTableId,
        orderUpdates,
        'test-user-id'
      );
    });
  });

  describe('DELETE /api/quantity-groups/:id', () => {
    it('should delete group (Req 4.5)', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174001';
      mockService.delete.mockResolvedValue(undefined);

      await request(app).delete(`/api/quantity-groups/${groupId}`).expect(204);

      expect(mockService.delete).toHaveBeenCalledWith(groupId, 'test-user-id');
    });

    it('should return 404 when group not found', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174001';
      const { QuantityGroupNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.delete.mockRejectedValue(new QuantityGroupNotFoundError(groupId));

      const response = await request(app).delete(`/api/quantity-groups/${groupId}`).expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_GROUP_NOT_FOUND');
    });
  });
});
