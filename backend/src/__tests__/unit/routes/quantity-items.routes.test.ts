/**
 * @fileoverview 数量項目APIルートのテスト
 *
 * TDD: RED phase - テストを先に作成
 *
 * Requirements:
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（大項目・工種・名称・単位・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 * - 6.1: 数量項目のコピー
 * - 6.2: 数量項目の移動
 *
 * @module __tests__/unit/routes/quantity-items.routes
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

vi.mock('../../../services/quantity-item.service.js', () => ({
  QuantityItemService: vi.fn(),
}));
vi.mock('../../../middleware/authenticate.middleware.js');
vi.mock('../../../middleware/authorize.middleware.js');

import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { QuantityItemService } from '../../../services/quantity-item.service.js';

// Type for mocked middleware
const mockAuthenticate = authenticate as Mock;
const mockRequirePermission = requirePermission as Mock;
const MockQuantityItemService = QuantityItemService as unknown as Mock;

describe('QuantityItemsRoutes', () => {
  let app: Express;
  let mockService: {
    create: Mock;
    findById: Mock;
    findByGroupId: Mock;
    update: Mock;
    updateDisplayOrder: Mock;
    delete: Mock;
    copy: Mock;
    move: Mock;
    bulkCopy: Mock;
    bulkMove: Mock;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock service
    mockService = {
      create: vi.fn(),
      findById: vi.fn(),
      findByGroupId: vi.fn(),
      update: vi.fn(),
      updateDisplayOrder: vi.fn(),
      delete: vi.fn(),
      copy: vi.fn(),
      move: vi.fn(),
      bulkCopy: vi.fn(),
      bulkMove: vi.fn(),
    };

    MockQuantityItemService.mockImplementation(() => mockService);

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

    vi.doMock('../../../services/quantity-item.service.js', () => ({
      QuantityItemService: class MockQuantityItemService {
        create = mockService.create;
        findById = mockService.findById;
        findByGroupId = mockService.findByGroupId;
        update = mockService.update;
        updateDisplayOrder = mockService.updateDisplayOrder;
        delete = mockService.delete;
        copy = mockService.copy;
        move = mockService.move;
        bulkCopy = mockService.bulkCopy;
        bulkMove = mockService.bulkMove;
      },
    }));

    vi.doMock('../../../middleware/authenticate.middleware.js', () => ({
      authenticate: mockAuthenticate,
    }));

    vi.doMock('../../../middleware/authorize.middleware.js', () => ({
      requirePermission: mockRequirePermission,
    }));

    // Import route after mocks are setup
    const { default: quantityItemsRoutes } = await import(
      '../../../routes/quantity-items.routes.js'
    );

    // Setup express app
    app = express();
    app.use(express.json());
    app.use('/api/quantity-groups/:groupId/items', quantityItemsRoutes);
    app.use('/api/quantity-items', quantityItemsRoutes);
  });

  describe('POST /api/quantity-groups/:groupId/items', () => {
    it('should create a new quantity item (Req 5.1, 5.2)', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        majorCategory: '建築',
        workType: '足場工事',
        name: '単管足場',
        unit: 'm2',
        quantity: 100.5,
      };
      const createdItem = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        quantityGroupId: groupId,
        majorCategory: '建築',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '足場工事',
        name: '単管足場',
        specification: null,
        unit: 'm2',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 100.5,
        remarks: null,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.create.mockResolvedValue(createdItem);

      const response = await request(app)
        .post(`/api/quantity-groups/${groupId}/items`)
        .send(requestBody)
        .expect(201);

      expect(response.body).toMatchObject({
        id: createdItem.id,
        quantityGroupId: groupId,
        majorCategory: '建築',
        workType: '足場工事',
        name: '単管足場',
      });
    });

    it('should return 400 for missing required fields (Req 5.3)', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174000';
      const requestBody = {
        majorCategory: '建築',
        // Missing: workType, name, unit, quantity
      };

      // Missing required fields should result in 400 from validation middleware
      await request(app)
        .post(`/api/quantity-groups/${groupId}/items`)
        .send(requestBody)
        .expect(400);
    });

    it('should return 404 when group not found', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174000';
      const { QuantityGroupNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.create.mockRejectedValue(new QuantityGroupNotFoundError(groupId));

      const response = await request(app)
        .post(`/api/quantity-groups/${groupId}/items`)
        .send({
          majorCategory: '建築',
          workType: '足場工事',
          name: '単管足場',
          unit: 'm2',
          quantity: 100.5,
        })
        .expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_GROUP_NOT_FOUND');
    });
  });

  describe('GET /api/quantity-groups/:groupId/items', () => {
    it('should list items for a group', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174000';
      const items = [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          quantityGroupId: groupId,
          majorCategory: '建築',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '単管足場',
          specification: null,
          unit: 'm2',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.5,
          remarks: null,
          displayOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockService.findByGroupId.mockResolvedValue(items);

      const response = await request(app).get(`/api/quantity-groups/${groupId}/items`).expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('単管足場');
    });
  });

  describe('GET /api/quantity-items/:id', () => {
    it('should return item detail', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      const item = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '建築',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '足場工事',
        name: '単管足場',
        specification: null,
        unit: 'm2',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 100.5,
        remarks: null,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.findById.mockResolvedValue(item);

      const response = await request(app).get(`/api/quantity-items/${itemId}`).expect(200);

      expect(response.body.id).toBe(itemId);
    });

    it('should return 404 when item not found', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      mockService.findById.mockResolvedValue(null);

      const response = await request(app).get(`/api/quantity-items/${itemId}`).expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_ITEM_NOT_FOUND');
    });
  });

  describe('PUT /api/quantity-items/:id', () => {
    it('should update item', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      const updatedAt = new Date();
      const updateBody = {
        name: '更新後の名称',
        quantity: 200.0,
        expectedUpdatedAt: updatedAt.toISOString(),
      };
      const updatedItem = {
        id: itemId,
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '建築',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '足場工事',
        name: '更新後の名称',
        specification: null,
        unit: 'm2',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 200.0,
        remarks: null,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.update.mockResolvedValue(updatedItem);

      const response = await request(app)
        .put(`/api/quantity-items/${itemId}`)
        .send(updateBody)
        .expect(200);

      expect(response.body.name).toBe('更新後の名称');
      expect(response.body.quantity).toBe(200.0);
    });

    it('should return 409 on conflict', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      const { QuantityItemConflictError } = await import('../../../errors/quantityTableError.js');
      mockService.update.mockRejectedValue(
        new QuantityItemConflictError('競合エラー', { detail: 'test' })
      );

      const response = await request(app)
        .put(`/api/quantity-items/${itemId}`)
        .send({
          name: '更新後の名称',
          expectedUpdatedAt: new Date().toISOString(),
        })
        .expect(409);

      expect(response.body).toHaveProperty('code', 'QUANTITY_ITEM_CONFLICT');
    });
  });

  describe('DELETE /api/quantity-items/:id', () => {
    it('should delete item (Req 5.4)', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      mockService.delete.mockResolvedValue(undefined);

      await request(app).delete(`/api/quantity-items/${itemId}`).expect(204);

      expect(mockService.delete).toHaveBeenCalledWith(itemId, 'test-user-id');
    });

    it('should return 404 when item not found', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      const { QuantityItemNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.delete.mockRejectedValue(new QuantityItemNotFoundError(itemId));

      const response = await request(app).delete(`/api/quantity-items/${itemId}`).expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_ITEM_NOT_FOUND');
    });
  });

  describe('POST /api/quantity-items/:id/copy', () => {
    it('should copy item (Req 6.1)', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      const copiedItem = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
        majorCategory: '建築',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '足場工事',
        name: '単管足場',
        specification: null,
        unit: 'm2',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 100.5,
        remarks: null,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.copy.mockResolvedValue(copiedItem);

      const response = await request(app).post(`/api/quantity-items/${itemId}/copy`).expect(201);

      expect(response.body.id).toBe(copiedItem.id);
      expect(response.body.id).not.toBe(itemId);
    });
  });

  describe('POST /api/quantity-items/:id/move', () => {
    it('should move item to another group (Req 6.2)', async () => {
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      const targetGroupId = '123e4567-e89b-12d3-a456-426614174010';
      const moveBody = {
        targetGroupId,
        displayOrder: 0,
      };
      const movedItem = {
        id: itemId,
        quantityGroupId: targetGroupId,
        majorCategory: '建築',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '足場工事',
        name: '単管足場',
        specification: null,
        unit: 'm2',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 100.5,
        remarks: null,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.move.mockResolvedValue(movedItem);

      const response = await request(app)
        .post(`/api/quantity-items/${itemId}/move`)
        .send(moveBody)
        .expect(200);

      expect(response.body.quantityGroupId).toBe(targetGroupId);
    });
  });

  describe('PUT /api/quantity-groups/:groupId/items/order', () => {
    it('should update display order of items', async () => {
      const groupId = '123e4567-e89b-12d3-a456-426614174000';
      const orderUpdates = [
        { id: '123e4567-e89b-12d3-a456-426614174001', displayOrder: 1 },
        { id: '123e4567-e89b-12d3-a456-426614174002', displayOrder: 0 },
      ];

      mockService.updateDisplayOrder.mockResolvedValue(undefined);

      await request(app)
        .put(`/api/quantity-groups/${groupId}/items/order`)
        .send({ orderUpdates })
        .expect(204);

      expect(mockService.updateDisplayOrder).toHaveBeenCalledWith(
        groupId,
        orderUpdates,
        'test-user-id'
      );
    });
  });

  describe('POST /api/quantity-items/bulk-copy', () => {
    it('should bulk copy items (Req 6.4)', async () => {
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174001',
        '123e4567-e89b-12d3-a456-426614174002',
      ];
      const copiedItems = [
        {
          id: '123e4567-e89b-12d3-a456-426614174003',
          quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
          majorCategory: '建築',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '単管足場',
          specification: null,
          unit: 'm2',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100.5,
          remarks: null,
          displayOrder: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174004',
          quantityGroupId: '123e4567-e89b-12d3-a456-426614174000',
          majorCategory: '建築',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '足場工事',
          name: '枠組足場',
          specification: null,
          unit: 'm2',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 50.0,
          remarks: null,
          displayOrder: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockService.bulkCopy.mockResolvedValue(copiedItems);

      const response = await request(app)
        .post('/api/quantity-items/bulk-copy')
        .send({ itemIds })
        .expect(201);

      expect(response.body).toHaveLength(2);
    });
  });

  describe('POST /api/quantity-items/bulk-move', () => {
    it('should bulk move items (Req 6.4)', async () => {
      const itemIds = [
        '123e4567-e89b-12d3-a456-426614174001',
        '123e4567-e89b-12d3-a456-426614174002',
      ];
      const targetGroupId = '123e4567-e89b-12d3-a456-426614174010';

      mockService.bulkMove.mockResolvedValue(undefined);

      await request(app)
        .post('/api/quantity-items/bulk-move')
        .send({ itemIds, targetGroupId })
        .expect(204);

      expect(mockService.bulkMove).toHaveBeenCalledWith(itemIds, targetGroupId, 'test-user-id');
    });
  });
});
