/**
 * @fileoverview ReceivedQuotationService ユニットテスト（改訂版: Task 20.2）
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.6, 11.8: ファイルアップロード
 * - 11.9, 11.10: バリデーションエラー
 * - 11.11: 複数の受領見積書を許可
 * - 11.14: ファイルプレビュー
 * - 11.15, 11.16, 11.17: 編集・削除
 * - 11.22: ファイルまたは明細行データのいずれかが必須
 *
 * Task 12.1: ReceivedQuotationServiceの実装
 * Task 20.2: contentType/textContent廃止、ファイル+明細行共存モデルへ移行
 *
 * @module tests/unit/services/received-quotation.service
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { ProjectScopeService } from '../../../services/project-scope.service.js';
import { ReceivedQuotationService } from '../../../services/received-quotation.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import {
  ReceivedQuotationNotFoundError,
  ReceivedQuotationConflictError,
  InvalidContentTypeError,
  InvalidFileTypeError,
  FileSizeLimitExceededError,
} from '../../../errors/receivedQuotationError.js';
import { EstimateRequestNotFoundError } from '../../../errors/estimateRequestError.js';
import { ProjectNotFoundError } from '../../../errors/projectError.js';
import { ValidationError } from '../../../errors/apiError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    receivedQuotation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    estimateRequest: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        receivedQuotation: {
          create: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
        },
        estimateRequest: {
          findUnique: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
};

// StorageProviderモック
const createMockStorageProvider = (): StorageProvider => ({
  type: 'local' as const,
  upload: vi.fn().mockResolvedValue({ key: 'test-key', size: 1000, etag: 'test-etag' }),
  get: vi.fn().mockResolvedValue(Buffer.from('test')),
  delete: vi.fn().mockResolvedValue(undefined),
  copy: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
  getSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-url'),
  getPublicUrl: vi.fn().mockReturnValue(null),
  testConnection: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn().mockResolvedValue(undefined),
});

/** 操作した利用者（監査ログの実行者。estimate-request の Requirement 14.7、タスク111.1） */
const ACTOR_ID = 'user-actor-001';

/**
 * 見積依頼の文脈（design の Service Interface の `QuotationContext`。タスク113.1）。
 * 既存の検証は入力に見積依頼の ID を置いていたため、その値から文脈を作って渡す
 */
const requestContextOf = (input: {
  estimateRequestId: string;
}): { kind: 'estimateRequest'; estimateRequestId: string } => ({
  kind: 'estimateRequest',
  estimateRequestId: input.estimateRequestId,
});

describe('ReceivedQuotationService', () => {
  let service: ReceivedQuotationService;
  let mockPrisma: PrismaClient;
  let mockStorageProvider: StorageProvider;
  /** 署名付きURLの発行の判定（タスク103.1）。既定は範囲内 */
  let mockProjectScope: { canAccessProject: Mock<ProjectScopeService['canAccessProject']> };
  /** 監査ログの記録（タスク111.1） */
  let mockAuditLogService: {
    createLog: Mock<IAuditLogService['createLog']>;
    getLogs: Mock<IAuditLogService['getLogs']>;
    exportLogs: Mock<IAuditLogService['exportLogs']>;
  };

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockStorageProvider = createMockStorageProvider();
    mockProjectScope = {
      canAccessProject: vi.fn<ProjectScopeService['canAccessProject']>().mockResolvedValue(true),
    };
    mockAuditLogService = {
      createLog: vi.fn<IAuditLogService['createLog']>(),
      getLogs: vi.fn<IAuditLogService['getLogs']>(),
      exportLogs: vi.fn<IAuditLogService['exportLogs']>(),
    };
    service = new ReceivedQuotationService({
      prisma: mockPrisma,
      storageProvider: mockStorageProvider,
      auditLogService: mockAuditLogService,
      projectScopeService: mockProjectScope,
    });
  });

  describe('create', () => {
    /**
     * @requirement estimate-request/REQ-14.1: The システム shall 受領見積書を見積依頼に紐づけて保存する
     *
     * 本検証は当該条文を機構として観測する。`ReceivedQuotationService.create` が
     * トランザクション内で `receivedQuotation.create` へ渡す `data` に、入力の
     * `estimateRequestId` がそのまま載ることを主張する。紐づけは外部キーの値として
     * 書き込みへ現れるため、これが「見積依頼に紐づけて保存する」の観測点である。
     * 観測の対象は本番モジュール backend/src/services/received-quotation.service.ts の
     * `create` であり、当該サービスは
     * backend/src/routes/received-quotation.routes.ts が取り込むため本番の経路に乗る。
     *
     * **この主張は本タスク（115.315）で足した。** 従前この検証は返り値の id・名称・
     * ファイル名しか見ておらず、書き込みの写しから `estimateRequestId` を落としても
     * 緑のままだった。条文を名乗っていたのは
     * backend/src/__tests__/unit/models/received-quotation-revised.model.test.ts の
     * 前書きだけで、同ファイルは生成された Prisma クライアントのみを取り込むため
     * `npm run check:req-coverage` は「到達しない被覆源のみの受入基準」へ分類していた。
     * 観測が無いまま名乗りだけを移すことは禁じられているため、先に観測を足した。
     *
     * 空振りでないことの実測（2026-09-07。採取は
     * `npm --prefix backend run test -- src/__tests__/unit/services/received-quotation.service.test.ts`。
     * 変異は復元済み）: `create` の書き込みの写しから `estimateRequestId` を外すと
     * 53件中1件（本検証）が落ちる。同じ変異を、本ファイルを HEAD（主張を足す前）の版へ
     * 戻して掛けると 53件すべてが緑のままだった。
     */
    it('ファイルなしで受領見積書を作成する（Requirements: 11.3, 11.4）', async () => {
      // Arrange: ファイルなしだが明細行ありで作成（Requirements: 11.22 - ファイルまたは明細行のいずれかが必須）
      const lineItems = [
        { name: '工事A', sortOrder: 0, quantity: 1, unitPrice: 10000, amount: 10000 },
      ];
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        lineItems,
      };

      const mockEstimateRequest = {
        id: 'er-001',
        deletedAt: null,
        projectId: 'project-001',
        tradingPartnerId: 'tp-001',
        tradingPartner: { name: '協力業者A' },
      };

      const mockCreatedQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date('2026-01-23T00:00:00Z'),
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
        lineItems: [{ id: 'li-001', receivedQuotationId: 'rq-001', ...lineItems[0] }],
      };

      // 書き込みの写しを検証するため、二重を変数へ束ねる
      const createQuotation = vi.fn().mockResolvedValue(mockCreatedQuotation);

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
          receivedQuotation: {
            create: createQuotation,
          },
          receivedQuotationLineItem: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(requestContextOf(input), input, ACTOR_ID);

      // Assert
      expect(result.id).toBe('rq-001');
      expect(result.name).toBe('テスト受領見積書');
      expect(result.fileName).toBeNull();

      // 見積依頼への紐づけが書き込みへ載ること（上の JSDoc の @requirement の観測点）
      expect(createQuotation).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estimateRequestId: 'er-001',
          }),
        })
      );
    });

    it('ファイル付きで受領見積書を作成する（Requirements: 11.6, 11.8）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書（PDF）',
        submittedAt: new Date('2026-01-23'),
        file: {
          buffer: Buffer.from('PDF content'),
          originalName: '見積書.pdf',
          mimeType: 'application/pdf',
          size: 10000,
        },
      };

      const mockEstimateRequest = {
        id: 'er-001',
        deletedAt: null,
        projectId: 'project-001',
        tradingPartnerId: 'tp-001',
        tradingPartner: { name: '協力業者A' },
      };

      const mockCreatedQuotation = {
        id: 'rq-002',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書（PDF）',
        submittedAt: new Date('2026-01-23'),
        filePath: 'quotations/er-001/rq-002/見積書.pdf',
        fileName: '見積書.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 10000,
        createdAt: new Date('2026-01-23T00:00:00Z'),
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
          receivedQuotation: {
            create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            update: vi.fn().mockResolvedValue(mockCreatedQuotation),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(requestContextOf(input), input, ACTOR_ID);

      // Assert
      expect(result.id).toBe('rq-002');
      expect(result.fileName).toBe('見積書.pdf');
      expect(result.fileMimeType).toBe('application/pdf');
      expect(mockStorageProvider.upload).toHaveBeenCalled();
    });

    it('見積依頼が存在しない場合、エラーを発生させる', async () => {
      // Arrange: 明細行ありでバリデーションを通過させるが、見積依頼が存在しない
      const input = {
        estimateRequestId: 'er-nonexistent',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        lineItems: [{ name: '工事A', sortOrder: 0, quantity: 1, unitPrice: 10000, amount: 10000 }],
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.create(requestContextOf(input), input, ACTOR_ID)).rejects.toThrow(
        EstimateRequestNotFoundError
      );
    });

    it('許可されていないファイル形式の場合、エラーを発生させる（Requirements: 11.8）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        file: {
          buffer: Buffer.from('invalid content'),
          originalName: 'test.exe',
          mimeType: 'application/x-msdownload',
          size: 1000,
        },
      };

      // Act & Assert
      await expect(service.create(requestContextOf(input), input, ACTOR_ID)).rejects.toThrow(
        InvalidFileTypeError
      );
    });

    it('ファイルサイズが10MBを超える場合、エラーを発生させる（Requirements: 11.9）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        file: {
          buffer: Buffer.from('large content'),
          originalName: 'large.pdf',
          mimeType: 'application/pdf',
          size: 11 * 1024 * 1024, // 11MB
        },
      };

      // Act & Assert
      await expect(service.create(requestContextOf(input), input, ACTOR_ID)).rejects.toThrow(
        FileSizeLimitExceededError
      );
    });

    it('Excelファイルで受領見積書を作成する', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書（Excel）',
        submittedAt: new Date('2026-01-23'),
        file: {
          buffer: Buffer.from('Excel content'),
          originalName: '見積書.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 5000,
        },
      };

      const mockEstimateRequest = {
        id: 'er-001',
        deletedAt: null,
        projectId: 'project-001',
        tradingPartnerId: 'tp-001',
        tradingPartner: { name: '協力業者A' },
      };

      const mockCreatedQuotation = {
        id: 'rq-003',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書（Excel）',
        submittedAt: new Date('2026-01-23'),
        filePath: 'quotations/er-001/rq-003/見積書.xlsx',
        fileName: '見積書.xlsx',
        fileMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: 5000,
        createdAt: new Date('2026-01-23T00:00:00Z'),
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
          receivedQuotation: {
            create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            update: vi.fn().mockResolvedValue(mockCreatedQuotation),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(requestContextOf(input), input, ACTOR_ID);

      // Assert
      expect(result.fileMimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });

    it('画像ファイルで受領見積書を作成する', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書（画像）',
        submittedAt: new Date('2026-01-23'),
        file: {
          buffer: Buffer.from('Image content'),
          originalName: '見積書.jpg',
          mimeType: 'image/jpeg',
          size: 2000,
        },
      };

      const mockEstimateRequest = {
        id: 'er-001',
        deletedAt: null,
        projectId: 'project-001',
        tradingPartnerId: 'tp-001',
        tradingPartner: { name: '協力業者A' },
      };

      const mockCreatedQuotation = {
        id: 'rq-004',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書（画像）',
        submittedAt: new Date('2026-01-23'),
        filePath: 'quotations/er-001/rq-004/見積書.jpg',
        fileName: '見積書.jpg',
        fileMimeType: 'image/jpeg',
        fileSize: 2000,
        createdAt: new Date('2026-01-23T00:00:00Z'),
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
          receivedQuotation: {
            create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            update: vi.fn().mockResolvedValue(mockCreatedQuotation),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(requestContextOf(input), input, ACTOR_ID);

      // Assert
      expect(result.fileMimeType).toBe('image/jpeg');
    });
  });

  describe('findById', () => {
    it('受領見積書詳細を取得する', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date('2026-01-23T00:00:00Z'),
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);

      // Act
      const result = await service.findById(quotationId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rq-001');
      expect(result!.name).toBe('テスト受領見積書');
    });

    it('存在しない受領見積書の場合、nullを返す', async () => {
      // Arrange
      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(null);

      // Act
      const result = await service.findById('rq-nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除された受領見積書の場合、nullを返す', async () => {
      // Arrange
      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // 論理削除済み
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);

      // Act
      const result = await service.findById('rq-001');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByEstimateRequestId', () => {
    it('見積依頼に紐付く受領見積書一覧を取得する（Requirements: 11.11）', async () => {
      // Arrange
      const estimateRequestId = 'er-001';
      const mockQuotations = [
        {
          id: 'rq-001',
          estimateRequestId: 'er-001',
          name: '受領見積書1',
          submittedAt: new Date('2026-01-23'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date('2026-01-23T00:00:00Z'),
          updatedAt: new Date('2026-01-23T00:00:00Z'),
          deletedAt: null,
        },
        {
          id: 'rq-002',
          estimateRequestId: 'er-001',
          name: '受領見積書2',
          submittedAt: new Date('2026-01-22'),
          filePath: 'quotations/er-001/rq-002/見積書.pdf',
          fileName: '見積書.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 10000,
          createdAt: new Date('2026-01-22T00:00:00Z'),
          updatedAt: new Date('2026-01-22T00:00:00Z'),
          deletedAt: null,
        },
      ];

      vi.mocked(mockPrisma.receivedQuotation.findMany).mockResolvedValue(mockQuotations as never);

      // Act
      const result = await service.findByEstimateRequestId(estimateRequestId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('受領見積書1');
      expect(result[1]!.name).toBe('受領見積書2');
    });

    it('論理削除された受領見積書は除外する', async () => {
      // Arrange
      vi.mocked(mockPrisma.receivedQuotation.findMany).mockResolvedValue([]);

      // Act
      const result = await service.findByEstimateRequestId('er-001');

      // Assert
      expect(result).toHaveLength(0);
      expect(mockPrisma.receivedQuotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('受領見積書を更新する（Requirements: 11.15）', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');
      const input = {
        name: '更新後の受領見積書名',
        submittedAt: new Date('2026-01-24'),
      };

      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: '元の受領見積書名',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date('2026-01-22T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const mockUpdatedQuotation = {
        ...mockQuotation,
        name: '更新後の受領見積書名',
        submittedAt: new Date('2026-01-24'),
        updatedAt: new Date('2026-01-23T01:00:00Z'),
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
            update: vi.fn().mockResolvedValue(mockUpdatedQuotation),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.update(quotationId, input, expectedUpdatedAt, ACTOR_ID);

      // Assert
      expect(result.name).toBe('更新後の受領見積書名');
    });

    it('楽観的排他制御エラー時はConflictErrorを発生させる', async () => {
      // Arrange
      const actualUpdatedAt = new Date('2026-01-23T01:00:00Z');
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z'); // 異なる日時

      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: '受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date(),
        updatedAt: actualUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.update('rq-001', { name: '新しい名前' }, expectedUpdatedAt, ACTOR_ID)
      ).rejects.toThrow(ReceivedQuotationConflictError);
    });

    it('ファイル変更時に旧ファイルを削除する', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');
      const input = {
        file: {
          buffer: Buffer.from('New PDF content'),
          originalName: '新しい見積書.pdf',
          mimeType: 'application/pdf',
          size: 15000,
        },
      };

      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: '受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: 'quotations/er-001/rq-001/旧見積書.pdf', // 旧ファイル
        fileName: '旧見積書.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 10000,
        createdAt: new Date('2026-01-22T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const mockUpdatedQuotation = {
        ...mockQuotation,
        filePath: 'quotations/er-001/rq-001/新しい見積書.pdf',
        fileName: '新しい見積書.pdf',
        fileSize: 15000,
        updatedAt: new Date('2026-01-23T01:00:00Z'),
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
            update: vi.fn().mockResolvedValue(mockUpdatedQuotation),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.update(quotationId, input, expectedUpdatedAt, ACTOR_ID);

      // Assert
      expect(mockStorageProvider.upload).toHaveBeenCalled();
      expect(mockStorageProvider.delete).toHaveBeenCalledWith(
        'quotations/er-001/rq-001/旧見積書.pdf'
      );
    });
  });

  describe('delete', () => {
    it('受領見積書を論理削除し、ファイルを物理削除する（Requirements: 11.16, 11.17）', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: 'quotations/er-001/rq-001/見積書.pdf',
        fileName: '見積書.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 10000,
        createdAt: new Date(),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
            update: vi.fn().mockResolvedValue({ ...mockQuotation, deletedAt: new Date() }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.delete(quotationId, expectedUpdatedAt, ACTOR_ID);

      // Assert
      expect(mockStorageProvider.delete).toHaveBeenCalledWith(
        'quotations/er-001/rq-001/見積書.pdf'
      );
    });

    it('ファイルなしの受領見積書の場合、ファイル削除は行わない', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date(),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
            update: vi.fn().mockResolvedValue({ ...mockQuotation, deletedAt: new Date() }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.delete(quotationId, expectedUpdatedAt, ACTOR_ID);

      // Assert
      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
    });

    it('レコードを物理削除せず deletedAt を設定して論理削除する（Req 14.5）', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date(),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const txUpdate = vi.fn().mockResolvedValue({ ...mockQuotation, deletedAt: new Date() });
      // 物理削除へ替わった場合も TypeError でなく主張で落ちるよう delete を用意する
      const txDelete = vi.fn().mockResolvedValue(mockQuotation);

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
            update: txUpdate,
            delete: txDelete,
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.delete(quotationId, expectedUpdatedAt, ACTOR_ID);

      // Assert
      expect(txUpdate).toHaveBeenCalledWith({
        where: { id: quotationId },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
      expect(txDelete).not.toHaveBeenCalled();
    });

    it('存在しない受領見積書の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.delete('rq-nonexistent', new Date(), ACTOR_ID)).rejects.toThrow(
        ReceivedQuotationNotFoundError
      );
    });
  });

  describe('getFilePreviewUrl', () => {
    it('署名付きURLを取得する（Requirements: 11.14）', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: 'quotations/er-001/rq-001/見積書.pdf',
        fileName: '見積書.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        projectId: 'project-001',
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);
      vi.mocked(mockStorageProvider.getSignedUrl).mockResolvedValue(
        'https://example.com/signed-url?token=xxx'
      );

      // Act
      const result = await service.getFilePreviewUrl(quotationId, 'user-001');

      // Assert
      expect(result).toBe('https://example.com/signed-url?token=xxx');
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'quotations/er-001/rq-001/見積書.pdf',
        expect.any(Object)
      );
      // 受領見積書の案件の列で、閲覧者の範囲を判定する（タスク103.1。タスク113.1 で案件の列へ移した）
      expect(mockProjectScope.canAccessProject).toHaveBeenCalledWith('user-001', 'project-001');
    });

    it('閲覧範囲外の案件の受領見積書は、不在と同じエラーにして署名付きURLを発行しない（タスク103.1）', async () => {
      // Arrange
      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue({
        id: 'rq-001',
        estimateRequestId: 'er-001',
        filePath: 'quotations/er-001/rq-001/見積書.pdf',
        fileName: '見積書.pdf',
        deletedAt: null,
        projectId: 'project-out-of-scope',
      } as never);
      mockProjectScope.canAccessProject.mockResolvedValue(false);

      // Act & Assert
      await expect(service.getFilePreviewUrl('rq-001', 'user-001')).rejects.toThrow(
        ReceivedQuotationNotFoundError
      );
      expect(mockProjectScope.canAccessProject).toHaveBeenCalledWith(
        'user-001',
        'project-out-of-scope'
      );
      expect(mockStorageProvider.getSignedUrl).not.toHaveBeenCalled();
    });

    it('ファイルなしの受領見積書の場合、エラーを発生させる', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        projectId: 'project-001',
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);

      // Act & Assert
      await expect(service.getFilePreviewUrl(quotationId, 'user-001')).rejects.toThrow(
        InvalidContentTypeError
      );
    });

    it('存在しない受領見積書の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getFilePreviewUrl('rq-nonexistent', 'user-001')).rejects.toThrow(
        ReceivedQuotationNotFoundError
      );
    });
  });

  /**
   * 受領見積書の文脈（見積依頼・案件）と案件の列での一覧・範囲・格納先（タスク113.1）
   *
   * design の Requirements 43-50 の章の D1（案件の列を全員に持たせる）・D2（一覧の既定を変えない）・
   * D3（案件の文脈の格納先）と、Service Interface の `QuotationContext` を観測する
   */
  describe('受領見積書の文脈と案件の列（タスク113.1）', () => {
    const projectRow = { id: 'project-ctx', deletedAt: null };

    const createdRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'rq-ctx',
      estimateRequestId: null,
      projectId: 'project-ctx',
      vendorName: '自前の協力業者',
      tradingPartnerId: null,
      name: '見積依頼の無い受領見積書',
      submittedAt: new Date('2026-11-01'),
      filePath: null,
      fileName: null,
      fileMimeType: null,
      fileSize: null,
      netAmount: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      deletedAt: null,
      lineItems: [],
      ...overrides,
    });

    const setupTx = (options: {
      project?: unknown;
      estimateRequest?: unknown;
      created?: Record<string, unknown>;
    }) => {
      const txClient = {
        project: { findUnique: vi.fn().mockResolvedValue(options.project ?? null) },
        estimateRequest: {
          findUnique: vi.fn().mockResolvedValue(options.estimateRequest ?? null),
        },
        // 業者名の照合（タスク113.2）。一致する協力業者が無い既定とし、業者名だけを保持する
        tradingPartner: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
        receivedQuotation: {
          create: vi.fn().mockResolvedValue(options.created ?? createdRow()),
          update: vi.fn().mockResolvedValue(options.created ?? createdRow()),
        },
        receivedQuotationLineItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) =>
        fn(txClient as unknown as PrismaClient)
      );
      return txClient;
    };

    const baseInput = {
      name: '  見積依頼の無い受領見積書  ',
      submittedAt: new Date('2026-11-01'),
      lineItems: [{ name: '工事A', sortOrder: 0, quantity: 1, unitPrice: 1000, amount: 1000 }],
    };

    /**
     * @requirement estimate-request/REQ-43.7
     * @requirement estimate-request/REQ-14.1
     */
    it('案件の文脈では、見積依頼を持たずに案件に属する受領見積書を作り、見積依頼を引かない', async () => {
      const txClient = setupTx({ project: projectRow });

      const result = await service.create(
        { kind: 'project', projectId: 'project-ctx' },
        { ...baseInput, vendorName: '  自前の協力業者  ' },
        ACTOR_ID
      );

      expect(txClient.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-ctx' },
        select: { id: true, deletedAt: true },
      });
      expect(txClient.estimateRequest.findUnique).not.toHaveBeenCalled();
      expect(txClient.receivedQuotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estimateRequestId: null,
            projectId: 'project-ctx',
            vendorName: '自前の協力業者',
            tradingPartnerId: null,
            name: '見積依頼の無い受領見積書',
          }),
        })
      );
      expect(result.estimateRequestId).toBeNull();
    });

    /**
     * @requirement estimate-request/REQ-14.1
     */
    it('見積依頼の文脈では、見積依頼の案件と宛先の取引先を写し、入力の業者名を使わない', async () => {
      const txClient = setupTx({
        estimateRequest: {
          id: 'er-ctx',
          deletedAt: null,
          projectId: 'project-of-request',
          tradingPartnerId: 'tp-request',
          tradingPartner: { name: '宛先の協力業者' },
        },
        created: createdRow({ estimateRequestId: 'er-ctx', projectId: 'project-of-request' }),
      });

      const result = await service.create(
        { kind: 'estimateRequest', estimateRequestId: 'er-ctx' },
        { ...baseInput, vendorName: '入力の業者名' },
        ACTOR_ID
      );

      expect(txClient.project.findUnique).not.toHaveBeenCalled();
      expect(txClient.receivedQuotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estimateRequestId: 'er-ctx',
            projectId: 'project-of-request',
            vendorName: '宛先の協力業者',
            tradingPartnerId: 'tp-request',
          }),
        })
      );
      expect(result.estimateRequestId).toBe('er-ctx');
    });

    it('案件の文脈で案件が無いか論理削除済みなら、作らずに案件の不在のエラーにする', async () => {
      for (const project of [null, { id: 'project-ctx', deletedAt: new Date() }]) {
        const txClient = setupTx({ project });
        await expect(
          service.create(
            { kind: 'project', projectId: 'project-ctx' },
            { ...baseInput, vendorName: '自前の協力業者' },
            ACTOR_ID
          )
        ).rejects.toThrow(ProjectNotFoundError);
        expect(txClient.receivedQuotation.create).not.toHaveBeenCalled();
      }
      expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
    });

    it('案件の文脈で業者名が空なら、43.8 の文言で拒み作らない', async () => {
      for (const vendorName of [undefined, '   ']) {
        const txClient = setupTx({ project: projectRow });
        const promise = service.create(
          { kind: 'project', projectId: 'project-ctx' },
          { ...baseInput, vendorName },
          ACTOR_ID
        );
        await expect(promise).rejects.toThrow(ValidationError);
        await expect(promise).rejects.toThrow('業者名を入力してください');
        expect(txClient.receivedQuotation.create).not.toHaveBeenCalled();
      }
    });

    it('案件の文脈のファイルは quotations/projects/{案件}/{受領見積書}/{ファイル名} に格納する（D3）', async () => {
      const txClient = setupTx({ project: projectRow });

      await service.create(
        { kind: 'project', projectId: 'project-ctx' },
        {
          ...baseInput,
          vendorName: '自前の協力業者',
          file: {
            buffer: Buffer.from('PDF'),
            originalName: '見積書.pdf',
            mimeType: 'application/pdf',
            size: 3,
          },
        },
        ACTOR_ID
      );

      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        'quotations/projects/project-ctx/rq-ctx/見積書.pdf',
        expect.any(Buffer),
        { contentType: 'application/pdf' }
      );
      expect(txClient.receivedQuotation.update).toHaveBeenCalledWith({
        where: { id: 'rq-ctx' },
        data: { filePath: 'quotations/projects/project-ctx/rq-ctx/見積書.pdf' },
      });
    });

    it('見積依頼の文脈のファイルは従来の quotations/{見積依頼}/{受領見積書}/{ファイル名} に格納する（D3）', async () => {
      setupTx({
        estimateRequest: {
          id: 'er-ctx',
          deletedAt: null,
          projectId: 'project-of-request',
          tradingPartnerId: 'tp-request',
          tradingPartner: { name: '宛先の協力業者' },
        },
        created: createdRow({ estimateRequestId: 'er-ctx', projectId: 'project-of-request' }),
      });

      await service.create(
        { kind: 'estimateRequest', estimateRequestId: 'er-ctx' },
        {
          ...baseInput,
          file: {
            buffer: Buffer.from('PDF'),
            originalName: '見積書.pdf',
            mimeType: 'application/pdf',
            size: 3,
          },
        },
        ACTOR_ID
      );

      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        'quotations/er-ctx/rq-ctx/見積書.pdf',
        expect.any(Buffer),
        { contentType: 'application/pdf' }
      );
    });

    describe('update', () => {
      const expectedUpdatedAt = new Date('2026-11-01T00:00:00Z');
      const replacement = {
        buffer: Buffer.from('New PDF'),
        originalName: '差し替え.pdf',
        mimeType: 'application/pdf',
        size: 7,
      };

      const setupUpdateTx = (existing: Record<string, unknown>) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(existing),
            update: vi.fn().mockResolvedValue({ ...existing, lineItems: [] }),
          },
          receivedQuotationLineItem: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
          },
        };
        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) =>
          fn(txClient as unknown as PrismaClient)
        );
        return txClient;
      };

      /**
       * @requirement estimate-request/REQ-43.10
       */
      it('案件の文脈の受領見積書のファイルの差し替えは案件の格納先へ送り、文脈の列を書き換えない（43.10）', async () => {
        const txClient = setupUpdateTx(createdRow({ updatedAt: expectedUpdatedAt }));

        await service.update(
          'rq-ctx',
          { name: '改名', file: replacement },
          expectedUpdatedAt,
          ACTOR_ID
        );

        expect(mockStorageProvider.upload).toHaveBeenCalledWith(
          'quotations/projects/project-ctx/rq-ctx/差し替え.pdf',
          expect.any(Buffer),
          { contentType: 'application/pdf' }
        );
        const data = txClient.receivedQuotation.update.mock.calls[0]![0].data as Record<
          string,
          unknown
        >;
        expect(data).not.toHaveProperty('estimateRequestId');
        expect(data).not.toHaveProperty('projectId');
      });

      /**
       * @requirement estimate-request/REQ-43.14
       */
      it('案件の無い受領見積書の更新は不在のエラーにし、ファイルを送らず書き換えない', async () => {
        const txClient = setupUpdateTx(
          createdRow({ projectId: null, estimateRequestId: null, updatedAt: expectedUpdatedAt })
        );

        await expect(
          service.update('rq-ctx', { file: replacement }, expectedUpdatedAt, ACTOR_ID)
        ).rejects.toThrow(ReceivedQuotationNotFoundError);
        expect(mockStorageProvider.upload).not.toHaveBeenCalled();
        expect(txClient.receivedQuotation.update).not.toHaveBeenCalled();
        expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
      });
    });

    describe('getFilePreviewUrl', () => {
      /**
       * @requirement estimate-request/REQ-43.12
       */
      it('見積依頼の無い受領見積書は、受領見積書の案件の列で範囲を判定して発行する', async () => {
        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          createdRow({
            filePath: 'quotations/projects/project-ctx/rq-ctx/見積書.pdf',
            fileName: '見積書.pdf',
          }) as never
        );

        await service.getFilePreviewUrl('rq-ctx', 'user-001');

        expect(mockPrisma.receivedQuotation.findUnique).toHaveBeenCalledWith({
          where: { id: 'rq-ctx' },
        });
        expect(mockProjectScope.canAccessProject).toHaveBeenCalledWith('user-001', 'project-ctx');
        expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
          'quotations/projects/project-ctx/rq-ctx/見積書.pdf',
          expect.any(Object)
        );
      });

      /**
       * @requirement estimate-request/REQ-43.14
       */
      it('案件の無い受領見積書は不在のエラーにし、範囲を判定せず署名付きURLを発行しない', async () => {
        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          createdRow({
            projectId: null,
            filePath: 'cards/rq-ctx/見積書.pdf',
            fileName: '見積書.pdf',
          }) as never
        );

        await expect(service.getFilePreviewUrl('rq-ctx', 'user-001')).rejects.toThrow(
          ReceivedQuotationNotFoundError
        );
        expect(mockProjectScope.canAccessProject).not.toHaveBeenCalled();
        expect(mockStorageProvider.getSignedUrl).not.toHaveBeenCalled();
      });
    });

    describe('findByProjectId', () => {
      const listedRow = (overrides: Record<string, unknown> = {}) => ({
        ...createdRow(),
        lineItems: [],
        ...overrides,
      });

      it('既定（requested）は案件の列で絞り、見積依頼に紐づく（論理削除されていない見積依頼の）ものだけを返す（D2）', async () => {
        vi.mocked(mockPrisma.receivedQuotation.findMany).mockResolvedValue([
          listedRow({ id: 'rq-req', estimateRequestId: 'er-1', vendorName: '宛先の協力業者' }),
        ] as never);

        const result = await service.findByProjectId('project-ctx', { include: 'requested' });

        expect(mockPrisma.receivedQuotation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              projectId: 'project-ctx',
              deletedAt: null,
              estimateRequestId: { not: null },
              estimateRequest: { is: { deletedAt: null } },
            },
            orderBy: { createdAt: 'desc' },
          })
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          id: 'rq-req',
          vendorName: '宛先の協力業者',
          tradingPartnerName: '宛先の協力業者',
        });
      });

      /**
       * @requirement estimate-request/REQ-43.1
       */
      it('include: all は、見積依頼に紐づかないものも含めて案件の論理削除されていない受領見積書を返す', async () => {
        vi.mocked(mockPrisma.receivedQuotation.findMany).mockResolvedValue([
          listedRow({ id: 'rq-own', estimateRequestId: null, vendorName: '自前の協力業者' }),
          listedRow({ id: 'rq-req', estimateRequestId: 'er-1', vendorName: '宛先の協力業者' }),
        ] as never);

        const result = await service.findByProjectId('project-ctx', { include: 'all' });

        expect(mockPrisma.receivedQuotation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              projectId: 'project-ctx',
              deletedAt: null,
              OR: [{ estimateRequestId: null }, { estimateRequest: { is: { deletedAt: null } } }],
            },
          })
        );
        expect(
          result.map((q) => [q.id, q.estimateRequestId, q.vendorName, q.tradingPartnerName])
        ).toEqual([
          ['rq-own', null, '自前の協力業者', '自前の協力業者'],
          ['rq-req', 'er-1', '宛先の協力業者', '宛先の協力業者'],
        ]);
      });
    });
  });

  /**
   * 業者名の写しと取引先の照合（タスク113.2）
   *
   * design の Requirements 43-50 の章の D4 を観測する。見積依頼の文脈は宛先の取引先を写し、案件の文脈は
   * 選んだ取引先（論理削除されていない協力業者）か、業者名と名前が完全に一致する協力業者がちょうど 1 件の
   * ときに紐づける。照合の条件（論理削除・種別）は照会の where で主張し、実際の DB での絞り込みは統合で確かめる
   */
  describe('業者名と取引先の照合（タスク113.2）', () => {
    const projectRow = { id: 'project-vn', deletedAt: null };
    const SUBCONTRACTOR_ONLY = {
      name: '協力の山田工務店',
      deletedAt: null,
      types: [{ type: 'SUBCONTRACTOR' }],
    };

    const quotationRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'rq-vn',
      estimateRequestId: null,
      projectId: 'project-vn',
      vendorName: '協力の山田工務店',
      tradingPartnerId: null,
      name: '受領見積書',
      submittedAt: new Date('2026-11-01'),
      filePath: null,
      fileName: null,
      fileMimeType: null,
      fileSize: null,
      netAmount: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      deletedAt: null,
      lineItems: [],
      ...overrides,
    });

    const setupTx = (options: {
      project?: unknown;
      estimateRequest?: unknown;
      partnerById?: unknown;
      partnersByName?: unknown[];
      existing?: Record<string, unknown>;
    }) => {
      const txClient = {
        project: { findUnique: vi.fn().mockResolvedValue(options.project ?? projectRow) },
        estimateRequest: {
          findUnique: vi.fn().mockResolvedValue(options.estimateRequest ?? null),
        },
        tradingPartner: {
          findUnique: vi.fn().mockResolvedValue(options.partnerById ?? null),
          findMany: vi.fn().mockResolvedValue(options.partnersByName ?? []),
        },
        receivedQuotation: {
          create: vi.fn().mockResolvedValue(quotationRow()),
          findUnique: vi.fn().mockResolvedValue(options.existing ?? null),
          update: vi
            .fn()
            .mockResolvedValue({ ...(options.existing ?? quotationRow()), lineItems: [] }),
        },
        receivedQuotationLineItem: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn(),
        },
      };
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) =>
        fn(txClient as unknown as PrismaClient)
      );
      return txClient;
    };

    const baseInput = {
      name: '受領見積書',
      submittedAt: new Date('2026-11-01'),
      lineItems: [{ name: '工事A', sortOrder: 0, quantity: 1, unitPrice: 1000, amount: 1000 }],
    };
    const projectContext = { kind: 'project', projectId: 'project-vn' } as const;

    const createdData = (txClient: ReturnType<typeof setupTx>) =>
      txClient.receivedQuotation.create.mock.calls[0]![0].data as Record<string, unknown>;

    /** 名前の照合の照会（論理削除されていない協力業者で名前が完全に一致するもの） */
    const nameMatchQuery = (name: string) => ({
      where: { name, deletedAt: null, types: { some: { type: 'SUBCONTRACTOR' } } },
      select: { id: true },
      take: 2,
    });

    describe('見積依頼の文脈', () => {
      /**
       * @requirement estimate-request/REQ-44.2
       * @requirement estimate-request/REQ-44.3
       */
      it('宛先の取引先の名前と ID を写し、入力の業者名と取引先の ID を使わず、照合もしない', async () => {
        const txClient = setupTx({
          estimateRequest: {
            id: 'er-vn',
            deletedAt: null,
            projectId: 'project-of-request',
            tradingPartnerId: 'tp-destination',
            tradingPartner: { name: '宛先の協力業者' },
          },
        });

        await service.create(
          { kind: 'estimateRequest', estimateRequestId: 'er-vn' },
          { ...baseInput, vendorName: '別の業者名', tradingPartnerId: 'tp-other' },
          ACTOR_ID
        );

        expect(createdData(txClient)).toEqual(
          expect.objectContaining({
            vendorName: '宛先の協力業者',
            tradingPartnerId: 'tp-destination',
          })
        );
        expect(txClient.tradingPartner.findUnique).not.toHaveBeenCalled();
        expect(txClient.tradingPartner.findMany).not.toHaveBeenCalled();
      });
    });

    describe('案件の文脈で取引先を選んだとき', () => {
      /**
       * @requirement estimate-request/REQ-44.5
       */
      it('選んだ協力業者の取引先に紐づけ、業者名に取引先の名前を入れる（入力の業者名より優先）', async () => {
        const txClient = setupTx({ partnerById: { id: 'tp-picked', ...SUBCONTRACTOR_ONLY } });

        await service.create(
          projectContext,
          { ...baseInput, vendorName: '山田', tradingPartnerId: 'tp-picked' },
          ACTOR_ID
        );

        expect(txClient.tradingPartner.findUnique).toHaveBeenCalledWith({
          where: { id: 'tp-picked' },
          select: { id: true, name: true, deletedAt: true, types: { select: { type: true } } },
        });
        expect(createdData(txClient)).toEqual(
          expect.objectContaining({ vendorName: '協力の山田工務店', tradingPartnerId: 'tp-picked' })
        );
        expect(txClient.tradingPartner.findMany).not.toHaveBeenCalled();
      });

      it('顧客と協力業者の両方の種別を持つ取引先も選べる', async () => {
        const txClient = setupTx({
          partnerById: {
            id: 'tp-both',
            name: '両方の取引先',
            deletedAt: null,
            types: [{ type: 'CUSTOMER' }, { type: 'SUBCONTRACTOR' }],
          },
        });

        await service.create(
          projectContext,
          { ...baseInput, vendorName: '両方の取引先', tradingPartnerId: 'tp-both' },
          ACTOR_ID
        );

        expect(createdData(txClient)).toEqual(
          expect.objectContaining({ vendorName: '両方の取引先', tradingPartnerId: 'tp-both' })
        );
      });

      it.each([
        ['存在しない', null],
        [
          '論理削除済みの',
          { id: 'tp-x', ...SUBCONTRACTOR_ONLY, deletedAt: new Date('2026-10-01') },
        ],
        [
          '顧客だけの',
          { id: 'tp-x', name: '顧客の会社', deletedAt: null, types: [{ type: 'CUSTOMER' }] },
        ],
      ])(
        '%s取引先の ID は検証の誤りで拒み、名前の照合へ切り替えず保存しない',
        async (_label, partner) => {
          const txClient = setupTx({
            partnerById: partner,
            partnersByName: [{ id: 'tp-same-name' }],
          });

          const promise = service.create(
            projectContext,
            { ...baseInput, vendorName: '協力の山田工務店', tradingPartnerId: 'tp-x' },
            ACTOR_ID
          );

          await expect(promise).rejects.toThrow(ValidationError);
          await expect(promise).rejects.toThrow(
            '選んだ取引先が見つからないか、協力業者として登録されていません'
          );
          expect(txClient.tradingPartner.findMany).not.toHaveBeenCalled();
          expect(txClient.receivedQuotation.create).not.toHaveBeenCalled();
          expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
        }
      );
    });

    describe('案件の文脈で取引先を選ばずに業者名だけを入れたとき', () => {
      /**
       * @requirement estimate-request/REQ-44.6
       */
      it('前後の空白を除いた名前が一致する協力業者がちょうど 1 件なら、その取引先に紐づける', async () => {
        const txClient = setupTx({ partnersByName: [{ id: 'tp-only' }] });

        await service.create(
          projectContext,
          { ...baseInput, vendorName: '  協力の山田工務店  ' },
          ACTOR_ID
        );

        expect(txClient.tradingPartner.findMany).toHaveBeenCalledWith(
          nameMatchQuery('協力の山田工務店')
        );
        expect(createdData(txClient)).toEqual(
          expect.objectContaining({ vendorName: '協力の山田工務店', tradingPartnerId: 'tp-only' })
        );
      });

      it('取引先の ID が null のときも名前で照合する', async () => {
        const txClient = setupTx({ partnersByName: [{ id: 'tp-only' }] });

        await service.create(
          projectContext,
          { ...baseInput, vendorName: '協力の山田工務店', tradingPartnerId: null },
          ACTOR_ID
        );

        expect(txClient.tradingPartner.findUnique).not.toHaveBeenCalled();
        expect(createdData(txClient)).toEqual(
          expect.objectContaining({ tradingPartnerId: 'tp-only' })
        );
      });

      /**
       * @requirement estimate-request/REQ-44.7
       */
      it.each([
        ['一致する協力業者が無い', []],
        ['一致する協力業者が複数ある', [{ id: 'tp-a' }, { id: 'tp-b' }]],
      ])('%sときは紐づけずに業者名だけを保持する', async (_label, partners) => {
        const txClient = setupTx({ partnersByName: partners });

        await service.create(
          projectContext,
          { ...baseInput, vendorName: '協力の山田工務店' },
          ACTOR_ID
        );

        expect(createdData(txClient)).toEqual(
          expect.objectContaining({ vendorName: '協力の山田工務店', tradingPartnerId: null })
        );
      });

      it('照合は論理削除されていない協力業者だけを対象にする（論理削除済み・顧客だけの取引先は数えない）', async () => {
        const txClient = setupTx({ partnersByName: [] });

        await service.create(projectContext, { ...baseInput, vendorName: '顧客の会社' }, ACTOR_ID);

        const query = txClient.tradingPartner.findMany.mock.calls[0]![0] as {
          where: Record<string, unknown>;
        };
        expect(query.where.deletedAt).toBeNull();
        expect(query.where.types).toEqual({ some: { type: 'SUBCONTRACTOR' } });
        expect(query.where.name).toBe('顧客の会社');
      });
    });

    describe('更新', () => {
      const expectedUpdatedAt = new Date('2026-11-01T00:00:00Z');

      const updatedData = (txClient: ReturnType<typeof setupTx>) =>
        txClient.receivedQuotation.update.mock.calls[0]![0].data as Record<string, unknown>;

      /**
       * @requirement estimate-request/REQ-44.3
       */
      it('見積依頼に紐づく受領見積書は、入力の業者名と取引先の ID を無視して写しを保つ', async () => {
        const txClient = setupTx({
          existing: quotationRow({
            estimateRequestId: 'er-vn',
            vendorName: '宛先の協力業者',
            tradingPartnerId: 'tp-destination',
            updatedAt: expectedUpdatedAt,
          }),
        });

        await service.update(
          'rq-vn',
          { name: '改名', vendorName: '書き換え', tradingPartnerId: 'tp-other' },
          expectedUpdatedAt,
          ACTOR_ID
        );

        const data = updatedData(txClient);
        expect(data).not.toHaveProperty('vendorName');
        expect(data).not.toHaveProperty('tradingPartnerId');
        expect(txClient.tradingPartner.findUnique).not.toHaveBeenCalled();
        expect(txClient.tradingPartner.findMany).not.toHaveBeenCalled();
      });

      /**
       * @requirement estimate-request/REQ-44.5
       */
      it('案件の文脈で別の取引先を選んだら、その取引先に紐づけて名前を入れる', async () => {
        const txClient = setupTx({
          existing: quotationRow({ updatedAt: expectedUpdatedAt }),
          partnerById: { id: 'tp-new', ...SUBCONTRACTOR_ONLY, name: '新しい協力業者' },
        });

        await service.update(
          'rq-vn',
          { vendorName: '新しい', tradingPartnerId: 'tp-new' },
          expectedUpdatedAt,
          ACTOR_ID
        );

        expect(updatedData(txClient)).toEqual(
          expect.objectContaining({ vendorName: '新しい協力業者', tradingPartnerId: 'tp-new' })
        );
      });

      /**
       * @requirement estimate-request/REQ-44.6
       * @requirement estimate-request/REQ-44.7
       */
      it('案件の文脈で業者名を打ち直したら名前で照合し直す（1 件なら紐づけ、無ければ紐づけを外す）', async () => {
        const matched = setupTx({
          existing: quotationRow({ updatedAt: expectedUpdatedAt, tradingPartnerId: 'tp-old' }),
          partnersByName: [{ id: 'tp-match' }],
        });
        await service.update(
          'rq-vn',
          { vendorName: ' 別の協力業者 ' },
          expectedUpdatedAt,
          ACTOR_ID
        );
        expect(matched.tradingPartner.findMany).toHaveBeenCalledWith(
          nameMatchQuery('別の協力業者')
        );
        expect(updatedData(matched)).toEqual(
          expect.objectContaining({ vendorName: '別の協力業者', tradingPartnerId: 'tp-match' })
        );

        const unmatched = setupTx({
          existing: quotationRow({ updatedAt: expectedUpdatedAt, tradingPartnerId: 'tp-old' }),
          partnersByName: [],
        });
        await service.update('rq-vn', { vendorName: '未登録の業者' }, expectedUpdatedAt, ACTOR_ID);
        expect(updatedData(unmatched)).toEqual(
          expect.objectContaining({ vendorName: '未登録の業者', tradingPartnerId: null })
        );
      });

      /**
       * @requirement estimate-request/REQ-44.8
       */
      it('同じ取引先と同じ業者名を送り直しても、取引先の今の名前で業者名を書き換えない', async () => {
        const txClient = setupTx({
          existing: quotationRow({
            updatedAt: expectedUpdatedAt,
            vendorName: '改名前の名前',
            tradingPartnerId: 'tp-renamed',
          }),
          partnerById: { id: 'tp-renamed', ...SUBCONTRACTOR_ONLY, name: '改名後の名前' },
        });

        await service.update(
          'rq-vn',
          { vendorName: '改名前の名前', tradingPartnerId: 'tp-renamed' },
          expectedUpdatedAt,
          ACTOR_ID
        );

        const data = updatedData(txClient);
        expect(data).not.toHaveProperty('vendorName');
        expect(data).not.toHaveProperty('tradingPartnerId');
      });

      it('案件の文脈で業者名を空にしたら 43.8 の文言で拒み書き換えない', async () => {
        const txClient = setupTx({ existing: quotationRow({ updatedAt: expectedUpdatedAt }) });

        const promise = service.update('rq-vn', { vendorName: '  ' }, expectedUpdatedAt, ACTOR_ID);

        await expect(promise).rejects.toThrow('業者名を入力してください');
        expect(txClient.receivedQuotation.update).not.toHaveBeenCalled();
      });

      it('業者名も取引先の ID も送らない更新は、業者名と紐づけに触れない', async () => {
        const txClient = setupTx({ existing: quotationRow({ updatedAt: expectedUpdatedAt }) });

        await service.update('rq-vn', { name: '改名だけ' }, expectedUpdatedAt, ACTOR_ID);

        const data = updatedData(txClient);
        expect(data).not.toHaveProperty('vendorName');
        expect(data).not.toHaveProperty('tradingPartnerId');
        expect(txClient.tradingPartner.findMany).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * Task 21.1: ReceivedQuotationServiceの明細行管理追加テスト
   *
   * Requirements:
   * - 11.9: 構造化データ入力エリア
   * - 11.10: 明細行データのバリデーション
   * - 11.11: 受領見積書取得時に明細行データを含めて返却
   * - 11.12: 金額の自動計算
   * - 11.13: 合計金額算出
   * - 11.22: ファイルまたは明細行データのいずれかが必須
   * - 11.24: ファイルも明細行もない場合のエラー
   * - 14.1: 受領見積書を見積依頼に紐づけて保存
   * - 14.2: 明細行データをDBに永続化
   * - 14.3: ファイルをストレージに保存
   * - 14.4: 作成日時と更新日時を記録
   * - 14.5: 論理削除
   * - 14.6: 楽観的排他制御
   */
  describe('明細行管理（Task 21.1）', () => {
    describe('create - 明細行対応', () => {
      it('明細行データを含む受領見積書を作成する（Requirements: 11.9, 14.2）', async () => {
        // Arrange
        const lineItems = [
          {
            name: '工事A',
            sortOrder: 0,
            specification: '規格A',
            unit: '式',
            quantity: 1,
            unitPrice: 50000,
            amount: 50000,
            remarks: '備考A',
          },
          {
            name: '工事B',
            sortOrder: 1,
            specification: null,
            unit: '個',
            quantity: 10,
            unitPrice: 1000,
            amount: 10000,
            remarks: null,
          },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書（明細行付き）',
          submittedAt: new Date('2026-01-23'),
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const mockCreatedQuotation = {
          id: 'rq-010',
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書（明細行付き）',
          submittedAt: new Date('2026-01-23'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date('2026-01-23T00:00:00Z'),
          updatedAt: new Date('2026-01-23T00:00:00Z'),
          deletedAt: null,
          lineItems: [
            { id: 'li-001', receivedQuotationId: 'rq-010', ...lineItems[0] },
            { id: 'li-002', receivedQuotationId: 'rq-010', ...lineItems[1] },
          ],
        };

        const mockCreateMany = vi.fn().mockResolvedValue({ count: 2 });

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: mockCreateMany,
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert
        expect(result.id).toBe('rq-010');
        expect(result.lineItems).toHaveLength(2);
        expect(result.lineItems[0]!.name).toBe('工事A');
        expect(result.lineItems[1]!.name).toBe('工事B');
        expect(result.totalAmount).toBe(60000);
      });

      it('ファイルと明細行の両方を含む受領見積書を作成する', async () => {
        // Arrange
        const lineItems = [
          { name: '項目1', sortOrder: 0, quantity: 5, unitPrice: 2000, amount: 10000 },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書（ファイル+明細行）',
          submittedAt: new Date('2026-01-23'),
          file: {
            buffer: Buffer.from('PDF content'),
            originalName: '見積書.pdf',
            mimeType: 'application/pdf',
            size: 5000,
          },
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const mockCreatedQuotation = {
          id: 'rq-011',
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書（ファイル+明細行）',
          submittedAt: new Date('2026-01-23'),
          filePath: 'quotations/er-001/rq-011/見積書.pdf',
          fileName: '見積書.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 5000,
          createdAt: new Date('2026-01-23T00:00:00Z'),
          updatedAt: new Date('2026-01-23T00:00:00Z'),
          deletedAt: null,
          lineItems: [{ id: 'li-001', receivedQuotationId: 'rq-011', ...lineItems[0] }],
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
              update: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert
        expect(result.fileName).toBe('見積書.pdf');
        expect(result.lineItems).toHaveLength(1);
        expect(result.totalAmount).toBe(10000);
        expect(mockStorageProvider.upload).toHaveBeenCalled();
      });

      it('ファイルも明細行もない場合にエラーを発生させる（Requirements: 11.22, 11.24）', async () => {
        // Arrange
        const input = {
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書',
          submittedAt: new Date('2026-01-23'),
          // ファイルも明細行もなし
        };

        // Act & Assert
        await expect(service.create(requestContextOf(input), input, ACTOR_ID)).rejects.toThrow(
          'ファイルのアップロードまたは明細行データの入力が必要です'
        );
      });

      it('サーバーサイド金額検証を行う（Requirements: 11.12）', async () => {
        // Arrange: 金額が数量x単価と一致しない
        const lineItems = [
          { name: '工事A', sortOrder: 0, quantity: 10, unitPrice: 1000, amount: 99999 },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書',
          submittedAt: new Date('2026-01-23'),
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const correctedLineItems = [
          {
            id: 'li-001',
            receivedQuotationId: 'rq-012',
            name: '工事A',
            sortOrder: 0,
            specification: null,
            unit: null,
            quantity: 10,
            unitPrice: 1000,
            amount: 10000,
            remarks: null,
          },
        ];
        const mockCreatedQuotation = {
          id: 'rq-012',
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書',
          submittedAt: new Date('2026-01-23'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date('2026-01-23T00:00:00Z'),
          updatedAt: new Date('2026-01-23T00:00:00Z'),
          deletedAt: null,
          lineItems: correctedLineItems,
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert: サーバーサイドで金額を再計算して保存
        expect(result.lineItems[0]!.amount).toBe(10000);
        expect(result.totalAmount).toBe(10000);
      });
    });

    describe('findById - 明細行対応', () => {
      it('受領見積書取得時に明細行データと合計金額を含めて返却する（Requirements: 11.11, 11.13）', async () => {
        // Arrange
        const mockQuotation = {
          id: 'rq-001',
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書',
          submittedAt: new Date('2026-01-23'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date('2026-01-23T00:00:00Z'),
          updatedAt: new Date('2026-01-23T00:00:00Z'),
          deletedAt: null,
          lineItems: [
            {
              id: 'li-001',
              receivedQuotationId: 'rq-001',
              sortOrder: 0,
              name: '工事A',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 50000,
              amount: 50000,
              remarks: null,
            },
            {
              id: 'li-002',
              receivedQuotationId: 'rq-001',
              sortOrder: 1,
              name: '工事B',
              specification: null,
              unit: '個',
              quantity: 10,
              unitPrice: 1000,
              amount: 10000,
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          mockQuotation as never
        );

        // Act
        const result = await service.findById('rq-001');

        // Assert
        expect(result).not.toBeNull();
        expect(result!.lineItems).toHaveLength(2);
        expect(result!.totalAmount).toBe(60000);
      });

      it('明細行がない受領見積書の場合、空配列とnullの合計金額を返す', async () => {
        // Arrange
        const mockQuotation = {
          id: 'rq-001',
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書',
          submittedAt: new Date('2026-01-23'),
          filePath: 'quotations/er-001/rq-001/見積書.pdf',
          fileName: '見積書.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 10000,
          createdAt: new Date('2026-01-23T00:00:00Z'),
          updatedAt: new Date('2026-01-23T00:00:00Z'),
          deletedAt: null,
          lineItems: [],
        };

        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          mockQuotation as never
        );

        // Act
        const result = await service.findById('rq-001');

        // Assert
        expect(result!.lineItems).toHaveLength(0);
        expect(result!.totalAmount).toBeNull();
      });
    });

    describe('findByEstimateRequestId - 明細行対応', () => {
      it('受領見積書一覧に明細行データと合計金額を含めて返却する', async () => {
        // Arrange
        const mockQuotations = [
          {
            id: 'rq-001',
            estimateRequestId: 'er-001',
            name: '受領見積書1',
            submittedAt: new Date('2026-01-23'),
            filePath: null,
            fileName: null,
            fileMimeType: null,
            fileSize: null,
            createdAt: new Date('2026-01-23T00:00:00Z'),
            updatedAt: new Date('2026-01-23T00:00:00Z'),
            deletedAt: null,
            lineItems: [
              {
                id: 'li-001',
                receivedQuotationId: 'rq-001',
                sortOrder: 0,
                name: '工事A',
                specification: null,
                unit: null,
                quantity: 1,
                unitPrice: 100000,
                amount: 100000,
                remarks: null,
              },
            ],
          },
        ];

        vi.mocked(mockPrisma.receivedQuotation.findMany).mockResolvedValue(mockQuotations as never);

        // Act
        const result = await service.findByEstimateRequestId('er-001');

        // Assert
        expect(result[0]!.lineItems).toHaveLength(1);
        expect(result[0]!.totalAmount).toBe(100000);
      });
    });

    describe('update - 明細行全量置換', () => {
      it('明細行の全量置換（DELETE + INSERT）をinteractive transaction内で実行する（Requirements: 14.2）', async () => {
        // Arrange
        const quotationId = 'rq-001';
        const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');
        const newLineItems = [
          { name: '新工事A', sortOrder: 0, quantity: 2, unitPrice: 30000, amount: 60000 },
          { name: '新工事B', sortOrder: 1, quantity: 5, unitPrice: 5000, amount: 25000 },
        ];

        const mockQuotation = {
          id: 'rq-001',
          estimateRequestId: 'er-001',
          name: '受領見積書',
          submittedAt: new Date('2026-01-23'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date('2026-01-22T00:00:00Z'),
          updatedAt: expectedUpdatedAt,
          deletedAt: null,
        };

        const mockUpdatedQuotation = {
          ...mockQuotation,
          updatedAt: new Date('2026-01-23T01:00:00Z'),
          lineItems: [
            { id: 'li-new-001', receivedQuotationId: 'rq-001', ...newLineItems[0] },
            { id: 'li-new-002', receivedQuotationId: 'rq-001', ...newLineItems[1] },
          ],
        };

        const mockDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
        const mockCreateMany = vi.fn().mockResolvedValue({ count: 2 });

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            receivedQuotation: {
              findUnique: vi.fn().mockResolvedValue(mockQuotation),
              update: vi.fn().mockResolvedValue(mockUpdatedQuotation),
            },
            receivedQuotationLineItem: {
              deleteMany: mockDeleteMany,
              createMany: mockCreateMany,
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.update(
          quotationId,
          { lineItems: newLineItems },
          expectedUpdatedAt,
          ACTOR_ID
        );

        // Assert
        expect(mockDeleteMany).toHaveBeenCalledWith({
          where: { receivedQuotationId: quotationId },
        });
        expect(mockCreateMany).toHaveBeenCalled();
        expect(result.lineItems).toHaveLength(2);
        expect(result.totalAmount).toBe(85000);
      });
    });

    describe('ファイル削除時のリカバリスコープ', () => {
      it('ファイル削除失敗時にログ記録を行い、処理を続行する', async () => {
        // Arrange
        const quotationId = 'rq-001';
        const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

        const mockQuotation = {
          id: 'rq-001',
          estimateRequestId: 'er-001',
          name: 'テスト受領見積書',
          submittedAt: new Date('2026-01-23'),
          filePath: 'quotations/er-001/rq-001/見積書.pdf',
          fileName: '見積書.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 10000,
          createdAt: new Date(),
          updatedAt: expectedUpdatedAt,
          deletedAt: null,
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            receivedQuotation: {
              findUnique: vi.fn().mockResolvedValue(mockQuotation),
              update: vi.fn().mockResolvedValue({ ...mockQuotation, deletedAt: new Date() }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // ファイル削除を失敗させる
        vi.mocked(mockStorageProvider.delete).mockRejectedValue(new Error('Storage delete failed'));

        // Act - エラーがスローされないことを確認
        await expect(
          service.delete(quotationId, expectedUpdatedAt, ACTOR_ID)
        ).resolves.toBeUndefined();

        // Assert: ファイル削除が試みられたが、エラーは伝播されない
        expect(mockStorageProvider.delete).toHaveBeenCalledWith(
          'quotations/er-001/rq-001/見積書.pdf'
        );
      });
    });
  });

  /**
   * Task 27.1: ReceivedQuotationServiceの明細行管理テスト追加
   *
   * Requirements:
   * - 11.9: 構造化データ入力エリア
   * - 11.10: 金額フィールドを入力不可とし自動計算する
   * - 11.11: 数量または単価変更時に金額を自動再計算する
   * - 11.12: 全明細行の金額合計を自動計算して表示する
   * - 11.13: フォーム初期表示時に1行の空の明細行を表示する（フロントエンド）
   * - 11.22: ファイルまたは明細行データのいずれかが必須
   * - 11.24: ファイルも明細行もない場合のバリデーションエラー
   * - 14.2: 明細行データをDBに永続化
   */
  describe('明細行管理テスト - Task 27.1', () => {
    describe('create - 明細行を含む受領見積書の作成', () => {
      it('明細行を含む受領見積書を正常に作成する（Requirements: 11.9, 14.2）', async () => {
        // Arrange
        const lineItems = [
          {
            name: '外壁塗装工事',
            sortOrder: 0,
            specification: 'シリコン系',
            unit: 'm2',
            quantity: 150,
            unitPrice: 3500,
            amount: 525000,
            remarks: '足場込み',
          },
          {
            name: '防水工事',
            sortOrder: 1,
            specification: 'ウレタン防水',
            unit: 'm2',
            quantity: 50,
            unitPrice: 8000,
            amount: 400000,
            remarks: null,
          },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: '外壁改修見積書',
          submittedAt: new Date('2026-02-01'),
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const mockCreatedQuotation = {
          id: 'rq-new-001',
          estimateRequestId: 'er-001',
          name: '外壁改修見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
          deletedAt: null,
          lineItems: lineItems.map((li, idx) => ({
            id: `li-${idx}`,
            receivedQuotationId: 'rq-new-001',
            ...li,
          })),
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 2 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert
        expect(result.id).toBe('rq-new-001');
        expect(result.lineItems).toHaveLength(2);
        expect(result.lineItems[0]!.name).toBe('外壁塗装工事');
        expect(result.lineItems[1]!.name).toBe('防水工事');
        expect(result.totalAmount).toBe(925000);
      });

      it('ファイルと明細行の共存登録テスト', async () => {
        // Arrange: ファイルと明細行の両方を含む入力
        const lineItems = [
          { name: '設備工事', sortOrder: 0, quantity: 3, unitPrice: 120000, amount: 360000 },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: '設備工事見積書',
          submittedAt: new Date('2026-02-01'),
          file: {
            buffer: Buffer.from('PDF content'),
            originalName: '設備見積.pdf',
            mimeType: 'application/pdf',
            size: 8000,
          },
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const mockCreatedQuotation = {
          id: 'rq-new-002',
          estimateRequestId: 'er-001',
          name: '設備工事見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: 'quotations/er-001/rq-new-002/設備見積.pdf',
          fileName: '設備見積.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 8000,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: [{ id: 'li-1', receivedQuotationId: 'rq-new-002', ...lineItems[0] }],
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
              update: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert: ファイルと明細行の両方が存在
        expect(result.fileName).toBe('設備見積.pdf');
        expect(result.lineItems).toHaveLength(1);
        expect(result.totalAmount).toBe(360000);
        expect(mockStorageProvider.upload).toHaveBeenCalled();
      });

      it('ファイルのみの登録テスト（明細行なし）', async () => {
        // Arrange: ファイルのみで明細行なし
        const input = {
          estimateRequestId: 'er-001',
          name: 'ファイルのみ見積書',
          submittedAt: new Date('2026-02-01'),
          file: {
            buffer: Buffer.from('Excel content'),
            originalName: '見積書.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 6000,
          },
          // lineItemsは指定しない
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const mockCreatedQuotation = {
          id: 'rq-new-003',
          estimateRequestId: 'er-001',
          name: 'ファイルのみ見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: 'quotations/er-001/rq-new-003/見積書.xlsx',
          fileName: '見積書.xlsx',
          fileMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileSize: 6000,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: [],
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
              update: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert: ファイルのみで明細行なし
        expect(result.fileName).toBe('見積書.xlsx');
        expect(result.lineItems).toHaveLength(0);
        expect(result.totalAmount).toBeNull();
      });

      it('明細行のみの登録テスト（ファイルなし）', async () => {
        // Arrange: 明細行のみでファイルなし
        const lineItems = [
          { name: '材料費', sortOrder: 0, quantity: 1, unitPrice: 250000, amount: 250000 },
          { name: '人件費', sortOrder: 1, quantity: 1, unitPrice: 150000, amount: 150000 },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: '明細のみ見積書',
          submittedAt: new Date('2026-02-01'),
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const mockCreatedQuotation = {
          id: 'rq-new-004',
          estimateRequestId: 'er-001',
          name: '明細のみ見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: lineItems.map((li, idx) => ({
            id: `li-${idx}`,
            receivedQuotationId: 'rq-new-004',
            ...li,
          })),
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 2 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert: 明細行のみでファイルなし
        expect(result.fileName).toBeNull();
        expect(result.lineItems).toHaveLength(2);
        expect(result.totalAmount).toBe(400000);
        expect(mockStorageProvider.upload).not.toHaveBeenCalled();
      });

      it('ファイルも明細行もない場合のバリデーションエラーテスト（Requirements: 11.22, 11.24）', async () => {
        // Arrange: ファイルも明細行もなし
        const input = {
          estimateRequestId: 'er-001',
          name: '空の見積書',
          submittedAt: new Date('2026-02-01'),
          // ファイルなし、明細行なし
        };

        // Act & Assert
        await expect(service.create(requestContextOf(input), input, ACTOR_ID)).rejects.toThrow(
          'ファイルのアップロードまたは明細行データの入力が必要です'
        );
      });

      it('空の明細行配列の場合もバリデーションエラーになる', async () => {
        // Arrange: 空の明細行配列
        const input = {
          estimateRequestId: 'er-001',
          name: '空配列見積書',
          submittedAt: new Date('2026-02-01'),
          lineItems: [],
        };

        // Act & Assert
        await expect(service.create(requestContextOf(input), input, ACTOR_ID)).rejects.toThrow(
          'ファイルのアップロードまたは明細行データの入力が必要です'
        );
      });
    });

    describe('create - 明細行データのサーバーサイド金額検証', () => {
      it('クライアント送信の金額が誤っている場合、サーバーサイドで再計算する（Requirements: 11.10, 11.11）', async () => {
        // Arrange: クライアントから誤った金額を送信
        const lineItems = [
          {
            name: '工事A',
            sortOrder: 0,
            quantity: 5,
            unitPrice: 20000,
            amount: 99999, // 誤った金額（正しくは100000）
          },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: '金額検証テスト見積書',
          submittedAt: new Date('2026-02-01'),
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };

        // サーバー側で金額補正後の明細行データ
        const correctedLineItem = {
          id: 'li-corrected',
          receivedQuotationId: 'rq-corrected',
          name: '工事A',
          sortOrder: 0,
          specification: null,
          unit: null,
          quantity: 5,
          unitPrice: 20000,
          amount: 100000, // サーバーサイドで再計算
          remarks: null,
        };

        const mockCreatedQuotation = {
          id: 'rq-corrected',
          estimateRequestId: 'er-001',
          name: '金額検証テスト見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: [correctedLineItem],
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert: 金額がサーバーサイドで再計算されている
        expect(result.lineItems[0]!.amount).toBe(100000);
        expect(result.totalAmount).toBe(100000);
      });

      it('数量または単価がnullの場合、金額はnullとなる', async () => {
        // Arrange: 数量または単価がnull
        const lineItems = [
          {
            name: '見積項目',
            sortOrder: 0,
            quantity: null, // 数量なし
            unitPrice: 10000,
            amount: null,
          },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: '数量null見積書',
          submittedAt: new Date('2026-02-01'),
          lineItems,
        };

        const mockEstimateRequest = {
          id: 'er-001',
          deletedAt: null,
          projectId: 'project-001',
          tradingPartnerId: 'tp-001',
          tradingPartner: { name: '協力業者A' },
        };
        const mockCreatedQuotation = {
          id: 'rq-null',
          estimateRequestId: 'er-001',
          name: '数量null見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: [
            {
              id: 'li-null',
              receivedQuotationId: 'rq-null',
              name: '見積項目',
              sortOrder: 0,
              specification: null,
              unit: null,
              quantity: null,
              unitPrice: 10000,
              amount: null,
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreatedQuotation),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        // Assert: 金額はnull
        expect(result.lineItems[0]!.amount).toBeNull();
      });
    });

    describe('明細行の全量置換（更新）テスト', () => {
      /**
       * @requirement estimate-request/REQ-14.2: The システム shall 受領見積書の明細行データ（任意分類、工種、名称、規格、単位、数量、単価、金額、備考）をデータベースに永続化する
       *
       * 本検証は当該条文のうち**書き込みの実行**を機構として観測する。
       * `ReceivedQuotationService.update` がトランザクション内で
       * `receivedQuotationLineItem.deleteMany` に続けて `createMany` を呼び、渡す `data` が
       * 明細行ごとの値（名称と並び順）を持つことを主張している。観測の対象は本番モジュール
       * backend/src/services/received-quotation.service.ts の `update` の全量置換であり、
       * 当該サービスは backend/src/routes/received-quotation.routes.ts が取り込むため
       * 本番の経路に乗る。
       *
       * 条文が挙げる九つの欄の構成を固定しているのは本検証ではなく
       * backend/src/__tests__/unit/schemas/received-quotation.schema.test.ts の
       * `lineItemSchema` の群である（そちらにも同じ番号を付けた）。本検証が固定するのは
       * `createMany` の `data` のうち名称と並び順の二つで、残る七つの欄の写しは
       * どの単体検証も固定していない。
       *
       * 空振りでないことの実測: `update` の `createMany` の写しで `sortOrder: item.sortOrder`
       * を `sortOrder: 0` へ潰すと、本検証を含む 53件中1件が落ちる（2026-09-07 実測。採取は
       * `npm --prefix backend run test -- src/__tests__/unit/services/received-quotation.service.test.ts`。
       * 変異は復元済み）。
       */
      it('明細行の全量置換でDELETE + INSERTが実行される', async () => {
        // Arrange
        const quotationId = 'rq-update-001';
        const expectedUpdatedAt = new Date('2026-02-01T00:00:00Z');
        const newLineItems = [
          { name: '新工事A', sortOrder: 0, quantity: 3, unitPrice: 50000, amount: 150000 },
          { name: '新工事B', sortOrder: 1, quantity: 2, unitPrice: 75000, amount: 150000 },
        ];

        const mockQuotation = {
          id: quotationId,
          estimateRequestId: 'er-001',
          name: '更新前見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date('2026-01-30T00:00:00Z'),
          updatedAt: expectedUpdatedAt,
          deletedAt: null,
        };

        const mockUpdatedQuotation = {
          ...mockQuotation,
          name: '更新前見積書',
          updatedAt: new Date('2026-02-01T01:00:00Z'),
          lineItems: newLineItems.map((li, idx) => ({
            id: `li-new-${idx}`,
            receivedQuotationId: quotationId,
            ...li,
          })),
        };

        const mockDeleteMany = vi.fn().mockResolvedValue({ count: 3 });
        const mockCreateMany = vi.fn().mockResolvedValue({ count: 2 });

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            receivedQuotation: {
              findUnique: vi.fn().mockResolvedValue(mockQuotation),
              update: vi.fn().mockResolvedValue(mockUpdatedQuotation),
            },
            receivedQuotationLineItem: {
              deleteMany: mockDeleteMany,
              createMany: mockCreateMany,
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.update(
          quotationId,
          { lineItems: newLineItems },
          expectedUpdatedAt,
          ACTOR_ID
        );

        // Assert
        expect(mockDeleteMany).toHaveBeenCalledWith({
          where: { receivedQuotationId: quotationId },
        });
        expect(mockCreateMany).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            expect.objectContaining({ name: '新工事A', sortOrder: 0 }),
            expect.objectContaining({ name: '新工事B', sortOrder: 1 }),
          ]),
        });
        expect(result.lineItems).toHaveLength(2);
        expect(result.totalAmount).toBe(300000);
      });

      it('明細行を空配列で更新（全削除）', async () => {
        // Arrange
        const quotationId = 'rq-update-002';
        const expectedUpdatedAt = new Date('2026-02-01T00:00:00Z');

        const mockQuotation = {
          id: quotationId,
          estimateRequestId: 'er-001',
          name: '全削除テスト見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: 'quotations/er-001/rq-update-002/file.pdf', // ファイルありなので明細なしでもOK
          fileName: 'file.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 5000,
          createdAt: new Date('2026-01-30T00:00:00Z'),
          updatedAt: expectedUpdatedAt,
          deletedAt: null,
        };

        const mockUpdatedQuotation = {
          ...mockQuotation,
          updatedAt: new Date('2026-02-01T01:00:00Z'),
          lineItems: [],
        };

        const mockDeleteMany = vi.fn().mockResolvedValue({ count: 5 });
        const mockCreateMany = vi.fn().mockResolvedValue({ count: 0 });

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            receivedQuotation: {
              findUnique: vi.fn().mockResolvedValue(mockQuotation),
              update: vi.fn().mockResolvedValue(mockUpdatedQuotation),
            },
            receivedQuotationLineItem: {
              deleteMany: mockDeleteMany,
              createMany: mockCreateMany,
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        // Act
        const result = await service.update(
          quotationId,
          { lineItems: [] },
          expectedUpdatedAt,
          ACTOR_ID
        );

        // Assert: 全削除される
        expect(mockDeleteMany).toHaveBeenCalledWith({
          where: { receivedQuotationId: quotationId },
        });
        expect(result.lineItems).toHaveLength(0);
        expect(result.totalAmount).toBeNull();
      });
    });

    describe('合計金額算出テスト', () => {
      it('複数明細行の合計金額を正しく算出する（Requirements: 11.12）', async () => {
        // Arrange
        const mockQuotation = {
          id: 'rq-total',
          estimateRequestId: 'er-001',
          name: '合計テスト見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-total',
              sortOrder: 0,
              name: '項目1',
              specification: null,
              unit: null,
              quantity: 10,
              unitPrice: 1000,
              amount: 10000,
              remarks: null,
            },
            {
              id: 'li-2',
              receivedQuotationId: 'rq-total',
              sortOrder: 1,
              name: '項目2',
              specification: null,
              unit: null,
              quantity: 20,
              unitPrice: 500,
              amount: 10000,
              remarks: null,
            },
            {
              id: 'li-3',
              receivedQuotationId: 'rq-total',
              sortOrder: 2,
              name: '項目3',
              specification: null,
              unit: null,
              quantity: 5,
              unitPrice: 10000,
              amount: 50000,
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          mockQuotation as never
        );

        // Act
        const result = await service.findById('rq-total');

        // Assert: 合計金額 = 10000 + 10000 + 50000 = 70000
        expect(result!.totalAmount).toBe(70000);
      });

      it('金額がnullの明細行は合計計算から除外される', async () => {
        // Arrange
        const mockQuotation = {
          id: 'rq-null-amount',
          estimateRequestId: 'er-001',
          name: 'null金額テスト見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-null-amount',
              sortOrder: 0,
              name: '項目1（金額あり）',
              specification: null,
              unit: null,
              quantity: 10,
              unitPrice: 1000,
              amount: 10000,
              remarks: null,
            },
            {
              id: 'li-2',
              receivedQuotationId: 'rq-null-amount',
              sortOrder: 1,
              name: '項目2（金額なし）',
              specification: null,
              unit: null,
              quantity: null, // 数量なしのため金額null
              unitPrice: 500,
              amount: null,
              remarks: null,
            },
            {
              id: 'li-3',
              receivedQuotationId: 'rq-null-amount',
              sortOrder: 2,
              name: '項目3（金額あり）',
              specification: null,
              unit: null,
              quantity: 5,
              unitPrice: 2000,
              amount: 10000,
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          mockQuotation as never
        );

        // Act
        const result = await service.findById('rq-null-amount');

        // Assert: 合計金額 = 10000 + 10000 = 20000（null金額の行は除外）
        expect(result!.totalAmount).toBe(20000);
      });

      it('すべての明細行の金額がnullの場合、合計はnull', async () => {
        // Arrange
        const mockQuotation = {
          id: 'rq-all-null',
          estimateRequestId: 'er-001',
          name: '全null金額テスト見積書',
          submittedAt: new Date('2026-02-01'),
          filePath: 'quotations/er-001/rq-all-null/file.pdf',
          fileName: 'file.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-all-null',
              sortOrder: 0,
              name: '項目1',
              specification: null,
              unit: null,
              quantity: null,
              unitPrice: null,
              amount: null,
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          mockQuotation as never
        );

        // Act
        const result = await service.findById('rq-all-null');

        // Assert: 全金額nullなので合計もnull
        expect(result!.totalAmount).toBeNull();
      });
    });
  });

  // ==========================================================================
  // Task 36.4: 任意分類・工種フィールドテスト (Requirements: 11.10, 14.2)
  // ==========================================================================
  describe('任意分類・工種フィールドテスト (Task 36.4)', () => {
    describe('create - 任意分類・工種を含む明細行の作成', () => {
      it('customCategoryとworkTypeフィールドを含む明細行を正常に作成する', async () => {
        const lineItems = [
          {
            name: '鉄筋D10',
            sortOrder: 0,
            customCategory: '躯体工事',
            workType: '鉄筋工事',
            specification: 'SD295A',
            unit: 'kg',
            quantity: 1500,
            unitPrice: 120,
            amount: 180000,
          },
          {
            name: 'コンクリート',
            sortOrder: 1,
            customCategory: '躯体工事',
            workType: 'コンクリート工事',
            specification: '21-8-20',
            unit: 'm3',
            quantity: 50,
            unitPrice: 15000,
            amount: 750000,
          },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: '見積書（任意分類・工種あり）',
          submittedAt: new Date('2026-02-01'),
          lineItems,
        };

        const mockCreated = {
          id: 'rq-custom-1',
          estimateRequestId: 'er-001',
          name: '見積書（任意分類・工種あり）',
          submittedAt: new Date('2026-02-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          fileStorageKey: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lineItems: [
            {
              id: 'li-c1',
              receivedQuotationId: 'rq-custom-1',
              sortOrder: 0,
              customCategory: '躯体工事',
              workType: '鉄筋工事',
              name: '鉄筋D10',
              specification: 'SD295A',
              unit: 'kg',
              quantity: { toNumber: () => 1500 },
              unitPrice: { toNumber: () => 120 },
              amount: { toNumber: () => 180000 },
              remarks: null,
            },
            {
              id: 'li-c2',
              receivedQuotationId: 'rq-custom-1',
              sortOrder: 1,
              customCategory: '躯体工事',
              workType: 'コンクリート工事',
              name: 'コンクリート',
              specification: '21-8-20',
              unit: 'm3',
              quantity: { toNumber: () => 50 },
              unitPrice: { toNumber: () => 15000 },
              amount: { toNumber: () => 750000 },
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'er-001',
                deletedAt: null,
                projectId: 'project-001',
                tradingPartnerId: 'tp-001',
                tradingPartner: { name: '協力業者A' },
              }),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreated),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 2 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        expect(result.lineItems).toHaveLength(2);
        expect(result.lineItems[0]?.customCategory).toBe('躯体工事');
        expect(result.lineItems[0]?.workType).toBe('鉄筋工事');
        expect(result.lineItems[1]?.customCategory).toBe('躯体工事');
        expect(result.lineItems[1]?.workType).toBe('コンクリート工事');
      });

      it('customCategoryとworkTypeがnull/undefinedの場合もエラーにならない', async () => {
        const lineItems = [
          {
            name: '工事A',
            sortOrder: 0,
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            // customCategoryとworkTypeを指定しない
          },
        ];

        const input = {
          estimateRequestId: 'er-001',
          name: '見積書（任意分類・工種なし）',
          submittedAt: new Date('2026-02-01'),
          lineItems,
        };

        const mockCreated = {
          id: 'rq-custom-2',
          estimateRequestId: 'er-001',
          name: '見積書（任意分類・工種なし）',
          submittedAt: new Date('2026-02-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          fileStorageKey: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lineItems: [
            {
              id: 'li-c3',
              receivedQuotationId: 'rq-custom-2',
              sortOrder: 0,
              customCategory: null,
              workType: null,
              name: '工事A',
              specification: null,
              unit: null,
              quantity: { toNumber: () => 1 },
              unitPrice: { toNumber: () => 10000 },
              amount: { toNumber: () => 10000 },
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
          const txClient = {
            estimateRequest: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'er-001',
                deletedAt: null,
                projectId: 'project-001',
                tradingPartnerId: 'tp-001',
                tradingPartner: { name: '協力業者A' },
              }),
            },
            receivedQuotation: {
              create: vi.fn().mockResolvedValue(mockCreated),
            },
            receivedQuotationLineItem: {
              createMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(txClient as unknown as PrismaClient);
        });

        const result = await service.create(requestContextOf(input), input, ACTOR_ID);

        expect(result.lineItems).toHaveLength(1);
        expect(result.lineItems[0]?.customCategory).toBeNull();
        expect(result.lineItems[0]?.workType).toBeNull();
      });
    });

    describe('findById - 任意分類・工種を含む取得', () => {
      it('取得レスポンスにcustomCategoryとworkTypeが含まれる', async () => {
        const mockQuotation = {
          id: 'rq-custom-3',
          estimateRequestId: 'er-001',
          name: '見積書テスト',
          submittedAt: new Date('2026-02-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          fileStorageKey: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lineItems: [
            {
              id: 'li-c4',
              receivedQuotationId: 'rq-custom-3',
              sortOrder: 0,
              customCategory: '仕上工事',
              workType: '塗装工事',
              name: '塗装',
              specification: '2回塗り',
              unit: 'm2',
              quantity: { toNumber: () => 200 },
              unitPrice: { toNumber: () => 3000 },
              amount: { toNumber: () => 600000 },
              remarks: null,
            },
          ],
        };

        vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(
          mockQuotation as never
        );

        const result = await service.findById('rq-custom-3');

        expect(result).not.toBeNull();
        expect(result!.lineItems[0]?.customCategory).toBe('仕上工事');
        expect(result!.lineItems[0]?.workType).toBe('塗装工事');
      });
    });
  });

  // ==========================================================================
  // Task 61.2: ReceivedQuotationServiceのnetAmountフィールドテスト（受領見積書レベル）
  // Requirements: 28.10 (NET金額のDB永続化), 28.11 (編集画面で既存NET金額データ表示)
  // ==========================================================================
  describe('netAmountフィールドテスト（受領見積書レベル） (Task 61.2)', () => {
    it('受領見積書作成時にnetAmountが受領見積書レベルで永続化されること（Requirements: 28.10）', async () => {
      const lineItems = [
        {
          name: '工事A',
          sortOrder: 0,
          quantity: 1,
          unitPrice: 10000,
          amount: 10000,
        },
      ];
      const input = {
        estimateRequestId: 'er-net-001',
        name: 'NET金額テスト',
        submittedAt: new Date('2026-02-18'),
        netAmount: 9000,
        lineItems,
      };

      const mockEstimateRequest = {
        id: 'er-net-001',
        deletedAt: null,
        projectId: 'project-001',
        tradingPartnerId: 'tp-001',
        tradingPartner: { name: '協力業者A' },
      };

      const mockCreatedQuotation = {
        id: 'rq-net-001',
        estimateRequestId: 'er-net-001',
        name: 'NET金額テスト',
        submittedAt: new Date('2026-02-18'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        netAmount: 9000,
        createdAt: new Date('2026-02-18T00:00:00Z'),
        updatedAt: new Date('2026-02-18T00:00:00Z'),
        deletedAt: null,
        lineItems: [
          {
            id: 'li-net-001',
            receivedQuotationId: 'rq-net-001',
            name: '工事A',
            sortOrder: 0,
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            customCategory: null,
            workType: null,
            specification: null,
            unit: null,
            remarks: null,
          },
        ],
      };

      let capturedCreateData: unknown = null;

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
          receivedQuotation: {
            create: vi.fn().mockImplementation((args) => {
              capturedCreateData = args;
              return mockCreatedQuotation;
            }),
          },
          receivedQuotationLineItem: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      const result = await service.create(requestContextOf(input), input, ACTOR_ID);

      expect(result.id).toBe('rq-net-001');
      expect(result.netAmount).toBe(9000);
      // 受領見積書作成データにnetAmountが含まれていることを確認
      expect(capturedCreateData).not.toBeNull();
      const createArgs = capturedCreateData as { data: { netAmount?: unknown } };
      expect(createArgs.data.netAmount).toBe(9000);
    });

    it('受領見積書取得時にnetAmountフィールドが返却されること（Requirements: 28.11）', async () => {
      const mockQuotation = {
        id: 'rq-net-002',
        estimateRequestId: 'er-net-002',
        name: 'NET金額取得テスト',
        submittedAt: new Date('2026-02-18'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        netAmount: 8500,
        createdAt: new Date('2026-02-18T00:00:00Z'),
        updatedAt: new Date('2026-02-18T00:00:00Z'),
        deletedAt: null,
        lineItems: [
          {
            id: 'li-net-002',
            receivedQuotationId: 'rq-net-002',
            name: '工事B',
            sortOrder: 0,
            customCategory: null,
            workType: null,
            specification: null,
            unit: null,
            quantity: 5,
            unitPrice: 2000,
            amount: 10000,
            remarks: null,
          },
        ],
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);

      const result = await service.findById('rq-net-002');

      expect(result).not.toBeNull();
      expect(result!.netAmount).toBe(8500);
    });

    it('netAmountがnullの場合にnullで返却されること（Requirements: 28.7）', async () => {
      const mockQuotation = {
        id: 'rq-net-003',
        estimateRequestId: 'er-net-003',
        name: 'NET金額null テスト',
        submittedAt: new Date('2026-02-18'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        netAmount: null,
        createdAt: new Date('2026-02-18T00:00:00Z'),
        updatedAt: new Date('2026-02-18T00:00:00Z'),
        deletedAt: null,
        lineItems: [
          {
            id: 'li-net-003',
            receivedQuotationId: 'rq-net-003',
            name: '工事C',
            sortOrder: 0,
            customCategory: null,
            workType: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          },
        ],
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);

      const result = await service.findById('rq-net-003');

      expect(result).not.toBeNull();
      expect(result!.netAmount).toBeNull();
    });

    it('明細行のcreateMany/更新データにnetAmountが含まれないこと（Requirements: 28.5）', async () => {
      const lineItems = [
        {
          name: '工事D',
          sortOrder: 0,
          quantity: 2,
          unitPrice: 5000,
          amount: 10000,
        },
      ];
      const input = {
        estimateRequestId: 'er-net-004',
        name: 'NET金額明細行除外テスト',
        submittedAt: new Date('2026-02-18'),
        netAmount: 7000,
        lineItems,
      };

      const mockEstimateRequest = {
        id: 'er-net-004',
        deletedAt: null,
        projectId: 'project-001',
        tradingPartnerId: 'tp-001',
        tradingPartner: { name: '協力業者A' },
      };

      const mockCreatedQuotation = {
        id: 'rq-net-004',
        estimateRequestId: 'er-net-004',
        name: 'NET金額明細行除外テスト',
        submittedAt: new Date('2026-02-18'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        netAmount: 7000,
        createdAt: new Date('2026-02-18T00:00:00Z'),
        updatedAt: new Date('2026-02-18T00:00:00Z'),
        deletedAt: null,
        lineItems: [],
      };

      let capturedLineItemData: unknown = null;

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
          receivedQuotation: {
            create: vi.fn().mockResolvedValue(mockCreatedQuotation),
          },
          receivedQuotationLineItem: {
            createMany: vi.fn().mockImplementation((args) => {
              capturedLineItemData = args;
              return { count: 1 };
            }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      await service.create(requestContextOf(input), input, ACTOR_ID);

      // createManyに渡された明細行データにnetAmountが含まれていないことを確認
      expect(capturedLineItemData).not.toBeNull();
      const lineItemCreateData = (capturedLineItemData as { data: Array<Record<string, unknown>> })
        ?.data;
      expect(lineItemCreateData?.[0]).not.toHaveProperty('netAmount');
    });

    it('受領見積書更新時にnetAmountが更新されること（Requirements: 28.10）', async () => {
      const quotationId = 'rq-net-upd-001';
      const expectedUpdatedAt = new Date('2026-02-18T00:00:00Z');
      const input = {
        netAmount: 12000,
      };

      const mockQuotation = {
        id: quotationId,
        estimateRequestId: 'er-net-upd-001',
        name: 'NET金額更新テスト',
        submittedAt: new Date('2026-02-18'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        netAmount: 9000,
        createdAt: new Date('2026-02-17T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const mockUpdatedQuotation = {
        ...mockQuotation,
        netAmount: 12000,
        updatedAt: new Date('2026-02-18T01:00:00Z'),
        lineItems: [],
      };

      let capturedUpdateData: unknown = null;

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
            update: vi.fn().mockImplementation((args) => {
              capturedUpdateData = args;
              return mockUpdatedQuotation;
            }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      const result = await service.update(quotationId, input, expectedUpdatedAt, ACTOR_ID);

      expect(result.netAmount).toBe(12000);
      // updateに渡されたデータにnetAmountが含まれていることを確認
      expect(capturedUpdateData).not.toBeNull();
      const updateArgs = capturedUpdateData as { data: { netAmount?: unknown } };
      expect(updateArgs.data.netAmount).toBe(12000);
    });

    it('受領見積書更新時にnetAmountをnullに更新できること（Requirements: 28.7）', async () => {
      const quotationId = 'rq-net-upd-002';
      const expectedUpdatedAt = new Date('2026-02-18T00:00:00Z');
      const input = {
        netAmount: null,
      };

      const mockQuotation = {
        id: quotationId,
        estimateRequestId: 'er-net-upd-002',
        name: 'NET金額null更新テスト',
        submittedAt: new Date('2026-02-18'),
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        netAmount: 9000,
        createdAt: new Date('2026-02-17T00:00:00Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const mockUpdatedQuotation = {
        ...mockQuotation,
        netAmount: null,
        updatedAt: new Date('2026-02-18T01:00:00Z'),
        lineItems: [],
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(mockQuotation),
            update: vi.fn().mockResolvedValue(mockUpdatedQuotation),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      const result = await service.update(quotationId, input, expectedUpdatedAt, ACTOR_ID);

      expect(result.netAmount).toBeNull();
    });

    it('findByEstimateRequestIdでnetAmountが各受領見積書に含まれること', async () => {
      const mockQuotations = [
        {
          id: 'rq-net-list-001',
          estimateRequestId: 'er-net-list',
          name: 'NET見積書1',
          submittedAt: new Date('2026-02-18'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          netAmount: 50000,
          createdAt: new Date('2026-02-18T00:00:00Z'),
          updatedAt: new Date('2026-02-18T00:00:00Z'),
          deletedAt: null,
          lineItems: [
            {
              id: 'li-net-list-001',
              receivedQuotationId: 'rq-net-list-001',
              sortOrder: 0,
              name: '工事X',
              customCategory: null,
              workType: null,
              specification: null,
              unit: null,
              quantity: 1,
              unitPrice: 100000,
              amount: 100000,
              remarks: null,
            },
          ],
        },
        {
          id: 'rq-net-list-002',
          estimateRequestId: 'er-net-list',
          name: 'NET見積書2',
          submittedAt: new Date('2026-02-19'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          netAmount: null,
          createdAt: new Date('2026-02-19T00:00:00Z'),
          updatedAt: new Date('2026-02-19T00:00:00Z'),
          deletedAt: null,
          lineItems: [],
        },
      ];

      vi.mocked(mockPrisma.receivedQuotation.findMany).mockResolvedValue(mockQuotations as never);

      const result = await service.findByEstimateRequestId('er-net-list');

      expect(result).toHaveLength(2);
      expect(result[0]!.netAmount).toBe(50000);
      expect(result[1]!.netAmount).toBeNull();
    });
  });

  // ==========================================
  // 監査ログ（estimate-request の Requirement 14.7、タスク111.1）
  // ==========================================

  /**
   * 受領見積書の作成・更新・論理削除が確定したときに、その操作の監査ログを変更と同じ
   * トランザクションの中で 1 件記録する。記録は `$transaction` のコールバックが受けたクライアント
   * （tx）を `createLog` の第 2 引数に渡して書く。協力業者の金額（netAmount・明細行の中身）と
   * ファイルの格納先（filePath）は社外秘のため記録に入れない。記録はデータベースの変更の後、
   * ストレージの操作（作成のファイルの送信、更新の差し替え前のファイルの取り除き）の前に置く。
   */
  describe('監査ログ（Requirement 14.7、タスク111.1）', () => {
    const NET_AMOUNT = 4_567_890;
    const UNIT_PRICE = 123_457;
    const STORED_FILE_PATH = 'quotations/er-001/rq-audit/旧見積書.pdf';

    const existingQuotation = (overrides: Record<string, unknown> = {}) => ({
      id: 'rq-audit',
      estimateRequestId: 'er-001',
      name: '変更前の受領見積書',
      submittedAt: new Date('2026-01-23T00:00:00.000Z'),
      filePath: STORED_FILE_PATH,
      fileName: '旧見積書.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 10000,
      netAmount: NET_AMOUNT,
      createdAt: new Date('2026-01-22T00:00:00Z'),
      updatedAt: new Date('2026-01-23T00:00:00Z'),
      deletedAt: null,
      ...overrides,
    });

    /** 記録の入力に金額・明細行の中身・ファイルの格納先が入らないこと */
    const expectNoConfidentialValues = (input: unknown): void => {
      const serialized = JSON.stringify(input);
      expect(serialized).not.toContain(String(NET_AMOUNT));
      expect(serialized).not.toContain(String(UNIT_PRICE));
      expect(serialized).not.toContain('netAmount');
      expect(serialized).not.toContain('unitPrice');
      expect(serialized).not.toContain('amount');
      expect(serialized).not.toContain('filePath');
      expect(serialized).not.toContain('quotations/');
      expect(serialized).not.toContain('秘匿の明細');
    };

    describe('create', () => {
      const setupCreateTx = (created: Record<string, unknown>) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'er-001',
              deletedAt: null,
              projectId: 'project-001',
              tradingPartnerId: 'tp-001',
              tradingPartner: { name: '協力業者A' },
            }),
          },
          receivedQuotation: {
            create: vi.fn().mockResolvedValue({ ...created, lineItems: [] }),
            update: vi.fn().mockResolvedValue(created),
          },
          receivedQuotationLineItem: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        };
        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) =>
          fn(txClient as unknown as PrismaClient)
        );
        return txClient;
      };

      it('明細行だけの作成が確定すると RECEIVED_QUOTATION_CREATED を tx で 1 件記録し、金額を入れない', async () => {
        const txClient = setupCreateTx({
          id: 'rq-audit',
          estimateRequestId: 'er-001',
          name: '監査ログの受領見積書',
          submittedAt: new Date('2026-01-24T00:00:00.000Z'),
          filePath: null,
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          netAmount: NET_AMOUNT,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        });

        await service.create(
          { kind: 'estimateRequest', estimateRequestId: 'er-001' },
          {
            name: '監査ログの受領見積書',
            submittedAt: new Date('2026-01-24T00:00:00.000Z'),
            netAmount: NET_AMOUNT,
            lineItems: [
              { name: '秘匿の明細A', sortOrder: 0, quantity: 2, unitPrice: UNIT_PRICE },
              { name: '秘匿の明細B', sortOrder: 1, quantity: 1, unitPrice: UNIT_PRICE },
            ],
          },
          ACTOR_ID
        );

        expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
        const [input, tx] = mockAuditLogService.createLog.mock.calls[0]!;
        expect(input).toEqual({
          action: 'RECEIVED_QUOTATION_CREATED',
          actorId: ACTOR_ID,
          targetType: 'ReceivedQuotation',
          targetId: 'rq-audit',
          before: null,
          after: {
            estimateRequestId: 'er-001',
            name: '監査ログの受領見積書',
            submittedAt: '2026-01-24T00:00:00.000Z',
            fileName: null,
            lineItemCount: 2,
          },
        });
        expect(tx).toBe(txClient);
        expectNoConfidentialValues(input);
      });

      it('ファイルありの作成は、記録をストレージへの送信より先に呼び、明細行の数を 0 で記録する', async () => {
        const txClient = setupCreateTx({
          id: 'rq-audit',
          estimateRequestId: 'er-001',
          name: 'ファイルの受領見積書',
          submittedAt: new Date('2026-01-24T00:00:00.000Z'),
          filePath: null,
          fileName: '見積書.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 10000,
          netAmount: NET_AMOUNT,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        });

        await service.create(
          { kind: 'estimateRequest', estimateRequestId: 'er-001' },
          {
            name: 'ファイルの受領見積書',
            submittedAt: new Date('2026-01-24T00:00:00.000Z'),
            netAmount: NET_AMOUNT,
            file: {
              buffer: Buffer.from('PDF'),
              originalName: '見積書.pdf',
              mimeType: 'application/pdf',
              size: 10000,
            },
          },
          ACTOR_ID
        );

        expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
        const [input, tx] = mockAuditLogService.createLog.mock.calls[0]!;
        expect(input).toEqual({
          action: 'RECEIVED_QUOTATION_CREATED',
          actorId: ACTOR_ID,
          targetType: 'ReceivedQuotation',
          targetId: 'rq-audit',
          before: null,
          after: {
            estimateRequestId: 'er-001',
            name: 'ファイルの受領見積書',
            submittedAt: '2026-01-24T00:00:00.000Z',
            fileName: '見積書.pdf',
            lineItemCount: 0,
          },
        });
        expect(tx).toBe(txClient);
        expectNoConfidentialValues(input);
        expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);
        expect(mockAuditLogService.createLog.mock.invocationCallOrder[0]!).toBeLessThan(
          vi.mocked(mockStorageProvider.upload).mock.invocationCallOrder[0]!
        );
      });

      it('記録が失敗すると作成は例外で終わり、ファイルをストレージへ送らない', async () => {
        setupCreateTx({
          id: 'rq-audit',
          estimateRequestId: 'er-001',
          name: 'ファイルの受領見積書',
          submittedAt: new Date('2026-01-24T00:00:00.000Z'),
          filePath: null,
          fileName: '見積書.pdf',
          fileMimeType: 'application/pdf',
          fileSize: 10000,
          netAmount: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        });
        mockAuditLogService.createLog.mockRejectedValue(new Error('監査ログの記録の失敗'));

        await expect(
          service.create(
            { kind: 'estimateRequest', estimateRequestId: 'er-001' },
            {
              name: 'ファイルの受領見積書',
              submittedAt: new Date('2026-01-24T00:00:00.000Z'),
              file: {
                buffer: Buffer.from('PDF'),
                originalName: '見積書.pdf',
                mimeType: 'application/pdf',
                size: 10000,
              },
            },
            ACTOR_ID
          )
        ).rejects.toThrow('監査ログの記録の失敗');

        expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
        expect(mockStorageProvider.upload).not.toHaveBeenCalled();
      });

      it('見積依頼が無い作成は記録しない', async () => {
        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) =>
          fn({
            estimateRequest: { findUnique: vi.fn().mockResolvedValue(null) },
          } as unknown as PrismaClient)
        );

        await expect(
          service.create(
            { kind: 'estimateRequest', estimateRequestId: 'er-missing' },
            {
              name: '不在',
              submittedAt: new Date('2026-01-24'),
              lineItems: [{ name: '明細', sortOrder: 0 }],
            },
            ACTOR_ID
          )
        ).rejects.toThrow(EstimateRequestNotFoundError);
        expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
      });
    });

    describe('update', () => {
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');
      const replacementFile = {
        buffer: Buffer.from('New PDF'),
        originalName: '新見積書.pdf',
        mimeType: 'application/pdf',
        size: 20000,
      };

      const setupUpdateTx = (
        current: Record<string, unknown>,
        updated: Record<string, unknown>
      ) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(current),
            update: vi.fn().mockResolvedValue({ ...updated, lineItems: [] }),
          },
          receivedQuotationLineItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) =>
          fn(txClient as unknown as PrismaClient)
        );
        return txClient;
      };

      it('更新が確定すると RECEIVED_QUOTATION_UPDATED を変更の前後と tx で 1 件記録し、差し替え前のファイルの取り除きより先に呼ぶ', async () => {
        const current = existingQuotation();
        const txClient = setupUpdateTx(current, {
          ...current,
          name: '変更後の受領見積書',
          submittedAt: new Date('2026-02-01T00:00:00.000Z'),
          filePath: 'quotations/er-001/rq-audit/新見積書.pdf',
          fileName: '新見積書.pdf',
          netAmount: NET_AMOUNT + 1,
          updatedAt: new Date('2026-01-23T01:00:00Z'),
        });

        await service.update(
          'rq-audit',
          {
            name: '変更後の受領見積書',
            submittedAt: new Date('2026-02-01T00:00:00.000Z'),
            netAmount: NET_AMOUNT + 1,
            file: replacementFile,
            lineItems: [{ name: '秘匿の明細C', sortOrder: 0, quantity: 1, unitPrice: UNIT_PRICE }],
          },
          expectedUpdatedAt,
          ACTOR_ID
        );

        expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
        const [input, tx] = mockAuditLogService.createLog.mock.calls[0]!;
        expect(input).toEqual({
          action: 'RECEIVED_QUOTATION_UPDATED',
          actorId: ACTOR_ID,
          targetType: 'ReceivedQuotation',
          targetId: 'rq-audit',
          before: {
            name: '変更前の受領見積書',
            submittedAt: '2026-01-23T00:00:00.000Z',
            fileName: '旧見積書.pdf',
          },
          after: {
            name: '変更後の受領見積書',
            submittedAt: '2026-02-01T00:00:00.000Z',
            fileName: '新見積書.pdf',
          },
        });
        expect(tx).toBe(txClient);
        expectNoConfidentialValues(input);
        expect(JSON.stringify(input)).not.toContain(String(NET_AMOUNT + 1));
        expect(mockStorageProvider.delete).toHaveBeenCalledWith(STORED_FILE_PATH);
        expect(mockAuditLogService.createLog.mock.invocationCallOrder[0]!).toBeLessThan(
          vi.mocked(mockStorageProvider.delete).mock.invocationCallOrder[0]!
        );
      });

      it('記録が失敗すると更新は例外で終わり、差し替え前のファイルを取り除かない', async () => {
        const current = existingQuotation();
        setupUpdateTx(current, { ...current, fileName: '新見積書.pdf' });
        mockAuditLogService.createLog.mockRejectedValue(new Error('監査ログの記録の失敗'));

        await expect(
          service.update('rq-audit', { file: replacementFile }, expectedUpdatedAt, ACTOR_ID)
        ).rejects.toThrow('監査ログの記録の失敗');

        expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
        expect(mockStorageProvider.delete).not.toHaveBeenCalled();
      });

      it('受領見積書が無い更新と楽観的排他制御の競合は記録しない', async () => {
        setupUpdateTx(existingQuotation({ deletedAt: new Date() }), existingQuotation());
        await expect(
          service.update('rq-audit', { name: '不在' }, expectedUpdatedAt, ACTOR_ID)
        ).rejects.toThrow(ReceivedQuotationNotFoundError);

        setupUpdateTx(
          existingQuotation({ updatedAt: new Date('2026-01-23T05:00:00Z') }),
          existingQuotation()
        );
        await expect(
          service.update('rq-audit', { name: '競合' }, expectedUpdatedAt, ACTOR_ID)
        ).rejects.toThrow(ReceivedQuotationConflictError);

        expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
      });
    });

    describe('delete', () => {
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

      const setupDeleteTx = (current: Record<string, unknown>) => {
        const txClient = {
          receivedQuotation: {
            findUnique: vi.fn().mockResolvedValue(current),
            update: vi.fn().mockResolvedValue({ ...current, deletedAt: new Date() }),
          },
        };
        vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) =>
          fn(txClient as unknown as PrismaClient)
        );
        return txClient;
      };

      it('論理削除が確定すると RECEIVED_QUOTATION_DELETED を変更の前と tx で 1 件記録し、論理削除の更新の後に呼ぶ', async () => {
        const txClient = setupDeleteTx(existingQuotation());

        await service.delete('rq-audit', expectedUpdatedAt, ACTOR_ID);

        expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
        const [input, tx] = mockAuditLogService.createLog.mock.calls[0]!;
        expect(input).toEqual({
          action: 'RECEIVED_QUOTATION_DELETED',
          actorId: ACTOR_ID,
          targetType: 'ReceivedQuotation',
          targetId: 'rq-audit',
          before: {
            estimateRequestId: 'er-001',
            name: '変更前の受領見積書',
            submittedAt: '2026-01-23T00:00:00.000Z',
            fileName: '旧見積書.pdf',
          },
          after: null,
        });
        expect(tx).toBe(txClient);
        expectNoConfidentialValues(input);
        expect(txClient.receivedQuotation.update.mock.invocationCallOrder[0]!).toBeLessThan(
          mockAuditLogService.createLog.mock.invocationCallOrder[0]!
        );
      });

      it('受領見積書が無い論理削除と楽観的排他制御の競合は記録しない', async () => {
        setupDeleteTx(existingQuotation({ deletedAt: new Date() }));
        await expect(service.delete('rq-audit', expectedUpdatedAt, ACTOR_ID)).rejects.toThrow(
          ReceivedQuotationNotFoundError
        );

        setupDeleteTx(existingQuotation({ updatedAt: new Date('2026-01-23T05:00:00Z') }));
        await expect(service.delete('rq-audit', expectedUpdatedAt, ACTOR_ID)).rejects.toThrow(
          ReceivedQuotationConflictError
        );

        expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
      });
    });
  });
});
