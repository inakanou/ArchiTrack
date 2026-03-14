/**
 * @fileoverview ScheduleService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.1: 工程表一覧取得
 * - 1.3: 工程表作成
 * - 1.4: 工程表詳細取得
 * - 1.5: 工程表削除
 * - 2.2: 数量表なしで空の工程表作成
 * - 2.3: 数量表指定時の項目自動取得
 * - 3.1: バルク保存（新規追加・更新・差分削除）
 * - 5.3: 並び順の永続化
 * - 9.2: 出力対象チェックボックスの初期値ON
 * - 9.5: 出力設定の永続化
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ScheduleService,
  type ScheduleServiceDependencies,
} from '../../../services/schedule.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ScheduleNotFoundError,
  ScheduleConflictError,
  ScheduleValidationError,
} from '../../../errors/scheduleError.js';

// Prismaモック
function createMockPrisma() {
  return {
    constructionSchedule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    scheduleItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    quantityTable: {
      findUnique: vi.fn(),
    },
    quantityItem: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        constructionSchedule: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
        },
        scheduleItem: {
          createMany: vi.fn(),
          deleteMany: vi.fn(),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
}

// テスト用サンプルデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const scheduleId = '550e8400-e29b-41d4-a716-446655440010';
const quantityTableId = '550e8400-e29b-41d4-a716-446655440020';
const itemId1 = '550e8400-e29b-41d4-a716-446655440031';
const itemId2 = '550e8400-e29b-41d4-a716-446655440032';
const quantityItemId1 = '550e8400-e29b-41d4-a716-446655440041';
const quantityItemId2 = '550e8400-e29b-41d4-a716-446655440042';

const mockScheduleRecord = {
  id: scheduleId,
  projectId,
  name: 'テスト工程表',
  quantityTableId: null,
  version: 0,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
  deletedAt: null,
  items: [],
  quantityTable: null,
};

const mockScheduleRecordWithItems = {
  ...mockScheduleRecord,
  items: [
    {
      id: itemId1,
      scheduleId,
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '基礎工事',
      labelText: '基礎',
      detailText: 'コンクリート打設',
      startDate: new Date('2026-04-01'),
      duration: 10,
      displayOrder: 0,
      isExportTarget: true,
      createdAt: new Date('2026-03-01'),
      updatedAt: new Date('2026-03-01'),
    },
    {
      id: itemId2,
      scheduleId,
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '鉄骨工事',
      labelText: '鉄骨',
      detailText: '組立',
      startDate: new Date('2026-04-15'),
      duration: 20,
      displayOrder: 1,
      isExportTarget: true,
      createdAt: new Date('2026-03-01'),
      updatedAt: new Date('2026-03-01'),
    },
  ],
};

const mockListRecord = {
  id: scheduleId,
  name: 'テスト工程表',
  quantityTable: { name: 'テスト数量表' },
  _count: { items: 5 },
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
  deletedAt: null,
};

describe('ScheduleService', () => {
  let service: ScheduleService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const deps: ScheduleServiceDependencies = {
      prisma: mockPrisma,
    };
    service = new ScheduleService(deps);
  });

  // ===== Task 3.1: 工程表のCRUD操作 =====

  describe('findByProject', () => {
    it('プロジェクトの工程表一覧を取得できること', async () => {
      const mockSchedules = [mockListRecord];
      (mockPrisma.constructionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSchedules
      );
      (mockPrisma.constructionSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await service.findByProject(projectId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.schedules).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.schedules[0]!.id).toBe(scheduleId);
      expect(result.schedules[0]!.name).toBe('テスト工程表');
      expect(result.schedules[0]!.quantityTableName).toBe('テスト数量表');
      expect(result.schedules[0]!.itemCount).toBe(5);
    });

    it('論理削除された工程表を除外すること', async () => {
      (mockPrisma.constructionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPrisma.constructionSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await service.findByProject(projectId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      const findManyCall = (mockPrisma.constructionSchedule.findMany as ReturnType<typeof vi.fn>)
        .mock.calls[0]?.[0];
      expect(findManyCall.where.deletedAt).toBeNull();
    });

    it('ページネーションが正しく適用されること', async () => {
      (mockPrisma.constructionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPrisma.constructionSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await service.findByProject(projectId, {
        page: 2,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      const findManyCall = (mockPrisma.constructionSchedule.findMany as ReturnType<typeof vi.fn>)
        .mock.calls[0]?.[0];
      expect(findManyCall.skip).toBe(10);
      expect(findManyCall.take).toBe(10);
    });

    it('quantityTableがnullの場合、quantityTableNameがnullになること', async () => {
      const recordNoQT = { ...mockListRecord, quantityTable: null };
      (mockPrisma.constructionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        recordNoQT,
      ]);
      (mockPrisma.constructionSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await service.findByProject(projectId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.schedules[0]!.quantityTableName).toBeNull();
    });

    it('日付が文字列の場合も正しく変換されること', async () => {
      const stringDateRecord = {
        ...mockListRecord,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      };
      (mockPrisma.constructionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        stringDateRecord,
      ]);
      (mockPrisma.constructionSchedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await service.findByProject(projectId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.schedules[0]!.createdAt).toBe('2026-03-01T00:00:00.000Z');
      expect(result.schedules[0]!.updatedAt).toBe('2026-03-01T00:00:00.000Z');
    });
  });

  describe('findById', () => {
    it('工程表詳細を取得できること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockScheduleRecordWithItems
      );

      const result = await service.findById(scheduleId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(scheduleId);
      expect(result!.name).toBe('テスト工程表');
      expect(result!.items).toHaveLength(2);
    });

    it('項目がdisplayOrder順で返されること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockScheduleRecordWithItems
      );

      const result = await service.findById(scheduleId);

      expect(result!.items[0]!.displayOrder).toBe(0);
      expect(result!.items[1]!.displayOrder).toBe(1);
    });

    it('論理削除された工程表はnullを返すこと', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        deletedAt: new Date(),
      });

      const result = await service.findById(scheduleId);

      expect(result).toBeNull();
    });

    it('存在しない工程表はnullを返すこと', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      const result = await service.findById(scheduleId);

      expect(result).toBeNull();
    });

    it('日付フィールドが正しく変換されること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockScheduleRecordWithItems
      );

      const result = await service.findById(scheduleId);

      expect(result!.items[0]!.startDate).toBe('2026-04-01');
    });

    it('startDateがnullの場合、nullのまま返されること', async () => {
      const recordWithNullDate = {
        ...mockScheduleRecord,
        items: [
          {
            id: itemId1,
            scheduleId,
            sourceType: 'MANUAL',
            sourceQuantityItemId: null,
            itemName: '未定の項目',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
            createdAt: new Date('2026-03-01'),
            updatedAt: new Date('2026-03-01'),
          },
        ],
      };
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        recordWithNullDate
      );

      const result = await service.findById(scheduleId);

      expect(result!.items[0]!.startDate).toBeNull();
      expect(result!.items[0]!.duration).toBeNull();
    });
  });

  describe('create', () => {
    it('数量表なしで空の工程表を作成できること', async () => {
      const createdRecord = {
        ...mockScheduleRecord,
        items: [],
        quantityTable: null,
      };
      (mockPrisma.constructionSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdRecord
      );
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdRecord
      );

      const result = await service.create(projectId, {
        name: 'テスト工程表',
        quantityTableId: null,
      });

      expect(result.id).toBe(scheduleId);
      expect(result.items).toHaveLength(0);
    });

    it('作成時にversionが0で初期化されること', async () => {
      const createdRecord = {
        ...mockScheduleRecord,
        items: [],
        quantityTable: null,
      };
      (mockPrisma.constructionSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdRecord
      );
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdRecord
      );

      await service.create(projectId, { name: 'テスト工程表', quantityTableId: null });

      const createCall = (mockPrisma.constructionSchedule.create as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(createCall.data.version).toBe(0);
    });
  });

  describe('update', () => {
    it('工程表の名称を更新できること', async () => {
      const updatedRecord = {
        ...mockScheduleRecordWithItems,
        name: '更新後の工程表',
        version: 1,
      };

      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockScheduleRecord
      );
      (mockPrisma.constructionSchedule.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        updatedRecord
      );

      const result = await service.update(scheduleId, {
        name: '更新後の工程表',
        version: 0,
      });

      expect(result.name).toBe('更新後の工程表');
    });

    it('存在しない工程表の更新はエラーになること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(service.update(scheduleId, { name: '更新', version: 0 })).rejects.toThrow(
        ScheduleNotFoundError
      );
    });

    it('versionが一致しない場合は競合エラーになること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        version: 2,
      });

      await expect(service.update(scheduleId, { name: '更新', version: 0 })).rejects.toThrow(
        ScheduleConflictError
      );
    });

    it('論理削除済みの工程表の更新はエラーになること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        deletedAt: new Date(),
      });

      await expect(service.update(scheduleId, { name: '更新', version: 0 })).rejects.toThrow(
        ScheduleNotFoundError
      );
    });

    it('更新時にversionがインクリメントされること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockScheduleRecord
      );
      (mockPrisma.constructionSchedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecordWithItems,
        version: 1,
      });

      await service.update(scheduleId, { name: '更新', version: 0 });

      const updateCall = (mockPrisma.constructionSchedule.update as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(updateCall.data.version).toEqual({ increment: 1 });
    });
  });

  describe('delete', () => {
    it('工程表を論理削除できること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockScheduleRecord
      );
      (mockPrisma.constructionSchedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        deletedAt: new Date(),
      });

      await expect(service.delete(scheduleId)).resolves.not.toThrow();
    });

    it('存在しない工程表の削除はエラーになること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(service.delete(scheduleId)).rejects.toThrow(ScheduleNotFoundError);
    });

    it('既に論理削除済みの工程表の削除はエラーになること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        deletedAt: new Date(),
      });

      await expect(service.delete(scheduleId)).rejects.toThrow(ScheduleNotFoundError);
    });
  });

  // ===== Task 3.2: 数量表連携による項目自動取得 =====

  describe('create（数量表連携）', () => {
    const mockQuantityItems = [
      {
        id: quantityItemId1,
        quantityGroupId: 'group-1',
        name: 'コンクリート工',
        displayOrder: 0,
        quantityGroup: { displayOrder: 0 },
      },
      {
        id: quantityItemId2,
        quantityGroupId: 'group-1',
        name: '鉄筋工',
        displayOrder: 1,
        quantityGroup: { displayOrder: 0 },
      },
    ];

    it('数量表指定時にQuantityItemからScheduleItemを生成すること', async () => {
      // 数量表の検証
      (mockPrisma.quantityTable.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: quantityTableId,
        projectId,
        deletedAt: null,
      });

      // 数量表項目の取得
      (mockPrisma.quantityItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockQuantityItems
      );

      // 工程表作成
      const createdSchedule = {
        ...mockScheduleRecord,
        quantityTableId,
        quantityTable: { name: 'テスト数量表' },
        items: [
          {
            id: itemId1,
            scheduleId,
            sourceType: 'QUANTITY_TABLE',
            sourceQuantityItemId: quantityItemId1,
            itemName: 'コンクリート工',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
            createdAt: new Date('2026-03-01'),
            updatedAt: new Date('2026-03-01'),
          },
          {
            id: itemId2,
            scheduleId,
            sourceType: 'QUANTITY_TABLE',
            sourceQuantityItemId: quantityItemId2,
            itemName: '鉄筋工',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 1,
            isExportTarget: true,
            createdAt: new Date('2026-03-01'),
            updatedAt: new Date('2026-03-01'),
          },
        ],
      };

      (mockPrisma.constructionSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSchedule
      );
      (mockPrisma.scheduleItem.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 2,
      });
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSchedule
      );

      const result = await service.create(projectId, {
        name: 'テスト工程表',
        quantityTableId,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.sourceType).toBe('QUANTITY_TABLE');
      expect(result.items[0]!.sourceQuantityItemId).toBe(quantityItemId1);
      expect(result.items[0]!.itemName).toBe('コンクリート工');
    });

    it('数量表項目のisExportTargetがtrueで初期化されること', async () => {
      (mockPrisma.quantityTable.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: quantityTableId,
        projectId,
        deletedAt: null,
      });
      (mockPrisma.quantityItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockQuantityItems
      );

      const createdSchedule = {
        ...mockScheduleRecord,
        quantityTableId,
        quantityTable: { name: 'テスト数量表' },
        items: [
          {
            id: itemId1,
            scheduleId,
            sourceType: 'QUANTITY_TABLE',
            sourceQuantityItemId: quantityItemId1,
            itemName: 'コンクリート工',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
            createdAt: new Date('2026-03-01'),
            updatedAt: new Date('2026-03-01'),
          },
        ],
      };

      (mockPrisma.constructionSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSchedule
      );
      (mockPrisma.scheduleItem.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      });
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSchedule
      );

      const result = await service.create(projectId, {
        name: 'テスト工程表',
        quantityTableId,
      });

      expect(result.items[0]!.isExportTarget).toBe(true);
    });

    it('数量表の項目順序（displayOrder）を保持してScheduleItemを生成すること', async () => {
      (mockPrisma.quantityTable.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: quantityTableId,
        projectId,
        deletedAt: null,
      });
      (mockPrisma.quantityItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockQuantityItems
      );

      const createdSchedule = {
        ...mockScheduleRecord,
        quantityTableId,
        quantityTable: { name: 'テスト数量表' },
        items: [
          {
            id: itemId1,
            scheduleId,
            sourceType: 'QUANTITY_TABLE',
            sourceQuantityItemId: quantityItemId1,
            itemName: 'コンクリート工',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
            createdAt: new Date('2026-03-01'),
            updatedAt: new Date('2026-03-01'),
          },
          {
            id: itemId2,
            scheduleId,
            sourceType: 'QUANTITY_TABLE',
            sourceQuantityItemId: quantityItemId2,
            itemName: '鉄筋工',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 1,
            isExportTarget: true,
            createdAt: new Date('2026-03-01'),
            updatedAt: new Date('2026-03-01'),
          },
        ],
      };

      (mockPrisma.constructionSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSchedule
      );
      (mockPrisma.scheduleItem.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 2,
      });
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSchedule
      );

      const result = await service.create(projectId, {
        name: 'テスト工程表',
        quantityTableId,
      });

      expect(result.items[0]!.displayOrder).toBe(0);
      expect(result.items[1]!.displayOrder).toBe(1);
    });

    it('指定された数量表が同一プロジェクトに属しない場合バリデーションエラーになること', async () => {
      (mockPrisma.quantityTable.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: quantityTableId,
        projectId: 'different-project-id',
        deletedAt: null,
      });

      await expect(
        service.create(projectId, {
          name: 'テスト工程表',
          quantityTableId,
        })
      ).rejects.toThrow(ScheduleValidationError);
    });

    it('存在しない数量表が指定された場合バリデーションエラーになること', async () => {
      (mockPrisma.quantityTable.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.create(projectId, {
          name: 'テスト工程表',
          quantityTableId,
        })
      ).rejects.toThrow(ScheduleValidationError);
    });

    it('論理削除された数量表が指定された場合バリデーションエラーになること', async () => {
      (mockPrisma.quantityTable.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: quantityTableId,
        projectId,
        deletedAt: new Date(),
      });

      await expect(
        service.create(projectId, {
          name: 'テスト工程表',
          quantityTableId,
        })
      ).rejects.toThrow(ScheduleValidationError);
    });
  });

  // ===== Task 3.3: バルク保存（全項目一括更新） =====

  describe('bulkSaveItems', () => {
    it('既存項目を更新できること', async () => {
      // 既存レコードの取得
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecordWithItems,
        version: 0,
      });

      // $transactionの設定
      const txMock = {
        scheduleItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          create: vi.fn().mockImplementation((args: { data: { itemName: string } }) =>
            Promise.resolve({
              id: args.data.itemName === '基礎工事更新' ? itemId1 : itemId2,
              ...args.data,
            })
          ),
        },
        constructionSchedule: {
          update: vi.fn().mockResolvedValue({
            ...mockScheduleRecord,
            version: 1,
            updatedAt: new Date('2026-03-02'),
          }),
        },
      };
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
      );

      const result = await service.bulkSaveItems(scheduleId, {
        version: 0,
        items: [
          {
            id: itemId1,
            itemName: '基礎工事更新',
            labelText: '基礎更新',
            detailText: '更新後詳細',
            startDate: '2026-04-01',
            duration: 15,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: itemId2,
            itemName: '鉄骨工事更新',
            labelText: '鉄骨更新',
            detailText: '更新後詳細2',
            startDate: '2026-04-20',
            duration: 25,
            displayOrder: 1,
            isExportTarget: false,
          },
        ],
      });

      expect(result.updatedItemCount).toBe(2);
      expect(result.updatedAt).toBeDefined();
    });

    it('id=nullの項目は新規作成されること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        items: [],
        version: 0,
      });

      const txMock = {
        scheduleItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({
            id: 'new-item-id',
            itemName: '新規項目',
          }),
        },
        constructionSchedule: {
          update: vi.fn().mockResolvedValue({
            ...mockScheduleRecord,
            version: 1,
            updatedAt: new Date('2026-03-02'),
          }),
        },
      };
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
      );

      const result = await service.bulkSaveItems(scheduleId, {
        version: 0,
        items: [
          {
            id: null,
            itemName: '新規項目',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      expect(result.updatedItemCount).toBe(1);
    });

    it('リクエストに含まれない既存項目は差分削除されること', async () => {
      // 既存に2つの項目があるが、リクエストには1つだけ
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecordWithItems,
        version: 0,
      });

      const txMock = {
        scheduleItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          create: vi.fn().mockResolvedValue({
            id: itemId1,
            itemName: '基礎工事',
          }),
        },
        constructionSchedule: {
          update: vi.fn().mockResolvedValue({
            ...mockScheduleRecord,
            version: 1,
            updatedAt: new Date('2026-03-02'),
          }),
        },
      };
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
      );

      const result = await service.bulkSaveItems(scheduleId, {
        version: 0,
        items: [
          {
            id: itemId1,
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '',
            startDate: '2026-04-01',
            duration: 10,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      // deleteManyが全既存項目を削除し、createで再作成
      expect(txMock.scheduleItem.deleteMany).toHaveBeenCalled();
      expect(result.updatedItemCount).toBe(1);
    });

    it('楽観的排他制御（version照合）が機能すること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        version: 5,
      });

      await expect(
        service.bulkSaveItems(scheduleId, {
          version: 0,
          items: [],
        })
      ).rejects.toThrow(ScheduleConflictError);
    });

    it('存在しない工程表のバルク保存はエラーになること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(
        service.bulkSaveItems(scheduleId, {
          version: 0,
          items: [],
        })
      ).rejects.toThrow(ScheduleNotFoundError);
    });

    it('論理削除済みの工程表のバルク保存はエラーになること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        deletedAt: new Date(),
      });

      await expect(
        service.bulkSaveItems(scheduleId, {
          version: 0,
          items: [],
        })
      ).rejects.toThrow(ScheduleNotFoundError);
    });

    it('トランザクション内でバッチ処理されること', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecord,
        items: [],
        version: 0,
      });

      const txMock = {
        scheduleItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({
            id: 'new-id',
            itemName: '項目1',
          }),
        },
        constructionSchedule: {
          update: vi.fn().mockResolvedValue({
            ...mockScheduleRecord,
            version: 1,
            updatedAt: new Date('2026-03-02'),
          }),
        },
      };
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
      );

      await service.bulkSaveItems(scheduleId, {
        version: 0,
        items: [
          {
            id: null,
            itemName: '項目1',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });

      // $transactionが呼ばれたことを確認
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('空の項目配列でバルク保存できること（全項目削除）', async () => {
      (mockPrisma.constructionSchedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockScheduleRecordWithItems,
        version: 0,
      });

      const txMock = {
        scheduleItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          create: vi.fn(),
        },
        constructionSchedule: {
          update: vi.fn().mockResolvedValue({
            ...mockScheduleRecord,
            version: 1,
            updatedAt: new Date('2026-03-02'),
          }),
        },
      };
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
      );

      const result = await service.bulkSaveItems(scheduleId, {
        version: 0,
        items: [],
      });

      expect(result.updatedItemCount).toBe(0);
      expect(txMock.scheduleItem.deleteMany).toHaveBeenCalled();
    });
  });
});
