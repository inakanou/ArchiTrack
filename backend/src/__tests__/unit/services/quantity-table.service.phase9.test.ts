/**
 * @fileoverview 数量表サービス Phase 9 テスト
 *
 * Task 34.4: バックエンドAPI拡張の統合テスト（ユニットテスト形式）
 *
 * SurveyImageSummaryの注釈付きサムネイルURLとコメントフィールドの
 * マッピング処理を検証する。
 *
 * Requirements: 3.3, 21.1
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { QuantityTableService } from '../../../services/quantity-table.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

// Mock Prisma型の定義
type MockPrismaClient = {
  quantityTable: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    count: Mock;
  };
  quantityGroup: {
    create: Mock;
  };
  quantityItem: {
    create: Mock;
    update: Mock;
  };
  project: {
    findUnique: Mock;
  };
  $transaction: Mock;
};

describe('QuantityTableService Phase 9 - SurveyImage拡張', () => {
  let service: QuantityTableService;
  let mockPrisma: MockPrismaClient;
  let mockAuditLogService: { createLog: Mock };

  beforeEach(() => {
    mockPrisma = {
      quantityTable: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      quantityGroup: {
        create: vi.fn(),
      },
      quantityItem: {
        create: vi.fn(),
        update: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    mockAuditLogService = {
      createLog: vi.fn(),
    };

    service = new QuantityTableService({
      prisma: mockPrisma as unknown as PrismaClient,
      auditLogService: mockAuditLogService as unknown as IAuditLogService,
    });
  });

  describe('REQ-3.3: 注釈付きサムネイルURLのマッピング', () => {
    it('annotatedThumbnailPathが存在する場合、署名付きURLが生成されること', async () => {
      const mockResult = {
        id: 'qt-1',
        projectId: 'proj-1',
        name: 'テスト数量表',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        project: { id: 'proj-1', name: 'テストプロジェクト' },
        groups: [
          {
            id: 'group-1',
            quantityTableId: 'qt-1',
            name: 'グループ1',
            surveyImageId: 'img-1',
            displayOrder: 0,
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            surveyImage: {
              id: 'img-1',
              thumbnailPath: 'thumbnails/thumb-1.jpg',
              originalPath: 'originals/original-1.jpg',
              annotatedThumbnailPath: 'annotated/annotated-thumb-1.jpg',
              fileName: 'photo1.jpg',
              comment: 'テストコメント',
            },
            items: [],
            _count: { items: 0 },
          },
        ],
        _count: { groups: 1 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(mockResult);

      const result = await service.findById('qt-1');

      expect(result).not.toBeNull();
      const group = result!.groups[0]!;
      expect(group.surveyImage).not.toBeNull();
      // REQ-3.3: annotatedThumbnailUrlが正しく生成されること
      expect(group.surveyImage!.annotatedThumbnailUrl).toBe(
        '/api/storage/annotated/annotated-thumb-1.jpg'
      );
    });

    it('annotatedThumbnailPathがnullの場合、annotatedThumbnailUrlもnullであること', async () => {
      const mockResult = {
        id: 'qt-1',
        projectId: 'proj-1',
        name: 'テスト数量表',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        project: { id: 'proj-1', name: 'テストプロジェクト' },
        groups: [
          {
            id: 'group-1',
            quantityTableId: 'qt-1',
            name: 'グループ1',
            surveyImageId: 'img-2',
            displayOrder: 0,
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            surveyImage: {
              id: 'img-2',
              thumbnailPath: 'thumbnails/thumb-2.jpg',
              originalPath: 'originals/original-2.jpg',
              annotatedThumbnailPath: null,
              fileName: 'photo2.jpg',
              comment: null,
            },
            items: [],
            _count: { items: 0 },
          },
        ],
        _count: { groups: 1 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(mockResult);

      const result = await service.findById('qt-1');

      expect(result).not.toBeNull();
      const group = result!.groups[0]!;
      expect(group.surveyImage).not.toBeNull();
      expect(group.surveyImage!.annotatedThumbnailUrl).toBeNull();
    });
  });

  describe('REQ-21.1: 写真コメントの返却', () => {
    it('commentが存在する場合、そのまま返却されること', async () => {
      const mockResult = {
        id: 'qt-1',
        projectId: 'proj-1',
        name: 'テスト数量表',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        project: { id: 'proj-1', name: 'テストプロジェクト' },
        groups: [
          {
            id: 'group-1',
            quantityTableId: 'qt-1',
            name: 'グループ1',
            surveyImageId: 'img-1',
            displayOrder: 0,
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            surveyImage: {
              id: 'img-1',
              thumbnailPath: 'thumbnails/thumb-1.jpg',
              originalPath: 'originals/original-1.jpg',
              annotatedThumbnailPath: 'annotated/annotated-thumb-1.jpg',
              fileName: 'photo1.jpg',
              comment: '現場の亀裂箇所',
            },
            items: [],
            _count: { items: 0 },
          },
        ],
        _count: { groups: 1 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(mockResult);

      const result = await service.findById('qt-1');

      expect(result).not.toBeNull();
      const group = result!.groups[0]!;
      expect(group.surveyImage!.comment).toBe('現場の亀裂箇所');
    });

    it('commentがnullの場合、nullで返却されること', async () => {
      const mockResult = {
        id: 'qt-1',
        projectId: 'proj-1',
        name: 'テスト数量表',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        project: { id: 'proj-1', name: 'テストプロジェクト' },
        groups: [
          {
            id: 'group-1',
            quantityTableId: 'qt-1',
            name: 'グループ1',
            surveyImageId: 'img-2',
            displayOrder: 0,
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            surveyImage: {
              id: 'img-2',
              thumbnailPath: 'thumbnails/thumb-2.jpg',
              originalPath: 'originals/original-2.jpg',
              annotatedThumbnailPath: null,
              fileName: 'photo2.jpg',
              comment: null,
            },
            items: [],
            _count: { items: 0 },
          },
        ],
        _count: { groups: 1 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(mockResult);

      const result = await service.findById('qt-1');

      expect(result).not.toBeNull();
      const group = result!.groups[0]!;
      expect(group.surveyImage!.comment).toBeNull();
    });
  });
});
