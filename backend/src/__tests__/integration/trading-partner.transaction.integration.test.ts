/**
 * @fileoverview データベーストランザクション統合テスト (Task 14.2)
 *
 * TDD Task 14.2: データベーストランザクションのテスト
 * - 取引先作成時の種別マッピング整合性テスト
 * - 更新・削除時のトランザクション整合性テスト
 *
 * Requirements (trading-partner-management):
 * - REQ-6.3: 取引先種別の複数選択を許可し、1つの取引先が「顧客」と「協力業者」の両方であることを可能とする
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { TradingPartnerType } from '../../generated/prisma/client.js';
import { TradingPartnerService } from '../../services/trading-partner.service.js';
import type { IAuditLogService } from '../../types/audit-log.types.js';
import type { CreateTradingPartnerInput } from '../../schemas/trading-partner.schema.js';
import {
  DuplicatePartnerNameError,
  TradingPartnerNotFoundError,
} from '../../errors/tradingPartnerError.js';

// 環境変数を初期化
validateEnv();

import getPrismaClient from '../../db.js';

describe('TradingPartner Transaction Integration Tests (Task 14.2)', () => {
  let prisma: PrismaClient;
  let service: TradingPartnerService;
  let mockAuditLogService: IAuditLogService;

  beforeAll(async () => {
    prisma = getPrismaClient();

    // モックの監査ログサービスを作成
    mockAuditLogService = {
      createLog: vi.fn().mockResolvedValue(undefined),
      getLogs: vi.fn().mockResolvedValue([]),
      exportLogs: vi.fn().mockResolvedValue('[]'),
    };

    service = new TradingPartnerService({
      prisma,
      auditLogService: mockAuditLogService,
    });
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-txn-',
          },
        },
      },
    });
    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-txn-',
        },
      },
    });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // 各テスト前にテストデータをクリーンアップ
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-txn-',
          },
        },
      },
    });
    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-txn-',
        },
      },
    });
  });

  describe('Create Transaction Integrity (REQ-6.3)', () => {
    it('should create trading partner with CUSTOMER type mapping in a single transaction', async () => {
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-create-customer',
        nameKana: 'テストトランザクションカスタマー',
        address: '東京都渋谷区1-1-1',
        types: [TradingPartnerType.CUSTOMER],
      };

      const result = await service.createPartner(input, 'test-actor-id');

      // 取引先が作成されたことを確認
      expect(result.id).toBeDefined();
      expect(result.name).toBe(input.name);
      expect(result.types).toHaveLength(1);
      expect(result.types).toContain(TradingPartnerType.CUSTOMER);

      // データベースから直接確認
      const partner = await prisma.tradingPartner.findUnique({
        where: { id: result.id },
        include: { types: true },
      });

      expect(partner).not.toBeNull();
      expect(partner?.types).toHaveLength(1);
      expect(partner?.types[0]?.type).toBe(TradingPartnerType.CUSTOMER);
    });

    it('should create trading partner with SUBCONTRACTOR type mapping in a single transaction', async () => {
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-create-subcontractor',
        nameKana: 'テストトランザクションサブコントラクター',
        address: '東京都渋谷区1-1-2',
        types: [TradingPartnerType.SUBCONTRACTOR],
      };

      const result = await service.createPartner(input, 'test-actor-id');

      expect(result.types).toHaveLength(1);
      expect(result.types).toContain(TradingPartnerType.SUBCONTRACTOR);

      // データベースから直接確認
      const partner = await prisma.tradingPartner.findUnique({
        where: { id: result.id },
        include: { types: true },
      });

      expect(partner?.types).toHaveLength(1);
      expect(partner?.types[0]?.type).toBe(TradingPartnerType.SUBCONTRACTOR);
    });

    it('should create trading partner with both CUSTOMER and SUBCONTRACTOR type mappings in a single transaction (REQ-6.3)', async () => {
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-create-both-types',
        nameKana: 'テストトランザクションボースタイプス',
        address: '東京都渋谷区1-1-3',
        types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR],
      };

      const result = await service.createPartner(input, 'test-actor-id');

      // 両方の種別が設定されていることを確認
      expect(result.types).toHaveLength(2);
      expect(result.types).toContain(TradingPartnerType.CUSTOMER);
      expect(result.types).toContain(TradingPartnerType.SUBCONTRACTOR);

      // データベースから直接確認
      const partner = await prisma.tradingPartner.findUnique({
        where: { id: result.id },
        include: { types: true },
      });

      expect(partner?.types).toHaveLength(2);
      const typeValues = partner?.types.map((t) => t.type) || [];
      expect(typeValues).toContain(TradingPartnerType.CUSTOMER);
      expect(typeValues).toContain(TradingPartnerType.SUBCONTRACTOR);
    });

    it('should rollback trading partner creation when type mapping fails', async () => {
      // 最初の取引先を作成
      const firstInput: CreateTradingPartnerInput = {
        name: 'test-txn-rollback-first',
        nameKana: 'テストロールバックファースト',
        address: '東京都渋谷区1-1-4',
        types: [TradingPartnerType.CUSTOMER],
      };

      await service.createPartner(firstInput, 'test-actor-id');

      // 同じ名前で2つ目を作成しようとするとエラー（重複チェックで失敗）
      const duplicateInput: CreateTradingPartnerInput = {
        name: 'test-txn-rollback-first', // 重複する名前
        nameKana: 'テストロールバックファースト2',
        address: '東京都渋谷区1-1-5',
        types: [TradingPartnerType.SUBCONTRACTOR],
      };

      await expect(service.createPartner(duplicateInput, 'test-actor-id')).rejects.toThrow(
        DuplicatePartnerNameError
      );

      // データベースから確認 - 重複した取引先は作成されていないことを確認
      const partners = await prisma.tradingPartner.findMany({
        where: {
          name: 'test-txn-rollback-first',
          deletedAt: null,
        },
      });

      expect(partners).toHaveLength(1); // 最初の1件のみ
    });

    it('should ensure type mapping integrity - no orphan mappings on failed creation', async () => {
      // 種別マッピングのみが作成されて取引先が作成されない状況は発生しないことを確認

      // 最初の取引先を作成
      const input1: CreateTradingPartnerInput = {
        name: 'test-txn-orphan-check',
        nameKana: 'テストオーファンチェック',
        address: '東京都渋谷区1-1-6',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input1, 'test-actor-id');

      // 作成後のマッピング数を取得
      const countAfterFirst = await prisma.tradingPartnerTypeMapping.count({
        where: { tradingPartnerId: created.id },
      });
      expect(countAfterFirst).toBe(1);

      // 重複エラーを発生させる（2件の種別を持つ取引先）
      const input2: CreateTradingPartnerInput = {
        name: 'test-txn-orphan-check', // 重複
        nameKana: 'テストオーファンチェック2',
        address: '東京都渋谷区1-1-7',
        types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR],
      };

      await expect(service.createPartner(input2, 'test-actor-id')).rejects.toThrow(
        DuplicatePartnerNameError
      );

      // 重複エラー後、最初の取引先のマッピング数は変わっていないことを確認
      const countAfterError = await prisma.tradingPartnerTypeMapping.count({
        where: { tradingPartnerId: created.id },
      });
      expect(countAfterError).toBe(1);

      // 重複名の取引先は作成されていないことを確認
      const partners = await prisma.tradingPartner.findMany({
        where: {
          name: 'test-txn-orphan-check',
          deletedAt: null,
        },
        include: { types: true },
      });

      expect(partners).toHaveLength(1);
      expect(partners[0]?.types).toHaveLength(1);
    });
  });

  describe('Update Transaction Integrity (REQ-6.3)', () => {
    it('should update type mappings in a single transaction - change from CUSTOMER to SUBCONTRACTOR', async () => {
      // まず取引先を作成
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-update-type-change',
        nameKana: 'テストアップデートタイプチェンジ',
        address: '東京都渋谷区1-1-8',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input, 'test-actor-id');
      expect(created.types).toContain(TradingPartnerType.CUSTOMER);

      // 種別を変更
      const updated = await service.updatePartner(
        created.id,
        { types: [TradingPartnerType.SUBCONTRACTOR] },
        'test-actor-id',
        created.updatedAt
      );

      expect(updated.types).toHaveLength(1);
      expect(updated.types).toContain(TradingPartnerType.SUBCONTRACTOR);
      expect(updated.types).not.toContain(TradingPartnerType.CUSTOMER);

      // データベースから直接確認
      const partner = await prisma.tradingPartner.findUnique({
        where: { id: created.id },
        include: { types: true },
      });

      expect(partner?.types).toHaveLength(1);
      expect(partner?.types[0]?.type).toBe(TradingPartnerType.SUBCONTRACTOR);
    });

    it('should update type mappings in a single transaction - add SUBCONTRACTOR to existing CUSTOMER (REQ-6.3)', async () => {
      // まず取引先を作成（CUSTOMERのみ）
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-update-add-type',
        nameKana: 'テストアップデートアッドタイプ',
        address: '東京都渋谷区1-1-9',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input, 'test-actor-id');

      // SUBCONTRACTORを追加（CUSTOMERも維持）
      const updated = await service.updatePartner(
        created.id,
        { types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR] },
        'test-actor-id',
        created.updatedAt
      );

      expect(updated.types).toHaveLength(2);
      expect(updated.types).toContain(TradingPartnerType.CUSTOMER);
      expect(updated.types).toContain(TradingPartnerType.SUBCONTRACTOR);

      // データベースから直接確認
      const partner = await prisma.tradingPartner.findUnique({
        where: { id: created.id },
        include: { types: true },
      });

      expect(partner?.types).toHaveLength(2);
    });

    it('should update type mappings in a single transaction - remove CUSTOMER from both types (REQ-6.3)', async () => {
      // まず取引先を作成（両方の種別）
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-update-remove-type',
        nameKana: 'テストアップデートリムーブタイプ',
        address: '東京都渋谷区1-1-10',
        types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR],
      };

      const created = await service.createPartner(input, 'test-actor-id');
      expect(created.types).toHaveLength(2);

      // CUSTOMERを削除（SUBCONTRACTORのみに）
      const updated = await service.updatePartner(
        created.id,
        { types: [TradingPartnerType.SUBCONTRACTOR] },
        'test-actor-id',
        created.updatedAt
      );

      expect(updated.types).toHaveLength(1);
      expect(updated.types).toContain(TradingPartnerType.SUBCONTRACTOR);
      expect(updated.types).not.toContain(TradingPartnerType.CUSTOMER);

      // データベースから直接確認
      const partner = await prisma.tradingPartner.findUnique({
        where: { id: created.id },
        include: { types: true },
      });

      expect(partner?.types).toHaveLength(1);
      expect(partner?.types[0]?.type).toBe(TradingPartnerType.SUBCONTRACTOR);
    });

    it('should rollback all changes when update fails due to duplicate name', async () => {
      // 2つの取引先を作成
      const input1: CreateTradingPartnerInput = {
        name: 'test-txn-update-rollback-1',
        nameKana: 'テストアップデートロールバック1',
        address: '東京都渋谷区1-1-11',
        types: [TradingPartnerType.CUSTOMER],
      };

      const input2: CreateTradingPartnerInput = {
        name: 'test-txn-update-rollback-2',
        nameKana: 'テストアップデートロールバック2',
        address: '東京都渋谷区1-1-12',
        types: [TradingPartnerType.SUBCONTRACTOR],
      };

      // partner1は重複チェックのために作成。変数自体は使用しないが存在が必要
      await service.createPartner(input1, 'test-actor-id');
      const partner2 = await service.createPartner(input2, 'test-actor-id');

      // partner2の名前をpartner1と同じに変更しようとする → 重複エラー
      await expect(
        service.updatePartner(
          partner2.id,
          { name: 'test-txn-update-rollback-1' },
          'test-actor-id',
          partner2.updatedAt
        )
      ).rejects.toThrow(DuplicatePartnerNameError);

      // partner2は元のままであることを確認
      const unchanged = await prisma.tradingPartner.findUnique({
        where: { id: partner2.id },
        include: { types: true },
      });

      expect(unchanged?.name).toBe('test-txn-update-rollback-2');
      expect(unchanged?.types).toHaveLength(1);
      expect(unchanged?.types[0]?.type).toBe(TradingPartnerType.SUBCONTRACTOR);
    });

    it('should maintain type mapping consistency when updating other fields', async () => {
      // 取引先を作成（両方の種別）
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-update-other-fields',
        nameKana: 'テストアップデートアザーフィールズ',
        address: '東京都渋谷区1-1-13',
        types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR],
      };

      const created = await service.createPartner(input, 'test-actor-id');

      // 種別以外のフィールドを更新
      const updated = await service.updatePartner(
        created.id,
        {
          branchName: '新宿支店',
          phoneNumber: '03-1234-5678',
        },
        'test-actor-id',
        created.updatedAt
      );

      // 種別は変更されていないことを確認
      expect(updated.types).toHaveLength(2);
      expect(updated.types).toContain(TradingPartnerType.CUSTOMER);
      expect(updated.types).toContain(TradingPartnerType.SUBCONTRACTOR);

      // 他のフィールドが更新されていることを確認
      expect(updated.branchName).toBe('新宿支店');
      expect(updated.phoneNumber).toBe('03-1234-5678');
    });
  });

  describe('Delete Transaction Integrity', () => {
    it('should not leave orphan type mappings after soft delete', async () => {
      // 取引先を作成
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-delete-orphan',
        nameKana: 'テストデリートオーファン',
        address: '東京都渋谷区1-1-14',
        types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR],
      };

      const created = await service.createPartner(input, 'test-actor-id');

      // 論理削除
      await service.deletePartner(created.id, 'test-actor-id');

      // 取引先が論理削除されていることを確認
      const deleted = await prisma.tradingPartner.findUnique({
        where: { id: created.id },
      });

      expect(deleted?.deletedAt).not.toBeNull();

      // 種別マッピングは物理削除されていないことを確認（論理削除なので残る）
      const mappings = await prisma.tradingPartnerTypeMapping.findMany({
        where: { tradingPartnerId: created.id },
      });

      expect(mappings).toHaveLength(2);
    });

    it('should not delete when partner is not found', async () => {
      await expect(service.deletePartner('non-existent-id', 'test-actor-id')).rejects.toThrow(
        TradingPartnerNotFoundError
      );
    });

    it('should not delete already soft-deleted partner', async () => {
      // 取引先を作成して論理削除
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-delete-already-deleted',
        nameKana: 'テストデリートオールレディデリーテッド',
        address: '東京都渋谷区1-1-15',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input, 'test-actor-id');
      await service.deletePartner(created.id, 'test-actor-id');

      // 再度削除しようとするとエラー
      await expect(service.deletePartner(created.id, 'test-actor-id')).rejects.toThrow(
        TradingPartnerNotFoundError
      );
    });
  });

  describe('Concurrent Transaction Handling', () => {
    it('should ensure database consistency when creating partners with same name sequentially', async () => {
      // 順次実行で同じ名前の作成を試みる（データベース一貫性テスト）
      const input1: CreateTradingPartnerInput = {
        name: 'test-txn-sequential-create',
        nameKana: 'テストシーケンシャルクリエイト1',
        address: '東京都渋谷区1-1-16',
        types: [TradingPartnerType.CUSTOMER],
      };

      // 1件目は成功
      const created = await service.createPartner(input1, 'test-actor-1');
      expect(created.id).toBeDefined();

      // 2件目は重複エラー
      const input2: CreateTradingPartnerInput = {
        name: 'test-txn-sequential-create', // 同じ名前
        nameKana: 'テストシーケンシャルクリエイト2',
        address: '東京都渋谷区1-1-17',
        types: [TradingPartnerType.SUBCONTRACTOR],
      };

      await expect(service.createPartner(input2, 'test-actor-2')).rejects.toThrow(
        DuplicatePartnerNameError
      );

      // データベースには1件だけ存在
      const partners = await prisma.tradingPartner.findMany({
        where: {
          name: 'test-txn-sequential-create',
          deletedAt: null,
        },
      });

      expect(partners).toHaveLength(1);
      expect(partners[0]?.id).toBe(created.id);
    });

    it('should reject update with stale updatedAt via optimistic locking', async () => {
      // 取引先を作成
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-optimistic-lock',
        nameKana: 'テストオプティミスティックロック',
        address: '東京都渋谷区1-1-18',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input, 'test-actor-id');

      // 明示的に古いupdatedAtを作成（1秒前）
      const staleUpdatedAt = new Date(created.updatedAt.getTime() - 1000);

      // 古いupdatedAtを使用して更新しようとするとエラー
      await expect(
        service.updatePartner(
          created.id,
          { types: [TradingPartnerType.SUBCONTRACTOR] },
          'test-actor-1',
          staleUpdatedAt // 明示的に古いupdatedAt
        )
      ).rejects.toThrow();

      // データベースの状態は変更されていないことを確認
      const unchanged = await prisma.tradingPartner.findUnique({
        where: { id: created.id },
        include: { types: true },
      });

      expect(unchanged?.types).toHaveLength(1);
      expect(unchanged?.types[0]?.type).toBe(TradingPartnerType.CUSTOMER);
    });

    it('should allow update with fresh updatedAt after another update', async () => {
      // 取引先を作成
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-fresh-update',
        nameKana: 'テストフレッシュアップデート',
        address: '東京都渋谷区1-1-19',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input, 'test-actor-id');

      // 最初の更新
      const updated1 = await service.updatePartner(
        created.id,
        { branchName: '新宿支店' },
        'test-actor-1',
        created.updatedAt
      );

      // 2番目の更新 - 新しいupdatedAtを使用（成功するはず）
      const updated2 = await service.updatePartner(
        created.id,
        { types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR] },
        'test-actor-2',
        updated1.updatedAt // 新しいupdatedAt
      );

      expect(updated2.types).toHaveLength(2);
      expect(updated2.branchName).toBe('新宿支店');
    });
  });

  describe('Audit Log Integration within Transaction', () => {
    it('should record audit log within create transaction', async () => {
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-audit-create',
        nameKana: 'テストオーディットクリエイト',
        address: '東京都渋谷区1-1-20',
        types: [TradingPartnerType.CUSTOMER, TradingPartnerType.SUBCONTRACTOR],
      };

      await service.createPartner(input, 'test-actor-id');

      // 監査ログが記録されたことを確認
      expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TRADING_PARTNER_CREATED',
          actorId: 'test-actor-id',
        })
      );
    });

    it('should record audit log within update transaction', async () => {
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-audit-update',
        nameKana: 'テストオーディットアップデート',
        address: '東京都渋谷区1-1-21',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input, 'test-actor-id');
      vi.clearAllMocks();

      await service.updatePartner(
        created.id,
        { types: [TradingPartnerType.SUBCONTRACTOR] },
        'test-actor-id',
        created.updatedAt
      );

      // 監査ログが記録されたことを確認
      expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TRADING_PARTNER_UPDATED',
          actorId: 'test-actor-id',
        })
      );
    });

    it('should record audit log within delete transaction', async () => {
      const input: CreateTradingPartnerInput = {
        name: 'test-txn-audit-delete',
        nameKana: 'テストオーディットデリート',
        address: '東京都渋谷区1-1-22',
        types: [TradingPartnerType.CUSTOMER],
      };

      const created = await service.createPartner(input, 'test-actor-id');
      vi.clearAllMocks();

      await service.deletePartner(created.id, 'test-actor-id');

      // 監査ログが記録されたことを確認
      expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TRADING_PARTNER_DELETED',
          actorId: 'test-actor-id',
        })
      );
    });
  });
});
