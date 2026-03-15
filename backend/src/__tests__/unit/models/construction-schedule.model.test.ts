/**
 * @fileoverview ConstructionSchedule（工程表）およびScheduleItem（工程表項目）モデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するConstructionSchedule・ScheduleItemモデルの型検証
 *
 * Requirements (construction-schedule):
 * - REQ-1.1: 工程表一覧表示
 * - REQ-1.3: 工程表保存
 * - REQ-2.3: 数量表指定時の項目自動取得
 * - REQ-3.1: 着工日入力欄
 * - REQ-3.2: 日数入力欄
 * - REQ-4.2: 任意項目の入力欄
 * - REQ-5.3: 並び順の永続化
 * - REQ-9.1: 出力対象チェックボックス表示
 * - REQ-9.2: チェックボックス初期値ON
 * - REQ-10.1: ラベル文字入力欄
 * - REQ-10.4: ラベル文字の永続化
 * - REQ-11.1: 詳細文字入力欄
 * - REQ-11.4: 詳細文字の永続化
 *
 * Task 1.1 Specification:
 * - ConstructionScheduleモデル: id, projectId, name, quantityTableId(nullable), version, createdAt, updatedAt, deletedAt
 * - ScheduleItemモデル: id, scheduleId, sourceType, sourceQuantityItemId(nullable), itemName, labelText, detailText, startDate, duration, displayOrder, isExportTarget
 * - ProjectモデルにconstructionSchedulesリレーションを追加
 * - QuantityTableモデルにconstructionSchedulesリレーションを追加
 * - QuantityItemモデルにscheduleItemsリレーションを追加
 * - 適切なインデックス（project_id, deleted_at, schedule_id, display_order）を設定
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';

describe('ConstructionSchedule Model Schema', () => {
  describe('ConstructionSchedule CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // REQ-1.3: 工程表保存 - 名称は必須
      const validInput: Prisma.ConstructionScheduleCreateInput = {
        name: 'テスト工程表',
        project: { connect: { id: 'project-id' } },
      };

      expect(validInput.name).toBe('テスト工程表');
      expect(validInput.project).toBeDefined();
    });

    it('should allow optional quantityTable relation', () => {
      // REQ-2.3: 数量表連携（任意）
      const input: Prisma.ConstructionScheduleCreateInput = {
        name: '工程表A',
        project: { connect: { id: 'project-id' } },
        quantityTable: { connect: { id: 'quantity-table-id' } },
      };

      expect(input.quantityTable).toBeDefined();
    });

    it('should allow creating without quantityTable', () => {
      // 数量表なしで作成可能
      const input: Prisma.ConstructionScheduleCreateInput = {
        name: '工程表B',
        project: { connect: { id: 'project-id' } },
      };

      expect(input.quantityTable).toBeUndefined();
    });

    it('should allow version field for optimistic locking', () => {
      // 楽観的排他制御
      const input: Prisma.ConstructionScheduleCreateInput = {
        name: '工程表C',
        version: 0,
        project: { connect: { id: 'project-id' } },
      };

      expect(input.version).toBe(0);
    });
  });

  describe('ConstructionSchedule fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.ConstructionScheduleSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have name field', () => {
      const select: Prisma.ConstructionScheduleSelect = { name: true };
      expect(select.name).toBe(true);
    });

    it('should have projectId field', () => {
      const select: Prisma.ConstructionScheduleSelect = { projectId: true };
      expect(select.projectId).toBe(true);
    });

    it('should have quantityTableId field', () => {
      const select: Prisma.ConstructionScheduleSelect = { quantityTableId: true };
      expect(select.quantityTableId).toBe(true);
    });

    it('should have version field', () => {
      const select: Prisma.ConstructionScheduleSelect = { version: true };
      expect(select.version).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.ConstructionScheduleSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // 論理削除
      const select: Prisma.ConstructionScheduleSelect = { deletedAt: true };
      expect(select.deletedAt).toBe(true);
    });
  });

  describe('ConstructionSchedule relations', () => {
    it('should have project relation', () => {
      const select: Prisma.ConstructionScheduleSelect = { project: true };
      expect(select.project).toBe(true);
    });

    it('should have quantityTable relation', () => {
      // REQ-2.3: 数量表リレーション
      const select: Prisma.ConstructionScheduleSelect = { quantityTable: true };
      expect(select.quantityTable).toBe(true);
    });

    it('should have items relation', () => {
      // 工程表項目リレーション
      const select: Prisma.ConstructionScheduleSelect = { items: true };
      expect(select.items).toBe(true);
    });
  });

  describe('ConstructionSchedule WhereInput for index-based queries', () => {
    it('should support filtering by projectId', () => {
      const where: Prisma.ConstructionScheduleWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBe('project-id');
    });

    it('should support filtering by deletedAt for soft delete', () => {
      const where: Prisma.ConstructionScheduleWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });
  });

  describe('ConstructionSchedule UpdateInput type structure', () => {
    it('should allow updating name', () => {
      const input: Prisma.ConstructionScheduleUpdateInput = {
        name: '更新後工程表名',
      };
      expect(input.name).toBe('更新後工程表名');
    });

    it('should allow updating version for optimistic locking', () => {
      const input: Prisma.ConstructionScheduleUpdateInput = {
        version: { increment: 1 },
      };
      expect(input.version).toBeDefined();
    });

    it('should allow soft delete via deletedAt', () => {
      const input: Prisma.ConstructionScheduleUpdateInput = {
        deletedAt: new Date(),
      };
      expect(input.deletedAt).toBeDefined();
    });
  });

  describe('ConstructionSchedule OrderBy for sorting', () => {
    it('should support sorting by createdAt', () => {
      const orderBy: Prisma.ConstructionScheduleOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      expect(orderBy.createdAt).toBe('desc');
    });

    it('should support sorting by updatedAt', () => {
      const orderBy: Prisma.ConstructionScheduleOrderByWithRelationInput = {
        updatedAt: 'desc',
      };
      expect(orderBy.updatedAt).toBe('desc');
    });

    it('should support sorting by name', () => {
      const orderBy: Prisma.ConstructionScheduleOrderByWithRelationInput = {
        name: 'asc',
      };
      expect(orderBy.name).toBe('asc');
    });
  });
});

describe('ScheduleItem Model Schema', () => {
  describe('ScheduleItem CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // REQ-4.2: 工程項目の入力
      const validInput: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(validInput.itemName).toBe('基礎工事');
      expect(validInput.schedule).toBeDefined();
    });

    it('should allow sourceType field with default MANUAL', () => {
      // sourceType: MANUAL or QUANTITY_TABLE
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        sourceType: 'MANUAL',
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.sourceType).toBe('MANUAL');
    });

    it('should allow QUANTITY_TABLE sourceType', () => {
      // REQ-2.3: 数量表由来の項目
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '鉄筋工事',
        sourceType: 'QUANTITY_TABLE',
        sourceQuantityItem: { connect: { id: 'quantity-item-id' } },
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.sourceType).toBe('QUANTITY_TABLE');
      expect(input.sourceQuantityItem).toBeDefined();
    });

    it('should allow labelText field', () => {
      // REQ-10.1: ラベル文字入力欄
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        labelText: '基礎',
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.labelText).toBe('基礎');
    });

    it('should allow detailText field', () => {
      // REQ-11.1: 詳細文字入力欄
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        detailText: 'コンクリート打設',
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.detailText).toBe('コンクリート打設');
    });

    it('should allow startDate field', () => {
      // REQ-3.1: 着工日入力欄
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        startDate: new Date('2026-04-01'),
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.startDate).toBeInstanceOf(Date);
    });

    it('should allow duration field', () => {
      // REQ-3.2: 日数入力欄
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        duration: 14,
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.duration).toBe(14);
    });

    it('should allow displayOrder field', () => {
      // REQ-5.3: 並び順の永続化
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        displayOrder: 0,
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.displayOrder).toBe(0);
    });

    it('should allow isExportTarget field', () => {
      // REQ-9.1: 出力対象チェックボックス
      // REQ-9.2: デフォルト値はtrue
      const input: Prisma.ScheduleItemCreateInput = {
        itemName: '基礎工事',
        isExportTarget: true,
        schedule: { connect: { id: 'schedule-id' } },
      };

      expect(input.isExportTarget).toBe(true);
    });
  });

  describe('ScheduleItem fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.ScheduleItemSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have scheduleId field', () => {
      const select: Prisma.ScheduleItemSelect = { scheduleId: true };
      expect(select.scheduleId).toBe(true);
    });

    it('should have sourceType field', () => {
      const select: Prisma.ScheduleItemSelect = { sourceType: true };
      expect(select.sourceType).toBe(true);
    });

    it('should have sourceQuantityItemId field', () => {
      const select: Prisma.ScheduleItemSelect = { sourceQuantityItemId: true };
      expect(select.sourceQuantityItemId).toBe(true);
    });

    it('should have itemName field', () => {
      const select: Prisma.ScheduleItemSelect = { itemName: true };
      expect(select.itemName).toBe(true);
    });

    it('should have labelText field', () => {
      // REQ-10.4: ラベル文字の永続化
      const select: Prisma.ScheduleItemSelect = { labelText: true };
      expect(select.labelText).toBe(true);
    });

    it('should have detailText field', () => {
      // REQ-11.4: 詳細文字の永続化
      const select: Prisma.ScheduleItemSelect = { detailText: true };
      expect(select.detailText).toBe(true);
    });

    it('should have startDate field', () => {
      // REQ-3.1: 着工日
      const select: Prisma.ScheduleItemSelect = { startDate: true };
      expect(select.startDate).toBe(true);
    });

    it('should have duration field', () => {
      // REQ-3.2: 日数
      const select: Prisma.ScheduleItemSelect = { duration: true };
      expect(select.duration).toBe(true);
    });

    it('should have displayOrder field', () => {
      // REQ-5.3: 並び順
      const select: Prisma.ScheduleItemSelect = { displayOrder: true };
      expect(select.displayOrder).toBe(true);
    });

    it('should have isExportTarget field', () => {
      // REQ-9.1: 出力対象
      const select: Prisma.ScheduleItemSelect = { isExportTarget: true };
      expect(select.isExportTarget).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.ScheduleItemSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });
  });

  describe('ScheduleItem relations', () => {
    it('should have schedule relation', () => {
      const select: Prisma.ScheduleItemSelect = { schedule: true };
      expect(select.schedule).toBe(true);
    });

    it('should have sourceQuantityItem relation', () => {
      // REQ-2.3: 数量表項目への参照
      const select: Prisma.ScheduleItemSelect = { sourceQuantityItem: true };
      expect(select.sourceQuantityItem).toBe(true);
    });
  });

  describe('ScheduleItem WhereInput for index-based queries', () => {
    it('should support filtering by scheduleId', () => {
      const where: Prisma.ScheduleItemWhereInput = {
        scheduleId: 'schedule-id',
      };
      expect(where.scheduleId).toBe('schedule-id');
    });

    it('should support filtering by scheduleId and displayOrder', () => {
      const where: Prisma.ScheduleItemWhereInput = {
        scheduleId: 'schedule-id',
        displayOrder: 0,
      };
      expect(where.scheduleId).toBe('schedule-id');
      expect(where.displayOrder).toBe(0);
    });
  });

  describe('ScheduleItem OrderBy for sorting', () => {
    it('should support sorting by displayOrder', () => {
      const orderBy: Prisma.ScheduleItemOrderByWithRelationInput = {
        displayOrder: 'asc',
      };
      expect(orderBy.displayOrder).toBe('asc');
    });
  });
});

describe('Existing models reverse relations', () => {
  it('should allow constructionSchedules relation in Project select', () => {
    // ProjectモデルへのconstructionSchedulesリレーション追加
    const select: Prisma.ProjectSelect = {
      constructionSchedules: true,
    };
    expect(select.constructionSchedules).toBe(true);
  });

  it('should allow constructionSchedules relation in QuantityTable select', () => {
    // QuantityTableモデルへのconstructionSchedulesリレーション追加
    const select: Prisma.QuantityTableSelect = {
      constructionSchedules: true,
    };
    expect(select.constructionSchedules).toBe(true);
  });

  it('should allow scheduleItems relation in QuantityItem select', () => {
    // QuantityItemモデルへのscheduleItemsリレーション追加
    const select: Prisma.QuantityItemSelect = {
      scheduleItems: true,
    };
    expect(select.scheduleItems).toBe(true);
  });
});
