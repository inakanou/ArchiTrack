/**
 * @fileoverview TradingPartnerService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.7: ユーザーが有効なデータを入力して保存ボタンをクリック時、新しい取引先レコードをデータベースに作成
 * - 2.8: 取引先作成成功時、成功メッセージを表示し取引先一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合、エラーを表示
 *
 * @module __tests__/unit/services/trading-partner.service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TradingPartnerService,
  type TradingPartnerServiceDependencies,
} from '../../../services/trading-partner.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import type { CreateTradingPartnerInput } from '../../../schemas/trading-partner.schema.js';
import { DuplicatePartnerNameError } from '../../../errors/tradingPartnerError.js';

// テスト用モック
function createMockPrisma() {
  return {
    tradingPartner: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    tradingPartnerTypeMapping: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        tradingPartner: {
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        tradingPartnerTypeMapping: {
          create: vi.fn(),
          createMany: vi.fn(),
          deleteMany: vi.fn(),
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
const mockTradingPartner = {
  id: 'partner-123',
  name: 'テスト取引先株式会社',
  nameKana: 'テストトリヒキサキカブシキガイシャ',
  branchName: null,
  branchNameKana: null,
  representativeName: null,
  representativeNameKana: null,
  address: '東京都渋谷区1-1-1',
  phoneNumber: '03-1234-5678',
  faxNumber: null,
  email: null,
  billingClosingDay: null,
  paymentMonthOffset: null,
  paymentDay: null,
  notes: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
  types: [{ id: 'type-1', tradingPartnerId: 'partner-123', type: 'CUSTOMER' as const }],
};

describe('TradingPartnerService', () => {
  let service: TradingPartnerService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();

    const deps: TradingPartnerServiceDependencies = {
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    };

    service = new TradingPartnerService(deps);
  });

  describe('createPartner', () => {
    const validInput: CreateTradingPartnerInput = {
      name: 'テスト取引先株式会社',
      nameKana: 'テストトリヒキサキカブシキガイシャ',
      types: ['CUSTOMER'],
      address: '東京都渋谷区1-1-1',
      phoneNumber: '03-1234-5678',
    };

    it('正常に取引先を作成し、監査ログを記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdPartner = {
        ...mockTradingPartner,
        id: 'new-partner-id',
        types: [{ id: 'type-1', tradingPartnerId: 'new-partner-id', type: 'CUSTOMER' as const }],
      };

      // トランザクション内のモック設定
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null), // 重複なし
            create: vi.fn().mockResolvedValue({ ...createdPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(createdPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createPartner(validInput, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('new-partner-id');
      expect(result.name).toBe('テスト取引先株式会社');
      expect(result.nameKana).toBe('テストトリヒキサキカブシキガイシャ');
      expect(result.types).toContain('CUSTOMER');
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TRADING_PARTNER_CREATED',
          actorId,
          targetType: 'TradingPartner',
          targetId: 'new-partner-id',
        })
      );
    });

    it('同一取引先名が既に存在する場合はDuplicatePartnerNameErrorをスローする', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(mockTradingPartner), // 重複あり
            create: vi.fn(),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createPartner(validInput, actorId)).rejects.toThrow(
        DuplicatePartnerNameError
      );
    });

    it('複数の種別（顧客と協力業者）を持つ取引先を作成できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithMultipleTypes: CreateTradingPartnerInput = {
        ...validInput,
        types: ['CUSTOMER', 'SUBCONTRACTOR'],
      };
      const createdPartner = {
        ...mockTradingPartner,
        types: [
          { id: 'type-1', tradingPartnerId: 'partner-123', type: 'CUSTOMER' as const },
          { id: 'type-2', tradingPartnerId: 'partner-123', type: 'SUBCONTRACTOR' as const },
        ],
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ ...createdPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(createdPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createPartner(inputWithMultipleTypes, actorId);

      // Assert
      expect(result.types).toHaveLength(2);
      expect(result.types).toContain('CUSTOMER');
      expect(result.types).toContain('SUBCONTRACTOR');
    });

    it('任意フィールドがすべて設定された取引先を作成できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const fullInput: CreateTradingPartnerInput = {
        name: 'フル入力取引先株式会社',
        nameKana: 'フルニュウリョクトリヒキサキカブシキガイシャ',
        types: ['CUSTOMER'],
        address: '東京都千代田区1-2-3',
        branchName: '本社営業部',
        branchNameKana: 'ホンシャエイギョウブ',
        representativeName: '山田太郎',
        representativeNameKana: 'ヤマダタロウ',
        phoneNumber: '03-1111-2222',
        faxNumber: '03-1111-3333',
        email: 'contact@example.com',
        billingClosingDay: 25,
        paymentMonthOffset: 1,
        paymentDay: 15,
        notes: 'これは備考です',
      };
      const createdPartner = {
        id: 'full-partner-id',
        ...fullInput,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        types: [{ id: 'type-1', tradingPartnerId: 'full-partner-id', type: 'CUSTOMER' as const }],
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ ...createdPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(createdPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createPartner(fullInput, actorId);

      // Assert
      expect(result.branchName).toBe('本社営業部');
      expect(result.representativeName).toBe('山田太郎');
      expect(result.email).toBe('contact@example.com');
      expect(result.billingClosingDay).toBe(25);
      expect(result.paymentMonthOffset).toBe(1);
      expect(result.paymentDay).toBe(15);
      expect(result.notes).toBe('これは備考です');
    });

    it('末日（99）を請求締日として設定できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithEndOfMonth: CreateTradingPartnerInput = {
        ...validInput,
        billingClosingDay: 99, // 末日
      };
      const createdPartner = {
        ...mockTradingPartner,
        billingClosingDay: 99,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ ...createdPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(createdPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createPartner(inputWithEndOfMonth, actorId);

      // Assert
      expect(result.billingClosingDay).toBe(99);
    });

    it('監査ログにbefore=null、after=作成データが記録される', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdPartner = {
        ...mockTradingPartner,
        id: 'new-partner-id',
        types: [{ id: 'type-1', tradingPartnerId: 'new-partner-id', type: 'CUSTOMER' as const }],
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ ...createdPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(createdPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      // Act
      await service.createPartner(validInput, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          before: null,
          after: expect.objectContaining({
            name: 'テスト取引先株式会社',
            nameKana: 'テストトリヒキサキカブシキガイシャ',
            address: '東京都渋谷区1-1-1',
            types: ['CUSTOMER'],
          }),
        })
      );
    });

    it('トランザクション内で種別マッピングが作成される', async () => {
      // Arrange
      const actorId = 'actor-123';
      let capturedCreateManyArgs: unknown = null;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const createManyMock = vi.fn().mockImplementation((args) => {
          capturedCreateManyArgs = args;
          return Promise.resolve({ count: 1 });
        });

        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ ...mockTradingPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: createManyMock,
          },
        };
        return fn(tx);
      });

      // Act
      await service.createPartner(validInput, actorId);

      // Assert
      expect(capturedCreateManyArgs).toEqual(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              tradingPartnerId: 'partner-123',
              type: 'CUSTOMER',
            }),
          ]),
        })
      );
    });

    it('重複チェックでは論理削除されていない取引先のみを対象とする', async () => {
      // Arrange
      const actorId = 'actor-123';
      let capturedFindFirstArgs: unknown = null;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const findFirstMock = vi.fn().mockImplementation((args) => {
          capturedFindFirstArgs = args;
          return Promise.resolve(null);
        });

        const tx = {
          tradingPartner: {
            findFirst: findFirstMock,
            create: vi.fn().mockResolvedValue({ ...mockTradingPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(mockTradingPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      // Act
      await service.createPartner(validInput, actorId);

      // Assert
      expect(capturedFindFirstArgs).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            name: 'テスト取引先株式会社',
            deletedAt: null,
          }),
        })
      );
    });
  });

  describe('createPartner - エッジケース', () => {
    it('必須フィールドのみの最小構成で取引先を作成できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const minimalInput: CreateTradingPartnerInput = {
        name: '最小取引先',
        nameKana: 'サイショウトリヒキサキ',
        types: ['CUSTOMER'],
        address: '東京都',
      };
      const createdPartner = {
        id: 'minimal-partner-id',
        name: '最小取引先',
        nameKana: 'サイショウトリヒキサキ',
        branchName: null,
        branchNameKana: null,
        representativeName: null,
        representativeNameKana: null,
        address: '東京都',
        phoneNumber: null,
        faxNumber: null,
        email: null,
        billingClosingDay: null,
        paymentMonthOffset: null,
        paymentDay: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        types: [
          { id: 'type-1', tradingPartnerId: 'minimal-partner-id', type: 'CUSTOMER' as const },
        ],
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ ...createdPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(createdPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createPartner(minimalInput, actorId);

      // Assert
      expect(result.name).toBe('最小取引先');
      expect(result.phoneNumber).toBeNull();
      expect(result.email).toBeNull();
    });

    it('協力業者のみの種別で取引先を作成できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const subcontractorInput: CreateTradingPartnerInput = {
        name: '協力業者株式会社',
        nameKana: 'キョウリョクギョウシャカブシキガイシャ',
        types: ['SUBCONTRACTOR'],
        address: '大阪府大阪市1-1-1',
      };
      const createdPartner = {
        id: 'subcontractor-partner-id',
        ...subcontractorInput,
        branchName: null,
        branchNameKana: null,
        representativeName: null,
        representativeNameKana: null,
        phoneNumber: null,
        faxNumber: null,
        email: null,
        billingClosingDay: null,
        paymentMonthOffset: null,
        paymentDay: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        types: [
          {
            id: 'type-1',
            tradingPartnerId: 'subcontractor-partner-id',
            type: 'SUBCONTRACTOR' as const,
          },
        ],
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          tradingPartner: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ ...createdPartner, types: [] }),
            findUnique: vi.fn().mockResolvedValue(createdPartner),
          },
          tradingPartnerTypeMapping: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createPartner(subcontractorInput, actorId);

      // Assert
      expect(result.types).toContain('SUBCONTRACTOR');
      expect(result.types).not.toContain('CUSTOMER');
    });
  });
});
