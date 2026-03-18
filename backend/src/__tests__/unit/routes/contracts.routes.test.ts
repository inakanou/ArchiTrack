/**
 * @fileoverview 契約書ルート ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 3.1: REST APIルート定義とアプリケーションマウント
 * Task 3.2: バックエンドの単体テスト・統合テスト作成
 *
 * Requirements:
 * - 1.1, 1.2: 契約書リスト表示
 * - 3.4: 見積書選択UI（API経由）
 * - 5.1: 変更契約時のparentContractId検証
 * - 7.1: 契約書作成
 * - 8.1: 契約書詳細表示
 * - 8.2, 8.3: ステータス双方向遷移
 * - 9.2: 契約書更新（楽観的排他制御）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ContractNotFoundError,
  ContractConflictError,
  ContractValidationError,
  ContractDeletionConstraintError,
} from '../../../errors/contractError.js';

// vi.hoistedでモック関数を定義（vi.mockと一緒にhoistingされる）
const { mockFindByProject, mockFindById, mockCreate, mockUpdate, mockUpdateStatus, mockDelete } =
  vi.hoisted(() => ({
    mockFindByProject: vi.fn(),
    mockFindById: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockUpdateStatus: vi.fn(),
    mockDelete: vi.fn(),
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
import contractsRoutes from '../../../routes/contracts.routes.js';

// テストデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const contractId = '550e8400-e29b-41d4-a716-446655440010';
const estimateId = '550e8400-e29b-41d4-a716-446655440001';

const mockContractDetail = {
  id: contractId,
  projectId,
  contractType: 'NEW',
  status: 'BEFORE_CONTRACT',
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
  estimate: { id: estimateId, name: 'テスト見積書' },
  parentContract: null,
  supervisorTradingPartner: null,
  project: {
    id: projectId,
    name: 'テストプロジェクト',
    siteAddress: '東京都渋谷区',
    tradingPartner: { id: 'tp-1', name: 'テスト顧客' },
  },
  version: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const mockContractListResponse = {
  contracts: [
    {
      id: contractId,
      contractType: 'NEW',
      contractDate: '2026-04-01',
      status: 'BEFORE_CONTRACT',
      contractAmount: 11000000,
      estimateName: 'テスト見積書',
      parentContractId: null,
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

describe('契約書ルート', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  // =================================================================
  // GET /api/projects/:projectId/contracts - 契約書一覧取得
  // Requirements: 1.1, 1.2
  // =================================================================
  describe('GET /api/projects/:projectId/contracts', () => {
    it('プロジェクトの契約書一覧を取得できること', async () => {
      mockFindByProject.mockResolvedValue(mockContractListResponse);

      const res = await request(app).get(`/api/projects/${projectId}/contracts`).expect(200);

      expect(res.body.contracts).toHaveLength(1);
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
      mockFindByProject.mockResolvedValue({ contracts: [], total: 0 });

      await request(app).get(`/api/projects/${projectId}/contracts?page=2&limit=10`).expect(200);

      expect(mockFindByProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ page: 2, limit: 10 })
      );
    });

    it('ソートパラメータが適用されること', async () => {
      mockFindByProject.mockResolvedValue({ contracts: [], total: 0 });

      await request(app)
        .get(`/api/projects/${projectId}/contracts?sortBy=contractDate&sortOrder=asc`)
        .expect(200);

      expect(mockFindByProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          sortBy: 'contractDate',
          sortOrder: 'asc',
        })
      );
    });

    it('無効なクエリパラメータで400エラーが返ること', async () => {
      await request(app).get(`/api/projects/${projectId}/contracts?sortBy=invalid`).expect(400);
    });
  });

  // =================================================================
  // GET /api/contracts/:id - 契約書詳細取得
  // Requirements: 8.1
  // =================================================================
  describe('GET /api/contracts/:id', () => {
    it('契約書詳細を取得できること', async () => {
      mockFindById.mockResolvedValue(mockContractDetail);

      const res = await request(app).get(`/api/contracts/${contractId}`).expect(200);

      expect(res.body.id).toBe(contractId);
      expect(res.body.projectId).toBe(projectId);
      expect(res.body.contractType).toBe('NEW');
    });

    it('存在しない契約書で404エラーが返ること', async () => {
      mockFindById.mockResolvedValue(null);

      await request(app).get(`/api/contracts/${contractId}`).expect(404);
    });
  });

  // =================================================================
  // POST /api/projects/:projectId/contracts - 契約書作成
  // Requirements: 7.1, 5.1
  // =================================================================
  describe('POST /api/projects/:projectId/contracts', () => {
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

    it('新規契約を作成できること', async () => {
      mockCreate.mockResolvedValue(mockContractDetail);

      const res = await request(app)
        .post(`/api/projects/${projectId}/contracts`)
        .send(validCreateData)
        .expect(201);

      expect(res.body.id).toBe(contractId);
      expect(mockCreate).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          contractType: 'NEW',
          estimateId,
        })
      );
    });

    it('バリデーションエラーで400が返ること', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/contracts`)
        .send({ contractType: 'INVALID' })
        .expect(400);
    });

    it('変更契約のparentContractIdが不正な場合422エラーが返ること', async () => {
      mockCreate.mockRejectedValue(
        new ContractValidationError('基となる契約書は同じプロジェクトの契約書である必要があります')
      );

      await request(app)
        .post(`/api/projects/${projectId}/contracts`)
        .send({
          ...validCreateData,
          contractType: 'AMENDMENT',
          parentContractId: '550e8400-e29b-41d4-a716-446655440099',
        })
        .expect(422);
    });
  });

  // =================================================================
  // PUT /api/contracts/:id - 契約書更新
  // Requirements: 9.2
  // =================================================================
  describe('PUT /api/contracts/:id', () => {
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

    it('契約書を更新できること', async () => {
      const updatedDetail = {
        ...mockContractDetail,
        paymentTerms: '更新後の支払条件',
        version: 1,
      };
      mockUpdate.mockResolvedValue(updatedDetail);

      const res = await request(app)
        .put(`/api/contracts/${contractId}`)
        .send(validUpdateData)
        .expect(200);

      expect(res.body.paymentTerms).toBe('更新後の支払条件');
    });

    it('存在しない契約書の更新で404エラーが返ること', async () => {
      mockUpdate.mockRejectedValue(new ContractNotFoundError());

      await request(app).put(`/api/contracts/${contractId}`).send(validUpdateData).expect(404);
    });

    it('version競合で409エラーが返ること', async () => {
      mockUpdate.mockRejectedValue(new ContractConflictError());

      await request(app).put(`/api/contracts/${contractId}`).send(validUpdateData).expect(409);
    });

    it('バリデーションエラーで400が返ること', async () => {
      await request(app)
        .put(`/api/contracts/${contractId}`)
        .send({ estimateId: 'invalid' })
        .expect(400);
    });
  });

  // =================================================================
  // PATCH /api/contracts/:id/status - ステータス更新
  // Requirements: 8.2, 8.3
  // =================================================================
  describe('PATCH /api/contracts/:id/status', () => {
    it('ステータスをCONTRACTEDに遷移できること', async () => {
      const contractedDetail = { ...mockContractDetail, status: 'CONTRACTED' };
      mockUpdateStatus.mockResolvedValue(contractedDetail);

      const res = await request(app)
        .patch(`/api/contracts/${contractId}/status`)
        .send({ status: 'CONTRACTED' })
        .expect(200);

      expect(res.body.status).toBe('CONTRACTED');
    });

    it('ステータスをBEFORE_CONTRACTに遷移できること', async () => {
      const beforeContractDetail = {
        ...mockContractDetail,
        status: 'BEFORE_CONTRACT',
      };
      mockUpdateStatus.mockResolvedValue(beforeContractDetail);

      const res = await request(app)
        .patch(`/api/contracts/${contractId}/status`)
        .send({ status: 'BEFORE_CONTRACT' })
        .expect(200);

      expect(res.body.status).toBe('BEFORE_CONTRACT');
    });

    it('無効なステータスで400エラーが返ること', async () => {
      await request(app)
        .patch(`/api/contracts/${contractId}/status`)
        .send({ status: 'INVALID' })
        .expect(400);
    });

    it('存在しない契約書のステータス更新で404エラーが返ること', async () => {
      mockUpdateStatus.mockRejectedValue(new ContractNotFoundError());

      await request(app)
        .patch(`/api/contracts/${contractId}/status`)
        .send({ status: 'CONTRACTED' })
        .expect(404);
    });
  });

  // =================================================================
  // DELETE /api/contracts/:id - 契約書論理削除
  // =================================================================
  describe('DELETE /api/contracts/:id', () => {
    it('契約書を論理削除できること', async () => {
      mockDelete.mockResolvedValue(undefined);

      await request(app).delete(`/api/contracts/${contractId}`).expect(204);
    });

    it('存在しない契約書の削除で404エラーが返ること', async () => {
      mockDelete.mockRejectedValue(new ContractNotFoundError());

      await request(app).delete(`/api/contracts/${contractId}`).expect(404);
    });

    it('子契約が存在する場合の削除で422エラーが返ること', async () => {
      mockDelete.mockRejectedValue(
        new ContractDeletionConstraintError(
          'この契約書は変更契約の基となっているため削除できません'
        )
      );

      const res = await request(app).delete(`/api/contracts/${contractId}`).expect(422);

      expect(res.body.status).toBe(422);
      expect(res.body.detail).toBe('この契約書は変更契約の基となっているため削除できません');
    });

    it('ステータスがCONTRACTEDの場合の削除で422エラーが返ること', async () => {
      mockDelete.mockRejectedValue(
        new ContractDeletionConstraintError(
          '契約済の契約書は削除できません。ステータスを契約前に戻してから削除してください'
        )
      );

      const res = await request(app).delete(`/api/contracts/${contractId}`).expect(422);

      expect(res.body.status).toBe(422);
      expect(res.body.detail).toBe(
        '契約済の契約書は削除できません。ステータスを契約前に戻してから削除してください'
      );
    });
  });
});
