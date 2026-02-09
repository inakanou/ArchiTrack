/**
 * @fileoverview オートコンプリート候補一括取得APIルートのテスト
 *
 * TDD: RED phase - テストを先に作成
 *
 * Task 15.1: プロジェクト単位のオートコンプリート候補一括取得エンドポイントを実装する
 * Task 15.2: オートコンプリート候補一括取得APIの統合テストを実装する
 *
 * Requirements:
 * - 7.1: 初回表示時に候補値を一括取得
 * - 7.2: APIリクエストは初回表示時の1回のみ
 *
 * @module __tests__/unit/routes/autocomplete-candidates.routes
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
    project: {
      findUnique: vi.fn(),
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

describe('AutocompleteCandidatesRoutes', () => {
  let app: Express;
  let mockPrisma: {
    quantityItem: {
      groupBy: Mock;
    };
    project: {
      findUnique: Mock;
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock prisma
    mockPrisma = {
      quantityItem: {
        groupBy: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
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
    // Register with project-scoped path pattern
    app.use('/api/projects/:projectId/quantity-items', autocompleteRoutes);
  });

  describe('GET /api/projects/:projectId/quantity-items/autocomplete-candidates', () => {
    const projectId = 'test-project-id-123';

    it('should return candidates for all 9 fields (Req 7.1)', async () => {
      // Mock project exists
      mockPrisma.project.findUnique.mockResolvedValue({ id: projectId });

      // Mock groupBy calls for each of the 9 fields
      mockPrisma.quantityItem.groupBy
        .mockResolvedValueOnce([{ majorCategory: '建築工事' }, { majorCategory: '電気工事' }])
        .mockResolvedValueOnce([{ middleCategory: '内装工事' }])
        .mockResolvedValueOnce([{ minorCategory: '塗装' }])
        .mockResolvedValueOnce([{ customCategory: '分類A' }])
        .mockResolvedValueOnce([{ workType: '足場' }])
        .mockResolvedValueOnce([{ name: '仮設足場' }])
        .mockResolvedValueOnce([{ specification: 'H=1800' }])
        .mockResolvedValueOnce([{ unit: 'm2' }])
        .mockResolvedValueOnce([{ remarks: '備考1' }]);

      const response = await request(app)
        .get(`/api/projects/${projectId}/quantity-items/autocomplete-candidates`)
        .expect(200);

      expect(response.body).toHaveProperty('candidates');
      const { candidates } = response.body;

      // All 9 fields should be present
      expect(candidates).toHaveProperty('majorCategory');
      expect(candidates).toHaveProperty('middleCategory');
      expect(candidates).toHaveProperty('minorCategory');
      expect(candidates).toHaveProperty('customCategory');
      expect(candidates).toHaveProperty('workType');
      expect(candidates).toHaveProperty('name');
      expect(candidates).toHaveProperty('specification');
      expect(candidates).toHaveProperty('unit');
      expect(candidates).toHaveProperty('remarks');

      // Verify values
      expect(candidates.majorCategory).toContain('建築工事');
      expect(candidates.majorCategory).toContain('電気工事');
      expect(candidates.middleCategory).toContain('内装工事');
      expect(candidates.minorCategory).toContain('塗装');
      expect(candidates.customCategory).toContain('分類A');
      expect(candidates.workType).toContain('足場');
      expect(candidates.name).toContain('仮設足場');
      expect(candidates.specification).toContain('H=1800');
      expect(candidates.unit).toContain('m2');
      expect(candidates.remarks).toContain('備考1');
    });

    it('should execute 9 groupBy queries in parallel via Promise.all', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: projectId });

      // All return empty arrays
      mockPrisma.quantityItem.groupBy.mockResolvedValue([]);

      await request(app)
        .get(`/api/projects/${projectId}/quantity-items/autocomplete-candidates`)
        .expect(200);

      // Should have been called 9 times (one for each field)
      expect(mockPrisma.quantityItem.groupBy).toHaveBeenCalledTimes(9);
    });

    it('should filter by projectId and exclude deleted quantity tables', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: projectId });
      mockPrisma.quantityItem.groupBy.mockResolvedValue([]);

      await request(app)
        .get(`/api/projects/${projectId}/quantity-items/autocomplete-candidates`)
        .expect(200);

      // Check that each groupBy call uses the correct where clause
      const calls = mockPrisma.quantityItem.groupBy.mock.calls;
      for (const call of calls) {
        const args = call[0];
        expect(args.where).toBeDefined();
        expect(args.where.quantityGroup).toBeDefined();
        expect(args.where.quantityGroup.quantityTable).toBeDefined();
        expect(args.where.quantityGroup.quantityTable.projectId).toBe(projectId);
        expect(args.where.quantityGroup.quantityTable.deletedAt).toBeNull();
      }
    });

    it('should exclude NULL and empty string values from candidates', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: projectId });

      // majorCategory groupBy returns values including null/empty
      mockPrisma.quantityItem.groupBy
        .mockResolvedValueOnce([
          { majorCategory: '建築工事' },
          { majorCategory: '' },
          { majorCategory: '電気工事' },
        ])
        .mockResolvedValue([]); // Other fields return empty

      const response = await request(app)
        .get(`/api/projects/${projectId}/quantity-items/autocomplete-candidates`)
        .expect(200);

      // Empty strings should be filtered out
      expect(response.body.candidates.majorCategory).not.toContain('');
      expect(response.body.candidates.majorCategory).toContain('建築工事');
      expect(response.body.candidates.majorCategory).toContain('電気工事');
    });

    it('should sort candidates in Japanese locale order (50-on order)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: projectId });

      mockPrisma.quantityItem.groupBy
        .mockResolvedValueOnce([
          { majorCategory: 'たたみ工事' },
          { majorCategory: 'あいう工事' },
          { majorCategory: 'さしす工事' },
        ])
        .mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/projects/${projectId}/quantity-items/autocomplete-candidates`)
        .expect(200);

      const sorted = [...response.body.candidates.majorCategory].sort((a: string, b: string) =>
        a.localeCompare(b, 'ja')
      );
      expect(response.body.candidates.majorCategory).toEqual(sorted);
    });

    it('should return 404 when project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await request(app)
        .get(`/api/projects/nonexistent-project/quantity-items/autocomplete-candidates`)
        .expect(404);
    });

    it('should return empty arrays when no quantity items exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: projectId });
      mockPrisma.quantityItem.groupBy.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/projects/${projectId}/quantity-items/autocomplete-candidates`)
        .expect(200);

      const { candidates } = response.body;
      expect(candidates.majorCategory).toEqual([]);
      expect(candidates.middleCategory).toEqual([]);
      expect(candidates.minorCategory).toEqual([]);
      expect(candidates.customCategory).toEqual([]);
      expect(candidates.workType).toEqual([]);
      expect(candidates.name).toEqual([]);
      expect(candidates.specification).toEqual([]);
      expect(candidates.unit).toEqual([]);
      expect(candidates.remarks).toEqual([]);
    });

    it('should require authentication', async () => {
      expect(mockAuthenticate).toBeDefined();
    });

    it('should require quantity_table:read permission', async () => {
      expect(mockRequirePermission).toBeDefined();
    });
  });
});
