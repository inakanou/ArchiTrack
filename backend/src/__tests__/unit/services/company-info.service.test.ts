/**
 * @fileoverview CompanyInfoService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.1: ユーザーが有効なデータを入力して保存ボタンをクリックしたとき、自社情報をデータベースに保存
 * - 2.2: 自社情報が未登録の場合、新規レコードを作成
 * - 2.3: 自社情報が既に登録されている場合、既存レコードを更新
 * - 2.7: 楽観的排他制御（versionフィールド）を実装し、同時更新による競合を検出
 * - 2.8: 楽観的排他制御で競合が検出された場合、エラーを返却
 * - 6.10: 自社情報の保存操作を監査ログに記録
 *
 * @module __tests__/unit/services/company-info.service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompanyInfoService,
  type CompanyInfoServiceDependencies,
} from '../../../services/company-info.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import { CompanyInfoConflictError } from '../../../errors/companyInfoError.js';

// テスト用モック
function createMockPrisma() {
  return {
    companyInfo: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        companyInfo: {
          findFirst: vi.fn(),
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
const mockCompanyInfo = {
  id: 'company-info-123',
  companyName: '株式会社テスト',
  address: '東京都渋谷区1-1-1',
  representative: '山田太郎',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'test@example.com',
  invoiceRegistrationNumber: 'T1234567890123',
  version: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('CompanyInfoService', () => {
  let service: CompanyInfoService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();

    const deps: CompanyInfoServiceDependencies = {
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    };

    service = new CompanyInfoService(deps);
  });

  describe('getCompanyInfo', () => {
    /**
     * Requirements: 9.2 - 自社情報が登録されている場合、自社情報オブジェクトを返却
     */
    it('登録済みデータが存在する場合、自社情報を返却する', async () => {
      // Arrange
      mockPrisma.companyInfo.findFirst = vi.fn().mockResolvedValue(mockCompanyInfo);

      // Act
      const result = await service.getCompanyInfo();

      // Assert
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.id).toBe('company-info-123');
      expect(result!.companyName).toBe('株式会社テスト');
      expect(result!.address).toBe('東京都渋谷区1-1-1');
      expect(result!.representative).toBe('山田太郎');
      expect(result!.phone).toBe('03-1234-5678');
      expect(result!.fax).toBe('03-1234-5679');
      expect(result!.email).toBe('test@example.com');
      expect(result!.invoiceRegistrationNumber).toBe('T1234567890123');
      expect(result!.version).toBe(1);
      expect(mockPrisma.companyInfo.findFirst).toHaveBeenCalledTimes(1);
    });

    /**
     * Requirements: 9.3 - 自社情報が未登録の場合、nullを返却
     */
    it('未登録の場合、nullを返却する', async () => {
      // Arrange
      mockPrisma.companyInfo.findFirst = vi.fn().mockResolvedValue(null);

      // Act
      const result = await service.getCompanyInfo();

      // Assert
      expect(result).toBeNull();
      expect(mockPrisma.companyInfo.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('upsertCompanyInfo', () => {
    const validInput = {
      companyName: '株式会社テスト',
      address: '東京都渋谷区1-1-1',
      representative: '山田太郎',
      phone: '03-1234-5678',
      fax: '03-1234-5679',
      email: 'test@example.com',
      invoiceRegistrationNumber: 'T1234567890123',
    };

    /**
     * Requirements: 2.2 - 自社情報が未登録の場合、新規レコードを作成
     */
    it('自社情報が未登録の場合、新規作成する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdCompanyInfo = {
        ...mockCompanyInfo,
        version: 1,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(null), // 未登録
            create: vi.fn().mockResolvedValue(createdCompanyInfo),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.upsertCompanyInfo(validInput, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('company-info-123');
      expect(result.companyName).toBe('株式会社テスト');
      expect(result.version).toBe(1);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPANY_INFO_CREATED',
          actorId,
          targetType: 'CompanyInfo',
          targetId: 'company-info-123',
        })
      );
    });

    /**
     * Requirements: 2.3 - 自社情報が既に登録されている場合、既存レコードを更新
     */
    it('自社情報が既に登録されている場合、更新する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithVersion = {
        ...validInput,
        companyName: '株式会社テスト更新',
        version: 1, // 楽観的排他制御用
      };
      const existingCompanyInfo = {
        ...mockCompanyInfo,
        version: 1,
      };
      const updatedCompanyInfo = {
        ...existingCompanyInfo,
        companyName: '株式会社テスト更新',
        version: 2,
        updatedAt: new Date('2024-01-02'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(existingCompanyInfo),
            update: vi.fn().mockResolvedValue(updatedCompanyInfo),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.upsertCompanyInfo(inputWithVersion, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.companyName).toBe('株式会社テスト更新');
      expect(result.version).toBe(2);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPANY_INFO_UPDATED',
          actorId,
          targetType: 'CompanyInfo',
          targetId: 'company-info-123',
        })
      );
    });

    /**
     * Requirements: 2.7, 2.8 - 楽観的排他制御で競合が検出された場合、エラーを送出
     */
    it('楽観的排他制御で競合が検出された場合、CompanyInfoConflictErrorをスローする', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithOldVersion = {
        ...validInput,
        version: 1, // 古いバージョン
      };
      const existingCompanyInfo = {
        ...mockCompanyInfo,
        version: 2, // 既にバージョンが上がっている
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(existingCompanyInfo),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.upsertCompanyInfo(inputWithOldVersion, actorId)).rejects.toThrow(
        CompanyInfoConflictError
      );
    });

    /**
     * Requirements: 6.10 - 監査ログ記録（新規作成時）
     */
    it('新規作成時に監査ログ（COMPANY_INFO_CREATED）を記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdCompanyInfo = {
        ...mockCompanyInfo,
        version: 1,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdCompanyInfo),
          },
        };
        return fn(tx);
      });

      // Act
      await service.upsertCompanyInfo(validInput, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPANY_INFO_CREATED',
          actorId,
          targetType: 'CompanyInfo',
          targetId: 'company-info-123',
          before: null,
          after: expect.objectContaining({
            companyName: '株式会社テスト',
            address: '東京都渋谷区1-1-1',
            representative: '山田太郎',
          }),
        })
      );
    });

    /**
     * Requirements: 6.10 - 監査ログ記録（更新時）
     */
    it('更新時に監査ログ（COMPANY_INFO_UPDATED）を記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithVersion = {
        ...validInput,
        companyName: '株式会社テスト更新',
        version: 1,
      };
      const existingCompanyInfo = {
        ...mockCompanyInfo,
        version: 1,
      };
      const updatedCompanyInfo = {
        ...existingCompanyInfo,
        companyName: '株式会社テスト更新',
        version: 2,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(existingCompanyInfo),
            update: vi.fn().mockResolvedValue(updatedCompanyInfo),
          },
        };
        return fn(tx);
      });

      // Act
      await service.upsertCompanyInfo(inputWithVersion, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPANY_INFO_UPDATED',
          actorId,
          targetType: 'CompanyInfo',
          targetId: 'company-info-123',
          before: expect.objectContaining({
            companyName: '株式会社テスト',
          }),
          after: expect.objectContaining({
            companyName: '株式会社テスト更新',
          }),
        })
      );
    });

    /**
     * 任意フィールドがnullの場合の処理
     */
    it('任意フィールドがnullでも正常に保存できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithNulls = {
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '山田太郎',
        phone: null,
        fax: null,
        email: null,
        invoiceRegistrationNumber: null,
      };
      const createdCompanyInfo = {
        id: 'company-info-123',
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '山田太郎',
        phone: null,
        fax: null,
        email: null,
        invoiceRegistrationNumber: null,
        version: 1,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdCompanyInfo),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.upsertCompanyInfo(inputWithNulls, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.phone).toBeNull();
      expect(result.fax).toBeNull();
      expect(result.email).toBeNull();
      expect(result.invoiceRegistrationNumber).toBeNull();
    });

    /**
     * 新規作成時にversionが指定されていない場合の処理
     */
    it('新規作成時にversionが省略されていても正常に保存できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithoutVersion = {
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '山田太郎',
      };
      const createdCompanyInfo = {
        ...mockCompanyInfo,
        version: 1,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdCompanyInfo),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.upsertCompanyInfo(inputWithoutVersion, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.version).toBe(1);
    });

    /**
     * 既存データがあるがversionが指定されていない場合（新規作成とみなす）
     * ただし、既存データがある場合はversionが必須
     */
    it('既存データがある場合にversionが未指定だとCompanyInfoConflictErrorをスローする', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithoutVersion = {
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '山田太郎',
        // version省略
      };
      const existingCompanyInfo = {
        ...mockCompanyInfo,
        version: 1,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          companyInfo: {
            findFirst: vi.fn().mockResolvedValue(existingCompanyInfo),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.upsertCompanyInfo(inputWithoutVersion, actorId)).rejects.toThrow(
        CompanyInfoConflictError
      );
    });
  });
});
