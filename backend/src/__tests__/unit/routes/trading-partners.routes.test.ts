/**
 * @fileoverview 取引先ルートのユニットテスト
 *
 * Requirements:
 * - 7.1: 認証済みユーザーのみに取引先一覧・詳細の閲覧を許可
 * - 7.2: 取引先の作成・編集・削除操作に対して適切な権限チェックを実行
 * - 7.3: 権限のないユーザーが操作を試みた場合、403 Forbiddenエラーを返却
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

// Use vi.hoisted to create mock functions that are hoisted along with vi.mock
const {
  mockGetPartners,
  mockGetPartner,
  mockCreatePartner,
  mockUpdatePartner,
  mockDeletePartner,
  mockCreateLog,
  mockRequirePermission,
  mockState,
} = vi.hoisted(() => ({
  mockGetPartners: vi.fn(),
  mockGetPartner: vi.fn(),
  mockCreatePartner: vi.fn(),
  mockUpdatePartner: vi.fn(),
  mockDeletePartner: vi.fn(),
  mockCreateLog: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockState: { shouldRejectPermission: false },
}));

// Mock dependencies before importing the routes
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    $transaction: vi.fn(),
    tradingPartner: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  })),
}));

vi.mock('../../../services/trading-partner.service.js', () => ({
  TradingPartnerService: class {
    getPartners = mockGetPartners;
    getPartner = mockGetPartner;
    createPartner = mockCreatePartner;
    updatePartner = mockUpdatePartner;
    deletePartner = mockDeletePartner;
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
import tradingPartnersRoutes from '../../../routes/trading-partners.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

/**
 * テスト用アプリケーションのセットアップ
 */
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/trading-partners', tradingPartnersRoutes);

  // Use actual error handler to properly handle validation errors
  app.use(errorHandler);

  return app;
}

describe('TradingPartnersRoutes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.shouldRejectPermission = false;
    app = createTestApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/trading-partners', () => {
    it('認証済みユーザーが取引先一覧を取得できる', async () => {
      // Arrange
      mockGetPartners.mockResolvedValue({
        data: [
          {
            id: 'partner-1',
            name: 'テスト株式会社',
            nameKana: 'テストカブシキガイシャ',
            address: '東京都渋谷区1-1-1',
            types: ['CUSTOMER'],
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });

      // Act
      const response = await request(app).get('/api/trading-partners');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:read');
    });

    it('trading-partner:read権限が必要', async () => {
      // Arrange
      mockGetPartners.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      // Act
      await request(app).get('/api/trading-partners');

      // Assert
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:read');
    });

    it('権限がない場合は403エラーを返す', async () => {
      // Arrange
      mockState.shouldRejectPermission = true;

      // Act
      const response = await request(app).get('/api/trading-partners');

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('ページネーションパラメータを処理できる', async () => {
      // Arrange
      mockGetPartners.mockResolvedValue({
        data: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });

      // Act
      const response = await request(app).get('/api/trading-partners?page=2&limit=10');

      // Assert
      expect(response.status).toBe(200);
    });

    it('検索パラメータを処理できる', async () => {
      // Arrange
      mockGetPartners.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      // Act
      const response = await request(app).get('/api/trading-partners?search=テスト');

      // Assert
      expect(response.status).toBe(200);
    });

    it('種別フィルターを処理できる', async () => {
      // Arrange
      mockGetPartners.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      // Act
      const response = await request(app).get('/api/trading-partners?type=CUSTOMER');

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/trading-partners/:id', () => {
    it('認証済みユーザーが取引先詳細を取得できる', async () => {
      // Arrange
      mockGetPartner.mockResolvedValue({
        id: 'partner-1',
        name: 'テスト株式会社',
        nameKana: 'テストカブシキガイシャ',
        address: '東京都渋谷区1-1-1',
        types: ['CUSTOMER'],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      });

      // Act
      const response = await request(app).get(
        '/api/trading-partners/550e8400-e29b-41d4-a716-446655440000'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('partner-1');
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:read');
    });

    it('trading-partner:read権限が必要', async () => {
      // Arrange
      mockGetPartner.mockResolvedValue({ id: 'partner-1' });

      // Act
      await request(app).get('/api/trading-partners/550e8400-e29b-41d4-a716-446655440000');

      // Assert
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:read');
    });

    it('無効なUUID形式でバリデーションエラーを返す', async () => {
      // Act
      const response = await request(app).get('/api/trading-partners/invalid-uuid');

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/trading-partners', () => {
    const validCreateBody = {
      name: 'テスト株式会社',
      nameKana: 'テストカブシキガイシャ',
      types: ['CUSTOMER'],
      address: '東京都渋谷区1-1-1',
    };

    it('認証済みユーザーが取引先を作成できる', async () => {
      // Arrange
      mockCreatePartner.mockResolvedValue({
        id: 'new-partner-id',
        ...validCreateBody,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      });

      // Act
      const response = await request(app).post('/api/trading-partners').send(validCreateBody);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.id).toBe('new-partner-id');
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:create');
    });

    it('trading-partner:create権限が必要', async () => {
      // Arrange
      mockCreatePartner.mockResolvedValue({ id: 'new-partner-id' });

      // Act
      await request(app).post('/api/trading-partners').send(validCreateBody);

      // Assert
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:create');
    });

    it('権限がない場合は403エラーを返す', async () => {
      // Arrange
      mockState.shouldRejectPermission = true;

      // Act
      const response = await request(app).post('/api/trading-partners').send(validCreateBody);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('必須フィールドがない場合はバリデーションエラーを返す', async () => {
      // Act
      const response = await request(app).post('/api/trading-partners').send({});

      // Assert
      expect(response.status).toBe(400);
    });

    it('フリガナがカタカナ以外の場合はバリデーションエラーを返す', async () => {
      // Act
      const response = await request(app)
        .post('/api/trading-partners')
        .send({
          ...validCreateBody,
          nameKana: 'てすとかぶしきがいしゃ', // ひらがな
        });

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/trading-partners/:id', () => {
    const validUpdateBody = {
      name: '更新テスト株式会社',
      expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('認証済みユーザーが取引先を更新できる', async () => {
      // Arrange
      mockUpdatePartner.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: '更新テスト株式会社',
        updatedAt: new Date('2024-01-02'),
      });

      // Act
      const response = await request(app)
        .put('/api/trading-partners/550e8400-e29b-41d4-a716-446655440000')
        .send(validUpdateBody);

      // Assert
      expect(response.status).toBe(200);
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:update');
    });

    it('trading-partner:update権限が必要', async () => {
      // Arrange
      mockUpdatePartner.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000' });

      // Act
      await request(app)
        .put('/api/trading-partners/550e8400-e29b-41d4-a716-446655440000')
        .send(validUpdateBody);

      // Assert
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:update');
    });

    it('権限がない場合は403エラーを返す', async () => {
      // Arrange
      mockState.shouldRejectPermission = true;

      // Act
      const response = await request(app)
        .put('/api/trading-partners/550e8400-e29b-41d4-a716-446655440000')
        .send(validUpdateBody);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('expectedUpdatedAtがない場合はバリデーションエラーを返す', async () => {
      // Act
      const response = await request(app)
        .put('/api/trading-partners/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: '更新テスト株式会社' });

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/trading-partners/:id', () => {
    it('認証済みユーザーが取引先を削除できる', async () => {
      // Arrange
      mockDeletePartner.mockResolvedValue(undefined);

      // Act
      const response = await request(app).delete(
        '/api/trading-partners/550e8400-e29b-41d4-a716-446655440000'
      );

      // Assert
      expect(response.status).toBe(204);
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:delete');
    });

    it('trading-partner:delete権限が必要', async () => {
      // Arrange
      mockDeletePartner.mockResolvedValue(undefined);

      // Act
      await request(app).delete('/api/trading-partners/550e8400-e29b-41d4-a716-446655440000');

      // Assert
      expect(mockRequirePermission).toHaveBeenCalledWith('trading-partner:delete');
    });

    it('権限がない場合は403エラーを返す', async () => {
      // Arrange
      mockState.shouldRejectPermission = true;

      // Act
      const response = await request(app).delete(
        '/api/trading-partners/550e8400-e29b-41d4-a716-446655440000'
      );

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });
  });
});
