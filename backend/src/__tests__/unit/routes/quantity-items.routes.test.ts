/**
 * @fileoverview 数量項目APIルートのテスト
 *
 * TDD: RED phase - テストを先に作成
 *
 * Requirements (quantity-table-generation):
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（大項目・工種・名称・単位・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 * - 6.1: 数量項目のコピー
 * - 6.2: 数量項目の移動
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・備考の文字数上限（全角25文字/半角50文字）
 * - 13.2: 工種の文字数上限（全角8文字/半角16文字）
 * - 13.3: 単位の文字数上限（全角3文字/半角6文字）
 *
 * @module __tests__/unit/routes/quantity-items.routes
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Mock dependencies before importing routes
// 案件の閲覧範囲の判定部品は素通りさせる（判定と経路への適用は
// quantity-table-project-scope.middleware.test.ts と統合テストが確かめる。quantity-table-generation タスク104.1）
// 表示順の更新と一括の操作の要素の判定部品は、呼ばれたことを数える（件数の上限を超えた要求で
// 呼ばれないことを確かめるため。quantity-table-generation タスク110.2）
const scopeSpies = vi.hoisted(() => ({ orderedItems: vi.fn(), bulkItems: vi.fn() }));
vi.mock('../../../middleware/quantity-table-project-scope.middleware.js', () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    requireQuantityGroupParamProjectScope: pass,
    requireQuantityItemProjectScope: pass,
    requireOrderedQuantityItemsProjectScope:
      () => (_req: unknown, _res: unknown, next: () => void) => {
        scopeSpies.orderedItems();
        next();
      },
    requireBulkQuantityItemsProjectScope:
      () => (_req: unknown, _res: unknown, next: () => void) => {
        scopeSpies.bulkItems();
        next();
      },
  };
});

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
    const { default: quantityItemsRoutes } =
      await import('../../../routes/quantity-items.routes.js');

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

    it('文字数上限違反を400 / QUANTITY_TABLE_VALIDATION_ERROR と違反フィールドで返す（Req 13.1, 13.2, 13.3）', async () => {
      // Task 77.1: 作成経路の拒否の応答形を保存経路（PUT /api/quantity-tables/:id/save）と揃える
      const groupId = '123e4567-e89b-12d3-a456-426614174000';
      const { QuantityTableValidationError } =
        await import('../../../errors/quantityTableError.js');
      mockService.create.mockRejectedValue(
        new QuantityTableValidationError(
          '数量項目に整合性エラーがあります。問題箇所を修正してください。',
          {
            unit: '単位は全角3文字/半角6文字以内で入力してください',
          }
        )
      );

      const response = await request(app)
        .post(`/api/quantity-groups/${groupId}/items`)
        .send({
          majorCategory: '建築',
          workType: '足場工事',
          name: '単管足場',
          unit: '立方メートル',
          quantity: 100.5,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        status: 400,
        code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        detail: '数量項目に整合性エラーがあります。問題箇所を修正してください。',
        unit: '単位は全角3文字/半角6文字以内で入力してください',
      });
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

    it('文字数上限違反を400 / QUANTITY_TABLE_VALIDATION_ERROR と違反フィールドで返す（Req 13.1, 13.2, 13.3）', async () => {
      // Task 77.1: 更新経路の拒否の応答形を作成経路・保存経路と揃える
      const itemId = '123e4567-e89b-12d3-a456-426614174001';
      const { QuantityTableValidationError } =
        await import('../../../errors/quantityTableError.js');
      mockService.update.mockRejectedValue(
        new QuantityTableValidationError(
          '数量項目に整合性エラーがあります。問題箇所を修正してください。',
          {
            remarks: '備考は全角25文字/半角50文字以内で入力してください',
          }
        )
      );

      const response = await request(app)
        .put(`/api/quantity-items/${itemId}`)
        .send({
          remarks: 'あ'.repeat(26),
          expectedUpdatedAt: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body).toMatchObject({
        status: 400,
        code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        detail: '数量項目に整合性エラーがあります。問題箇所を修正してください。',
        remarks: '備考は全角25文字/半角50文字以内で入力してください',
      });
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
  /**
   * 表示順の更新の `orderUpdates` と一括コピー・一括移動の `itemIds` の件数の上限
   * （quantity-table-generation タスク110.2。一括コピー・一括移動の上限はタスク111.1 で 1000 から 500 へ下げた）
   *
   * 各経路で上限ちょうどは通り、1 件超えると本文の検証の 400（既存の形）で上限を示す日本語の
   * メッセージと問題箇所を返し、要素の閲覧範囲の判定とサービスを呼ばない（判定も書き込みもしない）
   * ことを確かめる。本番と同じく JSON の受け口の上限を 5MB にし、errorHandler で応答の形を得る。
   *
   * @requirement quantity-table-generation/REQ-42.14
   */
  describe('配列の件数の上限', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174000';
    const targetGroupId = '123e4567-e89b-12d3-a456-426614174010';
    let limitApp: Express;
    let limits: {
      QUANTITY_ITEM_DISPLAY_ORDER_MAX_UPDATES: number;
      QUANTITY_ITEM_BULK_MAX_ITEMS: number;
      QUANTITY_ITEM_LIMIT_MESSAGES: { DISPLAY_ORDER_TOO_MANY: string; BULK_ITEMS_TOO_MANY: string };
    };

    beforeEach(async () => {
      // 外側の beforeEach の resetModules の後の同じモジュール群から読む（ApiError の同一性のため）
      const routesModule = await import('../../../routes/quantity-items.routes.js');
      const { errorHandler } = await import('../../../middleware/errorHandler.middleware.js');
      limits = routesModule;
      limitApp = express();
      limitApp.use(express.json({ limit: '5mb' }));
      limitApp.use('/api/quantity-groups/:groupId/items', routesModule.default);
      limitApp.use('/api/quantity-items', routesModule.default);
      limitApp.use(errorHandler);
    });

    const uuidOf = (index: number) =>
      `123e4567-e89b-12d3-a456-${(426614175000 + index).toString().padStart(12, '0')}`;
    const idsOf = (count: number) => Array.from({ length: count }, (_, index) => uuidOf(index));

    const putOrder = (body: object) =>
      request(limitApp).put(`/api/quantity-groups/${groupId}/items/order`).send(body);
    const bulkCopy = (body: object) =>
      request(limitApp).post('/api/quantity-items/bulk-copy').send(body);
    const bulkMove = (body: object) =>
      request(limitApp).post('/api/quantity-items/bulk-move').send(body);

    /** 既存の本文の検証の 400 と同じ形で、上限のメッセージと問題箇所だけを返すことを確かめる */
    const expectLimitRejection = (
      response: request.Response,
      reference: request.Response,
      message: string,
      path: string
    ) => {
      expect(reference.status).toBe(400);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(reference.body.code);
      expect(response.body.type).toBe(reference.body.type);
      expect(Object.keys(response.body).sort()).toEqual(Object.keys(reference.body).sort());
      expect(response.body.message).toBe(message);
      expect(response.body.details).toEqual([
        expect.objectContaining({ path, message, code: 'too_big' }),
      ]);
    };

    it('定数と文言が決定の値である', () => {
      expect(limits.QUANTITY_ITEM_DISPLAY_ORDER_MAX_UPDATES).toBe(2000);
      expect(limits.QUANTITY_ITEM_BULK_MAX_ITEMS).toBe(500);
      expect(limits.QUANTITY_ITEM_LIMIT_MESSAGES.DISPLAY_ORDER_TOO_MANY).toBe(
        '数量項目は2000件以内で指定してください'
      );
      expect(limits.QUANTITY_ITEM_LIMIT_MESSAGES.BULK_ITEMS_TOO_MANY).toBe(
        '数量項目は500件以内で選択してください'
      );
    });

    it('表示順の更新は上限ちょうどなら要素の判定とサービスへ渡す', async () => {
      mockService.updateDisplayOrder.mockResolvedValue(undefined);
      const orderUpdates = idsOf(2000).map((id, index) => ({ id, displayOrder: index }));

      const response = await putOrder({ orderUpdates });

      expect(response.status).toBe(204);
      expect(scopeSpies.orderedItems).toHaveBeenCalledTimes(1);
      expect(mockService.updateDisplayOrder).toHaveBeenCalledTimes(1);
      expect(mockService.updateDisplayOrder.mock.calls[0]![1]).toHaveLength(2000);
    });

    it('表示順の更新が上限を1件超えると400で上限を示し、要素の判定とサービスを呼ばない', async () => {
      const reference = await putOrder({ orderUpdates: 'not-an-array' });
      scopeSpies.orderedItems.mockClear();
      const orderUpdates = idsOf(2001).map((id, index) => ({ id, displayOrder: index }));

      const response = await putOrder({ orderUpdates });

      expectLimitRejection(
        response,
        reference,
        '数量項目は2000件以内で指定してください',
        'orderUpdates'
      );
      expect(scopeSpies.orderedItems).not.toHaveBeenCalled();
      expect(mockService.updateDisplayOrder).not.toHaveBeenCalled();
    });

    it('一括コピーは上限ちょうどなら要素の判定とサービスへ渡す', async () => {
      mockService.bulkCopy.mockResolvedValue([]);

      const response = await bulkCopy({ itemIds: idsOf(500) });

      expect(response.status).toBe(201);
      expect(scopeSpies.bulkItems).toHaveBeenCalledTimes(1);
      expect(mockService.bulkCopy).toHaveBeenCalledTimes(1);
      expect(mockService.bulkCopy.mock.calls[0]![0]).toHaveLength(500);
    });

    it('一括コピーが上限を1件超えると400で上限を示し、要素の判定とサービスを呼ばない', async () => {
      const reference = await bulkCopy({ itemIds: [] });
      scopeSpies.bulkItems.mockClear();

      const response = await bulkCopy({ itemIds: idsOf(501) });

      expect(reference.body.details).toEqual([
        expect.objectContaining({ path: 'itemIds', code: 'too_small' }),
      ]);
      expectLimitRejection(response, reference, '数量項目は500件以内で選択してください', 'itemIds');
      expect(scopeSpies.bulkItems).not.toHaveBeenCalled();
      expect(mockService.bulkCopy).not.toHaveBeenCalled();
    });

    it('一括移動は上限ちょうどなら要素の判定とサービスへ渡す', async () => {
      mockService.bulkMove.mockResolvedValue(undefined);

      const response = await bulkMove({ itemIds: idsOf(500), targetGroupId });

      expect(response.status).toBe(204);
      expect(scopeSpies.bulkItems).toHaveBeenCalledTimes(1);
      expect(mockService.bulkMove).toHaveBeenCalledTimes(1);
      expect(mockService.bulkMove.mock.calls[0]![0]).toHaveLength(500);
    });

    it('一括移動が上限を1件超えると400で上限を示し、要素の判定とサービスを呼ばない', async () => {
      const reference = await bulkMove({ itemIds: [], targetGroupId });
      scopeSpies.bulkItems.mockClear();

      const response = await bulkMove({ itemIds: idsOf(501), targetGroupId });

      expectLimitRejection(response, reference, '数量項目は500件以内で選択してください', 'itemIds');
      expect(scopeSpies.bulkItems).not.toHaveBeenCalled();
      expect(mockService.bulkMove).not.toHaveBeenCalled();
    });
  });
});
