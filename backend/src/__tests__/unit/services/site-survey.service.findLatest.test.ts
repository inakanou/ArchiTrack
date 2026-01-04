/**
 * @fileoverview SiteSurveyService.findLatestByProjectId ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.1: プロジェクト詳細画面に直近2件の現場調査と総数を表示する
 *
 * Task 31.1: 現場調査直近N件取得APIエンドポイントを実装する
 * - GET /api/projects/:projectId/site-surveys/latest
 * - クエリパラメータでlimit（デフォルト2）を指定可能
 * - 直近N件の現場調査と総数（totalCount）を返却する
 * - SurveyServiceにfindLatestByProjectIdメソッドを追加
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SiteSurveyService,
  type SiteSurveyServiceDependencies,
} from '../../../services/site-survey.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

// テスト用モック
function createMockPrisma() {
  return {
    project: {
      findUnique: vi.fn(),
    },
    siteSurvey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        project: {
          findUnique: vi.fn(),
        },
        siteSurvey: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
}

function createMockAuditLogService(): IAuditLogService {
  return {
    createLog: vi.fn().mockResolvedValue({ id: 'audit-log-id' }),
    getLogs: vi.fn().mockResolvedValue([]),
    exportLogs: vi.fn().mockResolvedValue('[]'),
  };
}

// テスト用サンプルデータ

const mockSurveys = [
  {
    id: 'survey-1',
    projectId: 'project-123',
    name: '第3回現場調査',
    surveyDate: new Date('2024-03-15'),
    memo: 'メモ3',
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
    deletedAt: null,
    images: [
      {
        id: 'image-1',
        thumbnailPath: 'thumbnails/survey-1/image-1.jpg',
      },
    ],
    _count: { images: 3 },
  },
  {
    id: 'survey-2',
    projectId: 'project-123',
    name: '第2回現場調査',
    surveyDate: new Date('2024-02-15'),
    memo: 'メモ2',
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-01'),
    deletedAt: null,
    images: [],
    _count: { images: 0 },
  },
  {
    id: 'survey-3',
    projectId: 'project-123',
    name: '第1回現場調査',
    surveyDate: new Date('2024-01-15'),
    memo: 'メモ1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    images: [],
    _count: { images: 0 },
  },
];

describe('SiteSurveyService', () => {
  let service: SiteSurveyService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();

    const deps: SiteSurveyServiceDependencies = {
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    };

    service = new SiteSurveyService(deps);
  });

  /**
   * Task 31.1: findLatestByProjectId
   *
   * Requirements:
   * - 2.1: プロジェクト詳細画面に直近2件の現場調査と総数を表示する
   */
  describe('findLatestByProjectId', () => {
    it('直近N件の現場調査と総数を返却する（Requirements: 2.1）', async () => {
      // Arrange
      const projectId = 'project-123';
      const limit = 2;

      // 直近2件の現場調査を返す
      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue(mockSurveys.slice(0, 2));
      // 総数を返す
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(3);

      // Act
      const result = await service.findLatestByProjectId(projectId, limit);

      // Assert
      expect(result).toBeDefined();
      expect(result.totalCount).toBe(3);
      expect(result.latestSurveys).toHaveLength(2);
      expect(result.latestSurveys[0]!.name).toBe('第3回現場調査');
      expect(result.latestSurveys[1]!.name).toBe('第2回現場調査');
    });

    it('デフォルトのlimitは2件である（Requirements: 2.1）', async () => {
      // Arrange
      const projectId = 'project-123';

      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue(mockSurveys.slice(0, 2));
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(3);

      // Act
      const result = await service.findLatestByProjectId(projectId);

      // Assert
      expect(mockPrisma.siteSurvey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
        })
      );
      expect(result.latestSurveys).toHaveLength(2);
    });

    it('調査日の降順でソートされる（Requirements: 2.1）', async () => {
      // Arrange
      const projectId = 'project-123';
      const limit = 3;

      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue(mockSurveys);
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(3);

      // Act
      await service.findLatestByProjectId(projectId, limit);

      // Assert
      expect(mockPrisma.siteSurvey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { surveyDate: 'desc' },
        })
      );
    });

    it('論理削除されたレコードは除外される', async () => {
      // Arrange
      const projectId = 'project-123';

      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(0);

      // Act
      await service.findLatestByProjectId(projectId);

      // Assert
      expect(mockPrisma.siteSurvey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
      expect(mockPrisma.siteSurvey.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });

    it('現場調査が0件の場合は空配列と総数0を返す', async () => {
      // Arrange
      const projectId = 'project-empty';

      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(0);

      // Act
      const result = await service.findLatestByProjectId(projectId);

      // Assert
      expect(result.totalCount).toBe(0);
      expect(result.latestSurveys).toHaveLength(0);
    });

    it('現場調査が1件の場合は1件と総数1を返す', async () => {
      // Arrange
      const projectId = 'project-123';
      const singleSurvey = [mockSurveys[0]];

      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue(singleSurvey);
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.findLatestByProjectId(projectId);

      // Assert
      expect(result.totalCount).toBe(1);
      expect(result.latestSurveys).toHaveLength(1);
    });

    it('サムネイルURLを含む現場調査情報を返す（Requirements: 2.1）', async () => {
      // Arrange
      const projectId = 'project-123';

      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue([mockSurveys[0]]);
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.findLatestByProjectId(projectId, 1);

      // Assert
      expect(result.latestSurveys[0]!.thumbnailUrl).toBe('thumbnails/survey-1/image-1.jpg');
    });

    it('画像がない場合はthumbnailUrlがnullになる', async () => {
      // Arrange
      const projectId = 'project-123';
      const surveyWithoutImages = [mockSurveys[1]]; // images: []

      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue(surveyWithoutImages);
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.findLatestByProjectId(projectId, 1);

      // Assert
      expect(result.latestSurveys[0]!.thumbnailUrl).toBeNull();
    });

    it('画像件数を返す', async () => {
      // Arrange
      const projectId = 'project-123';
      // mockSurveys[0]には既に_count: { images: 3 }がある
      mockPrisma.siteSurvey.findMany = vi.fn().mockResolvedValue([mockSurveys[0]]);
      mockPrisma.siteSurvey.count = vi.fn().mockResolvedValue(1);

      // Act
      const result = await service.findLatestByProjectId(projectId, 1);

      // Assert
      expect(result.latestSurveys[0]!.imageCount).toBe(3);
    });
  });
});
