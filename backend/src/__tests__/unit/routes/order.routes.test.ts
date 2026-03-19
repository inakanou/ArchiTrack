/**
 * @fileoverview 発注ルート ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 3.3: 発注のルーター実装
 *
 * Requirements:
 * - 17.3: 発注の閲覧をVIEWER以上のロールに許可する / 発注の作成・編集・削除をEDITOR以上のロールに許可する
 * - 19.3: 発注のCRUD操作にRESTful APIを提供する
 * - 19.9: APIレスポンスに適切なHTTPステータスコードを返却する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  OrderNotFoundError,
  OrderEditBlockedError,
  OrderDeletionBlockedError,
  ExecutionBudgetNotFoundForOrderError,
  ConfirmedAmountRequiredError,
  InvalidOrderStatusTransitionError,
  NoCheckedItemsError,
} from '../../../errors/orderError.js';

// vi.hoistedでモック関数を定義
const {
  mockCreate,
  mockFindByExecutionBudgetId,
  mockGetWithItems,
  mockUpdate,
  mockUpdateItems,
  mockUpdateStatus,
  mockCancelOrder,
  mockDelete,
  mockFindByProjectId,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindByExecutionBudgetId: vi.fn(),
  mockGetWithItems: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateItems: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockCancelOrder: vi.fn(),
  mockDelete: vi.fn(),
  mockFindByProjectId: vi.fn(),
}));

// 依存モジュールのモック
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/order.service.js', () => ({
  OrderService: class {
    create = mockCreate;
    findByExecutionBudgetId = mockFindByExecutionBudgetId;
    getWithItems = mockGetWithItems;
    update = mockUpdate;
    updateItems = mockUpdateItems;
    updateStatus = mockUpdateStatus;
    cancelOrder = mockCancelOrder;
    delete = mockDelete;
  },
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
import orderRoutes from '../../../routes/order.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const executionBudgetId = '550e8400-e29b-41d4-a716-446655440030';
const orderId = '550e8400-e29b-41d4-a716-446655440040';
const tradingPartnerId = '550e8400-e29b-41d4-a716-446655440050';

const mockOrderCreateResult = {
  id: orderId,
  executionBudgetId,
  tradingPartnerId,
  status: 'BEFORE_ORDER',
  confirmedAmount: null,
  version: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const mockOrderSummaryList = [
  {
    id: orderId,
    executionBudgetId,
    tradingPartnerId,
    tradingPartnerName: 'テスト取引先',
    status: 'BEFORE_ORDER',
    confirmedAmount: null,
    checkedItemCount: 3,
    totalExecutionAmount: '300000',
    version: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
];

const mockOrderWithItems = {
  id: orderId,
  executionBudgetId,
  tradingPartnerId,
  tradingPartnerName: 'テスト取引先',
  status: 'BEFORE_ORDER',
  confirmedAmount: null,
  version: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  items: [
    {
      id: '550e8400-e29b-41d4-a716-446655440060',
      executionBudgetItemId: '550e8400-e29b-41d4-a716-446655440070',
      checked: true,
      orderAmount: null,
      name: 'テスト項目1',
      specification: '規格A',
      unit: '式',
      quantity: '1',
      executionUnitPrice: '100000',
      executionAmount: '100000',
    },
  ],
  totalExecutionAmount: '100000',
};

const mockUpdateResult = {
  id: orderId,
  tradingPartnerId,
  status: 'BEFORE_ORDER',
  confirmedAmount: null,
  version: 1,
};

const mockStatusUpdateResult = {
  id: orderId,
  tradingPartnerId,
  status: 'ORDERED',
  confirmedAmount: '500000',
  version: 2,
};

const mockBudgetData = {
  id: executionBudgetId,
  projectId,
};

// テスト用Expressアプリ
function createTestApp() {
  const app = express();
  app.use(express.json());

  // 発注ルートは実行予算のサブルートとしてマウント
  app.use('/api/projects/:projectId/execution-budget/orders', orderRoutes);

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
        detail: err.message,
      });
    }
  );

  return app;
}

describe('発注ルート', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // デフォルトで実行予算が存在する前提
    mockFindByProjectId.mockResolvedValue(mockBudgetData);
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/orders - 発注一覧取得
  // Requirements: 17.3, 19.3, 19.9
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/orders', () => {
    it('発注一覧を取得できること（200 OK）', async () => {
      mockFindByExecutionBudgetId.mockResolvedValue(mockOrderSummaryList);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/orders`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(orderId);
      expect(res.body[0].tradingPartnerName).toBe('テスト取引先');
      expect(res.body[0].checkedItemCount).toBe(3);
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId);
      expect(mockFindByExecutionBudgetId).toHaveBeenCalledWith(executionBudgetId);
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      await request(app).get(`/api/projects/${projectId}/execution-budget/orders`).expect(404);
    });
  });

  // =================================================================
  // POST /api/projects/:projectId/execution-budget/orders - 発注作成
  // Requirements: 17.3, 19.3, 19.9
  // =================================================================
  describe('POST /api/projects/:projectId/execution-budget/orders', () => {
    it('発注を作成できること（201 Created）', async () => {
      mockCreate.mockResolvedValue(mockOrderCreateResult);

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget/orders`)
        .send({ tradingPartnerId })
        .expect(201);

      expect(res.body.id).toBe(orderId);
      expect(res.body.status).toBe('BEFORE_ORDER');
      expect(mockCreate).toHaveBeenCalledWith(executionBudgetId, tradingPartnerId);
    });

    it('tradingPartnerIdが不正な形式で400エラーが返ること', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/execution-budget/orders`)
        .send({ tradingPartnerId: 'invalid-uuid' })
        .expect(400);
    });

    it('tradingPartnerIdが未指定で400エラーが返ること', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/execution-budget/orders`)
        .send({})
        .expect(400);
    });

    it('実行予算が存在しない場合404エラーが返ること', async () => {
      mockFindByProjectId.mockResolvedValue(null);

      await request(app)
        .post(`/api/projects/${projectId}/execution-budget/orders`)
        .send({ tradingPartnerId })
        .expect(404);
    });

    it('サービスがExecutionBudgetNotFoundForOrderErrorを返した場合404エラーが返ること', async () => {
      mockCreate.mockRejectedValue(new ExecutionBudgetNotFoundForOrderError());

      const res = await request(app)
        .post(`/api/projects/${projectId}/execution-budget/orders`)
        .send({ tradingPartnerId })
        .expect(404);

      expect(res.body.status).toBe(404);
    });
  });

  // =================================================================
  // GET /api/projects/:projectId/execution-budget/orders/:orderId - 発注詳細取得
  // Requirements: 17.3, 19.3, 19.9
  // =================================================================
  describe('GET /api/projects/:projectId/execution-budget/orders/:orderId', () => {
    it('発注詳細を取得できること（200 OK）', async () => {
      mockGetWithItems.mockResolvedValue(mockOrderWithItems);

      const res = await request(app)
        .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .expect(200);

      expect(res.body.id).toBe(orderId);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.totalExecutionAmount).toBe('100000');
      expect(mockGetWithItems).toHaveBeenCalledWith(orderId);
    });

    it('発注が存在しない場合404エラーが返ること', async () => {
      mockGetWithItems.mockResolvedValue(null);

      await request(app)
        .get(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .expect(404);
    });
  });

  // =================================================================
  // PATCH /api/projects/:projectId/execution-budget/orders/:orderId - 発注編集
  // Requirements: 17.3, 19.3, 19.9
  // =================================================================
  describe('PATCH /api/projects/:projectId/execution-budget/orders/:orderId', () => {
    it('取引先を変更できること（200 OK）', async () => {
      const newPartnerId = '550e8400-e29b-41d4-a716-446655440099';
      mockUpdate.mockResolvedValue({
        ...mockUpdateResult,
        tradingPartnerId: newPartnerId,
      });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .send({ tradingPartnerId: newPartnerId })
        .expect(200);

      expect(res.body.tradingPartnerId).toBe(newPartnerId);
      expect(mockUpdate).toHaveBeenCalledWith(orderId, {
        tradingPartnerId: newPartnerId,
      });
    });

    it('確定発注金額を変更できること（200 OK）', async () => {
      mockUpdate.mockResolvedValue({
        ...mockUpdateResult,
        confirmedAmount: '500000',
      });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .send({ confirmedAmount: '500000' })
        .expect(200);

      expect(res.body.confirmedAmount).toBe('500000');
    });

    it('発注が存在しない場合404エラーが返ること', async () => {
      mockUpdate.mockRejectedValue(new OrderNotFoundError());

      await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .send({ confirmedAmount: '500000' })
        .expect(404);
    });

    it('発注済みの場合422エラーが返ること', async () => {
      mockUpdate.mockRejectedValue(new OrderEditBlockedError());

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .send({ confirmedAmount: '500000' })
        .expect(422);

      expect(res.body.status).toBe(422);
    });
  });

  // =================================================================
  // PUT /api/projects/:projectId/execution-budget/orders/:orderId/items - 項目更新
  // Requirements: 17.3, 19.3, 19.9
  // =================================================================
  describe('PUT /api/projects/:projectId/execution-budget/orders/:orderId/items', () => {
    const itemIds = [
      '550e8400-e29b-41d4-a716-446655440070',
      '550e8400-e29b-41d4-a716-446655440071',
    ];

    it('項目のチェック状態を更新できること（200 OK）', async () => {
      mockUpdateItems.mockResolvedValue(mockOrderWithItems);

      const res = await request(app)
        .put(`/api/projects/${projectId}/execution-budget/orders/${orderId}/items`)
        .send({ itemIds })
        .expect(200);

      expect(res.body.id).toBe(orderId);
      expect(res.body.items).toBeDefined();
      expect(mockUpdateItems).toHaveBeenCalledWith(orderId, itemIds);
    });

    it('itemIdsの形式が不正な場合400エラーが返ること', async () => {
      await request(app)
        .put(`/api/projects/${projectId}/execution-budget/orders/${orderId}/items`)
        .send({ itemIds: ['invalid-uuid'] })
        .expect(400);
    });

    it('発注が存在しない場合404エラーが返ること', async () => {
      mockUpdateItems.mockRejectedValue(new OrderNotFoundError());

      await request(app)
        .put(`/api/projects/${projectId}/execution-budget/orders/${orderId}/items`)
        .send({ itemIds })
        .expect(404);
    });

    it('発注済みの場合422エラーが返ること', async () => {
      mockUpdateItems.mockRejectedValue(new OrderEditBlockedError());

      const res = await request(app)
        .put(`/api/projects/${projectId}/execution-budget/orders/${orderId}/items`)
        .send({ itemIds })
        .expect(422);

      expect(res.body.status).toBe(422);
    });
  });

  // =================================================================
  // PATCH /api/projects/:projectId/execution-budget/orders/:orderId/status - ステータス変更
  // Requirements: 17.3, 19.3, 19.9
  // =================================================================
  describe('PATCH /api/projects/:projectId/execution-budget/orders/:orderId/status', () => {
    it('ステータスをUNDER_REVIEWに変更できること（200 OK）', async () => {
      mockUpdateStatus.mockResolvedValue({
        ...mockUpdateResult,
        status: 'UNDER_REVIEW',
      });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}/status`)
        .send({ status: 'UNDER_REVIEW' })
        .expect(200);

      expect(res.body.status).toBe('UNDER_REVIEW');
      expect(mockUpdateStatus).toHaveBeenCalledWith(orderId, 'UNDER_REVIEW', undefined);
    });

    it('ステータスをORDEREDに変更できること（確定金額あり）（200 OK）', async () => {
      mockUpdateStatus.mockResolvedValue(mockStatusUpdateResult);

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}/status`)
        .send({ status: 'ORDERED', confirmedAmount: '500000' })
        .expect(200);

      expect(res.body.status).toBe('ORDERED');
      expect(res.body.confirmedAmount).toBe('500000');
      expect(mockUpdateStatus).toHaveBeenCalledWith(orderId, 'ORDERED', '500000');
    });

    it('ステータスをCANCELLEDに変更すると取消処理が実行されること（200 OK）', async () => {
      mockCancelOrder.mockResolvedValue({
        id: orderId,
        tradingPartnerId,
        status: 'CANCELLED',
        confirmedAmount: null,
        version: 3,
      });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}/status`)
        .send({ status: 'CANCELLED' })
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
      expect(mockCancelOrder).toHaveBeenCalledWith(orderId);
    });

    it('無効なステータスで400エラーが返ること', async () => {
      await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}/status`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);
    });

    it('確定発注金額未入力でORDERED変更時422エラーが返ること', async () => {
      mockUpdateStatus.mockRejectedValue(new ConfirmedAmountRequiredError());

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}/status`)
        .send({ status: 'ORDERED' })
        .expect(422);

      expect(res.body.status).toBe(422);
    });

    it('無効なステータス遷移で422エラーが返ること', async () => {
      mockUpdateStatus.mockRejectedValue(new InvalidOrderStatusTransitionError());

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}/status`)
        .send({ status: 'ORDERED', confirmedAmount: '500000' })
        .expect(422);

      expect(res.body.status).toBe(422);
    });

    it('チェック済み項目がない場合422エラーが返ること', async () => {
      mockUpdateStatus.mockRejectedValue(new NoCheckedItemsError());

      const res = await request(app)
        .patch(`/api/projects/${projectId}/execution-budget/orders/${orderId}/status`)
        .send({ status: 'ORDERED', confirmedAmount: '500000' })
        .expect(422);

      expect(res.body.status).toBe(422);
    });
  });

  // =================================================================
  // DELETE /api/projects/:projectId/execution-budget/orders/:orderId - 発注削除
  // Requirements: 17.3, 19.3, 19.9
  // =================================================================
  describe('DELETE /api/projects/:projectId/execution-budget/orders/:orderId', () => {
    it('発注を削除できること（204 No Content）', async () => {
      mockDelete.mockResolvedValue(undefined);

      await request(app)
        .delete(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .expect(204);

      expect(mockDelete).toHaveBeenCalledWith(orderId);
    });

    it('発注が存在しない場合404エラーが返ること', async () => {
      mockDelete.mockRejectedValue(new OrderNotFoundError());

      await request(app)
        .delete(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .expect(404);
    });

    it('発注済みの場合422エラーが返ること', async () => {
      mockDelete.mockRejectedValue(new OrderDeletionBlockedError());

      const res = await request(app)
        .delete(`/api/projects/${projectId}/execution-budget/orders/${orderId}`)
        .expect(422);

      expect(res.body.status).toBe(422);
    });
  });
});
