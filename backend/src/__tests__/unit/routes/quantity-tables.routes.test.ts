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

// ストレージプロバイダをモックし、署名付きURL変換を決定論的に検証可能にする。
// getSignedUrl は `/api/storage/` プレフィックス除去後のパスから署名付きURLを生成する。
vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: vi.fn(() => true),
  getStorageProvider: vi.fn(() => ({
    getSignedUrl: vi.fn(async (key: string) => `https://signed.example.com/${key}?sig=test`),
  })),
}));

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
    copy: Mock;
    saveDraft: Mock;
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
      copy: vi.fn(),
      saveDraft: vi.fn(),
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
        copy = mockService.copy;
        saveDraft = mockService.saveDraft;
      },
    }));

    vi.doMock('../../../middleware/authenticate.middleware.js', () => ({
      authenticate: mockAuthenticate,
    }));

    vi.doMock('../../../middleware/authorize.middleware.js', () => ({
      requirePermission: mockRequirePermission,
    }));

    vi.doMock('../../../storage/index.js', () => ({
      isStorageConfigured: vi.fn(() => true),
      getStorageProvider: vi.fn(() => ({
        getSignedUrl: vi.fn(async (key: string) => `https://signed.example.com/${key}?sig=test`),
      })),
    }));

    // Import route after mocks are setup
    const { default: quantityTablesRoutes } =
      await import('../../../routes/quantity-tables.routes.js');

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
      const { ProjectNotFoundForQuantityTableError } =
        await import('../../../errors/quantityTableError.js');
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

  /**
   * Task 20.2: 数量表コピーAPIエンドポイントテスト
   *
   * Requirements:
   * - 17.2: コピーダイアログで数量表名を入力して作成を確定する
   * - 17.5: コピー中にエラーが発生した場合、不完全なコピーデータが残らないようにする
   */
  describe('POST /api/quantity-tables/:id/copy', () => {
    const tableId = '123e4567-e89b-12d3-a456-426614174001';

    it('正常にコピーされた数量表を201レスポンスで返却する（Requirements: 17.2）', async () => {
      const copiedTable = {
        id: '123e4567-e89b-12d3-a456-426614174099',
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'コピーされた数量表',
        groupCount: 2,
        itemCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.copy.mockResolvedValue(copiedTable);

      const response = await request(app)
        .post(`/api/quantity-tables/${tableId}/copy`)
        .send({ name: 'コピーされた数量表' })
        .expect(201);

      expect(response.body).toMatchObject({
        id: copiedTable.id,
        name: 'コピーされた数量表',
      });
      expect(mockService.copy).toHaveBeenCalledWith(
        tableId,
        { name: 'コピーされた数量表' },
        'test-user-id'
      );
    });

    it('数量表名が空の場合400エラーを返却する（バリデーション）', async () => {
      await request(app)
        .post(`/api/quantity-tables/${tableId}/copy`)
        .send({ name: '' })
        .expect(400);
    });

    it('数量表名が200文字を超える場合400エラーを返却する（バリデーション）', async () => {
      const longName = 'あ'.repeat(201);

      await request(app)
        .post(`/api/quantity-tables/${tableId}/copy`)
        .send({ name: longName })
        .expect(400);
    });

    it('リクエストボディにnameがない場合400エラーを返却する', async () => {
      await request(app).post(`/api/quantity-tables/${tableId}/copy`).send({}).expect(400);
    });

    it('コピー元の数量表が存在しない場合404エラーを返却する（Requirements: 17.5）', async () => {
      const { QuantityTableNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.copy.mockRejectedValue(new QuantityTableNotFoundError(tableId));

      const response = await request(app)
        .post(`/api/quantity-tables/${tableId}/copy`)
        .send({ name: 'コピー名' })
        .expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });

    it('予期しないエラー時は500エラーを返却する（Requirements: 17.5）', async () => {
      mockService.copy.mockRejectedValue(new Error('予期しないエラー'));

      const response = await request(app)
        .post(`/api/quantity-tables/${tableId}/copy`)
        .send({ name: 'コピー名' })
        .expect(500);

      expect(response.body).toHaveProperty('status', 500);
    });

    it('IDがUUID形式でない場合400エラーを返却する', async () => {
      await request(app)
        .post(`/api/quantity-tables/invalid-id/copy`)
        .send({ name: 'コピー名' })
        .expect(400);
    });
  });

  /**
   * Task 59.2: フル状態同期保存APIエンドポイントテスト（PUT /:id/save）
   *
   * 既存 bulk-save ルートを統合・置換した新エンドポイント。
   *
   * Requirements:
   * - 42.5: 保存操作時に全変更を一括永続化する
   * - 42.8: 保存正常完了時に最新データを返却し画面・編集状態を同期する
   * - 42.9: 整合性/サーバーエラー時はエラーを返し未保存状態を保持可能とする
   */
  describe('PUT /api/quantity-tables/:id/save', () => {
    const tableId = '123e4567-e89b-12d3-a456-426614174001';

    /** 妥当なフル状態同期保存リクエストボディを生成する */
    const buildSaveBody = () => ({
      expectedUpdatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      name: '編集後の数量表名',
      groups: [
        {
          id: '123e4567-e89b-12d3-a456-426614174010',
          name: 'グループA',
          surveyImageId: null,
          displayOrder: 0,
          items: [
            {
              id: '123e4567-e89b-12d3-a456-426614174020',
              majorCategory: '大項目',
              middleCategory: null,
              minorCategory: null,
              customCategory: null,
              workType: '工種',
              name: '項目名',
              specification: null,
              unit: 'm2',
              calculationMethod: 'STANDARD',
              calculationParams: null,
              adjustmentFactor: 1,
              roundingUnit: 1,
              quantity: 10,
              remarks: null,
              displayOrder: 0,
            },
          ],
        },
        {
          // 新規グループ（id=null / tempId 付き）に新規項目を含む
          id: null,
          tempId: 'tmp-group-1',
          name: '新規グループ',
          surveyImageId: null,
          displayOrder: 1,
          items: [
            {
              id: null,
              tempId: 'tmp-item-1',
              majorCategory: null,
              middleCategory: null,
              minorCategory: null,
              customCategory: null,
              workType: '工種2',
              name: '新規項目',
              specification: null,
              unit: 'm',
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 2, height: 3 },
              adjustmentFactor: 1.1,
              roundingUnit: 0.1,
              quantity: 6,
              remarks: null,
              displayOrder: 0,
            },
          ],
        },
      ],
    });

    it('正常時に200で最新のQuantityTableDetailを返却する（Req 42.5, 42.8）', async () => {
      const body = buildSaveBody();
      const latestDetail = {
        id: tableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '編集後の数量表名',
        groups: [],
        createdAt: new Date(),
        updatedAt: new Date('2026-01-01T01:00:00.000Z'),
      };

      mockService.saveDraft.mockResolvedValue(latestDetail);

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send(body)
        .expect(200);

      expect(response.body).toMatchObject({
        id: tableId,
        name: '編集後の数量表名',
      });
      // saveDraft(id, input, actorId) のシグネチャで呼び出される
      expect(mockService.saveDraft).toHaveBeenCalledWith(
        tableId,
        expect.objectContaining({
          expectedUpdatedAt: body.expectedUpdatedAt,
          name: '編集後の数量表名',
          groups: expect.any(Array),
        }),
        'test-user-id'
      );
    });

    it('保存レスポンスのsurveyImage URLを署名付きURLに変換して返却する（保存後リンク切れ防止）', async () => {
      // 保存直後の応答でも詳細取得（GET /:id）と同様に署名付きURL変換を適用することで、
      // 保存後にグループ画像がリンク切れになる事象を防ぐ。
      const body = buildSaveBody();
      const latestDetail = {
        id: tableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '編集後の数量表名',
        groups: [
          {
            id: '123e4567-e89b-12d3-a456-426614174010',
            quantityTableId: tableId,
            name: 'グループA',
            surveyImageId: 'img-1',
            surveyImage: {
              id: 'img-1',
              thumbnailUrl: '/api/storage/thumbnails/img-1.jpg',
              originalUrl: '/api/storage/originals/img-1.jpg',
              fileName: 'img-1.jpg',
              hasAnnotations: false,
              annotatedThumbnailUrl: null,
              comment: null,
            },
            displayOrder: 0,
            itemCount: 0,
            items: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date('2026-01-01T01:00:00.000Z'),
      };

      mockService.saveDraft.mockResolvedValue(latestDetail);

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send(body)
        .expect(200);

      // `/api/storage/` プレフィックスを除去したパスから署名付きURLが生成されること
      expect(response.body.groups[0].surveyImage.thumbnailUrl).toBe(
        'https://signed.example.com/thumbnails/img-1.jpg?sig=test'
      );
      expect(response.body.groups[0].surveyImage.originalUrl).toBe(
        'https://signed.example.com/originals/img-1.jpg?sig=test'
      );
    });

    it('バリデーションエラー（整合性検証）時に400を返却する（Req 42.9）', async () => {
      const { QuantityTableValidationError } =
        await import('../../../errors/quantityTableError.js');
      mockService.saveDraft.mockRejectedValue(
        new QuantityTableValidationError('整合性エラー', { 'groups.0.items.0.quantity': '不正' })
      );

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send(buildSaveBody())
        .expect(400);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_VALIDATION_ERROR');
    });

    it('リクエストボディが不正な場合（Zod検証失敗）400を返却する', async () => {
      // expectedUpdatedAt 欠落
      await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send({ name: 'x', groups: [] })
        .expect(400);
    });

    it('数量表が存在しない場合404を返却する（Req 42.9）', async () => {
      const { QuantityTableNotFoundError } = await import('../../../errors/quantityTableError.js');
      mockService.saveDraft.mockRejectedValue(new QuantityTableNotFoundError(tableId));

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send(buildSaveBody())
        .expect(404);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });

    it('expectedUpdatedAt競合時に409を返却する（Req 42.9）', async () => {
      const { QuantityTableConflictError } = await import('../../../errors/quantityTableError.js');
      mockService.saveDraft.mockRejectedValue(
        new QuantityTableConflictError('競合エラー', { detail: 'test' })
      );

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send(buildSaveBody())
        .expect(409);

      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_CONFLICT');
    });

    it('認証なしの場合401を返却する', async () => {
      // authenticate ミドルウェアが401で応答する
      mockAuthenticate.mockImplementationOnce((_req, res) => {
        res.status(401).json({ status: 401, code: 'UNAUTHORIZED' });
      });

      await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send(buildSaveBody())
        .expect(401);

      expect(mockService.saveDraft).not.toHaveBeenCalled();
    });

    it('権限がない場合403を返却する', async () => {
      // requirePermission はルート登録時（モジュール読み込み時）に評価されるため、
      // 既定実装を403応答に差し替えてからルートを再構築する
      mockRequirePermission.mockImplementation(
        () => (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
          res.status(403).json({ status: 403, code: 'FORBIDDEN' });
        }
      );

      // requirePermission はモジュール読み込み時に評価されるためルートを再構築する
      vi.resetModules();
      vi.doMock('../../../db.js', () => ({ default: vi.fn(() => ({})) }));
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
          copy = mockService.copy;
          saveDraft = mockService.saveDraft;
        },
      }));
      vi.doMock('../../../middleware/authenticate.middleware.js', () => ({
        authenticate: mockAuthenticate,
      }));
      vi.doMock('../../../middleware/authorize.middleware.js', () => ({
        requirePermission: mockRequirePermission,
      }));

      const { default: freshRoutes } = await import('../../../routes/quantity-tables.routes.js');
      const freshApp = express();
      freshApp.use(express.json());
      freshApp.use('/api/quantity-tables', freshRoutes);

      await request(freshApp)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send(buildSaveBody())
        .expect(403);

      expect(mockService.saveDraft).not.toHaveBeenCalled();
    });

    it('IDがUUID形式でない場合400を返却する', async () => {
      await request(app)
        .put(`/api/quantity-tables/invalid-id/save`)
        .send(buildSaveBody())
        .expect(400);
    });

    it('bulk-save ルートは廃止され存在しない（統合・置換）', async () => {
      // 旧 /:id/bulk-save は本エンドポイントへ統合・置換されたため到達不能（404）
      await request(app)
        .put(`/api/quantity-tables/${tableId}/bulk-save`)
        .send({ expectedUpdatedAt: new Date().toISOString(), groups: [] })
        .expect(404);
    });
  });
});
