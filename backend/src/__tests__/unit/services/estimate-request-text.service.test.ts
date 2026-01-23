/**
 * @fileoverview EstimateRequestTextService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 6.1: メール見積依頼文のヘッダ・本文・フッタを生成
 * - 6.2: FAX見積依頼文のヘッダ・本文・フッタを生成
 * - 6.3: 内訳データをメール本文に含める
 * - 6.4: メールアドレス未登録時のエラー
 * - 6.5: FAX番号未登録時のエラー
 * - 7.3: 項目が選択されていない場合のエラー
 *
 * Task 2.3: EstimateRequestTextServiceの実装
 *
 * @module tests/unit/services/estimate-request-text.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { EstimateRequestTextService } from '../../../services/estimate-request-text.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  EstimateRequestNotFoundError,
  MissingContactInfoError,
  NoItemsSelectedError,
} from '../../../errors/estimateRequestError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    estimateRequest: {
      findUnique: vi.fn(),
    },
    estimateRequestItem: {
      findMany: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('EstimateRequestTextService', () => {
  let service: EstimateRequestTextService;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new EstimateRequestTextService({
      prisma: mockPrisma,
    });
  });

  describe('generateEmailText', () => {
    it('メール見積依頼文を生成する（Requirements: 6.1）', async () => {
      // Arrange
      const requestId = 'er-001';
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
          faxNumber: null,
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: 'VVFケーブル',
            unit: 'm',
            quantity: new Decimal('100.00'),
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateEmailText(requestId);

      // Assert
      expect(result.subject).toContain('テストプロジェクト');
      expect(result.to).toBe('test@example.com');
      expect(result.body).toContain('テスト協力業者');
      expect(result.body).toContain('お見積り');
    });

    it('メールアドレス未登録時、エラーを発生させる（Requirements: 6.4）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: null, // メールアドレス未登録
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
        },
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);

      // Act & Assert
      await expect(service.generateEmailText('er-001')).rejects.toThrow(MissingContactInfoError);
    });

    it('内訳データをメール本文に含める（Requirements: 6.3）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: true, // 内訳を含める
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: 'VVFケーブル',
            unit: 'm',
            quantity: new Decimal('100.00'),
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateEmailText('er-001');

      // Assert
      expect(result.body).toContain('配線工事');
      expect(result.body).toContain('VVFケーブル');
      expect(result.body).toContain('100');
    });

    it('項目が選択されていない場合、エラーを発生させる（Requirements: 7.3）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
        },
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue([] as never); // 選択項目なし

      // Act & Assert
      await expect(service.generateEmailText('er-001')).rejects.toThrow(NoItemsSelectedError);
    });
  });

  describe('generateFaxText', () => {
    it('FAX見積依頼文を生成する（Requirements: 6.2）', async () => {
      // Arrange
      const requestId = 'er-001';
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: null,
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: 'VVFケーブル',
            unit: 'm',
            quantity: new Decimal('100.00'),
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateFaxText(requestId);

      // Assert
      expect(result.faxNumber).toBe('03-1234-5678');
      expect(result.body).toContain('テスト協力業者');
      expect(result.body).toContain('FAX');
    });

    it('FAX番号未登録時、エラーを発生させる（Requirements: 6.5）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
          faxNumber: null, // FAX番号未登録
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
        },
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);

      // Act & Assert
      await expect(service.generateFaxText('er-001')).rejects.toThrow(MissingContactInfoError);
    });
  });

  describe('generateText', () => {
    it('見積依頼のmethodに応じて適切なテキストを生成する（EMAIL）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: 'VVFケーブル',
            unit: 'm',
            quantity: new Decimal('100.00'),
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateText('er-001');

      // Assert
      expect(result.type).toBe('email');
      expect('to' in result && result.to).toBe('test@example.com');
    });

    it('見積依頼のmethodに応じて適切なテキストを生成する（FAX）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: {
          id: 'is-001',
          name: 'テスト内訳書',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: 'VVFケーブル',
            unit: 'm',
            quantity: new Decimal('100.00'),
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateText('er-001');

      // Assert
      expect(result.type).toBe('fax');
      expect('faxNumber' in result && result.faxNumber).toBe('03-1234-5678');
    });

    it('存在しない見積依頼の場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(service.generateText('er-nonexistent')).rejects.toThrow(
        EstimateRequestNotFoundError
      );
    });

    it('削除済み見積依頼の場合、エラーを発生させる', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        deletedAt: new Date(), // 削除済み
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: { id: 'proj-001', name: 'テストプロジェクト', siteAddress: null },
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);

      // Act & Assert
      await expect(service.generateText('er-001')).rejects.toThrow(EstimateRequestNotFoundError);
    });
  });

  describe('generateEmailBody edge cases', () => {
    it('現場住所がない場合でも生成できる', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: null, // 現場住所なし
        },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: null,
            unit: 'm',
            quantity: 100,
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateEmailText('er-001');

      // Assert
      expect(result.body).toContain('テストプロジェクト');
      expect(result.body).not.toContain('現場住所');
    });

    it('項目の一部フィールドがnullでも生成できる', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: true,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: { id: 'proj-001', name: 'テストプロジェクト', siteAddress: '東京都' },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: null, // nullフィールド
            name: '配線工事',
            specification: null,
            unit: null,
            quantity: 50,
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateEmailText('er-001');

      // Assert
      expect(result.body).toContain('配線工事');
      expect(result.body).toContain('50');
    });

    it('項目のnameがnullでも生成できる', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: true,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: { id: 'proj-001', name: 'テストプロジェクト', siteAddress: '東京都' },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: null, // nameがnull
            specification: 'VVF',
            unit: 'm',
            quantity: 100,
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateEmailText('er-001');

      // Assert
      expect(result.body).toContain('電気工事');
      expect(result.body).toContain('VVF');
      expect(result.body).toContain('100m');
    });
  });

  describe('generateFaxText edge cases', () => {
    it('内訳書を本文に含めて生成する', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: true, // 内訳を含める
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: null,
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: { id: 'proj-001', name: 'テストプロジェクト', siteAddress: '東京都渋谷区' },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: 'VVFケーブル',
            unit: 'm',
            quantity: new Decimal('100.00'),
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateFaxText('er-001');

      // Assert
      expect(result.body).toContain('配線工事');
      expect(result.body).toContain('VVFケーブル');
      expect(result.body).toContain('見積対象項目');
    });

    it('現場住所がない場合でも生成できる', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: null,
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: null, // 現場住所なし
        },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: '配線工事',
            specification: null,
            unit: 'm',
            quantity: 100,
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateFaxText('er-001');

      // Assert
      expect(result.body).toContain('FAX');
      expect(result.body).not.toContain('現場住所');
    });

    it('項目が選択されていない場合、エラーを発生させる', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: false,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: null,
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: { id: 'proj-001', name: 'テストプロジェクト', siteAddress: null },
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue([] as never);

      // Act & Assert
      await expect(service.generateFaxText('er-001')).rejects.toThrow(NoItemsSelectedError);
    });

    it('項目のnameがnullでも生成できる（FAX）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: true,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: null,
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: { id: 'proj-001', name: 'テストプロジェクト', siteAddress: '東京都' },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: '電気工事',
            name: null, // nameがnull
            specification: 'VVF',
            unit: 'm',
            quantity: 100,
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateFaxText('er-001');

      // Assert
      expect(result.body).toContain('電気工事');
      expect(result.body).toContain('VVF');
      expect(result.body).toContain('100m');
    });

    it('項目の全フィールドがnullでも生成できる（FAX）', async () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        method: 'FAX',
        includeBreakdownInBody: true,
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: null,
          faxNumber: '03-1234-5678',
        },
        itemizedStatement: { id: 'is-001', name: 'テスト内訳書' },
        project: { id: 'proj-001', name: 'テストプロジェクト', siteAddress: '東京都' },
      };

      const mockSelectedItems = [
        {
          id: 'eri-001',
          selected: true,
          itemizedStatementItem: {
            id: 'isi-001',
            workType: null, // 全てnull
            name: null,
            specification: null,
            unit: null,
            quantity: 50,
          },
        },
      ];

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue(
        mockSelectedItems as never
      );

      // Act
      const result = await service.generateFaxText('er-001');

      // Assert
      expect(result.body).toContain('50');
      expect(result.body).toContain('見積対象項目');
    });
  });
});
