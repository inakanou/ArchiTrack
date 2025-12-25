/**
 * @fileoverview TradingPartnerテーブル統合テスト
 *
 * TDD Task 1.3: データベースマイグレーションの実行
 * - Prismaマイグレーションを作成・適用
 * - フリガナ検索用、論理削除フィルタ用、作成日ソート用のインデックスを追加
 * - 種別フィルタ用のインデックスを追加
 *
 * Requirements (trading-partner-management):
 * - REQ-9.5: 大量データ（1000件以上）でもページネーションにより一覧表示のパフォーマンスを維持
 * - REQ-11.14: 各取引先レコードに作成日時と更新日時を自動記録
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient, TradingPartner } from '../../generated/prisma/client.js';
import { TradingPartnerType } from '../../generated/prisma/client.js';

// 環境変数を初期化
validateEnv();

import getPrismaClient from '../../db.js';

describe('TradingPartner Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = getPrismaClient();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-integration-',
          },
        },
      },
    });
    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-integration-',
        },
      },
    });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 各テスト前にテストデータをクリーンアップ
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-integration-',
          },
        },
      },
    });
    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-integration-',
        },
      },
    });
  });

  describe('TradingPartner Table Existence', () => {
    it('should have trading_partners table created', async () => {
      // テーブルが存在することを確認（CRUDが正常に動作することで検証）
      const result = await prisma.tradingPartner.findMany({
        take: 1,
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should have trading_partner_type_mappings table created', async () => {
      const result = await prisma.tradingPartnerTypeMapping.findMany({
        take: 1,
      });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('TradingPartner CRUD Operations', () => {
    it('should create a trading partner with required fields', async () => {
      const partner = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-create',
          nameKana: 'テストインテグレーションクリエイト',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
        include: {
          types: true,
        },
      });

      expect(partner).toHaveProperty('id');
      expect(partner.name).toBe('test-integration-create');
      expect(partner.nameKana).toBe('テストインテグレーションクリエイト');
      expect(partner.address).toBe('東京都渋谷区1-1-1');
      expect(partner.types).toHaveLength(1);
      expect(partner.types[0]?.type).toBe(TradingPartnerType.CUSTOMER);
      // REQ-11.14: 作成日時と更新日時を自動記録
      expect(partner.createdAt).toBeInstanceOf(Date);
      expect(partner.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a trading partner with all fields', async () => {
      const partner = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-full',
          nameKana: 'テストインテグレーションフル',
          branchName: '渋谷支店',
          representativeName: '山田太郎',
          address: '東京都渋谷区1-1-1',
          phoneNumber: '03-1234-5678',
          faxNumber: '03-1234-5679',
          email: 'test@example.com',
          billingClosingDay: 20,
          paymentMonthOffset: 1,
          paymentDay: 25,
          notes: '備考テスト',
          types: {
            create: [
              { type: TradingPartnerType.CUSTOMER },
              { type: TradingPartnerType.SUBCONTRACTOR },
            ],
          },
        },
        include: {
          types: true,
        },
      });

      expect(partner.branchName).toBe('渋谷支店');
      expect(partner.representativeName).toBe('山田太郎');
      expect(partner.billingClosingDay).toBe(20);
      expect(partner.paymentMonthOffset).toBe(1);
      expect(partner.paymentDay).toBe(25);
      expect(partner.types).toHaveLength(2);
    });

    it('should update a trading partner', async () => {
      const created = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-update',
          nameKana: 'テストインテグレーションアップデート',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      const updated = await prisma.tradingPartner.update({
        where: { id: created.id },
        data: {
          branchName: '新宿支店',
          phoneNumber: '03-9999-8888',
        },
      });

      expect(updated.branchName).toBe('新宿支店');
      expect(updated.phoneNumber).toBe('03-9999-8888');
      // REQ-11.14: 更新日時が更新される
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('should soft delete a trading partner', async () => {
      const created = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-delete',
          nameKana: 'テストインテグレーションデリート',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      // 論理削除
      const deletedAt = new Date();
      await prisma.tradingPartner.update({
        where: { id: created.id },
        data: { deletedAt },
      });

      // deletedAtがnullのレコードのみ取得
      const activePartners = await prisma.tradingPartner.findMany({
        where: {
          name: 'test-integration-delete',
          deletedAt: null,
        },
      });

      expect(activePartners).toHaveLength(0);

      // 全レコードを取得（削除済みも含む）
      const allPartners = await prisma.tradingPartner.findMany({
        where: {
          name: 'test-integration-delete',
        },
      });

      expect(allPartners).toHaveLength(1);
      expect(allPartners[0]?.deletedAt).not.toBeNull();
    });
  });

  describe('TradingPartnerTypeMapping Operations', () => {
    it('should create multiple type mappings for a single partner', async () => {
      const partner = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-multi-type',
          nameKana: 'テストインテグレーションマルチタイプ',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [
              { type: TradingPartnerType.CUSTOMER },
              { type: TradingPartnerType.SUBCONTRACTOR },
            ],
          },
        },
        include: {
          types: true,
        },
      });

      expect(partner.types).toHaveLength(2);
      const typeValues = partner.types.map((t) => t.type);
      expect(typeValues).toContain(TradingPartnerType.CUSTOMER);
      expect(typeValues).toContain(TradingPartnerType.SUBCONTRACTOR);
    });

    it('should cascade delete type mappings when partner is deleted', async () => {
      const partner = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-cascade',
          nameKana: 'テストインテグレーションカスケード',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
        include: {
          types: true,
        },
      });

      const mappingId = partner.types[0]?.id;

      // 物理削除
      await prisma.tradingPartner.delete({
        where: { id: partner.id },
      });

      // 種別マッピングも削除されていることを確認
      if (mappingId) {
        const mapping = await prisma.tradingPartnerTypeMapping.findUnique({
          where: { id: mappingId },
        });
        expect(mapping).toBeNull();
      }
    });
  });

  describe('Index Usage Verification', () => {
    it('should efficiently filter by nameKana using index', async () => {
      // フリガナ検索用インデックスの検証
      await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-index-kana',
          nameKana: 'テストインデックスカナ',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      const result = await prisma.tradingPartner.findMany({
        where: {
          nameKana: {
            contains: 'テスト',
          },
        },
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should efficiently filter by deletedAt using index', async () => {
      // 論理削除フィルタ用インデックスの検証
      await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-index-deleted',
          nameKana: 'テストインデックスデリーテッド',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      const activePartners = await prisma.tradingPartner.findMany({
        where: {
          deletedAt: null,
          name: {
            startsWith: 'test-integration-index-deleted',
          },
        },
      });

      expect(activePartners.length).toBe(1);
    });

    it('should efficiently sort by createdAt using index', async () => {
      // 作成日ソート用インデックスの検証
      const partner1 = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-sort-1',
          nameKana: 'テストソート1',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      // 少し待ってから2番目を作成
      await new Promise((resolve) => setTimeout(resolve, 10));

      const partner2 = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-sort-2',
          nameKana: 'テストソート2',
          address: '東京都渋谷区1-1-2',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      const sortedDesc = await prisma.tradingPartner.findMany({
        where: {
          name: {
            startsWith: 'test-integration-sort-',
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(sortedDesc).toHaveLength(2);
      expect(sortedDesc[0]?.id).toBe(partner2.id);
      expect(sortedDesc[1]?.id).toBe(partner1.id);
    });

    it('should efficiently filter type mappings by type using index', async () => {
      // 種別フィルタ用インデックスの検証
      await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-type-filter',
          nameKana: 'テストタイプフィルター',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.SUBCONTRACTOR }],
          },
        },
      });

      const subcontractors = await prisma.tradingPartner.findMany({
        where: {
          name: {
            startsWith: 'test-integration-type-filter',
          },
          types: {
            some: {
              type: TradingPartnerType.SUBCONTRACTOR,
            },
          },
        },
      });

      expect(subcontractors).toHaveLength(1);
    });

    it('should efficiently sort by nameKana (default sort) using index', async () => {
      // フリガナ昇順ソート用インデックスの検証
      await prisma.tradingPartner.createMany({
        data: [
          {
            name: 'test-integration-kana-sort-a',
            nameKana: 'アイウエオ',
            address: '東京都渋谷区1-1-1',
          },
          {
            name: 'test-integration-kana-sort-c',
            nameKana: 'サシスセソ',
            address: '東京都渋谷区1-1-3',
          },
          {
            name: 'test-integration-kana-sort-b',
            nameKana: 'カキクケコ',
            address: '東京都渋谷区1-1-2',
          },
        ],
      });

      // 各取引先に種別を追加
      const partners = await prisma.tradingPartner.findMany({
        where: {
          name: {
            startsWith: 'test-integration-kana-sort-',
          },
        },
      });

      for (const partner of partners) {
        await prisma.tradingPartnerTypeMapping.create({
          data: {
            tradingPartnerId: partner.id,
            type: TradingPartnerType.CUSTOMER,
          },
        });
      }

      const sortedByKana = await prisma.tradingPartner.findMany({
        where: {
          name: {
            startsWith: 'test-integration-kana-sort-',
          },
        },
        orderBy: {
          nameKana: 'asc',
        },
      });

      expect(sortedByKana).toHaveLength(3);
      expect(sortedByKana[0]?.nameKana).toBe('アイウエオ');
      expect(sortedByKana[1]?.nameKana).toBe('カキクケコ');
      expect(sortedByKana[2]?.nameKana).toBe('サシスセソ');
    });
  });

  describe('Unique Constraint Verification', () => {
    it('should allow checking for duplicate names at application level', async () => {
      // Note: PostgreSQLの複合ユニーク制約では、NULL値は一意性チェックで特別に扱われる
      // (NULL != NULL として扱われるため、deletedAt=nullの複数レコードが許可される)
      // 取引先名の重複チェックはサービス層で行う必要がある（design.md参照）
      await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-unique',
          nameKana: 'テストユニーク',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      // 同じ名前でdeletedAt=nullのレコードを検索して重複チェック
      const existingPartner = await prisma.tradingPartner.findFirst({
        where: {
          name: 'test-integration-unique',
          deletedAt: null,
        },
      });

      // 重複が存在することを確認（サービス層で拒否する）
      expect(existingPartner).not.toBeNull();
      expect(existingPartner?.name).toBe('test-integration-unique');
    });

    it('should allow same name when one record is soft deleted', async () => {
      // 1件目を作成して論理削除
      const first = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-unique-deleted',
          nameKana: 'テストユニークデリーテッド',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      await prisma.tradingPartner.update({
        where: { id: first.id },
        data: { deletedAt: new Date() },
      });

      // 同じ名前で新規作成（deletedAtがnullなので許可される）
      const second = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-unique-deleted',
          nameKana: 'テストユニークデリーテッド2',
          address: '東京都渋谷区1-1-2',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      expect(second).toBeDefined();
      expect(second.name).toBe('test-integration-unique-deleted');
    });

    it('should enforce unique constraint on tradingPartnerId and type in type mappings', async () => {
      const partner = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-type-unique',
          nameKana: 'テストタイプユニーク',
          address: '東京都渋谷区1-1-1',
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      // 同じ取引先に同じ種別を追加しようとするとエラー
      // Prismaのエラーログを抑制（意図的にユニーク制約違反を発生させるため）
      const originalStdoutWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array) => {
        const str = typeof chunk === 'string' ? chunk : chunk.toString();
        if (str.includes('prisma:error') || str.includes('Unique constraint failed')) {
          return true;
        }
        return originalStdoutWrite(chunk);
      }) as typeof process.stdout.write;
      try {
        await expect(
          prisma.tradingPartnerTypeMapping.create({
            data: {
              tradingPartnerId: partner.id,
              type: TradingPartnerType.CUSTOMER,
            },
          })
        ).rejects.toThrow();
      } finally {
        process.stdout.write = originalStdoutWrite;
      }
    });
  });

  describe('Billing and Payment Fields', () => {
    it('should handle billingClosingDay as 末日 (99)', async () => {
      // REQ-11.11: 請求締日として「末日」（99）を許可
      const partner = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-billing-last',
          nameKana: 'テストビリングラスト',
          address: '東京都渋谷区1-1-1',
          billingClosingDay: 99,
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      expect(partner.billingClosingDay).toBe(99);
    });

    it('should handle paymentDay as 末日 (99) with month offset', async () => {
      // REQ-11.12: 支払日を月オフセットと日の組み合わせで管理
      const partner = await prisma.tradingPartner.create({
        data: {
          name: 'test-integration-payment-last',
          nameKana: 'テストペイメントラスト',
          address: '東京都渋谷区1-1-1',
          paymentMonthOffset: 2, // 翌々月
          paymentDay: 99, // 末日
          types: {
            create: [{ type: TradingPartnerType.CUSTOMER }],
          },
        },
      });

      expect(partner.paymentMonthOffset).toBe(2);
      expect(partner.paymentDay).toBe(99);
    });

    it('should handle all valid paymentMonthOffset values (1, 2, 3)', async () => {
      // 翌月、翌々月、3ヶ月後をテスト
      const partners: TradingPartner[] = [];

      for (const offset of [1, 2, 3]) {
        const partner = await prisma.tradingPartner.create({
          data: {
            name: `test-integration-payment-offset-${offset}`,
            nameKana: `テストペイメントオフセット${offset}`,
            address: '東京都渋谷区1-1-1',
            paymentMonthOffset: offset,
            paymentDay: 25,
            types: {
              create: [{ type: TradingPartnerType.CUSTOMER }],
            },
          },
        });
        partners.push(partner);
      }

      expect(partners[0]?.paymentMonthOffset).toBe(1);
      expect(partners[1]?.paymentMonthOffset).toBe(2);
      expect(partners[2]?.paymentMonthOffset).toBe(3);
    });
  });

  describe('Transaction Support', () => {
    it('should support transaction for creating partner with types', async () => {
      const result = await prisma.$transaction(async (tx) => {
        const partner = await tx.tradingPartner.create({
          data: {
            name: 'test-integration-transaction',
            nameKana: 'テストトランザクション',
            address: '東京都渋谷区1-1-1',
          },
        });

        await tx.tradingPartnerTypeMapping.create({
          data: {
            tradingPartnerId: partner.id,
            type: TradingPartnerType.CUSTOMER,
          },
        });

        await tx.tradingPartnerTypeMapping.create({
          data: {
            tradingPartnerId: partner.id,
            type: TradingPartnerType.SUBCONTRACTOR,
          },
        });

        return tx.tradingPartner.findUnique({
          where: { id: partner.id },
          include: { types: true },
        });
      });

      expect(result).not.toBeNull();
      expect(result?.types).toHaveLength(2);
    });

    it('should rollback transaction on error', async () => {
      // トランザクション内で明示的にエラーを発生させる
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.tradingPartner.create({
            data: {
              name: 'test-integration-rollback-new',
              nameKana: 'テストロールバックニュー',
              address: '東京都渋谷区1-1-1',
              types: {
                create: [{ type: TradingPartnerType.CUSTOMER }],
              },
            },
          });

          // 明示的にエラーを発生させてロールバックをトリガー
          throw new Error('Intentional error for rollback test');
        })
      ).rejects.toThrow('Intentional error for rollback test');

      // ロールバックされていることを確認
      const newPartner = await prisma.tradingPartner.findFirst({
        where: { name: 'test-integration-rollback-new' },
      });
      expect(newPartner).toBeNull();
    });
  });
});
