/**
 * @fileoverview 工程表ルート ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 4: バックエンドAPIルートとカスタムエラーの実装
 *
 * Requirements:
 * - 1.1: 工程表一覧表示
 * - 1.2: 工程表新規作成画面表示
 * - 1.3: 工程表保存
 * - 1.4: 工程表詳細表示
 * - 1.5: 工程表削除
 * - 1.6: 保存失敗時エラー表示
 * - 2.1: 数量表選択肢表示
 * - 2.2: 数量表なしで空の工程表作成
 * - 2.3: 数量表指定時の項目自動取得
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ScheduleNotFoundError,
  ScheduleConflictError,
  ScheduleValidationError,
} from '../../../errors/scheduleError.js';

// vi.hoistedでモック関数を定義（vi.mockと一緒にhoistingされる）
const { mockFindByProject, mockFindById, mockCreate, mockUpdate, mockBulkSaveItems, mockDelete } =
  vi.hoisted(() => ({
    mockFindByProject: vi.fn(),
    mockFindById: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockBulkSaveItems: vi.fn(),
    mockDelete: vi.fn(),
  }));

// 依存モジュールのモック
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/schedule.service.js', () => ({
  ScheduleService: class {
    findByProject = mockFindByProject;
    findById = mockFindById;
    create = mockCreate;
    update = mockUpdate;
    bulkSaveItems = mockBulkSaveItems;
    delete = mockDelete;
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
import schedulesRoutes from '../../../routes/schedules.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const scheduleId = '550e8400-e29b-41d4-a716-446655440010';

const mockScheduleDetail = {
  id: scheduleId,
  projectId,
  name: 'テスト工程表',
  quantityTableId: null,
  quantityTableName: null,
  items: [
    {
      id: '550e8400-e29b-41d4-a716-446655440020',
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '基礎工事',
      labelText: '基礎',
      detailText: 'コンクリート打設',
      startDate: '2026-04-01',
      duration: 10,
      displayOrder: 0,
      isExportTarget: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
  ],
  version: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const mockScheduleListResponse = {
  schedules: [
    {
      id: scheduleId,
      name: 'テスト工程表',
      quantityTableName: null,
      itemCount: 1,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
  ],
  total: 1,
};

// テスト用Expressアプリ
function createTestApp() {
  const app = express();
  app.use(express.json());

  // デュアルマウント（design.md準拠）
  app.use('/api/projects/:projectId/schedules', schedulesRoutes);
  app.use('/api/schedules', schedulesRoutes);

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

describe('工程表ルート', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  // =================================================================
  // GET /api/projects/:projectId/schedules - 工程表一覧取得
  // Requirements: 1.1
  // =================================================================
  describe('GET /api/projects/:projectId/schedules', () => {
    it('プロジェクトの工程表一覧を取得できること', async () => {
      mockFindByProject.mockResolvedValue(mockScheduleListResponse);

      const res = await request(app).get(`/api/projects/${projectId}/schedules`).expect(200);

      expect(res.body.schedules).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(mockFindByProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      );
    });

    it('クエリパラメータでページネーションが適用されること', async () => {
      mockFindByProject.mockResolvedValue({ schedules: [], total: 0 });

      await request(app).get(`/api/projects/${projectId}/schedules?page=2&limit=10`).expect(200);

      expect(mockFindByProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ page: 2, limit: 10 })
      );
    });

    it('ソートパラメータが適用されること', async () => {
      mockFindByProject.mockResolvedValue({ schedules: [], total: 0 });

      await request(app)
        .get(`/api/projects/${projectId}/schedules?sortBy=name&sortOrder=asc`)
        .expect(200);

      expect(mockFindByProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          sortBy: 'name',
          sortOrder: 'asc',
        })
      );
    });

    it('無効なクエリパラメータで400エラーが返ること', async () => {
      await request(app).get(`/api/projects/${projectId}/schedules?sortBy=invalid`).expect(400);
    });

    it('サービスエラー時に500エラーが返ること', async () => {
      mockFindByProject.mockRejectedValue(new Error('DB error'));

      await request(app).get(`/api/projects/${projectId}/schedules`).expect(500);
    });
  });

  // =================================================================
  // POST /api/projects/:projectId/schedules - 工程表作成
  // Requirements: 1.2, 1.3, 2.1, 2.2, 2.3
  // =================================================================
  describe('POST /api/projects/:projectId/schedules', () => {
    const validCreateData = {
      name: 'テスト工程表',
      quantityTableId: null,
    };

    it('数量表なしで工程表を作成できること', async () => {
      mockCreate.mockResolvedValue(mockScheduleDetail);

      const res = await request(app)
        .post(`/api/projects/${projectId}/schedules`)
        .send(validCreateData)
        .expect(201);

      expect(res.body.id).toBe(scheduleId);
      expect(mockCreate).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          name: 'テスト工程表',
          quantityTableId: null,
        })
      );
    });

    it('数量表指定ありで工程表を作成できること', async () => {
      const quantityTableId = '550e8400-e29b-41d4-a716-446655440030';
      const detailWithQt = {
        ...mockScheduleDetail,
        quantityTableId,
        quantityTableName: 'テスト数量表',
      };
      mockCreate.mockResolvedValue(detailWithQt);

      const res = await request(app)
        .post(`/api/projects/${projectId}/schedules`)
        .send({ name: 'テスト工程表', quantityTableId })
        .expect(201);

      expect(res.body.quantityTableId).toBe(quantityTableId);
    });

    it('名前なしで400バリデーションエラーが返ること', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/schedules`)
        .send({ name: '' })
        .expect(400);
    });

    it('名前が200文字超で400バリデーションエラーが返ること', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/schedules`)
        .send({ name: 'あ'.repeat(201) })
        .expect(400);
    });

    it('数量表バリデーションエラーで422が返ること', async () => {
      mockCreate.mockRejectedValue(
        new ScheduleValidationError('指定された数量表は同一プロジェクトに属していません')
      );

      await request(app)
        .post(`/api/projects/${projectId}/schedules`)
        .send({
          name: 'テスト工程表',
          quantityTableId: '550e8400-e29b-41d4-a716-446655440099',
        })
        .expect(422);
    });

    it('サービスエラー時に500エラーが返ること', async () => {
      mockCreate.mockRejectedValue(new Error('DB error'));

      await request(app)
        .post(`/api/projects/${projectId}/schedules`)
        .send(validCreateData)
        .expect(500);
    });
  });

  // =================================================================
  // GET /api/schedules/:id - 工程表詳細取得
  // Requirements: 1.4
  // =================================================================
  describe('GET /api/schedules/:id', () => {
    it('工程表詳細を取得できること', async () => {
      mockFindById.mockResolvedValue(mockScheduleDetail);

      const res = await request(app).get(`/api/schedules/${scheduleId}`).expect(200);

      expect(res.body.id).toBe(scheduleId);
      expect(res.body.name).toBe('テスト工程表');
      expect(res.body.items).toHaveLength(1);
    });

    it('存在しない工程表で404エラーが返ること', async () => {
      mockFindById.mockResolvedValue(null);

      const res = await request(app).get(`/api/schedules/${scheduleId}`).expect(404);

      expect(res.body.status).toBe(404);
      expect(res.body.detail).toBe('工程表が見つかりません');
    });
  });

  // =================================================================
  // PUT /api/schedules/:id - 工程表更新
  // Requirements: 1.3, 1.6
  // =================================================================
  describe('PUT /api/schedules/:id', () => {
    const validUpdateData = {
      name: '更新後の工程表',
      version: 0,
    };

    it('工程表を更新できること', async () => {
      const updatedDetail = {
        ...mockScheduleDetail,
        name: '更新後の工程表',
        version: 1,
      };
      mockUpdate.mockResolvedValue(updatedDetail);

      const res = await request(app)
        .put(`/api/schedules/${scheduleId}`)
        .send(validUpdateData)
        .expect(200);

      expect(res.body.name).toBe('更新後の工程表');
      expect(res.body.version).toBe(1);
    });

    it('存在しない工程表の更新で404エラーが返ること', async () => {
      mockUpdate.mockRejectedValue(new ScheduleNotFoundError());

      await request(app).put(`/api/schedules/${scheduleId}`).send(validUpdateData).expect(404);
    });

    it('version競合で409エラーが返ること', async () => {
      mockUpdate.mockRejectedValue(new ScheduleConflictError());

      await request(app).put(`/api/schedules/${scheduleId}`).send(validUpdateData).expect(409);
    });

    it('名前なしで400バリデーションエラーが返ること', async () => {
      await request(app)
        .put(`/api/schedules/${scheduleId}`)
        .send({ name: '', version: 0 })
        .expect(400);
    });

    it('versionなしで400バリデーションエラーが返ること', async () => {
      await request(app)
        .put(`/api/schedules/${scheduleId}`)
        .send({ name: '更新後の工程表' })
        .expect(400);
    });
  });

  // =================================================================
  // PUT /api/schedules/:id/bulk-save - バルク保存
  // Requirements: 2.2, 2.3
  // =================================================================
  describe('PUT /api/schedules/:id/bulk-save', () => {
    const validBulkSaveData = {
      version: 0,
      items: [
        {
          id: null,
          itemName: '基礎工事',
          labelText: '基礎',
          detailText: 'コンクリート打設',
          startDate: '2026-04-01',
          duration: 10,
          displayOrder: 0,
          isExportTarget: true,
        },
      ],
    };

    it('バルク保存が成功すること', async () => {
      const bulkSaveResult = {
        updatedItemCount: 1,
        updatedAt: '2026-03-01T00:00:00.000Z',
      };
      mockBulkSaveItems.mockResolvedValue(bulkSaveResult);

      const res = await request(app)
        .put(`/api/schedules/${scheduleId}/bulk-save`)
        .send(validBulkSaveData)
        .expect(200);

      expect(res.body.updatedItemCount).toBe(1);
      expect(mockBulkSaveItems).toHaveBeenCalledWith(
        scheduleId,
        expect.objectContaining({ version: 0 })
      );
    });

    it('存在しない工程表のバルク保存で404エラーが返ること', async () => {
      mockBulkSaveItems.mockRejectedValue(new ScheduleNotFoundError());

      await request(app)
        .put(`/api/schedules/${scheduleId}/bulk-save`)
        .send(validBulkSaveData)
        .expect(404);
    });

    it('version競合で409エラーが返ること', async () => {
      mockBulkSaveItems.mockRejectedValue(new ScheduleConflictError());

      await request(app)
        .put(`/api/schedules/${scheduleId}/bulk-save`)
        .send(validBulkSaveData)
        .expect(409);
    });

    it('バリデーションエラーで400が返ること', async () => {
      await request(app)
        .put(`/api/schedules/${scheduleId}/bulk-save`)
        .send({
          version: 0,
          items: [
            {
              id: null,
              itemName: '', // 空文字 - 必須
              labelText: '',
              detailText: '',
              startDate: null,
              duration: null,
              displayOrder: 0,
              isExportTarget: true,
            },
          ],
        })
        .expect(400);
    });

    it('日数が0以下でバリデーションエラーになること', async () => {
      await request(app)
        .put(`/api/schedules/${scheduleId}/bulk-save`)
        .send({
          version: 0,
          items: [
            {
              id: null,
              itemName: '基礎工事',
              labelText: '',
              detailText: '',
              startDate: '2026-04-01',
              duration: 0, // 0以下
              displayOrder: 0,
              isExportTarget: true,
            },
          ],
        })
        .expect(400);
    });
  });

  // =================================================================
  // DELETE /api/schedules/:id - 工程表論理削除
  // Requirements: 1.5
  // =================================================================
  describe('DELETE /api/schedules/:id', () => {
    it('工程表を論理削除できること', async () => {
      mockDelete.mockResolvedValue(undefined);

      await request(app).delete(`/api/schedules/${scheduleId}`).expect(204);
    });

    it('存在しない工程表の削除で404エラーが返ること', async () => {
      mockDelete.mockRejectedValue(new ScheduleNotFoundError());

      await request(app).delete(`/api/schedules/${scheduleId}`).expect(404);
    });
  });

  // =================================================================
  // GET /api/schedules/:id/export - エクスポート
  // Requirements: 1.1, 1.2
  // =================================================================
  describe('GET /api/schedules/:id/export', () => {
    it('xlsxフォーマットのエクスポートリクエストが受け付けられること', async () => {
      // エクスポートサービスは未実装なので、ルートがformat validationを通すことを確認
      // 実際のエクスポートはTask 11, 12で実装
      mockFindById.mockResolvedValue(mockScheduleDetail);

      const res = await request(app)
        .get(`/api/schedules/${scheduleId}/export?format=xlsx`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('pdfフォーマットのエクスポートリクエストが受け付けられること', async () => {
      mockFindById.mockResolvedValue(mockScheduleDetail);

      const res = await request(app)
        .get(`/api/schedules/${scheduleId}/export?format=pdf`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('無効なフォーマットで400エラーが返ること', async () => {
      await request(app).get(`/api/schedules/${scheduleId}/export?format=csv`).expect(400);
    });

    it('formatパラメータなしで400エラーが返ること', async () => {
      await request(app).get(`/api/schedules/${scheduleId}/export`).expect(400);
    });

    it('存在しない工程表のエクスポートで404エラーが返ること', async () => {
      mockFindById.mockResolvedValue(null);

      await request(app).get(`/api/schedules/${scheduleId}/export?format=xlsx`).expect(404);
    });
  });
});
