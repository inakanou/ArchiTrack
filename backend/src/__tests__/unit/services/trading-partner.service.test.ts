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
import {
  DuplicatePartnerNameError,
  TradingPartnerNotFoundError,
} from '../../../errors/tradingPartnerError.js';

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

  /**
   * getPartners テスト
   *
   * Requirements:
   * - 1.1: 登録済みの取引先をテーブル形式で表示する
   * - 1.2: 取引先名、フリガナ、部課/支店/支社名、代表者名、取引先種別、住所、電話番号、登録日を表示
   * - 1.3: 取引先名またはフリガナによる部分一致検索
   * - 1.4: 取引先種別でのフィルタリング
   * - 1.5: ページネーション
   * - 1.6: 指定された列でソート
   * - 1.7: 取引先データが存在しない場合のメッセージ（空配列返却）
   * - 1.8: デフォルトソート順をフリガナの昇順
   */
  describe('getPartners', () => {
    // テスト用モックデータ
    const mockPartners = [
      {
        id: 'partner-1',
        name: 'アルファ株式会社',
        nameKana: 'アルファカブシキガイシャ',
        branchName: '東京支店',
        branchNameKana: 'トウキョウシテン',
        representativeName: '山田太郎',
        representativeNameKana: 'ヤマダタロウ',
        address: '東京都渋谷区1-1-1',
        phoneNumber: '03-1111-1111',
        faxNumber: null,
        email: 'alpha@example.com',
        billingClosingDay: 25,
        paymentMonthOffset: 1,
        paymentDay: 15,
        notes: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        deletedAt: null,
        types: [{ id: 'type-1', tradingPartnerId: 'partner-1', type: 'CUSTOMER' as const }],
      },
      {
        id: 'partner-2',
        name: 'ベータ建設株式会社',
        nameKana: 'ベータケンセツカブシキガイシャ',
        branchName: null,
        branchNameKana: null,
        representativeName: '鈴木一郎',
        representativeNameKana: 'スズキイチロウ',
        address: '大阪府大阪市2-2-2',
        phoneNumber: '06-2222-2222',
        faxNumber: '06-2222-2223',
        email: null,
        billingClosingDay: 99,
        paymentMonthOffset: 2,
        paymentDay: 99,
        notes: 'メモ',
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
        deletedAt: null,
        types: [{ id: 'type-2', tradingPartnerId: 'partner-2', type: 'SUBCONTRACTOR' as const }],
      },
      {
        id: 'partner-3',
        name: 'ガンマ商事株式会社',
        nameKana: 'ガンマショウジカブシキガイシャ',
        branchName: null,
        branchNameKana: null,
        representativeName: null,
        representativeNameKana: null,
        address: '愛知県名古屋市3-3-3',
        phoneNumber: null,
        faxNumber: null,
        email: null,
        billingClosingDay: null,
        paymentMonthOffset: null,
        paymentDay: null,
        notes: null,
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01'),
        deletedAt: null,
        types: [
          { id: 'type-3', tradingPartnerId: 'partner-3', type: 'CUSTOMER' as const },
          { id: 'type-4', tradingPartnerId: 'partner-3', type: 'SUBCONTRACTOR' as const },
        ],
      },
    ];

    it('ページネーション付きで取引先一覧を取得できる', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(3);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue(mockPartners);

      // Act
      const result = await service.getPartners(
        {},
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(result.data).toHaveLength(3);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
    });

    it('デフォルトでフリガナ昇順でソートされる（Requirement 1.8）', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(3);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue(mockPartners);

      // Act
      await service.getPartners({}, { page: 1, limit: 20 }, { sort: 'nameKana', order: 'asc' });

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { nameKana: 'asc' },
        })
      );
    });

    it('取引先名またはフリガナで部分一致検索できる（Requirement 1.3）', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(1);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([mockPartners[0]]);

      // Act
      await service.getPartners(
        { search: 'アルファ' },
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'アルファ', mode: 'insensitive' } },
              { nameKana: { contains: 'アルファ', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('種別でフィルタリングできる（Requirement 1.4）', async () => {
      // Arrange
      const customerPartners = mockPartners.filter((p) =>
        p.types.some((t) => t.type === 'CUSTOMER')
      );
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(customerPartners.length);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue(customerPartners);

      // Act
      await service.getPartners(
        { type: 'CUSTOMER' },
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            types: {
              some: {
                type: 'CUSTOMER',
              },
            },
          }),
        })
      );
    });

    it('指定された列でソートできる（Requirement 1.6）', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(3);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue(mockPartners);

      // Act
      await service.getPartners({}, { page: 1, limit: 20 }, { sort: 'createdAt', order: 'desc' });

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('取引先名でソートできる', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(3);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue(mockPartners);

      // Act
      await service.getPartners({}, { page: 1, limit: 20 }, { sort: 'name', order: 'asc' });

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      );
    });

    it('ページネーションでskipとtakeが正しく計算される', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(50);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([]);

      // Act
      await service.getPartners({}, { page: 3, limit: 10 }, { sort: 'nameKana', order: 'asc' });

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3 - 1) * 10
          take: 10,
        })
      );
    });

    it('データが存在しない場合は空配列を返す（Requirement 1.7）', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(0);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([]);

      // Act
      const result = await service.getPartners(
        {},
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(result.data).toEqual([]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('検索とフィルタを組み合わせて取得できる', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(1);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([mockPartners[0]]);

      // Act
      await service.getPartners(
        { search: 'アルファ', type: 'CUSTOMER' },
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: [
              { name: { contains: 'アルファ', mode: 'insensitive' } },
              { nameKana: { contains: 'アルファ', mode: 'insensitive' } },
            ],
            types: {
              some: {
                type: 'CUSTOMER',
              },
            },
          }),
        })
      );
    });

    it('論理削除されたレコードは除外される', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(0);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([]);

      // Act
      await service.getPartners({}, { page: 1, limit: 20 }, { sort: 'nameKana', order: 'asc' });

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });

    it('返却データに種別情報が含まれる（Requirement 1.2）', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(1);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([mockPartners[2]]); // 両方の種別を持つ

      // Act
      const result = await service.getPartners(
        {},
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(result.data).toHaveLength(1);
      const partner = result.data[0];
      expect(partner).toBeDefined();
      expect(partner!.types).toContain('CUSTOMER');
      expect(partner!.types).toContain('SUBCONTRACTOR');
    });

    it('返却データに必要なフィールドがすべて含まれる（Requirement 1.2）', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(1);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([mockPartners[0]]);

      // Act
      const result = await service.getPartners(
        {},
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(result.data).toHaveLength(1);
      const partner = result.data[0];
      expect(partner).toBeDefined();
      expect(partner!.id).toBe('partner-1');
      expect(partner!.name).toBe('アルファ株式会社');
      expect(partner!.nameKana).toBe('アルファカブシキガイシャ');
      expect(partner!.branchName).toBe('東京支店');
      expect(partner!.representativeName).toBe('山田太郎');
      expect(partner!.address).toBe('東京都渋谷区1-1-1');
      expect(partner!.phoneNumber).toBe('03-1111-1111');
      expect(partner!.types).toContain('CUSTOMER');
      expect(partner!.createdAt).toEqual(new Date('2024-01-01'));
    });

    it('総ページ数が正しく計算される', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(55);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([]);

      // Act
      const result = await service.getPartners(
        {},
        { page: 1, limit: 20 },
        { sort: 'nameKana', order: 'asc' }
      );

      // Assert
      expect(result.pagination.totalPages).toBe(3); // Math.ceil(55 / 20) = 3
    });

    it('typesリレーションがincludeされる', async () => {
      // Arrange
      mockPrisma.tradingPartner.count = vi.fn().mockResolvedValue(1);
      mockPrisma.tradingPartner.findMany = vi.fn().mockResolvedValue([mockPartners[0]]);

      // Act
      await service.getPartners({}, { page: 1, limit: 20 }, { sort: 'nameKana', order: 'asc' });

      // Assert
      expect(mockPrisma.tradingPartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            types: true,
          },
        })
      );
    });
  });

  /**
   * getPartner テスト
   *
   * Requirements:
   * - 3.1: ユーザーが一覧から取引先を選択したとき、取引先詳細ページを表示する
   * - 3.2: 全フィールド情報を詳細ページに表示する
   * - 3.4: プロジェクト管理機能が有効なとき、当該取引先に紐付くプロジェクト一覧を表示する（将来対応）
   */
  describe('getPartner', () => {
    const mockPartnerWithAllFields = {
      id: 'partner-detail-123',
      name: 'テスト取引先株式会社',
      nameKana: 'テストトリヒキサキカブシキガイシャ',
      branchName: '東京支店',
      branchNameKana: 'トウキョウシテン',
      representativeName: '山田太郎',
      representativeNameKana: 'ヤマダタロウ',
      address: '東京都渋谷区1-1-1',
      phoneNumber: '03-1234-5678',
      faxNumber: '03-1234-5679',
      email: 'contact@test.example.com',
      billingClosingDay: 25,
      paymentMonthOffset: 1,
      paymentDay: 15,
      notes: 'これは備考です。',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15'),
      deletedAt: null,
      types: [
        { id: 'type-1', tradingPartnerId: 'partner-detail-123', type: 'CUSTOMER' as const },
        { id: 'type-2', tradingPartnerId: 'partner-detail-123', type: 'SUBCONTRACTOR' as const },
      ],
    };

    it('IDで取引先詳細を取得できる（Requirement 3.1）', async () => {
      // Arrange
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(mockPartnerWithAllFields);

      // Act
      const result = await service.getPartner('partner-detail-123');

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('partner-detail-123');
      expect(result.name).toBe('テスト取引先株式会社');
      expect(mockPrisma.tradingPartner.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'partner-detail-123', deletedAt: null },
        })
      );
    });

    it('全フィールドの情報を返却する（Requirement 3.2）', async () => {
      // Arrange
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(mockPartnerWithAllFields);

      // Act
      const result = await service.getPartner('partner-detail-123');

      // Assert
      expect(result.name).toBe('テスト取引先株式会社');
      expect(result.nameKana).toBe('テストトリヒキサキカブシキガイシャ');
      expect(result.branchName).toBe('東京支店');
      expect(result.branchNameKana).toBe('トウキョウシテン');
      expect(result.representativeName).toBe('山田太郎');
      expect(result.representativeNameKana).toBe('ヤマダタロウ');
      expect(result.address).toBe('東京都渋谷区1-1-1');
      expect(result.phoneNumber).toBe('03-1234-5678');
      expect(result.faxNumber).toBe('03-1234-5679');
      expect(result.email).toBe('contact@test.example.com');
      expect(result.billingClosingDay).toBe(25);
      expect(result.paymentMonthOffset).toBe(1);
      expect(result.paymentDay).toBe(15);
      expect(result.notes).toBe('これは備考です。');
      expect(result.createdAt).toEqual(new Date('2024-01-01'));
      expect(result.updatedAt).toEqual(new Date('2024-01-15'));
    });

    it('種別情報を配列で返却する', async () => {
      // Arrange
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(mockPartnerWithAllFields);

      // Act
      const result = await service.getPartner('partner-detail-123');

      // Assert
      expect(result.types).toContain('CUSTOMER');
      expect(result.types).toContain('SUBCONTRACTOR');
      expect(result.types).toHaveLength(2);
    });

    it('取引先が見つからない場合はTradingPartnerNotFoundErrorをスローする', async () => {
      // Arrange
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.getPartner('non-existent-id')).rejects.toThrow(
        TradingPartnerNotFoundError
      );
    });

    it('論理削除された取引先は取得できない', async () => {
      // Arrange
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.getPartner('deleted-partner-id')).rejects.toThrow(
        TradingPartnerNotFoundError
      );

      // WHERE条件にdeletedAt: nullが含まれていることを確認
      expect(mockPrisma.tradingPartner.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deleted-partner-id', deletedAt: null },
        })
      );
    });

    it('typesリレーションがincludeされる', async () => {
      // Arrange
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(mockPartnerWithAllFields);

      // Act
      await service.getPartner('partner-detail-123');

      // Assert
      expect(mockPrisma.tradingPartner.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            types: true,
          },
        })
      );
    });

    it('必須フィールドのみの取引先詳細を取得できる', async () => {
      // Arrange
      const minimalPartner = {
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
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        deletedAt: null,
        types: [
          { id: 'type-1', tradingPartnerId: 'minimal-partner-id', type: 'CUSTOMER' as const },
        ],
      };
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(minimalPartner);

      // Act
      const result = await service.getPartner('minimal-partner-id');

      // Assert
      expect(result.name).toBe('最小取引先');
      expect(result.branchName).toBeNull();
      expect(result.representativeName).toBeNull();
      expect(result.phoneNumber).toBeNull();
      expect(result.email).toBeNull();
      expect(result.billingClosingDay).toBeNull();
    });

    it('末日（99）が設定された請求締日・支払日を正しく返却する', async () => {
      // Arrange
      const partnerWithEndOfMonth = {
        ...mockPartnerWithAllFields,
        billingClosingDay: 99, // 末日
        paymentDay: 99, // 末日
      };
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(partnerWithEndOfMonth);

      // Act
      const result = await service.getPartner('partner-detail-123');

      // Assert
      expect(result.billingClosingDay).toBe(99);
      expect(result.paymentDay).toBe(99);
    });

    it('プロジェクト情報取得用のインターフェースが準備されている（将来対応、Requirement 3.4）', async () => {
      // Arrange
      mockPrisma.tradingPartner.findUnique = vi.fn().mockResolvedValue(mockPartnerWithAllFields);

      // Act
      const result = await service.getPartner('partner-detail-123');

      // Assert
      // 現時点ではprojectsは未実装だが、インターフェースとして存在確認
      // TradingPartnerDetailがTradingPartnerInfoを拡張し、projects?: ProjectSummary[]を持つ
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('types');
      // projects フィールドはオプションとして将来追加予定
    });
  });
});
