/**
 * @fileoverview ReceivedQuotationService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.5: テキスト入力フィールド
 * - 11.6, 11.8: ファイルアップロード
 * - 11.7: テキストとファイルの排他的選択
 * - 11.9, 11.10: バリデーションエラー
 * - 11.11: 複数の受領見積書を許可
 * - 11.14: ファイルプレビュー
 * - 11.15, 11.16, 11.17: 編集・削除
 *
 * Task 12.1: ReceivedQuotationServiceの実装
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
    it('テキストコンテンツで受領見積書を作成する（Requirements: 11.3, 11.4, 11.5）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        contentType: 'TEXT' as const,
        textContent: '見積金額: 1,000,000円',
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
        contentType: 'TEXT',
        textContent: '見積金額: 1,000,000円',
        filePath: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
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
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.id).toBe('rq-001');
      expect(result.name).toBe('テスト受領見積書');
      expect(result.contentType).toBe('TEXT');
      expect(result.textContent).toBe('見積金額: 1,000,000円');
      expect(result.fileName).toBeNull();
    });

    it('ファイルコンテンツで受領見積書を作成する（Requirements: 11.6, 11.8）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書（PDF）',
        submittedAt: new Date('2026-01-23'),
        contentType: 'FILE' as const,
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
        contentType: 'FILE',
        textContent: null,
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
      expect(result.contentType).toBe('FILE');
      expect(result.fileName).toBe('見積書.pdf');
      expect(result.fileMimeType).toBe('application/pdf');
      expect(mockStorageProvider.upload).toHaveBeenCalled();
    });

    it('見積依頼が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-nonexistent',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        contentType: 'TEXT' as const,
        textContent: '見積金額: 1,000,000円',
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

    it('TEXTコンテンツタイプでテキストが未入力の場合、エラーを発生させる（Requirements: 11.7）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        contentType: 'TEXT' as const,
        textContent: undefined,
      };

      // Act & Assert
      await expect(service.create(input)).rejects.toThrow(InvalidContentTypeError);
    });

    it('FILEコンテンツタイプでファイルが未指定の場合、エラーを発生させる（Requirements: 11.7）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        contentType: 'FILE' as const,
        file: undefined,
      };

      // Act & Assert
      await expect(service.create(input)).rejects.toThrow(InvalidContentTypeError);
    });

    it('許可されていないファイル形式の場合、エラーを発生させる（Requirements: 11.8）', async () => {
      // Arrange
      const input = {
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        contentType: 'FILE' as const,
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
        contentType: 'FILE' as const,
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
        contentType: 'FILE' as const,
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
        contentType: 'FILE',
        textContent: null,
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
        contentType: 'FILE' as const,
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
        contentType: 'FILE',
        textContent: null,
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
        contentType: 'TEXT',
        textContent: '見積金額: 1,000,000円',
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
        contentType: 'TEXT',
        textContent: '見積金額',
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
          contentType: 'TEXT',
          textContent: '見積金額1',
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
          contentType: 'FILE',
          textContent: null,
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
        contentType: 'TEXT',
        textContent: '見積金額',
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
        contentType: 'TEXT',
        textContent: '見積金額',
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
        contentType: 'FILE' as const,
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
        contentType: 'FILE',
        textContent: null,
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
        contentType: 'FILE',
        textContent: null,
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

    it('テキストコンテンツの場合、ファイル削除は行わない', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const expectedUpdatedAt = new Date('2026-01-23T00:00:00Z');

      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        contentType: 'TEXT',
        textContent: '見積金額',
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
        contentType: 'FILE',
        textContent: null,
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

    it('テキストコンテンツの受領見積書の場合、エラーを発生させる', async () => {
      // Arrange
      const quotationId = 'rq-001';
      const mockQuotation = {
        id: 'rq-001',
        estimateRequestId: 'er-001',
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-23'),
        contentType: 'TEXT',
        textContent: '見積金額',
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
});
