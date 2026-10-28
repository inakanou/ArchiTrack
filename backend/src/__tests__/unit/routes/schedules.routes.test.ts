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
 *
 * 出力の記録（construction-schedule の Requirement 13.6・13.7、タスク22.2）:
 * ファイルの生成の前に ExportAuditService.record を 1 回呼ぶこと、記録の失敗では生成せず
 * 500 と EXPORT_RECORD_FAILED を返すこと、記録の判定が案件を範囲外・不在としたときは 404 にすることを確かめる
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
const {
  mockFindByProject,
  mockFindById,
  mockCreate,
  mockUpdate,
  mockBulkSaveItems,
  mockDelete,
  mockGetExportData,
  mockExportToExcel,
  mockExportToPdf,
  mockRecord,
  mockFindProjectIdOfSchedule,
} = vi.hoisted(() => ({
  mockFindByProject: vi.fn(),
  mockFindById: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockBulkSaveItems: vi.fn(),
  mockDelete: vi.fn(),
  mockGetExportData: vi.fn(),
  mockExportToExcel: vi.fn(),
  mockExportToPdf: vi.fn(),
  mockRecord: vi.fn(),
  mockFindProjectIdOfSchedule: vi.fn(),
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

vi.mock('../../../services/schedule-export.service.js', () => ({
  ScheduleExportService: class {
    getExportData = mockGetExportData;
    exportToExcel = mockExportToExcel;
    exportToPdf = mockExportToPdf;
  },
}));

// 出力の記録（判定と記録の内容は export-audit.service.test.ts と統合テストが確かめる）
vi.mock('../../../services/export-audit.service.js', () => ({
  ExportAuditService: class {
    record = mockRecord;
  },
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {},
}));

vi.mock('../../../services/project-scope.service.js', () => ({
  getSharedProjectScopeService: vi.fn(),
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

// 案件の閲覧範囲の判定部品は素通りさせる（判定と経路への適用は
// construction-schedule-project-scope.middleware.test.ts と統合テストが確かめる。タスク22.1）
vi.mock('../../../middleware/construction-schedule-project-scope.middleware.js', () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    findProjectIdOfSchedule: mockFindProjectIdOfSchedule,
    requireProjectParamScope: pass,
    requireScheduleProjectScope: pass,
  };
});

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
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

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
      err: Error & { statusCode?: number; status?: number; code?: string },
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      const statusCode = err.statusCode || err.status || 500;
      res.status(statusCode).json({
        status: statusCode,
        detail: err.message,
        ...(err.code && { code: err.code }),
      });
    }
  );

  return app;
}

describe('工程表ルート', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    // 出力の記録は既定で成功させる（記録の失敗は個々の試験で差し替える）
    mockFindProjectIdOfSchedule.mockResolvedValue(projectId);
    mockRecord.mockResolvedValue({ ok: true, value: { recordId: 'record-1' } });
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
        }),
        'test-user-id',
        // 数量表の所属の照合で範囲外とした拒否の記録に添える要求の識別（タスク22.1、13.4）
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining(`/api/projects/${projectId}/schedules`),
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
      mockCreate.mockRejectedValue(new ScheduleValidationError('指定された数量表が見つかりません'));

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
  // 経路の ID の形式の検査（タスク22.1。案件の閲覧範囲の判定部品より前に置く）
  // =================================================================
  describe('経路の ID の形式の検査（タスク22.1）', () => {
    it.each([
      ['GET', '/api/schedules/not-a-uuid'],
      ['PUT', '/api/schedules/not-a-uuid'],
      ['PUT', '/api/schedules/not-a-uuid/bulk-save'],
      ['DELETE', '/api/schedules/not-a-uuid'],
      ['GET', '/api/schedules/not-a-uuid/export?format=xlsx'],
      ['GET', '/api/projects/not-a-uuid/schedules'],
      ['POST', '/api/projects/not-a-uuid/schedules'],
      // プロジェクトの配下でないマウントから届く一覧・作成は経路にプロジェクト ID が無い
      ['GET', '/api/schedules'],
      ['POST', '/api/schedules'],
    ] as const)('%s %s は 400 になり、本体を呼ばない', async (method, path) => {
      const call = request(app)[method.toLowerCase() as 'get' | 'put' | 'delete' | 'post'](path);
      await call.send({ name: 'テスト工程表', version: 0, items: [] }).expect(400);
      for (const mock of [
        mockFindByProject,
        mockFindById,
        mockCreate,
        mockUpdate,
        mockBulkSaveItems,
        mockDelete,
        mockGetExportData,
      ]) {
        expect(mock).not.toHaveBeenCalled();
      }
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
    const mockExportData = {
      id: scheduleId,
      name: 'テスト工程表',
      projectName: 'テストプロジェクト',
      companyName: 'テスト建設',
      items: [],
    };

    it('xlsxフォーマットのエクスポートでExcelファイルが返ること', async () => {
      mockGetExportData.mockResolvedValue(mockExportData);
      mockExportToExcel.mockResolvedValue(Buffer.from('xlsx-data'));

      const res = await request(app)
        .get(`/api/schedules/${scheduleId}/export?format=xlsx`)
        .expect(200);

      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(res.headers['content-disposition']).toContain('.xlsx');
      expect(mockGetExportData).toHaveBeenCalledWith(scheduleId);
      expect(mockExportToExcel).toHaveBeenCalledWith(mockExportData);
    });

    it('pdfフォーマットのエクスポートでPDFファイルが返ること', async () => {
      mockGetExportData.mockResolvedValue(mockExportData);
      mockExportToPdf.mockResolvedValue(Buffer.from('pdf-data'));

      const res = await request(app)
        .get(`/api/schedules/${scheduleId}/export?format=pdf`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('.pdf');
      expect(mockGetExportData).toHaveBeenCalledWith(scheduleId);
      expect(mockExportToPdf).toHaveBeenCalledWith(mockExportData);
    });

    it('無効なフォーマットで400エラーが返ること', async () => {
      await request(app).get(`/api/schedules/${scheduleId}/export?format=csv`).expect(400);
    });

    it('formatパラメータなしで400エラーが返ること', async () => {
      await request(app).get(`/api/schedules/${scheduleId}/export`).expect(400);
    });

    it('存在しない工程表のエクスポートで404エラーが返ること', async () => {
      mockGetExportData.mockResolvedValue(null);

      await request(app).get(`/api/schedules/${scheduleId}/export?format=xlsx`).expect(404);
      expect(mockRecord).not.toHaveBeenCalled();
    });
  });

  // =================================================================
  // GET /api/schedules/:id/export - 出力の記録
  // construction-schedule の Requirement 13.6・13.7（タスク22.2）
  // =================================================================
  describe('GET /api/schedules/:id/export の出力の記録 (Req 13.6, 13.7)', () => {
    const exportItem = {
      itemName: '工程',
      labelText: '',
      detailText: '',
      startDate: null,
      duration: 1,
      displayOrder: 0,
    };
    // 出力対象は 2 件（出力対象から外した 1 件は数えない。Requirement 9.3）
    const mockExportData = {
      id: scheduleId,
      name: 'テスト工程表',
      projectName: 'テストプロジェクト',
      companyName: 'テスト建設',
      items: [
        { ...exportItem, id: 'item-1', isExportTarget: true },
        { ...exportItem, id: 'item-2', isExportTarget: false },
        { ...exportItem, id: 'item-3', isExportTarget: true },
      ],
    };

    it.each([
      { format: 'xlsx', generator: () => mockExportToExcel },
      { format: 'pdf', generator: () => mockExportToPdf },
    ])(
      '$format の出力は生成の前に種別 schedule_export・案件・工程表・出力対象の件数で 1 回記録する',
      async ({ format, generator }) => {
        mockGetExportData.mockResolvedValue(mockExportData);
        generator().mockResolvedValue(Buffer.from('file'));

        await request(app)
          .get(`/api/schedules/${scheduleId}/export?format=${format}`)
          .set('User-Agent', 'unit-test-agent')
          .expect(200);

        expect(mockFindProjectIdOfSchedule).toHaveBeenCalledWith(scheduleId);
        expect(mockRecord).toHaveBeenCalledTimes(1);
        expect(mockRecord).toHaveBeenCalledWith(
          'test-user-id',
          { kind: 'schedule_export', projectId, targetIds: [scheduleId], itemCount: 2 },
          expect.objectContaining({ userAgent: 'unit-test-agent' })
        );
        expect(mockRecord.mock.invocationCallOrder[0]).toBeLessThan(
          generator().mock.invocationCallOrder[0]!
        );
      }
    );

    it.each(['xlsx', 'pdf'])(
      '記録が失敗すると %s のファイルを生成せず 500 と EXPORT_RECORD_FAILED を返す',
      async (format) => {
        mockGetExportData.mockResolvedValue(mockExportData);
        mockRecord.mockResolvedValue({ ok: false, error: { type: 'RECORD_FAILED' } });

        const res = await request(app)
          .get(`/api/schedules/${scheduleId}/export?format=${format}`)
          .expect(500);

        expect(res.headers['content-disposition']).toBeUndefined();
        expect(res.body).toMatchObject({
          status: 500,
          code: 'EXPORT_RECORD_FAILED',
          detail: '出力を記録できなかったため中止しました',
        });
        expect(mockExportToExcel).not.toHaveBeenCalled();
        expect(mockExportToPdf).not.toHaveBeenCalled();
      }
    );

    it('記録の判定が案件を範囲外・不在としたときは生成せず 404 を返す', async () => {
      mockGetExportData.mockResolvedValue(mockExportData);
      mockRecord.mockResolvedValue({ ok: false, error: { type: 'PROJECT_OUT_OF_SCOPE' } });

      await request(app).get(`/api/schedules/${scheduleId}/export?format=xlsx`).expect(404);

      expect(mockExportToExcel).not.toHaveBeenCalled();
    });

    it('出力データの取得の後に工程表の案件が引けなくなったときは記録も生成もせず 404 を返す', async () => {
      mockGetExportData.mockResolvedValue(mockExportData);
      mockFindProjectIdOfSchedule.mockResolvedValue(null);

      await request(app).get(`/api/schedules/${scheduleId}/export?format=pdf`).expect(404);

      expect(mockRecord).not.toHaveBeenCalled();
      expect(mockExportToPdf).not.toHaveBeenCalled();
    });

    it('format の不正の 400 では記録しない', async () => {
      await request(app).get(`/api/schedules/${scheduleId}/export?format=csv`).expect(400);

      expect(mockRecord).not.toHaveBeenCalled();
    });
  });

  // =================================================================
  // GET /api/schedules/:id/export - 出力処理の失敗
  // 対応する設計: design.md「Export Errors (500)」
  //
  // 応答の形式は本番と同じ大域のエラーハンドラー（RFC 7807 Problem Details）で確かめるため、
  // 上の createTestApp の簡易ハンドラーではなく errorHandler を載せたアプリを使う。
  // =================================================================
  describe('GET /api/schedules/:id/export の出力処理の失敗 (Req 7.6, 8.6)', () => {
    const mockExportData = {
      id: scheduleId,
      name: 'テスト工程表',
      projectName: 'テストプロジェクト',
      companyName: 'テスト建設',
      items: [],
    };

    function createAppWithErrorHandler() {
      const errorApp = express();
      errorApp.use(express.json());
      errorApp.use('/api/schedules', schedulesRoutes);
      errorApp.use(errorHandler);
      return errorApp;
    }

    it.each([
      {
        format: 'xlsx',
        label: 'Excel',
        arrange: () => mockExportToExcel.mockRejectedValue(new Error('workbook generation failed')),
        generator: () => mockExportToExcel,
        other: () => mockExportToPdf,
      },
      {
        format: 'pdf',
        label: 'PDF',
        arrange: () => mockExportToPdf.mockRejectedValue(new Error('pdf generation failed')),
        generator: () => mockExportToPdf,
        other: () => mockExportToExcel,
      },
    ])(
      '$label の生成処理が失敗したとき、500 とエラーメッセージを返しファイルを返さないこと',
      async ({ format, arrange, generator, other }) => {
        mockGetExportData.mockResolvedValue(mockExportData);
        arrange();

        const res = await request(createAppWithErrorHandler()).get(
          `/api/schedules/${scheduleId}/export?format=${format}`
        );

        expect(res.status).toBe(500);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.headers['content-disposition']).toBeUndefined();
        expect(res.body).toMatchObject({
          status: 500,
          title: 'Internal Server Error',
          detail: 'Internal server error',
          instance: `/api/schedules/${scheduleId}/export?format=${format}`,
        });
        // 生成処理の内部の失敗内容を応答へ漏らさないこと。スタックトレースは実行環境が
        // development / test と明示されたときだけ付く開発用の機能（user-authentication 要件42.9）
        // で、本番の応答には付かないため、それを除いた応答の本文で確かめる
        const { stack: _developmentOnlyStack, ...productionBody } = res.body;
        expect(JSON.stringify(productionBody)).not.toContain('generation failed');
        expect(generator()).toHaveBeenCalledWith(mockExportData);
        expect(other()).not.toHaveBeenCalled();
      }
    );
  });
});
