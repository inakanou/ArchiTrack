/**
 * @fileoverview EstimateRequestService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 3.6: 見積依頼を作成し詳細画面に遷移
 * - 8.1: 見積依頼をプロジェクトに紐付けて保存
 * - 8.2: 見積依頼に選択された項目リストを保存
 * - 8.3: 見積依頼の作成日時と更新日時を記録
 * - 8.4: 見積依頼の削除時に論理削除を行う
 * - 8.5: 楽観的排他制御により同時更新を防止
 * - 4.4: 項目の選択状態更新
 * - 4.5: 選択状態を自動的に保存
 * - 4.10-4.12: 他の見積依頼での選択状態を含む項目一覧取得
 * - 9.6: 変更を保存
 *
 * Task 2.1: EstimateRequestServiceの基本CRUD操作
 * Task 2.2: EstimateRequestServiceの項目選択管理
 *
 * @module tests/unit/services/estimate-request.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { EstimateRequestService } from '../../../services/estimate-request.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import {
  EstimateRequestNotFoundError,
  EstimateRequestConflictError,
  TradingPartnerNotSubcontractorError,
  EmptyItemizedStatementItemsError,
} from '../../../errors/estimateRequestError.js';
import { ItemizedStatementNotFoundError } from '../../../errors/itemizedStatementError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    estimateRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    estimateRequestItem: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    itemizedStatement: {
      findUnique: vi.fn(),
    },
    itemizedStatementItem: {
      findMany: vi.fn(),
    },
    tradingPartner: {
      findUnique: vi.fn(),
    },
    tradingPartnerTypeMapping: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        estimateRequest: {
          create: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
        },
        estimateRequestItem: {
          createMany: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
        },
        itemizedStatement: {
          findUnique: vi.fn(),
        },
        itemizedStatementItem: {
          findMany: vi.fn(),
        },
        tradingPartner: {
          findUnique: vi.fn(),
        },
        tradingPartnerTypeMapping: {
          findFirst: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
};

// AuditLogServiceモック
const createMockAuditLogService = (): IAuditLogService => ({
  createLog: vi.fn().mockResolvedValue(undefined),
  getLogs: vi.fn(),
  exportLogs: vi.fn(),
});

describe('EstimateRequestService', () => {
  let service: EstimateRequestService;
  let mockPrisma: PrismaClient;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();
    service = new EstimateRequestService({
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    });
  });

  describe('create', () => {
    it('見積依頼を作成し、内訳書項目をEstimateRequestItemとして自動初期化する（Requirements: 3.6, 8.1, 8.2）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト見積依頼',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        method: 'EMAIL' as const,
      };

      const mockTradingPartner = {
        id: 'tp-001',
        name: 'テスト協力業者',
        deletedAt: null,
      };

      const mockTypeMapping = {
        id: 'tpm-001',
        tradingPartnerId: 'tp-001',
        type: 'SUBCONTRACTOR',
      };

      const mockItemizedStatement = {
        id: 'is-001',
        name: 'テスト内訳書',
        projectId: 'proj-001',
        deletedAt: null,
        items: [
          { id: 'item-001', displayOrder: 0 },
          { id: 'item-002', displayOrder: 1 },
        ],
      };

      const mockCreatedRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-01-23T00:00:00Z'),
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
      };

      // トランザクションモックをセットアップ
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          tradingPartner: {
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            findFirst: vi.fn().mockResolvedValue(mockTypeMapping),
          },
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockItemizedStatement),
          },
          estimateRequest: {
            create: vi.fn().mockResolvedValue(mockCreatedRequest),
          },
          estimateRequestItem: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe('er-001');
      expect(result.name).toBe('テスト見積依頼');
      expect(result.tradingPartnerName).toBe('テスト協力業者');
      expect(result.itemizedStatementName).toBe('テスト内訳書');
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('取引先が協力業者ではない場合、エラーを発生させる（Requirements: 3.4）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト見積依頼',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
      };

      const mockTradingPartner = {
        id: 'tp-001',
        name: 'テスト顧客',
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          tradingPartner: {
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            findFirst: vi.fn().mockResolvedValue(null), // SUBCONTRACTORタイプが無い
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(
        TradingPartnerNotSubcontractorError
      );
    });

    it('内訳書が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト見積依頼',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-nonexistent',
      };

      const mockTradingPartner = {
        id: 'tp-001',
        name: 'テスト協力業者',
        deletedAt: null,
      };

      const mockTypeMapping = {
        id: 'tpm-001',
        tradingPartnerId: 'tp-001',
        type: 'SUBCONTRACTOR',
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          tradingPartner: {
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            findFirst: vi.fn().mockResolvedValue(mockTypeMapping),
          },
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(ItemizedStatementNotFoundError);
    });

    it('内訳書に項目がない場合、エラーを発生させる（Requirements: 4.13）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: 'テスト見積依頼',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
      };

      const mockTradingPartner = {
        id: 'tp-001',
        name: 'テスト協力業者',
        deletedAt: null,
      };

      const mockTypeMapping = {
        id: 'tpm-001',
        tradingPartnerId: 'tp-001',
        type: 'SUBCONTRACTOR',
      };

      const mockItemizedStatement = {
        id: 'is-001',
        name: 'テスト内訳書',
        projectId: 'proj-001',
        deletedAt: null,
        items: [], // 項目が0件
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          tradingPartner: {
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            findFirst: vi.fn().mockResolvedValue(mockTypeMapping),
          },
          itemizedStatement: {
            findUnique: vi.fn().mockResolvedValue(mockItemizedStatement),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow(
        EmptyItemizedStatementItemsError
      );
    });
  });

  describe('findById', () => {
    it('見積依頼詳細を取得する', async () => {
      // Arrange
      const requestId = 'er-001';
      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-01-23T00:00:00Z'),
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);

      // Act
      const result = await service.findById(requestId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe('er-001');
      expect(result!.name).toBe('テスト見積依頼');
    });

    it('存在しない見積依頼の場合、nullを返す', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(null);

      // Act
      const result = await service.findById('er-nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除された見積依頼の場合、nullを返す', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // 論理削除済み
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);

      // Act
      const result = await service.findById('er-001');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByProjectId', () => {
    it('プロジェクトに紐付く見積依頼一覧を取得する', async () => {
      // Arrange
      const projectId = 'proj-001';
      const mockRequests = [
        {
          id: 'er-001',
          projectId: 'proj-001',
          tradingPartnerId: 'tp-001',
          itemizedStatementId: 'is-001',
          name: '見積依頼1',
          method: 'EMAIL',
          includeBreakdownInBody: false,
          createdAt: new Date('2026-01-23T00:00:00Z'),
          updatedAt: new Date('2026-01-23T00:00:00Z'),
          deletedAt: null,
          tradingPartner: { id: 'tp-001', name: '協力業者1' },
          itemizedStatement: { id: 'is-001', name: '内訳書1' },
        },
        {
          id: 'er-002',
          projectId: 'proj-001',
          tradingPartnerId: 'tp-002',
          itemizedStatementId: 'is-002',
          name: '見積依頼2',
          method: 'FAX',
          includeBreakdownInBody: true,
          createdAt: new Date('2026-01-22T00:00:00Z'),
          updatedAt: new Date('2026-01-22T00:00:00Z'),
          deletedAt: null,
          tradingPartner: { id: 'tp-002', name: '協力業者2' },
          itemizedStatement: { id: 'is-002', name: '内訳書2' },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findMany).mockResolvedValue(mockRequests as never);
      vi.mocked(mockPrisma.estimateRequest.count).mockResolvedValue(2 as never);

      // Act
      const result = await service.findByProjectId(projectId, { page: 1, limit: 20 });

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.name).toBe('見積依頼1');
      expect(result.pagination.total).toBe(2);
    });

    it('論理削除された見積依頼は除外する', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimateRequest.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.estimateRequest.count).mockResolvedValue(0 as never);

      // Act
      const result = await service.findByProjectId('proj-001', { page: 1, limit: 20 });

      // Assert
      expect(result.data).toHaveLength(0);
      expect(mockPrisma.estimateRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('見積依頼を更新する（Requirements: 9.6）', async () => {
      // Arrange
      const requestId = 'er-001';
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');
      const input = {
        name: '更新後の見積依頼名',
        method: 'FAX' as const,
        includeBreakdownInBody: true,
      };

      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: '元の見積依頼名',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-01-22T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        name: '更新後の見積依頼名',
        method: 'FAX',
        includeBreakdownInBody: true,
        updatedAt: new Date('2026-01-23T01:00:00Z'),
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockRequest),
            update: vi.fn().mockResolvedValue(mockUpdatedRequest),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.update(requestId, input, actorId, expectedUpdatedAt);

      // Assert
      expect(result.name).toBe('更新後の見積依頼名');
      expect(result.method).toBe('FAX');
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('楽観的排他制御エラー時はEstimateRequestConflictErrorを発生させる（Requirements: 8.5）', async () => {
      // Arrange
      const actualUpdatedAt = new Date('2026-01-23T01:00:00Z');
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z'); // 異なる日時

      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: '見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date(),
        updatedAt: actualUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockRequest),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.update('er-001', { name: '新しい名前' }, 'user-001', expectedUpdatedAt)
      ).rejects.toThrow(EstimateRequestConflictError);
    });
  });

  describe('delete', () => {
    it('見積依頼を論理削除する（Requirements: 8.4）', async () => {
      // Arrange
      const requestId = 'er-001';
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date(),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockRequest),
            update: vi.fn().mockResolvedValue({ ...mockRequest, deletedAt: new Date() }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.delete(requestId, actorId, expectedUpdatedAt);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('存在しない見積依頼の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('er-nonexistent', 'user-001', new Date())).rejects.toThrow(
        EstimateRequestNotFoundError
      );
    });

    it('楽観的排他制御エラー時はEstimateRequestConflictErrorを発生させる', async () => {
      // Arrange
      const actualUpdatedAt = new Date('2026-01-23T01:00:00Z');
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: '見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date(),
        updatedAt: actualUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockRequest),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('er-001', 'user-001', expectedUpdatedAt)).rejects.toThrow(
        EstimateRequestConflictError
      );
    });
  });

  describe('updateItemSelection', () => {
    it('項目の選択状態を更新する（Requirements: 4.4, 4.5）', async () => {
      // Arrange
      const requestId = 'er-001';
      const actorId = 'user-001';
      const itemSelections = [
        { itemId: 'eri-001', selected: true },
        { itemId: 'eri-002', selected: false },
      ];

      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockRequest),
          },
          estimateRequestItem: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.updateItemSelection(requestId, itemSelections, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('存在しない見積依頼の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.updateItemSelection(
          'er-nonexistent',
          [{ itemId: 'eri-001', selected: true }],
          'user-001'
        )
      ).rejects.toThrow(EstimateRequestNotFoundError);
    });
  });

  describe('findItemsWithOtherRequestStatus', () => {
    it('他の見積依頼での選択状態を含む項目一覧を取得する（Requirements: 4.10, 4.11, 4.12）', async () => {
      // Arrange
      const requestId = 'er-001';
      const mockRequest = {
        id: 'er-001',
        projectId: 'proj-001',
        itemizedStatementId: 'is-001',
        deletedAt: null,
      };

      const mockItems = [
        {
          id: 'eri-001',
          estimateRequestId: 'er-001',
          itemizedStatementItemId: 'isi-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            customCategory: '分類A',
            workType: '工種1',
            name: '名称1',
            specification: '規格1',
            unit: 'm',
            quantity: new Decimal('10.00'),
            displayOrder: 0,
          },
        },
        {
          id: 'eri-002',
          estimateRequestId: 'er-001',
          itemizedStatementItemId: 'isi-002',
          selected: false,
          itemizedStatementItem: {
            id: 'isi-002',
            customCategory: '分類B',
            workType: '工種2',
            name: '名称2',
            specification: null,
            unit: '式',
            quantity: new Decimal('5.00'),
            displayOrder: 1,
          },
        },
      ];

      // 他の見積依頼での選択状態
      const mockOtherSelections = [
        {
          itemizedStatementItemId: 'isi-001',
          estimateRequest: {
            id: 'er-002',
            name: '他の見積依頼',
            tradingPartner: { name: '協力業者B' },
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany)
        .mockResolvedValueOnce(mockItems as never) // 対象見積依頼の項目
        .mockResolvedValueOnce(mockOtherSelections as never); // 他の見積依頼での選択

      // Act
      const result = await service.findItemsWithOtherRequestStatus(requestId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.selected).toBe(true);
      expect(result[0]!.otherRequests).toHaveLength(1);
      expect(result[0]!.otherRequests[0]!.tradingPartnerName).toBe('協力業者B');
    });

    it('存在しない見積依頼の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(service.findItemsWithOtherRequestStatus('er-nonexistent')).rejects.toThrow(
        EstimateRequestNotFoundError
      );
    });
  });
});
