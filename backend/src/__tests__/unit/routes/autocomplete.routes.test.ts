/**
 * @fileoverview オートコンプリートAPIルートのテスト
 *
 * TDD: RED phase - テストを先に作成
 *
 * Requirements:
 * - 7.1: 大項目フィールドで2文字以上入力すると、過去の入力履歴からオートコンプリート候補を表示する
 * - 7.2: 中項目フィールドで2文字以上入力すると、選択中の大項目に紐づく過去の中項目からオートコンプリート候補を表示する
 * - 7.3: 小項目フィールドで2文字以上入力すると、選択中の大項目・中項目に紐づく過去の小項目からオートコンプリート候補を表示する
 *
 * @module __tests__/unit/routes/autocomplete.routes
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Mock dependencies before importing routes
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    quantityItem: {
      groupBy: vi.fn(),
    },
  })),
}));

vi.mock('../../../middleware/authenticate.middleware.js');
vi.mock('../../../middleware/authorize.middleware.js');

import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import getPrismaClient from '../../../db.js';

// Type for mocked middleware
const mockAuthenticate = authenticate as Mock;
const mockRequirePermission = requirePermission as Mock;
const mockGetPrismaClient = getPrismaClient as Mock;

describe('AutocompleteRoutes', () => {
  let app: Express;
  let mockPrisma: {
    quantityItem: {
      groupBy: Mock;
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock prisma
    mockPrisma = {
      quantityItem: {
        groupBy: vi.fn(),
      },
    };

    mockGetPrismaClient.mockReturnValue(mockPrisma);

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
      default: vi.fn(() => mockPrisma),
    }));

    vi.doMock('../../../middleware/authenticate.middleware.js', () => ({
      authenticate: mockAuthenticate,
    }));

    vi.doMock('../../../middleware/authorize.middleware.js', () => ({
      requirePermission: mockRequirePermission,
    }));

    // Import route after mocks are setup
    const { default: autocompleteRoutes } = await import('../../../routes/autocomplete.routes.js');

    // Setup express app
    app = express();
    app.use(express.json());
    app.use('/api/autocomplete', autocompleteRoutes);
  });

  describe('GET /api/autocomplete/major-categories', () => {
    it('should return major category suggestions (Req 7.1)', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([
        { majorCategory: '建築工事' },
        { majorCategory: '建具工事' },
        { majorCategory: '建設仮設工事' },
      ]);

      const response = await request(app)
        .get('/api/autocomplete/major-categories?q=建')
        .expect(200);

      expect(response.body.suggestions).toEqual(['建築工事', '建具工事', '建設仮設工事']);
    });

    it('should accept query with 1 character', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([{ majorCategory: '建築工事' }]);

      const response = await request(app)
        .get('/api/autocomplete/major-categories?q=建')
        .expect(200);

      expect(response.body).toHaveProperty('suggestions');
    });

    it('should return limited results based on limit parameter', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([
        { majorCategory: 'カテゴリ1' },
        { majorCategory: 'カテゴリ2' },
      ]);

      const response = await request(app)
        .get('/api/autocomplete/major-categories?q=カテ&limit=2')
        .expect(200);

      expect(response.body.suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/autocomplete/middle-categories', () => {
    it('should return middle category suggestions filtered by major category (Req 7.2)', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([
        { middleCategory: '内装仕上工事' },
        { middleCategory: '内壁工事' },
      ]);

      const response = await request(app)
        .get('/api/autocomplete/middle-categories?q=内&majorCategory=建築工事')
        .expect(200);

      expect(response.body.suggestions).toEqual(['内装仕上工事', '内壁工事']);
    });

    it('should require majorCategory parameter', async () => {
      // Missing majorCategory should result in 400
      await request(app).get('/api/autocomplete/middle-categories?q=内').expect(400);
    });
  });

  describe('GET /api/autocomplete/minor-categories', () => {
    it('should return minor category suggestions filtered by major and middle categories (Req 7.3)', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([
        { minorCategory: '塗装下地処理' },
        { minorCategory: '塗装仕上げ' },
      ]);

      const response = await request(app)
        .get(
          '/api/autocomplete/minor-categories?q=塗&majorCategory=建築工事&middleCategory=内装仕上工事'
        )
        .expect(200);

      expect(response.body.suggestions).toEqual(['塗装下地処理', '塗装仕上げ']);
    });

    it('should require majorCategory and middleCategory parameters', async () => {
      // Missing middleCategory should result in 400
      await request(app)
        .get('/api/autocomplete/minor-categories?q=塗&majorCategory=建築工事')
        .expect(400);
    });
  });

  describe('GET /api/autocomplete/work-types', () => {
    it('should return work type suggestions', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([
        { workType: '足場工事' },
        { workType: '足場解体工事' },
      ]);

      const response = await request(app).get('/api/autocomplete/work-types?q=足').expect(200);

      expect(response.body.suggestions).toEqual(['足場工事', '足場解体工事']);
    });
  });

  describe('GET /api/autocomplete/units', () => {
    it('should return unit suggestions', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([{ unit: 'm2' }, { unit: 'm3' }]);

      const response = await request(app).get('/api/autocomplete/units?q=m').expect(200);

      expect(response.body.suggestions).toEqual(['m2', 'm3']);
    });
  });

  describe('GET /api/autocomplete/specifications', () => {
    it('should return specification suggestions', async () => {
      mockPrisma.quantityItem.groupBy.mockResolvedValue([
        { specification: 'H=1800mm' },
        { specification: 'H=2000mm' },
      ]);

      const response = await request(app).get('/api/autocomplete/specifications?q=H=').expect(200);

      expect(response.body.suggestions).toEqual(['H=1800mm', 'H=2000mm']);
    });
  });
});
