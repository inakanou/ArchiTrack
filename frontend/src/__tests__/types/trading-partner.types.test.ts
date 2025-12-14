/**
 * @fileoverview 取引先管理機能 型定義のユニットテスト
 *
 * TDD: RED Phase - テストを先に作成
 *
 * Requirements:
 * - 6.1: 顧客と協力業者の2種類の取引先種別をシステムで提供
 */

import { describe, it, expect } from 'vitest';
import {
  TRADING_PARTNER_TYPES,
  TRADING_PARTNER_TYPE_LABELS,
  isTradingPartnerType,
  getTradingPartnerTypeLabel,
  type TradingPartnerType,
  type TradingPartnerInfo,
  type TradingPartnerDetail,
  type TradingPartnerSearchResult,
  type PaginatedTradingPartners,
  type CreateTradingPartnerInput,
  type UpdateTradingPartnerInput,
  type TradingPartnerFilter,
} from '../../types/trading-partner.types';

describe('Trading Partner Types', () => {
  describe('TRADING_PARTNER_TYPES', () => {
    it('should have exactly 2 types', () => {
      expect(TRADING_PARTNER_TYPES).toHaveLength(2);
    });

    it('should contain CUSTOMER and SUBCONTRACTOR', () => {
      const expectedTypes = ['CUSTOMER', 'SUBCONTRACTOR'];
      expect(TRADING_PARTNER_TYPES).toEqual(expectedTypes);
    });

    it('should be readonly', () => {
      expect(Array.isArray(TRADING_PARTNER_TYPES)).toBe(true);
    });
  });

  describe('TRADING_PARTNER_TYPE_LABELS', () => {
    it('should have labels for all 2 types', () => {
      expect(Object.keys(TRADING_PARTNER_TYPE_LABELS)).toHaveLength(2);
    });

    it('should have correct Japanese labels', () => {
      expect(TRADING_PARTNER_TYPE_LABELS.CUSTOMER).toBe('顧客');
      expect(TRADING_PARTNER_TYPE_LABELS.SUBCONTRACTOR).toBe('協力業者');
    });
  });

  describe('isTradingPartnerType', () => {
    it('should return true for valid trading partner types', () => {
      TRADING_PARTNER_TYPES.forEach((type) => {
        expect(isTradingPartnerType(type)).toBe(true);
      });
    });

    it('should return false for invalid values', () => {
      expect(isTradingPartnerType('INVALID')).toBe(false);
      expect(isTradingPartnerType('')).toBe(false);
      expect(isTradingPartnerType(null)).toBe(false);
      expect(isTradingPartnerType(undefined)).toBe(false);
      expect(isTradingPartnerType(123)).toBe(false);
      expect(isTradingPartnerType({})).toBe(false);
    });

    it('should return false for similar but incorrect strings', () => {
      expect(isTradingPartnerType('customer')).toBe(false); // lowercase
      expect(isTradingPartnerType('Customer')).toBe(false); // mixed case
      expect(isTradingPartnerType('CUSTOMERS')).toBe(false); // typo
      expect(isTradingPartnerType('subcontractor')).toBe(false); // lowercase
    });
  });

  describe('getTradingPartnerTypeLabel', () => {
    it('should return correct Japanese label for valid type', () => {
      expect(getTradingPartnerTypeLabel('CUSTOMER')).toBe('顧客');
      expect(getTradingPartnerTypeLabel('SUBCONTRACTOR')).toBe('協力業者');
    });

    it('should return undefined for invalid type', () => {
      expect(getTradingPartnerTypeLabel('INVALID' as TradingPartnerType)).toBeUndefined();
    });
  });

  describe('Type definitions', () => {
    describe('TradingPartnerInfo', () => {
      it('should have correct structure for list view', () => {
        const partner: TradingPartnerInfo = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テスト株式会社',
          nameKana: 'テストカブシキガイシャ',
          branchName: '東京支店',
          branchNameKana: 'トウキョウシテン',
          representativeName: '山田太郎',
          representativeNameKana: 'ヤマダタロウ',
          types: ['CUSTOMER'],
          address: '東京都千代田区丸の内1-1-1',
          phoneNumber: '03-1234-5678',
          faxNumber: '03-1234-5679',
          email: 'contact@test.co.jp',
          billingClosingDay: 25,
          paymentMonthOffset: 1,
          paymentDay: 31,
          notes: '備考テスト',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
        };
        expect(partner.id).toBeDefined();
        expect(partner.name).toBeDefined();
        expect(partner.nameKana).toBeDefined();
        expect(partner.types).toContain('CUSTOMER');
      });

      it('should allow null optional fields', () => {
        const partner: TradingPartnerInfo = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テスト株式会社',
          nameKana: 'テストカブシキガイシャ',
          branchName: null,
          branchNameKana: null,
          representativeName: null,
          representativeNameKana: null,
          types: ['CUSTOMER', 'SUBCONTRACTOR'],
          address: '東京都千代田区丸の内1-1-1',
          phoneNumber: null,
          faxNumber: null,
          email: null,
          billingClosingDay: null,
          paymentMonthOffset: null,
          paymentDay: null,
          notes: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
        };
        expect(partner.branchName).toBeNull();
        expect(partner.phoneNumber).toBeNull();
      });
    });

    describe('TradingPartnerDetail', () => {
      it('should be same as TradingPartnerInfo', () => {
        const detail: TradingPartnerDetail = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テスト株式会社',
          nameKana: 'テストカブシキガイシャ',
          branchName: null,
          branchNameKana: null,
          representativeName: null,
          representativeNameKana: null,
          types: ['CUSTOMER'],
          address: '東京都千代田区丸の内1-1-1',
          phoneNumber: null,
          faxNumber: null,
          email: null,
          billingClosingDay: null,
          paymentMonthOffset: null,
          paymentDay: null,
          notes: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
        };
        expect(detail.id).toBeDefined();
      });
    });

    describe('TradingPartnerSearchResult', () => {
      it('should have correct structure for autocomplete', () => {
        const result: TradingPartnerSearchResult = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テスト株式会社',
          nameKana: 'テストカブシキガイシャ',
          types: ['CUSTOMER', 'SUBCONTRACTOR'],
        };
        expect(result.id).toBeDefined();
        expect(result.name).toBeDefined();
        expect(result.nameKana).toBeDefined();
        expect(result.types).toHaveLength(2);
      });
    });

    describe('PaginatedTradingPartners', () => {
      it('should have correct structure', () => {
        const paginated: PaginatedTradingPartners = {
          data: [],
          pagination: {
            page: 1,
            limit: 20,
            total: 100,
            totalPages: 5,
          },
        };
        expect(paginated.data).toEqual([]);
        expect(paginated.pagination.page).toBe(1);
        expect(paginated.pagination.totalPages).toBe(5);
      });
    });

    describe('CreateTradingPartnerInput', () => {
      it('should have required fields', () => {
        const input: CreateTradingPartnerInput = {
          name: '新規取引先',
          nameKana: 'シンキトリヒキサキ',
          types: ['CUSTOMER'],
          address: '東京都渋谷区1-1-1',
        };
        expect(input.name).toBe('新規取引先');
        expect(input.types).toContain('CUSTOMER');
      });

      it('should allow optional fields', () => {
        const input: CreateTradingPartnerInput = {
          name: '新規取引先',
          nameKana: 'シンキトリヒキサキ',
          types: ['CUSTOMER', 'SUBCONTRACTOR'],
          address: '東京都渋谷区1-1-1',
          branchName: '渋谷支店',
          branchNameKana: 'シブヤシテン',
          representativeName: '田中一郎',
          representativeNameKana: 'タナカイチロウ',
          phoneNumber: '03-1234-5678',
          faxNumber: '03-1234-5679',
          email: 'info@example.com',
          billingClosingDay: 25,
          paymentMonthOffset: 1,
          paymentDay: 31,
          notes: '備考',
        };
        expect(input.branchName).toBe('渋谷支店');
        expect(input.billingClosingDay).toBe(25);
      });
    });

    describe('UpdateTradingPartnerInput', () => {
      it('should require expectedUpdatedAt', () => {
        const input: UpdateTradingPartnerInput = {
          expectedUpdatedAt: '2025-01-02T00:00:00Z',
          name: '更新された取引先名',
        };
        expect(input.expectedUpdatedAt).toBe('2025-01-02T00:00:00Z');
        expect(input.name).toBe('更新された取引先名');
      });

      it('should allow partial updates', () => {
        const input: UpdateTradingPartnerInput = {
          expectedUpdatedAt: '2025-01-02T00:00:00Z',
        };
        expect(input.expectedUpdatedAt).toBeDefined();
        expect(input.name).toBeUndefined();
      });
    });

    describe('TradingPartnerFilter', () => {
      it('should allow empty filter', () => {
        const filter: TradingPartnerFilter = {};
        expect(Object.keys(filter)).toHaveLength(0);
      });

      it('should allow search filter', () => {
        const filter: TradingPartnerFilter = {
          search: 'テスト',
        };
        expect(filter.search).toBe('テスト');
      });

      it('should allow type filter with multiple values', () => {
        const filter: TradingPartnerFilter = {
          type: ['CUSTOMER', 'SUBCONTRACTOR'],
        };
        expect(filter.type).toEqual(['CUSTOMER', 'SUBCONTRACTOR']);
      });

      it('should allow combined filters', () => {
        const filter: TradingPartnerFilter = {
          search: 'テスト',
          type: ['CUSTOMER'],
        };
        expect(filter.search).toBe('テスト');
        expect(filter.type).toEqual(['CUSTOMER']);
      });
    });
  });
});
