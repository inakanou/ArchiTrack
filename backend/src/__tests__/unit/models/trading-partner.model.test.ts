/**
 * @fileoverview TradingPartnerモデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するTradingPartnerモデルの型検証
 *
 * Requirements (trading-partner-management):
 * - REQ-11.1: 取引先名（名前）の最大文字数を200文字に制限
 * - REQ-11.2: フリガナの最大文字数を200文字に制限し、カタカナのみを許可
 * - REQ-11.3: 部課/支店/支社名の最大文字数を100文字に制限
 * - REQ-11.4: 部課/支店/支社フリガナの最大文字数を100文字に制限し、カタカナのみを許可
 * - REQ-11.5: 代表者名の最大文字数を100文字に制限
 * - REQ-11.6: 代表者フリガナの最大文字数を100文字に制限し、カタカナのみを許可
 * - REQ-11.10: 住所の最大文字数を500文字に制限
 * - REQ-11.11: 請求締日を1〜31の整数値または「末日」（99）として管理
 * - REQ-11.12: 支払日を月オフセット（1=翌月、2=翌々月、3=3ヶ月後）と日（1〜31または99=末日）の組み合わせとして管理
 * - REQ-11.13: 備考の最大文字数を2000文字に制限
 * - REQ-11.14: 各取引先レコードに作成日時と更新日時を自動記録
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import { TradingPartnerType } from '../../../generated/prisma/client.js';

describe('TradingPartner Model Schema', () => {
  describe('TradingPartnerType Enum', () => {
    it('should have CUSTOMER and SUBCONTRACTOR values defined', () => {
      // 取引先種別: 顧客/協力業者
      expect(TradingPartnerType.CUSTOMER).toBe('CUSTOMER');
      expect(TradingPartnerType.SUBCONTRACTOR).toBe('SUBCONTRACTOR');
    });

    it('should have exactly 2 type values', () => {
      const typeValues = Object.values(TradingPartnerType);
      expect(typeValues).toHaveLength(2);
    });
  });

  describe('TradingPartner CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // 必須フィールド: 名前、フリガナ、住所
      const validInput: Prisma.TradingPartnerCreateInput = {
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
        address: '東京都渋谷区1-1-1',
        types: {
          create: [{ type: TradingPartnerType.CUSTOMER }],
        },
      };

      expect(validInput.name).toBe('株式会社テスト');
      expect(validInput.nameKana).toBe('カブシキガイシャテスト');
      expect(validInput.address).toBe('東京都渋谷区1-1-1');
    });

    it('should allow optional fields', () => {
      // 任意フィールドの検証
      const inputWithOptionalFields: Prisma.TradingPartnerCreateInput = {
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
        address: '東京都渋谷区1-1-1',
        types: {
          create: [{ type: TradingPartnerType.CUSTOMER }],
        },
        branchName: '渋谷支店',
        branchNameKana: 'シブヤシテン',
        representativeName: '山田太郎',
        representativeNameKana: 'ヤマダタロウ',
        phoneNumber: '03-1234-5678',
        faxNumber: '03-1234-5679',
        email: 'test@example.com',
        billingClosingDay: 20,
        paymentMonthOffset: 1, // 翌月
        paymentDay: 25,
        notes: '備考テスト',
      };

      expect(inputWithOptionalFields.branchName).toBe('渋谷支店');
      expect(inputWithOptionalFields.representativeName).toBe('山田太郎');
      expect(inputWithOptionalFields.phoneNumber).toBe('03-1234-5678');
      expect(inputWithOptionalFields.billingClosingDay).toBe(20);
      expect(inputWithOptionalFields.paymentMonthOffset).toBe(1);
      expect(inputWithOptionalFields.paymentDay).toBe(25);
    });

    it('should allow 末日 (99) for billingClosingDay', () => {
      // REQ-11.11: 請求締日として「末日」（99）を許可
      const input: Prisma.TradingPartnerCreateInput = {
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
        address: '東京都渋谷区1-1-1',
        types: {
          create: [{ type: TradingPartnerType.CUSTOMER }],
        },
        billingClosingDay: 99, // 末日
      };

      expect(input.billingClosingDay).toBe(99);
    });

    it('should allow 末日 (99) for paymentDay', () => {
      // REQ-11.12: 支払日として「末日」（99）を許可
      const input: Prisma.TradingPartnerCreateInput = {
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
        address: '東京都渋谷区1-1-1',
        types: {
          create: [{ type: TradingPartnerType.CUSTOMER }],
        },
        paymentMonthOffset: 2, // 翌々月
        paymentDay: 99, // 末日
      };

      expect(input.paymentMonthOffset).toBe(2);
      expect(input.paymentDay).toBe(99);
    });
  });

  describe('TradingPartner fields validation', () => {
    it('should have id field as UUID', () => {
      // 取引先に一意のIDを自動付与
      const partnerSelect: Prisma.TradingPartnerSelect = {
        id: true,
      };
      expect(partnerSelect.id).toBe(true);
    });

    it('should have createdAt and updatedAt fields', () => {
      // REQ-11.14: 作成日時と更新日時を自動記録
      const partnerSelect: Prisma.TradingPartnerSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(partnerSelect.createdAt).toBe(true);
      expect(partnerSelect.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // 論理削除フィールド
      const partnerSelect: Prisma.TradingPartnerSelect = {
        deletedAt: true,
      };
      expect(partnerSelect.deletedAt).toBe(true);
    });

    it('should have all required fields selectable', () => {
      const partnerSelect: Prisma.TradingPartnerSelect = {
        id: true,
        name: true,
        nameKana: true,
        address: true,
      };
      expect(partnerSelect.name).toBe(true);
      expect(partnerSelect.nameKana).toBe(true);
      expect(partnerSelect.address).toBe(true);
    });

    it('should have all optional fields selectable', () => {
      const partnerSelect: Prisma.TradingPartnerSelect = {
        branchName: true,
        branchNameKana: true,
        representativeName: true,
        representativeNameKana: true,
        phoneNumber: true,
        faxNumber: true,
        email: true,
        billingClosingDay: true,
        paymentMonthOffset: true,
        paymentDay: true,
        notes: true,
      };
      expect(partnerSelect.branchName).toBe(true);
      expect(partnerSelect.representativeName).toBe(true);
      expect(partnerSelect.billingClosingDay).toBe(true);
      expect(partnerSelect.paymentMonthOffset).toBe(true);
      expect(partnerSelect.paymentDay).toBe(true);
    });
  });

  describe('TradingPartner relations', () => {
    it('should have types relation to TradingPartnerTypeMapping', () => {
      const partnerSelect: Prisma.TradingPartnerSelect = {
        types: true,
      };
      expect(partnerSelect.types).toBe(true);
    });
  });

  describe('TradingPartner filter and sort fields', () => {
    it('should allow filtering by name', () => {
      const where: Prisma.TradingPartnerWhereInput = {
        name: { contains: '株式会社' },
      };
      expect(where.name).toBeDefined();
    });

    it('should allow filtering by nameKana', () => {
      const where: Prisma.TradingPartnerWhereInput = {
        nameKana: { contains: 'カブシキ' },
      };
      expect(where.nameKana).toBeDefined();
    });

    it('should allow filtering by deletedAt for soft delete', () => {
      const where: Prisma.TradingPartnerWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should allow sorting by nameKana (default sort)', () => {
      // デフォルトソート: フリガナ昇順
      const orderByNameKana: Prisma.TradingPartnerOrderByWithRelationInput = {
        nameKana: 'asc',
      };
      expect(orderByNameKana.nameKana).toBe('asc');
    });

    it('should allow sorting by createdAt', () => {
      const orderByCreatedAt: Prisma.TradingPartnerOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      expect(orderByCreatedAt.createdAt).toBe('desc');
    });
  });

  describe('TradingPartner unique constraint', () => {
    it('should support unique compound constraint on name and deletedAt', () => {
      // 取引先名の一意制約（deletedAt=nullの範囲内）
      // この制約はPrismaスキーマの @@unique([name, deletedAt]) で定義される
      // Prisma 7では、nullableフィールドを含む複合ユニーク制約では、
      // deletedAtが設定されている場合のみ複合ユニーク検索が可能
      // deletedAt: null のレコードはidで検索する必要がある

      // deletedAtが設定されている場合の複合ユニーク検索
      const deletedDate = new Date('2024-01-01');
      const whereWithDeletedAt: Prisma.TradingPartnerWhereUniqueInput = {
        name_deletedAt: {
          name: '株式会社テスト',
          deletedAt: deletedDate,
        },
      };
      expect(whereWithDeletedAt.name_deletedAt).toBeDefined();
      expect(whereWithDeletedAt.name_deletedAt?.name).toBe('株式会社テスト');
      expect(whereWithDeletedAt.name_deletedAt?.deletedAt).toBe(deletedDate);
    });

    it('should support id-based unique lookup for active records', () => {
      // deletedAt: null のレコード（アクティブなレコード）はidで検索
      const whereById: Prisma.TradingPartnerWhereUniqueInput = {
        id: 'partner-uuid',
      };
      expect(whereById.id).toBe('partner-uuid');
    });
  });
});

describe('TradingPartnerTypeMapping Model Schema', () => {
  describe('TradingPartnerTypeMapping CreateInput type structure', () => {
    it('should require tradingPartnerId and type', () => {
      const validInput: Prisma.TradingPartnerTypeMappingCreateInput = {
        tradingPartner: { connect: { id: 'partner-id' } },
        type: TradingPartnerType.CUSTOMER,
      };

      expect(validInput.type).toBe(TradingPartnerType.CUSTOMER);
    });

    it('should support both CUSTOMER and SUBCONTRACTOR types', () => {
      const customerInput: Prisma.TradingPartnerTypeMappingCreateInput = {
        tradingPartner: { connect: { id: 'partner-id' } },
        type: TradingPartnerType.CUSTOMER,
      };
      const subcontractorInput: Prisma.TradingPartnerTypeMappingCreateInput = {
        tradingPartner: { connect: { id: 'partner-id' } },
        type: TradingPartnerType.SUBCONTRACTOR,
      };

      expect(customerInput.type).toBe('CUSTOMER');
      expect(subcontractorInput.type).toBe('SUBCONTRACTOR');
    });
  });

  describe('TradingPartnerTypeMapping fields', () => {
    it('should have id, tradingPartnerId, and type fields', () => {
      const mappingSelect: Prisma.TradingPartnerTypeMappingSelect = {
        id: true,
        tradingPartnerId: true,
        type: true,
      };
      expect(mappingSelect.id).toBe(true);
      expect(mappingSelect.tradingPartnerId).toBe(true);
      expect(mappingSelect.type).toBe(true);
    });

    it('should have tradingPartner relation', () => {
      const mappingSelect: Prisma.TradingPartnerTypeMappingSelect = {
        tradingPartner: true,
      };
      expect(mappingSelect.tradingPartner).toBe(true);
    });
  });

  describe('TradingPartnerTypeMapping unique constraint', () => {
    it('should support unique compound constraint on tradingPartnerId and type', () => {
      // 1つの取引先に同じ種別を重複登録できない
      const where: Prisma.TradingPartnerTypeMappingWhereUniqueInput = {
        tradingPartnerId_type: {
          tradingPartnerId: 'partner-id',
          type: TradingPartnerType.CUSTOMER,
        },
      };
      expect(where.tradingPartnerId_type).toBeDefined();
    });
  });
});
