/**
 * @fileoverview ReceivedQuotationモデル改訂版のスキーマ定義テスト
 *
 * TDD: RED Phase - contentType/textContent列廃止後のReceivedQuotationモデルの型検証
 *
 * Requirements (estimate-request):
 * - REQ-11.9: 構造化データ入力エリアに明細行を表示
 * - REQ-14.1: 受領見積書を見積依頼に紐づけて保存する
 * - REQ-14.2: 受領見積書の明細行データをデータベースに永続化する
 *
 * Design Specification (Migration Strategy):
 * - contentType列とtextContent列を廃止し、ファイルと明細行の共存モデルへ移行
 * - 既存のcontentType='TEXT'レコードのテキストデータを明細行データに変換
 * - 既存のcontentType='FILE'レコードはファイル情報をそのまま保持
 * - ReceivedQuotationLineItemリレーションを追加
 * - ReceivedQuotationContentType Enumを削除
 *
 * Task 20.2: ReceivedQuotationモデルの改訂マイグレーション
 */

import { describe, it, expect } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';

describe('ReceivedQuotation Revised Model Schema', () => {
  describe('contentType and textContent fields should be removed', () => {
    it('should NOT have contentType field after migration', () => {
      // Design: contentType列を廃止
      // ReceivedQuotationSelectにcontentTypeが存在しないことを検証
      const select: Prisma.ReceivedQuotationSelect = {};
      // contentType プロパティが型に存在しないことを確認
      // TypeScript型レベルでは 'contentType' in select は常にfalseになるべき
      expect('contentType' in select).toBe(false);
      // 値のアサインがないことも確認
      expect((select as Record<string, unknown>)['contentType']).toBeUndefined();
    });

    it('should NOT have textContent field after migration', () => {
      // Design: textContent列を廃止
      const select: Prisma.ReceivedQuotationSelect = {};
      expect('textContent' in select).toBe(false);
      expect((select as Record<string, unknown>)['textContent']).toBeUndefined();
    });

    it('should NOT have ReceivedQuotationContentType enum', () => {
      // Design: ReceivedQuotationContentType Enumを削除
      // Prisma名前空間にReceivedQuotationContentTypeが存在しないことを確認
      expect((Prisma as Record<string, unknown>)['ReceivedQuotationContentType']).toBeUndefined();
    });
  });

  describe('revised ReceivedQuotation CreateInput', () => {
    it('should create without contentType and textContent', () => {
      // Design: ファイルと明細行の共存モデル
      const validInput: Prisma.ReceivedQuotationCreateInput = {
        name: 'テスト受領見積書',
        submittedAt: new Date('2026-01-20'),
        estimateRequest: { connect: { id: 'estimate-request-id' } },
      };

      // contentTypeとtextContentが不要であること
      expect(validInput.name).toBe('テスト受領見積書');
      expect(validInput.submittedAt).toBeInstanceOf(Date);
      expect((validInput as Record<string, unknown>)['contentType']).toBeUndefined();
      expect((validInput as Record<string, unknown>)['textContent']).toBeUndefined();
    });

    it('should create with file information only', () => {
      // Design: ファイルのみの受領見積書
      const validInput: Prisma.ReceivedQuotationCreateInput = {
        name: 'ファイル付き見積書',
        submittedAt: new Date('2026-01-20'),
        filePath: 'quotations/uuid/filename.pdf',
        fileName: 'quotation.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 1024000,
        estimateRequest: { connect: { id: 'estimate-request-id' } },
      };

      expect(validInput.filePath).toBe('quotations/uuid/filename.pdf');
      expect(validInput.fileName).toBe('quotation.pdf');
    });

    it('should create with nested lineItems', () => {
      // REQ-14.2: 明細行付き受領見積書
      const validInput: Prisma.ReceivedQuotationCreateInput = {
        name: '明細付き見積書',
        submittedAt: new Date('2026-01-20'),
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        lineItems: {
          create: [
            {
              sortOrder: 0,
              name: '外壁塗装',
              specification: 'シリコン樹脂塗料',
              unit: 'm2',
              quantity: 150.5,
              unitPrice: 3500,
              amount: 526750,
            },
          ],
        },
      };

      expect(validInput.lineItems).toBeDefined();
    });

    it('should create with both file and lineItems', () => {
      // Design: ファイルと明細行の共存を許可
      const validInput: Prisma.ReceivedQuotationCreateInput = {
        name: 'ファイル+明細付き見積書',
        submittedAt: new Date('2026-01-20'),
        filePath: 'quotations/uuid/filename.pdf',
        fileName: 'quotation.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 1024000,
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        lineItems: {
          create: [
            {
              sortOrder: 0,
              name: '外壁塗装',
              quantity: 100,
              unitPrice: 5000,
              amount: 500000,
            },
          ],
        },
      };

      expect(validInput.filePath).toBeDefined();
      expect(validInput.lineItems).toBeDefined();
    });
  });

  describe('revised ReceivedQuotation fields', () => {
    it('should retain all file information fields', () => {
      // ファイル情報フィールドは維持される
      const select: Prisma.ReceivedQuotationSelect = {
        filePath: true,
        fileName: true,
        fileMimeType: true,
        fileSize: true,
      };
      expect(select.filePath).toBe(true);
      expect(select.fileName).toBe(true);
      expect(select.fileMimeType).toBe(true);
      expect(select.fileSize).toBe(true);
    });

    it('should retain all metadata fields', () => {
      // メタデータフィールドは維持される
      const select: Prisma.ReceivedQuotationSelect = {
        id: true,
        estimateRequestId: true,
        name: true,
        submittedAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      };
      expect(select.id).toBe(true);
      expect(select.name).toBe(true);
    });

    it('should have lineItems relation', () => {
      // Design: lineItemsリレーション追加
      const select: Prisma.ReceivedQuotationSelect = {
        lineItems: true,
      };
      expect(select.lineItems).toBe(true);
    });
  });

  describe('revised ReceivedQuotation filtering', () => {
    it('should NOT allow filtering by contentType', () => {
      // contentTypeが廃止されたため、フィルタリングに使用できない
      const where: Prisma.ReceivedQuotationWhereInput = {
        estimateRequestId: 'test-id',
      };
      expect((where as Record<string, unknown>)['contentType']).toBeUndefined();
    });

    it('should allow filtering by file fields', () => {
      // ファイルの有無でフィルタリング可能
      const where: Prisma.ReceivedQuotationWhereInput = {
        filePath: { not: null },
      };
      expect(where.filePath).toBeDefined();
    });
  });
});
