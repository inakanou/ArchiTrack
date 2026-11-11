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

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { ProjectScopeService } from '../../../services/project-scope.service.js';
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
  /** 他の見積依頼の絞り込み条件（タスク103.1）。既定は全案件閲覧（絞り込みなし） */
  let mockProjectScope: {
    buildProjectScopeWhere: Mock<ProjectScopeService['buildProjectScopeWhere']>;
  };

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();
    mockProjectScope = {
      buildProjectScopeWhere: vi
        .fn<ProjectScopeService['buildProjectScopeWhere']>()
        .mockResolvedValue(null),
    };
    service = new EstimateRequestService({
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
      projectScopeService: mockProjectScope,
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

    it('内訳書未指定（undefined）の場合、内訳書なしで保存され EstimateRequestItem は生成されない（Requirements: 39.2, 39.3, 39.4）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: '内訳書なし見積依頼',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        method: 'EMAIL' as const,
        // itemizedStatementId 未指定
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

      const mockCreatedRequest = {
        id: 'er-no-is-001',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: null,
        name: '内訳書なし見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-05-08T00:00:00Z'),
        updatedAt: new Date('2026-05-08T00:00:00Z'),
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: null,
      };

      const itemizedStatementFindUnique = vi.fn();
      const estimateRequestItemCreateMany = vi.fn();
      const estimateRequestCreate = vi.fn().mockResolvedValue(mockCreatedRequest);

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          tradingPartner: {
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            findFirst: vi.fn().mockResolvedValue(mockTypeMapping),
          },
          itemizedStatement: {
            findUnique: itemizedStatementFindUnique,
          },
          estimateRequest: {
            create: estimateRequestCreate,
          },
          estimateRequestItem: {
            createMany: estimateRequestItemCreateMany,
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert: 結果（itemizedStatementId が null で永続化）
      expect(result.id).toBe('er-no-is-001');
      expect(result.itemizedStatementId).toBeNull();
      expect(result.itemizedStatementName).toBeNull();
      expect(result.includeBreakdownInBody).toBe(false);

      // Assert: 内訳書検証はスキップされている
      expect(itemizedStatementFindUnique).not.toHaveBeenCalled();

      // Assert: EstimateRequestItem は生成されない
      expect(estimateRequestItemCreateMany).not.toHaveBeenCalled();

      // Assert: estimateRequest.create に itemizedStatementId: null が渡る
      expect(estimateRequestCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemizedStatementId: null,
            includeBreakdownInBody: false,
          }),
        })
      );

      // Assert: 監査ログ after.itemCount=0, itemizedStatementId=null
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ESTIMATE_REQUEST_CREATED',
          after: expect.objectContaining({
            itemizedStatementId: null,
            itemCount: 0,
          }),
        }),
        // 第 2 引数はトランザクションのクライアント（タスク109.1）
        expect.anything()
      );
    });

    it('内訳書なし（itemizedStatementId=null 明示・includeBreakdownInBody=false）でも内訳書検証はスキップされ、通常通り保存される（Requirements: 39.2, 39.4）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: '内訳書なし見積依頼（明示 null）',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: null,
        includeBreakdownInBody: false,
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

      const mockCreatedRequest = {
        id: 'er-no-is-explicit-null',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: null,
        name: '内訳書なし見積依頼（明示 null）',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-05-08T00:00:00Z'),
        updatedAt: new Date('2026-05-08T00:00:00Z'),
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: null,
      };

      const itemizedStatementFindUnique = vi.fn();
      const estimateRequestItemCreateMany = vi.fn();
      const estimateRequestCreate = vi.fn().mockResolvedValue(mockCreatedRequest);

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          tradingPartner: {
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            findFirst: vi.fn().mockResolvedValue(mockTypeMapping),
          },
          itemizedStatement: {
            findUnique: itemizedStatementFindUnique,
          },
          estimateRequest: {
            create: estimateRequestCreate,
          },
          estimateRequestItem: {
            createMany: estimateRequestItemCreateMany,
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(input, actorId);

      // Assert: 戻り値が内訳書なしで構成されている
      expect(result.itemizedStatementId).toBeNull();
      expect(result.itemizedStatementName).toBeNull();
      expect(result.includeBreakdownInBody).toBe(false);

      // Assert: 内訳書 ID 明示 null 指定時も内訳書検証スキップ
      expect(itemizedStatementFindUnique).not.toHaveBeenCalled();

      // Assert: EstimateRequestItem.createMany が呼ばれない（R-39-5）
      expect(estimateRequestItemCreateMany).not.toHaveBeenCalled();

      // Assert: 永続化値が itemizedStatementId=null / includeBreakdownInBody=false
      expect(estimateRequestCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemizedStatementId: null,
            includeBreakdownInBody: false,
          }),
        })
      );

      // Assert: 監査ログ after.itemizedStatementId=null / itemCount=0（R-39-6）
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ESTIMATE_REQUEST_CREATED',
          after: expect.objectContaining({
            itemizedStatementId: null,
            itemCount: 0,
          }),
        }),
        // 第 2 引数はトランザクションのクライアント（タスク109.1）
        expect.anything()
      );
    });

    it('内訳書なしで includeBreakdownInBody=true を渡しても false が強制保存される（Requirements: 39.3）', async () => {
      // Arrange
      const actorId = 'user-001';
      const input = {
        name: '内訳書なし見積依頼',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: null,
        includeBreakdownInBody: true, // ユーザーが true を指定
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

      const mockCreatedRequest = {
        id: 'er-no-is-002',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: null,
        name: '内訳書なし見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-05-08T00:00:00Z'),
        updatedAt: new Date('2026-05-08T00:00:00Z'),
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: null,
      };

      const estimateRequestCreate = vi.fn().mockResolvedValue(mockCreatedRequest);

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          tradingPartner: {
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            findFirst: vi.fn().mockResolvedValue(mockTypeMapping),
          },
          itemizedStatement: {
            findUnique: vi.fn(),
          },
          estimateRequest: {
            create: estimateRequestCreate,
          },
          estimateRequestItem: {
            createMany: vi.fn(),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.create(input, actorId);

      // Assert: includeBreakdownInBody=false が強制される
      expect(estimateRequestCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemizedStatementId: null,
            includeBreakdownInBody: false,
          }),
        })
      );
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

    /**
     * 別のプロジェクトの内訳書を指す作成は、項目の有無を問わず内訳書の不在と同じエラーにし、
     * 見積依頼を作らず監査も記録しない（タスク121.1・design.md の D15）。
     *
     * @requirement estimate-request/REQ-51.1
     * @requirement estimate-request/REQ-51.2
     */
    it.each([
      { label: '項目あり', items: [{ id: 'isi-other-001', displayOrder: 1 }] },
      { label: '項目なし', items: [] },
    ])(
      '別のプロジェクトの内訳書（$label）を指すと不在と同じエラーになり、作成も監査の記録もしない',
      async ({ items }) => {
        const actorId = 'user-001';
        const input = {
          name: 'テスト見積依頼',
          projectId: 'proj-001',
          tradingPartnerId: 'tp-001',
          itemizedStatementId: 'is-other',
        };
        const estimateRequestCreate = vi.fn();
        const estimateRequestItemCreateMany = vi.fn();

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            tradingPartner: {
              findUnique: vi
                .fn()
                .mockResolvedValue({ id: 'tp-001', name: 'テスト協力業者', deletedAt: null }),
            },
            tradingPartnerTypeMapping: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'tpm-001',
                tradingPartnerId: 'tp-001',
                type: 'SUBCONTRACTOR',
              }),
            },
            itemizedStatement: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'is-other',
                name: '他の案件の内訳書',
                projectId: 'proj-other',
                deletedAt: null,
                items,
              }),
            },
            estimateRequest: { create: estimateRequestCreate },
            estimateRequestItem: { createMany: estimateRequestItemCreateMany },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        const rejection = service.create(input, actorId);
        await expect(rejection).rejects.toThrow(ItemizedStatementNotFoundError);
        await expect(rejection).rejects.not.toThrow(EmptyItemizedStatementItemsError);
        await expect(rejection).rejects.toMatchObject({
          code: 'ITEMIZED_STATEMENT_NOT_FOUND',
          message: new ItemizedStatementNotFoundError('is-other').message,
        });
        expect(estimateRequestCreate).not.toHaveBeenCalled();
        expect(estimateRequestItemCreateMany).not.toHaveBeenCalled();
        expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
      }
    );
  });

  describe('監査ログをトランザクションの中で書く（タスク109.1）', () => {
    // 作成・更新・論理削除・項目の選択の保存の監査ログは、$transaction のコールバックが受ける
    // トランザクションのクライアントを createLog の第 2 引数に渡して書く。渡さないとトランザクションの
    // 外の接続で書かれ、巻き戻った操作の監査ログだけが残る（受入基準 8.6。巻き戻しの実際は統合テストで確かめる）
    const actorId = 'user-001';
    const tradingPartner = { id: 'tp-tx', name: '監査ログ検証協力業者', deletedAt: null };
    const typeMapping = { id: 'tpm-tx', tradingPartnerId: 'tp-tx', type: 'SUBCONTRACTOR' };
    const storedRequest = {
      id: 'er-tx',
      projectId: 'proj-001',
      tradingPartnerId: 'tp-tx',
      itemizedStatementId: 'is-tx',
      name: '監査ログ検証見積依頼',
      method: 'EMAIL',
      includeBreakdownInBody: false,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      deletedAt: null,
      tradingPartner: { id: 'tp-tx', name: '監査ログ検証協力業者' },
      itemizedStatement: { id: 'is-tx', name: '監査ログ検証内訳書' },
    };

    /** `$transaction` がコールバックへ渡すクライアントを捕まえる */
    function captureTransactionClient(txClient: Record<string, unknown>): { current: unknown } {
      const captured: { current: unknown } = { current: undefined };
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        captured.current = txClient;
        return fn(txClient as unknown as PrismaClient);
      });
      return captured;
    }

    function secondArgumentOfCreateLog(): unknown {
      expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
      return vi.mocked(mockAuditLogService.createLog).mock.calls[0]?.[1];
    }

    it('内訳書ありの作成は createLog の第 2 引数にトランザクションのクライアントを渡す', async () => {
      const captured = captureTransactionClient({
        tradingPartner: { findUnique: vi.fn().mockResolvedValue(tradingPartner) },
        tradingPartnerTypeMapping: { findFirst: vi.fn().mockResolvedValue(typeMapping) },
        itemizedStatement: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'is-tx',
            name: '監査ログ検証内訳書',
            projectId: 'proj-001',
            deletedAt: null,
            items: [{ id: 'isi-tx', displayOrder: 0 }],
          }),
        },
        estimateRequest: { create: vi.fn().mockResolvedValue(storedRequest) },
        estimateRequestItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      });

      await service.create(
        {
          name: '監査ログ検証見積依頼',
          projectId: 'proj-001',
          tradingPartnerId: 'tp-tx',
          itemizedStatementId: 'is-tx',
          method: 'EMAIL',
        },
        actorId
      );

      expect(captured.current).toBeDefined();
      expect(secondArgumentOfCreateLog()).toBe(captured.current);
    });

    it('内訳書なしの作成は createLog の第 2 引数にトランザクションのクライアントを渡す', async () => {
      const captured = captureTransactionClient({
        tradingPartner: { findUnique: vi.fn().mockResolvedValue(tradingPartner) },
        tradingPartnerTypeMapping: { findFirst: vi.fn().mockResolvedValue(typeMapping) },
        estimateRequest: {
          create: vi.fn().mockResolvedValue({
            ...storedRequest,
            itemizedStatementId: null,
            itemizedStatement: null,
          }),
        },
      });

      await service.create(
        {
          name: '監査ログ検証見積依頼',
          projectId: 'proj-001',
          tradingPartnerId: 'tp-tx',
          method: 'EMAIL',
        },
        actorId
      );

      expect(captured.current).toBeDefined();
      expect(secondArgumentOfCreateLog()).toBe(captured.current);
    });

    it('更新は createLog の第 2 引数にトランザクションのクライアントを渡す', async () => {
      const captured = captureTransactionClient({
        estimateRequest: {
          findUnique: vi.fn().mockResolvedValue(storedRequest),
          update: vi.fn().mockResolvedValue({ ...storedRequest, name: '新名' }),
        },
      });

      await service.update('er-tx', { name: '新名' }, actorId, storedRequest.updatedAt);

      expect(captured.current).toBeDefined();
      expect(secondArgumentOfCreateLog()).toBe(captured.current);
    });

    it('論理削除は createLog の第 2 引数にトランザクションのクライアントを渡す', async () => {
      const captured = captureTransactionClient({
        estimateRequest: {
          findUnique: vi.fn().mockResolvedValue(storedRequest),
          update: vi.fn().mockResolvedValue({ ...storedRequest, deletedAt: new Date() }),
        },
      });

      await service.delete('er-tx', actorId, storedRequest.updatedAt);

      expect(captured.current).toBeDefined();
      expect(secondArgumentOfCreateLog()).toBe(captured.current);
    });

    it('項目の選択の保存は createLog の第 2 引数にトランザクションのクライアントを渡す', async () => {
      const captured = captureTransactionClient({
        estimateRequest: {
          findUnique: vi.fn().mockResolvedValue({ id: 'er-tx', deletedAt: null }),
        },
        estimateRequestItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      });

      await service.updateItemSelection('er-tx', [{ itemId: 'eri-tx', selected: true }], actorId);

      expect(captured.current).toBeDefined();
      expect(secondArgumentOfCreateLog()).toBe(captured.current);
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

    it('内訳書なしの見積依頼に includeBreakdownInBody=true を渡しても false に正規化される（Requirements: 39.9）', async () => {
      // Arrange
      const requestId = 'er-002';
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date('2026-05-08T00:00:00Z');
      const input = {
        includeBreakdownInBody: true, // ユーザーが true を指定
      };

      // 対象レコードは itemizedStatementId === null（内訳書なし）
      const mockRequest = {
        id: 'er-002',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: null,
        name: '内訳書なし見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-05-07T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: null,
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        includeBreakdownInBody: false, // 永続化値は false
        updatedAt: new Date('2026-05-08T01:00:00Z'),
      };

      const updateSpy = vi.fn().mockResolvedValue(mockUpdatedRequest);

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockRequest),
            update: updateSpy,
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.update(requestId, input, actorId, expectedUpdatedAt);

      // Assert: 永続化値は false に正規化されている
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId },
          data: expect.objectContaining({
            includeBreakdownInBody: false,
          }),
        })
      );
      expect(result.includeBreakdownInBody).toBe(false);

      // Assert: 監査ログ after も正規化後の値（false）
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ESTIMATE_REQUEST_UPDATED',
          after: expect.objectContaining({
            includeBreakdownInBody: false,
          }),
        }),
        // 第 2 引数はトランザクションのクライアント（タスク109.1）
        expect.anything()
      );
    });

    it('内訳書ありの見積依頼に includeBreakdownInBody=true を渡したときは true がそのまま反映される（Requirements: 39.12）', async () => {
      // Arrange: 既存挙動が保たれることを確認
      const requestId = 'er-003';
      const actorId = 'user-001';
      const expectedUpdatedAt = new Date('2026-05-08T00:00:00Z');
      const input = {
        includeBreakdownInBody: true,
      };

      const mockRequest = {
        id: 'er-003',
        projectId: 'proj-001',
        tradingPartnerId: 'tp-001',
        itemizedStatementId: 'is-001',
        name: '内訳書あり見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: new Date('2026-05-07T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
        tradingPartner: { id: 'tp-001', name: 'テスト協力業者' },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        includeBreakdownInBody: true,
        updatedAt: new Date('2026-05-08T01:00:00Z'),
      };

      const updateSpy = vi.fn().mockResolvedValue(mockUpdatedRequest);

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockRequest),
            update: updateSpy,
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.update(requestId, input, actorId, expectedUpdatedAt);

      // Assert: 内訳書ありなので true がそのまま反映される
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId },
          data: expect.objectContaining({
            includeBreakdownInBody: true,
          }),
        })
      );
      expect(result.includeBreakdownInBody).toBe(true);
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
      const result = await service.findItemsWithOtherRequestStatus(requestId, 'user-001');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.selected).toBe(true);
      expect(result[0]!.otherRequests).toHaveLength(1);
      expect(result[0]!.otherRequests[0]!.tradingPartnerName).toBe('協力業者B');
    });

    it('他の見積依頼は閲覧者の閲覧範囲内の案件（論理削除されていない案件）に属するものに絞る（タスク103.1）', async () => {
      // Arrange
      const scopeWhere = {
        OR: [
          { salesPersonId: 'user-001' },
          { constructionPersonId: 'user-001' },
          { createdById: 'user-001' },
        ],
      };
      mockProjectScope.buildProjectScopeWhere.mockResolvedValue(scopeWhere);
      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue({
        id: 'er-001',
        projectId: 'proj-001',
        itemizedStatementId: 'is-001',
        deletedAt: null,
      } as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([] as never);

      // Act
      await service.findItemsWithOtherRequestStatus('er-001', 'user-001');

      // Assert
      expect(mockProjectScope.buildProjectScopeWhere).toHaveBeenCalledWith('user-001');
      const otherQuery = vi.mocked(mockPrisma.estimateRequestItem.findMany).mock.calls[1]?.[0] as {
        where: { estimateRequest: unknown };
      };
      expect(otherQuery.where.estimateRequest).toEqual({
        deletedAt: null,
        project: { deletedAt: null, ...scopeWhere },
      });
    });

    it('存在しない見積依頼の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.findItemsWithOtherRequestStatus('er-nonexistent', 'user-001')
      ).rejects.toThrow(EstimateRequestNotFoundError);
    });
  });
});
