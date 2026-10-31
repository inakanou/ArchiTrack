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
 * - REQ-49.3: 転記・案分・利益率・諸経費行追加・値引き行追加はデータベースへ書き込まない
 * - REQ-49.5: これらの操作の実行後の保存で競合エラーを発生させない
 *
 * 転記系5経路のハンドラのテストは、経路を撤去した（Task 55.7）ことに伴い削除した。
 * 各経路が担っていた振る舞いの移行先は次のとおり:
 * - 受領見積書転記 → `frontend/.../estimateEditReducer.test.ts` の `applyQuotationTransfer`
 * - NET金額案分 → 同 `applyNetAllocation` と `estimateCalculations.test.ts` の `allocateNet`
 * - 利益率適用 → 同 `applyProfitRate` と `estimateCalculations.test.ts` の `applyProfitRate`
 *   （利益率の範囲エラー REQ-13.3 は `ProfitRateDialog.test.tsx` の
 *   `利益率の範囲エラー (13.3)`）
 * - 諸経費行追加 → 同 `addOverheadItem`
 * - 値引き行追加 → 同「プリセット値の値引き行をルートレベルの末尾に追加する」
 * 撤去そのものは本ファイルの `撤去済みエンドポイント (REQ-42.1, REQ-49.3)` が固定する。
 *
 * Task 4.1: 見積書CRUD APIエンドポイントの実装
 * Task 4.2: 見積項目CRUD APIエンドポイントの実装
 * Task 55.7: 転記系エンドポイントの撤去
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
  mockGetHierarchy,
  mockCalculateCommonTemporaryCost,
  mockCalculateSiteManagementCost,
  mockCalculateGeneralAdminCost,
  mockCreateLog,
  mockRequirePermission,
  mockState,
  mockPrismaTransaction,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByProjectId: vi.fn(),
  mockFindLatestByProjectId: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockGetHierarchy: vi.fn(),
  mockCalculateCommonTemporaryCost: vi.fn(),
  mockCalculateSiteManagementCost: vi.fn(),
  mockCalculateGeneralAdminCost: vi.fn(),
  mockCreateLog: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockState: { shouldRejectPermission: false },
  mockPrismaTransaction: vi.fn(),
}));

// Mock dependencies before importing the routes
// 案件の閲覧範囲の判定部品は素通りさせる（判定と経路への適用は estimate-creation-project-scope.middleware.test.ts と
// 統合テストが確かめる。estimate-creation タスク62.1）
vi.mock('../../../middleware/estimate-creation-project-scope.middleware.js', () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    requireProjectParamScope: pass,
    requireEstimateProjectScope: pass,
  };
});

vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    $transaction: mockPrismaTransaction,
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
    getHierarchy = mockGetHierarchy;
  },
}));

vi.mock('../../../services/overhead-cost.service.js', () => ({
  OverheadCostService: class {
    calculateCommonTemporaryCost = mockCalculateCommonTemporaryCost;
    calculateSiteManagementCost = mockCalculateSiteManagementCost;
    calculateGeneralAdminCost = mockCalculateGeneralAdminCost;
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
} from '../../../errors/estimateError.js';
import { ProjectNotFoundError } from '../../../errors/projectError.js';
import { ValidationError } from '../../../errors/apiError.js';
import { EstimateDraftService } from '../../../services/estimate-draft.service.js';
import { saveEstimateDraftSchema } from '../../../schemas/estimate.schema.js';

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
        'test-user-id',
        // 内訳書の所属の照合で範囲外とした拒否の記録に添える要求の識別（タスク62.1、57.4）
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining(`/api/projects/${projectId}/estimates`),
        })
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
        'test-user-id',
        expect.objectContaining({ method: 'POST' })
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
    // 楽観的排他制御の基準時刻はクエリで受け取る（HTTP は DELETE の本文に意味を定めず、中継で落ちうるため。
    // 画面の deleteEstimate もクエリで送る。2026-10-30 の是正、estimate-creation の Requirement 11.4・11.6）
    const validDeleteQuery = {
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('クエリの updatedAt で見積書を削除できること', async () => {
      mockDelete.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .query(validDeleteQuery);

      expect(response.status).toBe(204);
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledWith(
        validUUID,
        expect.any(String),
        new Date(validDeleteQuery.updatedAt)
      );
    });

    it('updatedAt を本文だけに載せた要求は 400 を返し、削除しないこと', async () => {
      mockDelete.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .send(validDeleteQuery);

      expect(response.status).toBe(400);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('クエリの updatedAt の形式が不正なら 400 を返し、削除しないこと', async () => {
      mockDelete.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .query({ updatedAt: 'not-a-date' });

      expect(response.status).toBe(400);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('見積書が存在しない場合は404を返すこと', async () => {
      mockDelete.mockRejectedValue(new EstimateNotFoundError(validUUID));

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .query(validDeleteQuery);

      expect(response.status).toBe(404);
    });

    it('楽観的排他制御エラーの場合は409を返すこと', async () => {
      mockDelete.mockRejectedValue(new EstimateConflictError());

      const response = await request(app)
        .delete(`/api/estimates/${validUUID}`)
        .query(validDeleteQuery);

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

  // ==========================================
  // 撤去済みエンドポイント（Task 53.12 / 55.7 / 56.10, REQ-42.1, REQ-49.3, REQ-10.1, REQ-10.2）
  // ==========================================

  /**
   * 明細の追加・削除・複写・一括更新・並び替え・階層移動は
   * `PUT /api/estimates/:id/save`（一括保存）へ統合したため、旧6経路は存在しない。
   *
   * 受領見積書転記・NET金額案分・利益率適用・諸経費行追加・値引き行追加の5経路も、
   * クライアントの `estimateCalculations` と `estimateEditReducer` による
   * 編集状態への反映へ移したため存在しない（Task 55.7）。この撤去自体が
   * 49.3（実行時点でデータベースへ書き込まない）と 49.5（後続の保存で競合させない）の
   * 成立条件であり、経路が復活すれば `Estimate.updatedAt` を進める書き込みも復活する。
   *
   * 見積書出力 `GET /:id/export` も、帳票（PDF）と表計算（Excel）の生成を
   * クライアントの `EstimatePdfExportService` / `EstimateExcelExportService` へ
   * 移したため存在しない（Task 56.10）。経路が残っていれば「出力にサーバーが
   * 関与しない」が破れ、未保存の変更を含む出力（REQ-56.1〜56.3）が
   * サーバー側の保存済みデータで上書きされうる。
   *
   * 「経路が無いこと」は個々のハンドラのテストでは表現できないため、
   * ルーターへ要求を投げて**見つからない応答**になることで固定する。
   * あわせて、維持対象の経路が巻き添えで消えていないこと
   * （過剰撤去の検出）も同じ観点で固定する。
   *
   * Requirements (estimate-creation):
   * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
   * - REQ-10.2: Excel出力を選択した場合、同じ書式規則のExcelファイルを生成する
   * - REQ-42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
   * - REQ-49.3: これらの操作は実行の時点でデータベースへの書き込みを行わない
   * - REQ-49.5: これらの操作の実行後に保存操作を行っても競合エラーを発生させない
   */
  describe('撤去済みエンドポイント (REQ-42.1, REQ-49.3, REQ-10.1, REQ-10.2)', () => {
    const anotherItemId = '550e8400-e29b-41d4-a716-446655440009';
    const receivedQuotationId = '550e8400-e29b-41d4-a716-446655440007';
    const lineItemId = '550e8400-e29b-41d4-a716-446655440008';

    /** 明細操作系6経路（Task 53.12, REQ-42.1） */
    const removedItemRoutes: Array<{ name: string; send: () => request.Test }> = [
      {
        name: 'POST /api/estimates/:id/items',
        send: () =>
          request(app)
            .post(`/api/estimates/${validUUID}/items`)
            .send({ displayOrder: 0, lines: [{ lineType: 'ESTIMATE' }] }),
      },
      {
        name: 'DELETE /api/estimates/:id/items/:itemId',
        send: () =>
          request(app)
            .delete(`/api/estimates/${validUUID}/items/${estimateItemId}`)
            .send({ forceDelete: true }),
      },
      {
        name: 'POST /api/estimates/:id/items/:itemId/duplicate',
        send: () =>
          request(app).post(`/api/estimates/${validUUID}/items/${estimateItemId}/duplicate`),
      },
      {
        name: 'PUT /api/estimates/:id/items/batch',
        send: () =>
          request(app)
            .put(`/api/estimates/${validUUID}/items/batch`)
            .send({ items: [], updatedAt: '2024-01-01T00:00:00.000Z' }),
      },
      {
        name: 'PUT /api/estimates/:id/items/reorder',
        send: () =>
          request(app)
            .put(`/api/estimates/${validUUID}/items/reorder`)
            .send({ itemOrders: [{ id: estimateItemId, displayOrder: 0 }] }),
      },
      {
        name: 'PATCH /api/estimates/:id/items/:itemId/move',
        send: () =>
          request(app)
            .patch(`/api/estimates/${validUUID}/items/${estimateItemId}/move`)
            .send({ newParentId: anotherItemId }),
      },
    ];

    /**
     * 転記系5経路（Task 55.7, REQ-49.3）
     *
     * ペイロードは撤去前のスキーマを満たす正当な内容にする。形式不正で 400 に
     * なったものを「経路が無い」と読み違えないようにするため。
     */
    const removedTransferRoutes: Array<{ name: string; send: () => request.Test }> = [
      {
        name: 'POST /api/estimates/:id/transfer-quotation',
        send: () =>
          request(app)
            .post(`/api/estimates/${validUUID}/transfer-quotation`)
            .send({ receivedQuotationId, lineItemIds: [lineItemId] }),
      },
      {
        name: 'POST /api/estimates/:id/calculate-net',
        send: () =>
          request(app)
            .post(`/api/estimates/${validUUID}/calculate-net`)
            .send({
              vendorName: 'テスト業者',
              targetLineIds: [estimateItemId],
              excludeLineIds: [],
              netAmount: '8000',
            }),
      },
      {
        name: 'POST /api/estimates/:id/apply-profit-rate',
        send: () =>
          request(app)
            .post(`/api/estimates/${validUUID}/apply-profit-rate`)
            .send({ profitRate: '10', overwriteOption: 'all' }),
      },
      {
        name: 'POST /api/estimates/:id/overhead-items',
        send: () =>
          request(app)
            .post(`/api/estimates/${validUUID}/overhead-items`)
            .send({ costType: 'COMMON_TEMPORARY' }),
      },
      {
        name: 'POST /api/estimates/:id/discount-items',
        send: () =>
          request(app)
            .post(`/api/estimates/${validUUID}/discount-items`)
            .send({ unitPrice: -1000 }),
      },
    ];

    /**
     * 出力系1経路（Task 56.10, REQ-10.1, REQ-10.2）
     *
     * クエリは撤去前のスキーマを満たす正当な内容にする（`format` は必須だった）。
     * 形式不正の 400 を「経路が無い」と読み違えないようにするため。
     */
    const removedExportRoutes: Array<{ name: string; send: () => request.Test }> = [
      {
        name: 'GET /api/estimates/:id/export',
        send: () =>
          request(app).get(
            `/api/estimates/${validUUID}/export?format=pdf&lineTypes=ESTIMATE,EXECUTION`
          ),
      },
    ];

    const removedRoutes = [...removedItemRoutes, ...removedTransferRoutes, ...removedExportRoutes];

    it.each(removedRoutes)('$name が見つからない応答を返すこと', async ({ send }) => {
      const response = await send();

      expect(response.status).toBe(404);
    });

    /**
     * 撤去した12経路がデータベースへ到達しないこと（REQ-49.3, REQ-49.5, REQ-10.1, REQ-10.2）
     *
     * `$transaction` は撤去前の案分・利益率適用が `Estimate.updatedAt` を
     * 進めていた経路そのもの。ここが呼ばれれば 49.5（後続の保存で競合しない）が破れる。
     * `getHierarchy` は撤去前の出力経路が明細ツリーを読み出していた入口でもあり、
     * ここが呼ばれれば出力がサーバー側の保存済みデータを見ていることになる。
     */
    it('撤去した経路がサービス・データベースの呼び出しに到達しないこと (REQ-49.3, REQ-49.5)', async () => {
      for (const route of removedRoutes) {
        await route.send();
      }

      expect(mockPrismaTransaction).not.toHaveBeenCalled();
      expect(mockGetHierarchy).not.toHaveBeenCalled();
    });

    /**
     * 過剰撤去の検出。書き込みを伴わない `POST /:id/calculate-overhead` は
     * 撤去対象ではない（撤去した書き込み経路 `POST /:id/overhead-items` との
     * 取り違えを防ぐ）。応答の中身ではなく「経路が解決されること」だけを見る。
     */
    const keptRoutes: Array<{ name: string; send: () => request.Test }> = [
      {
        name: 'POST /api/estimates/:id/calculate-overhead',
        send: () => request(app).post(`/api/estimates/${validUUID}/calculate-overhead`).send({}),
      },
      {
        name: 'PUT /api/estimates/:id/save',
        send: () => request(app).put(`/api/estimates/${validUUID}/save`).send({}),
      },
    ];

    it.each(keptRoutes)('$name は撤去されていないこと', async ({ send }) => {
      const response = await send();

      expect(response.status).not.toBe(404);
    });

    it('見積項目の参照経路 GET /api/estimates/:id/items は維持されること', async () => {
      mockGetHierarchy.mockResolvedValue(mockEstimateDetail.items);

      const response = await request(app).get(`/api/estimates/${validUUID}/items`);

      expect(response.status).toBe(200);
      expect(mockGetHierarchy).toHaveBeenCalledWith(validUUID);
    });
  });

  /**
   * 構造の不備だけで 422 となる要求でも、本文の形が正しい限り属さない見積項目の ID の範囲外の判定を通し、
   * 形式の不正の 400 では判定しない（タスク66.1。design.md の「2026-10-31 の追加」章の「決定」）。
   * 判定と記録の中身はサービスの単体テストと閲覧範囲の統合テストが確かめる。
   *
   * @requirement estimate-creation/REQ-57.11
   */
  describe('PUT /api/estimates/:id/save の構造の不備の 422 の分岐の範囲外の判定', () => {
    const duplicatedId = '550e8400-e29b-41d4-a716-446655440066';
    const saveNode = (id: string | null, tempId: string | null): Record<string, unknown> => ({
      id,
      tempId,
      itemType: 'STANDARD',
      lines: [
        {
          lineType: 'ESTIMATE',
          name: '項目',
          specification: null,
          unit: null,
          quantity: null,
          unitPrice: null,
          amount: null,
          remarks: null,
          sourceVendorName: null,
        },
      ],
      children: [],
    });
    const body = (expectedUpdatedAt: string): Record<string, unknown> => ({
      expectedUpdatedAt,
      reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
      // 同じ既存 ID の重複配置（構造の不備）
      items: [saveNode(duplicatedId, null), saveNode(duplicatedId, null)],
    });

    let recordSpy: ReturnType<typeof vi.spyOn>;
    let statusApp: express.Express;

    beforeEach(() => {
      recordSpy = vi
        .spyOn(EstimateDraftService.prototype, 'recordForeignItemScopeDenials')
        .mockResolvedValue(undefined);
      statusApp = express();
      statusApp.use(express.json());
      statusApp.use('/api/estimates', estimatesRoutes);
      statusApp.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        res.status(status).json({ code: (err as { code?: string }).code ?? null });
      });
    });

    afterEach(() => {
      recordSpy.mockRestore();
    });

    it('構造の不備だけの 422 では、本文の明細ツリーと実行者と要求の識別を渡して判定の処理を呼ぶ', async () => {
      const response = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body('2026-10-31T00:00:00.000Z'));

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy).toHaveBeenCalledWith(
        validUUID,
        [
          expect.objectContaining({ id: duplicatedId }),
          expect.objectContaining({ id: duplicatedId }),
        ],
        'test-user-id',
        expect.objectContaining({ method: 'PUT', path: `/api/estimates/${validUUID}/save` })
      );
    });

    it('形式の不正を含む 400 では判定の処理を呼ばない', async () => {
      const response = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body('日時ではない'));

      expect(response.status).toBe(400);
      expect(recordSpy).not.toHaveBeenCalled();
    });
  });
  /**
   * 一括保存の本文の見積項目の総数と階層の深さの前倒しの数え上げ（タスク67.1）
   *
   * 総数の上限（2000）か深さの上限（100段）を超えた本文は、Zod の検証とサービスの保存を呼ばずに
   * 従来の 422 の形で拒む。読んだ節点の ID で 57.11 の判定の処理を呼ぶ（B 案）。
   *
   * @requirement estimate-creation/REQ-42.10
   * @requirement estimate-creation/REQ-42.12
   */
  describe('PUT /api/estimates/:id/save の総数と深さの前倒しの数え上げ', () => {
    const foreignId = '550e8400-e29b-41d4-a716-446655440077';
    const saveNode = (
      children: unknown[] = [],
      id: string | null = null,
      tempId: string | null = 'tmp'
    ): Record<string, unknown> => ({
      id,
      tempId,
      itemType: 'STANDARD',
      lines: [
        {
          lineType: 'ESTIMATE',
          name: '項目',
          specification: null,
          unit: null,
          quantity: null,
          unitPrice: null,
          amount: null,
          remarks: null,
          sourceVendorName: null,
        },
      ],
      children,
    });
    const body = (items: unknown[], expectedUpdatedAt = '2026-10-31T00:00:00.000Z') => ({
      expectedUpdatedAt,
      reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
      items,
    });
    const chain = (depth: number): Record<string, unknown> => {
      let current = saveNode([], null, `tmp-${depth}`);
      for (let level = depth - 1; level >= 1; level -= 1) {
        current = saveNode([current], null, `tmp-${level}`);
      }
      return current;
    };

    let recordIdsSpy: ReturnType<typeof vi.spyOn>;
    let recordTreeSpy: ReturnType<typeof vi.spyOn>;
    let saveDraftSpy: ReturnType<typeof vi.spyOn>;
    let safeParseSpy: ReturnType<typeof vi.spyOn>;
    let statusApp: express.Express;

    beforeEach(() => {
      recordIdsSpy = vi
        .spyOn(EstimateDraftService.prototype, 'recordForeignItemIdScopeDenials')
        .mockResolvedValue(undefined);
      recordTreeSpy = vi
        .spyOn(EstimateDraftService.prototype, 'recordForeignItemScopeDenials')
        .mockResolvedValue(undefined);
      saveDraftSpy = vi
        .spyOn(EstimateDraftService.prototype, 'saveDraft')
        .mockRejectedValue(new Error('saveDraft は呼ばれない想定'));
      safeParseSpy = vi.spyOn(saveEstimateDraftSchema, 'safeParse');
      statusApp = express();
      statusApp.use(express.json({ limit: '5mb' }));
      statusApp.use('/api/estimates', estimatesRoutes);
      statusApp.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        const apiErr = err as { statusCode?: number; code?: string; details?: unknown };
        res.status(apiErr.statusCode ?? 500).json({
          code: apiErr.code ?? null,
          message: err.message,
          details: apiErr.details ?? null,
        });
      });
    });

    afterEach(() => {
      recordIdsSpy.mockRestore();
      recordTreeSpy.mockRestore();
      saveDraftSpy.mockRestore();
      safeParseSpy.mockRestore();
    });

    it('総数が 2001 件の本文は、Zod の検証とサービスの保存を呼ばずに件数の上限の 422 になる', async () => {
      const response = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body(Array.from({ length: 2001 }, (_, index) => saveNode([], null, `tmp-${index}`))));

      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        code: 'ESTIMATE_DRAFT_VALIDATION_ERROR',
        message: '見積明細の入力内容に不備があるため保存できません',
        details: {
          issues: [{ path: 'items', message: '見積明細は合計2000件以内で保存してください' }],
        },
      });
      expect(safeParseSpy).not.toHaveBeenCalled();
      expect(saveDraftSpy).not.toHaveBeenCalled();
      expect(recordTreeSpy).not.toHaveBeenCalled();
    });

    it('深さ 101 段の本文は、Zod の検証とサービスの保存を呼ばずに深さの上限の 422 になる', async () => {
      const response = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body([chain(101)]));

      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        code: 'ESTIMATE_DRAFT_VALIDATION_ERROR',
        message: '見積明細の入力内容に不備があるため保存できません',
        details: {
          issues: [{ path: 'items', message: '見積項目の階層は100段以内で保存してください' }],
        },
      });
      expect(safeParseSpy).not.toHaveBeenCalled();
      expect(saveDraftSpy).not.toHaveBeenCalled();
    });

    it('上限を超え、形式の不正も併せて含む本文も 422 になる（従来は 400）', async () => {
      const items = Array.from({ length: 2001 }, (_, index) => saveNode([], null, `tmp-${index}`));
      const response = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body(items, '日時ではない'));

      expect(response.status).toBe(422);
      expect(response.body.details.issues).toEqual([
        { path: 'items', message: '見積明細は合計2000件以内で保存してください' },
      ]);
      expect(safeParseSpy).not.toHaveBeenCalled();
    });

    it('打ち切った本文でも、読んだ節点の ID と実行者と要求の識別で 57.11 の判定の処理を呼ぶ', async () => {
      const items = [
        saveNode([], foreignId, null),
        ...Array.from({ length: 2000 }, (_, index) => saveNode([], null, `tmp-${index}`)),
      ];
      const response = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body(items));

      expect(response.status).toBe(422);
      expect(recordIdsSpy).toHaveBeenCalledTimes(1);
      expect(recordIdsSpy).toHaveBeenCalledWith(
        validUUID,
        [foreignId],
        'test-user-id',
        expect.objectContaining({ method: 'PUT', path: `/api/estimates/${validUUID}/save` })
      );
    });

    it('上限ちょうど（2000 件・100 段）の本文は従来どおり Zod の検証へ進み、打ち切りの判定を呼ばない', async () => {
      saveDraftSpy.mockRejectedValue(Object.assign(new Error('到達'), { statusCode: 418 }));
      const flatResponse = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body(Array.from({ length: 2000 }, (_, index) => saveNode([], null, `tmp-${index}`))));
      const deepResponse = await request(statusApp)
        .put(`/api/estimates/${validUUID}/save`)
        .send(body([chain(100)]));

      expect(flatResponse.status).toBe(418);
      expect(deepResponse.status).toBe(418);
      expect(safeParseSpy).toHaveBeenCalledTimes(2);
      expect(saveDraftSpy).toHaveBeenCalledTimes(2);
      expect(recordIdsSpy).not.toHaveBeenCalled();
    });
  });
});
