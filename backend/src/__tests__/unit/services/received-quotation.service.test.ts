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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceivedQuotationService } from '../../../services/received-quotation.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';
import {
  ReceivedQuotationNotFoundError,
  ReceivedQuotationConflictError,
  InvalidContentTypeError,
  InvalidFileTypeError,
  FileSizeLimitExceededError,
} from '../../../errors/receivedQuotationError.js';
import { EstimateRequestNotFoundError } from '../../../errors/estimateRequestError.js';

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

describe('ReceivedQuotationService', () => {
  let service: ReceivedQuotationService;
  let mockPrisma: PrismaClient;
  let mockStorageProvider: StorageProvider;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockStorageProvider = createMockStorageProvider();
    service = new ReceivedQuotationService({
      prisma: mockPrisma,
      storageProvider: mockStorageProvider,
    });
  });

  describe('create', () => {
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
      const result = await service.create(input);

      // Assert
      expect(result.id).toBe('rq-001');
      expect(result.name).toBe('テスト受領見積書');
      expect(result.fileName).toBeNull();
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
      const result = await service.create(input);

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
      await expect(service.create(input)).rejects.toThrow(EstimateRequestNotFoundError);
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
      await expect(service.create(input)).rejects.toThrow(InvalidFileTypeError);
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
      await expect(service.create(input)).rejects.toThrow(FileSizeLimitExceededError);
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
      const result = await service.create(input);

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
      const result = await service.create(input);

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
      const result = await service.update(quotationId, input, expectedUpdatedAt);

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
        service.update('rq-001', { name: '新しい名前' }, expectedUpdatedAt)
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
      await service.update(quotationId, input, expectedUpdatedAt);

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
      await service.delete(quotationId, expectedUpdatedAt);

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
      await service.delete(quotationId, expectedUpdatedAt);

      // Assert
      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
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
      await expect(service.delete('rq-nonexistent', new Date())).rejects.toThrow(
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
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);
      vi.mocked(mockStorageProvider.getSignedUrl).mockResolvedValue(
        'https://example.com/signed-url?token=xxx'
      );

      // Act
      const result = await service.getFilePreviewUrl(quotationId);

      // Assert
      expect(result).toBe('https://example.com/signed-url?token=xxx');
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'quotations/er-001/rq-001/見積書.pdf',
        expect.any(Object)
      );
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
      };

      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(mockQuotation as never);

      // Act & Assert
      await expect(service.getFilePreviewUrl(quotationId)).rejects.toThrow(InvalidContentTypeError);
    });

    it('存在しない受領見積書の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.receivedQuotation.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getFilePreviewUrl('rq-nonexistent')).rejects.toThrow(
        ReceivedQuotationNotFoundError
      );
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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

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
        await expect(service.create(input)).rejects.toThrow(
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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

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
          expectedUpdatedAt
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
        await expect(service.delete(quotationId, expectedUpdatedAt)).resolves.toBeUndefined();

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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

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
        await expect(service.create(input)).rejects.toThrow(
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
        await expect(service.create(input)).rejects.toThrow(
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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };

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
        const result = await service.create(input);

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

        const mockEstimateRequest = { id: 'er-001', deletedAt: null };
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
        const result = await service.create(input);

        // Assert: 金額はnull
        expect(result.lineItems[0]!.amount).toBeNull();
      });
    });

    describe('明細行の全量置換（更新）テスト', () => {
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
          expectedUpdatedAt
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
        const result = await service.update(quotationId, { lineItems: [] }, expectedUpdatedAt);

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
              findUnique: vi.fn().mockResolvedValue({ id: 'er-001', deletedAt: null }),
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

        const result = await service.create(input);

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
              findUnique: vi.fn().mockResolvedValue({ id: 'er-001', deletedAt: null }),
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

        const result = await service.create(input);

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
});
