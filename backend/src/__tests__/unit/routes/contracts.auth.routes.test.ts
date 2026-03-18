/**
 * @fileoverview 契約書ルート 権限テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 11.2: 契約書操作用の権限をシステムに定義する
 *
 * Requirements:
 * - 13.1: 認証済みユーザー限定閲覧
 * - 13.2: 権限チェック実行
 * - 13.3: 権限定義（contract:create/read/update/delete）
 * - 13.4: 403 Forbidden返却
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

// vi.hoistedでモック関数を定義
const {
  mockFindByProject,
  mockFindById,
  mockCreate,
  mockUpdate,
  mockUpdateStatus,
  mockDelete,
  mockRequirePermission,
  mockState,
} = vi.hoisted(() => ({
  mockFindByProject: vi.fn(),
  mockFindById: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockDelete: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockState: { shouldRejectPermission: false },
}));

// 依存モジュールのモック
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/contract.service.js', () => ({
  ContractService: class {
    findByProject = mockFindByProject;
    findById = mockFindById;
    create = mockCreate;
    update = mockUpdate;
    updateStatus = mockUpdateStatus;
    delete = mockDelete;
  },
}));

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    req.user = { userId: 'test-user-id', email: 'test@example.com', roles: ['user'] };
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

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ルートモジュールをインポート（モックが適用された状態）
import contractsRoutes from '../../../routes/contracts.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const contractId = '550e8400-e29b-41d4-a716-446655440010';
const estimateId = '550e8400-e29b-41d4-a716-446655440001';

const validCreateData = {
  contractType: 'NEW',
  parentContractId: null,
  estimateId,
  contractDate: '2026-04-01',
  constructionStartDate: '2026-05-01',
  constructionEndDate: '2026-12-31',
  deliveryDate: '2027-01-15',
  taxRate: 0.1,
  paymentTerms: '着手時30%',
  separateConstruction: '電気設備工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: null,
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
};

const validUpdateData = {
  estimateId,
  contractDate: '2026-04-01',
  constructionStartDate: '2026-05-01',
  constructionEndDate: '2026-12-31',
  deliveryDate: '2027-01-15',
  taxRate: 0.1,
  paymentTerms: '更新後の支払条件',
  separateConstruction: '電気設備工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: null,
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
  version: 0,
};

// テスト用Expressアプリ
function createTestApp() {
  const app = express();
  app.use(express.json());

  // デュアルマウント（design.md準拠）
  app.use('/api/projects/:projectId/contracts', contractsRoutes);
  app.use('/api/contracts', contractsRoutes);

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

describe('契約書ルート - 権限チェック', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.shouldRejectPermission = false;
    app = createTestApp();
  });

  // =================================================================
  // GET - contract:read 権限チェック
  // Requirements: 13.1, 13.2, 13.3, 13.4
  // =================================================================
  describe('GET /api/projects/:projectId/contracts - 権限チェック', () => {
    it('contract:read権限が要求されること', async () => {
      mockFindByProject.mockResolvedValue({ contracts: [], total: 0 });

      await request(app).get(`/api/projects/${projectId}/contracts`);

      expect(mockRequirePermission).toHaveBeenCalledWith('contract:read');
    });

    it('権限がない場合は403 Forbiddenを返すこと', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app).get(`/api/projects/${projectId}/contracts`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/contracts/:id - 権限チェック', () => {
    it('contract:read権限が要求されること', async () => {
      mockFindById.mockResolvedValue({ id: contractId });

      await request(app).get(`/api/contracts/${contractId}`);

      expect(mockRequirePermission).toHaveBeenCalledWith('contract:read');
    });

    it('権限がない場合は403 Forbiddenを返すこと', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app).get(`/api/contracts/${contractId}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  // =================================================================
  // POST - contract:create 権限チェック
  // Requirements: 13.1, 13.2, 13.3, 13.4
  // =================================================================
  describe('POST /api/projects/:projectId/contracts - 権限チェック', () => {
    it('contract:create権限が要求されること', async () => {
      mockCreate.mockResolvedValue({ id: contractId });

      await request(app).post(`/api/projects/${projectId}/contracts`).send(validCreateData);

      expect(mockRequirePermission).toHaveBeenCalledWith('contract:create');
    });

    it('権限がない場合は403 Forbiddenを返すこと', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app)
        .post(`/api/projects/${projectId}/contracts`)
        .send(validCreateData);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  // =================================================================
  // PUT - contract:update 権限チェック
  // Requirements: 13.1, 13.2, 13.3, 13.4
  // =================================================================
  describe('PUT /api/contracts/:id - 権限チェック', () => {
    it('contract:update権限が要求されること', async () => {
      mockUpdate.mockResolvedValue({ id: contractId });

      await request(app).put(`/api/contracts/${contractId}`).send(validUpdateData);

      expect(mockRequirePermission).toHaveBeenCalledWith('contract:update');
    });

    it('権限がない場合は403 Forbiddenを返すこと', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app).put(`/api/contracts/${contractId}`).send(validUpdateData);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  // =================================================================
  // PATCH - contract:update 権限チェック
  // Requirements: 13.1, 13.2, 13.3, 13.4
  // =================================================================
  describe('PATCH /api/contracts/:id/status - 権限チェック', () => {
    it('contract:update権限が要求されること', async () => {
      mockUpdateStatus.mockResolvedValue({ id: contractId, status: 'CONTRACTED' });

      await request(app)
        .patch(`/api/contracts/${contractId}/status`)
        .send({ status: 'CONTRACTED' });

      expect(mockRequirePermission).toHaveBeenCalledWith('contract:update');
    });

    it('権限がない場合は403 Forbiddenを返すこと', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app)
        .patch(`/api/contracts/${contractId}/status`)
        .send({ status: 'CONTRACTED' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  // =================================================================
  // DELETE - contract:delete 権限チェック
  // Requirements: 13.1, 13.2, 13.3, 13.4
  // =================================================================
  describe('DELETE /api/contracts/:id - 権限チェック', () => {
    it('contract:delete権限が要求されること', async () => {
      mockDelete.mockResolvedValue(undefined);

      await request(app).delete(`/api/contracts/${contractId}`);

      expect(mockRequirePermission).toHaveBeenCalledWith('contract:delete');
    });

    it('権限がない場合は403 Forbiddenを返すこと', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app).delete(`/api/contracts/${contractId}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });
});
