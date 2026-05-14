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

  describe('内訳書なしの null セーフガード（Requirements: 39.9）', () => {
    // Task 83.4: generateEmailBody/generateFaxBody 内 `if (request.includeBreakdownInBody)` 条件を
    // `if (request.includeBreakdownInBody && selectedItems.length > 0)` に変更
    // 二重ガード: includeBreakdownInBody=false（83.2/83.3 由来）＋ selectedItems.length=0（自然帰結）
    //
    // Task 85.3: design.md（line 5630）が明示する
    // 「`generate{Email,Fax}Body()` で内訳書なし＋ `includeBreakdownInBody=false`（強制）の
    //   場合に【見積対象項目】セクションが省略されること」を private メソッド直叩きで検証する。
    // public API（generateEmailText/generateFaxText）では入口で NoItemsSelectedError が
    // 先に投げられるため、本文生成ロジック自体の検証には private 直叩きが必要。

    it('内訳書なし（itemizedStatement=null）かつ items=[] の見積依頼で generateText() を呼び出すと NoItemsSelectedError を投げる（メール）', async () => {
      // Arrange: 内訳書未紐付け かつ EstimateRequestItem 0 件（83.2 で auto-init スキップ）
      const mockRequest = {
        id: 'er-001',
        name: 'クイックリクエスト',
        method: 'EMAIL',
        includeBreakdownInBody: false, // 83.2/83.3 由来の強制 false
        deletedAt: null,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
          faxNumber: null,
        },
        itemizedStatement: null, // 内訳書未紐付け（Prisma optional relation）
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(mockRequest as never);
      vi.mocked(mockPrisma.estimateRequestItem.findMany).mockResolvedValue([] as never);

      // Act & Assert: 既存の NoItemsSelectedError 振る舞いは維持されるため例外を投げる
      await expect(service.generateText('er-001')).rejects.toThrow(NoItemsSelectedError);
    });

    it('includeBreakdownInBody=true でも selectedItems が空なら【見積対象項目】セクションを含めない（メール本文）', async () => {
      // Arrange: 防御的シナリオ — items 配列が空かつ includeBreakdownInBody=true の場合に
      // 二つ目のガード（selectedItems.length > 0）が機能して【見積対象項目】を出力しないことを検証
      // 注: 通常フローでは generateEmailText 入口の NoItemsSelectedError ガードで弾かれるため、
      // 本テストは private な generateEmailBody の論理 AND を直接検証する目的で
      // 型アサーションでアクセスする。
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        includeBreakdownInBody: true, // 旧コードでは true 単独でセクションが出力されてしまう
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      } as const;

      // private generateEmailBody を直接呼び出して二つ目のガードを検証
      // （NoItemsSelectedError 経由では body 生成自体が走らないため、論理 AND の検証を直接行う）
      const body = (
        service as unknown as {
          generateEmailBody: (r: typeof mockRequest, items: never[]) => string;
        }
      ).generateEmailBody(mockRequest, []);

      // Assert: selectedItems が空のため【見積対象項目】セクションは含まれてはならない
      expect(body).not.toContain('【見積対象項目】');
    });

    it('includeBreakdownInBody=true でも selectedItems が空なら【見積対象項目】セクションを含めない（FAX本文）', async () => {
      // Arrange: 防御的シナリオ（FAX 版）
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        includeBreakdownInBody: true, // 旧コードでは true 単独でセクションが出力されてしまう
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          faxNumber: '03-1234-5678',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      } as const;

      const body = (
        service as unknown as {
          generateFaxBody: (r: typeof mockRequest, items: never[]) => string;
        }
      ).generateFaxBody(mockRequest, []);

      // Assert
      expect(body).not.toContain('【見積対象項目】');
    });

    // Task 85.3: 内訳書なし（itemizedStatement=null）+ includeBreakdownInBody=false + items=[]
    // の正規シナリオで、private generate{Email,Fax}Body が【見積対象項目】を出力しないことを検証
    // （design.md line 5630: `generate{Email,Fax}Body()` で内訳書なし＋
    //   `includeBreakdownInBody=false`（強制）の場合に省略されること）

    it('内訳書なし＋ includeBreakdownInBody=false でメール本文に【見積対象項目】セクションが含まれない（Requirements: 39.9）', () => {
      // Arrange: 83.2/83.3 で強制された保存後の正規状態
      // - itemizedStatement: null（DB 上は relation 未設定）
      // - includeBreakdownInBody: false（強制）
      // - items: []（auto-init スキップ）
      const mockRequest = {
        id: 'er-001',
        name: 'クイックリクエスト',
        includeBreakdownInBody: false, // 強制 false
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      } as const;

      // Act
      const body = (
        service as unknown as {
          generateEmailBody: (r: typeof mockRequest, items: never[]) => string;
        }
      ).generateEmailBody(mockRequest, []);

      // Assert
      expect(body).not.toContain('【見積対象項目】');
      // ヘッダ・物件情報・フッタは正常に生成されていること
      expect(body).toContain('テスト協力業者 御中');
      expect(body).toContain('テストプロジェクト');
      expect(body).toContain('以上');
    });

    it('内訳書なし＋ includeBreakdownInBody=false で FAX 本文に【見積対象項目】セクションが含まれない（Requirements: 39.9）', () => {
      // Arrange: FAX 版の同等シナリオ
      const mockRequest = {
        id: 'er-001',
        name: 'クイックリクエスト',
        includeBreakdownInBody: false, // 強制 false
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          faxNumber: '03-1234-5678',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      } as const;

      // Act
      const body = (
        service as unknown as {
          generateFaxBody: (r: typeof mockRequest, items: never[]) => string;
        }
      ).generateFaxBody(mockRequest, []);

      // Assert
      expect(body).not.toContain('【見積対象項目】');
      // FAX ヘッダ・物件情報・フッタは正常に生成されていること
      expect(body).toContain('FAX送信票');
      expect(body).toContain('テスト協力業者 御中');
      expect(body).toContain('テストプロジェクト');
      expect(body).toContain('以上');
    });

    // Task 85.3: 内訳書あり＋ includeBreakdownInBody=true で【見積対象項目】が含まれる
    // ことの回帰確認（既存の generateEmailText / generateFaxText シナリオで間接的に
    // カバーされているが、private メソッドの正のパスを直接検証する）

    it('内訳書あり＋ includeBreakdownInBody=true でメール本文に【見積対象項目】セクションが含まれる（Requirements: 39.9 回帰）', () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        includeBreakdownInBody: true,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          email: 'test@example.com',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      } as const;

      // SelectedItemInfo は service 内部 interface のため、構造ベースで定義
      const items = [
        {
          workType: '電気工事',
          name: '配線工事',
          specification: 'VVFケーブル',
          unit: 'm',
          quantity: 100,
        },
      ];

      // Act
      const body = (
        service as unknown as {
          generateEmailBody: (r: typeof mockRequest, sel: typeof items) => string;
        }
      ).generateEmailBody(mockRequest, items);

      // Assert
      expect(body).toContain('【見積対象項目】');
      expect(body).toContain('配線工事');
      expect(body).toContain('VVFケーブル');
      expect(body).toContain('100m');
    });

    it('内訳書あり＋ includeBreakdownInBody=true で FAX 本文に【見積対象項目】セクションが含まれる（Requirements: 39.9 回帰）', () => {
      // Arrange
      const mockRequest = {
        id: 'er-001',
        name: 'テスト見積依頼',
        includeBreakdownInBody: true,
        tradingPartner: {
          id: 'tp-001',
          name: 'テスト協力業者',
          faxNumber: '03-1234-5678',
        },
        project: {
          id: 'proj-001',
          name: 'テストプロジェクト',
          siteAddress: '東京都渋谷区',
        },
      } as const;

      const items = [
        {
          workType: '電気工事',
          name: '配線工事',
          specification: 'VVFケーブル',
          unit: 'm',
          quantity: 100,
        },
      ];

      // Act
      const body = (
        service as unknown as {
          generateFaxBody: (r: typeof mockRequest, sel: typeof items) => string;
        }
      ).generateFaxBody(mockRequest, items);

      // Assert
      expect(body).toContain('【見積対象項目】');
      expect(body).toContain('配線工事');
      expect(body).toContain('VVFケーブル');
      expect(body).toContain('100m');
    });
  });
});
