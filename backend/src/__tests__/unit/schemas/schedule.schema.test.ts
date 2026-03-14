/**
 * @fileoverview 工程表スキーマのユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.3: 工程表保存（バリデーション）
 * - 1.6: 保存失敗時エラー表示
 * - 3.4: 着工日未入力バリデーション
 * - 3.5: 日数0以下バリデーション
 */

import { describe, it, expect } from 'vitest';
import {
  createScheduleSchema,
  updateScheduleSchema,
  bulkSaveScheduleItemsSchema,
  exportQuerySchema,
  scheduleListQuerySchema,
  SCHEDULE_VALIDATION_MESSAGES,
} from '../../../schemas/schedule.schema.js';

function getErrorMessages(result: {
  success: false;
  error: { issues: { message: string }[] };
}): string[] {
  return result.error.issues.map((issue) => issue.message);
}

// ================================================================
// createScheduleSchema テスト
// ================================================================
describe('createScheduleSchema', () => {
  describe('有効なデータのバリデーション', () => {
    it('nameのみ指定した場合にバリデーションが成功すること', () => {
      const result = createScheduleSchema.safeParse({ name: '工程表A' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('工程表A');
        expect(result.data.quantityTableId).toBeNull();
      }
    });

    it('nameとquantityTableIdを指定した場合にバリデーションが成功すること', () => {
      const result = createScheduleSchema.safeParse({
        name: '工程表B',
        quantityTableId: '550e8400-e29b-41d4-a716-446655440001',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantityTableId).toBe('550e8400-e29b-41d4-a716-446655440001');
      }
    });

    it('quantityTableIdがnullの場合にバリデーションが成功すること', () => {
      const result = createScheduleSchema.safeParse({
        name: '工程表C',
        quantityTableId: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantityTableId).toBeNull();
      }
    });
  });

  describe('name バリデーション', () => {
    it('nameが未指定の場合エラーになること', () => {
      const result = createScheduleSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('nameが空文字列の場合エラーになること', () => {
      const result = createScheduleSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.NAME_REQUIRED))).toBe(
          true
        );
      }
    });

    it('nameが1文字の場合にバリデーションが成功すること', () => {
      const result = createScheduleSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(true);
    });

    it('nameが200文字の場合にバリデーションが成功すること', () => {
      const result = createScheduleSchema.safeParse({ name: 'A'.repeat(200) });
      expect(result.success).toBe(true);
    });

    it('nameが201文字の場合エラーになること', () => {
      const result = createScheduleSchema.safeParse({ name: 'A'.repeat(201) });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.NAME_MAX_LENGTH))).toBe(
          true
        );
      }
    });
  });

  describe('quantityTableId バリデーション', () => {
    it('quantityTableIdが不正なUUIDの場合エラーになること', () => {
      const result = createScheduleSchema.safeParse({
        name: '工程表',
        quantityTableId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ================================================================
// updateScheduleSchema テスト
// ================================================================
describe('updateScheduleSchema', () => {
  const validUpdateData = {
    name: '更新された工程表',
    version: 1,
  };

  describe('有効なデータのバリデーション', () => {
    it('有効なデータでバリデーションが成功すること', () => {
      const result = updateScheduleSchema.safeParse(validUpdateData);
      expect(result.success).toBe(true);
    });
  });

  describe('name バリデーション', () => {
    it('nameが未指定の場合エラーになること', () => {
      const result = updateScheduleSchema.safeParse({ version: 1 });
      expect(result.success).toBe(false);
    });

    it('nameが空文字列の場合エラーになること', () => {
      const result = updateScheduleSchema.safeParse({ name: '', version: 1 });
      expect(result.success).toBe(false);
    });

    it('nameが201文字の場合エラーになること', () => {
      const result = updateScheduleSchema.safeParse({ name: 'A'.repeat(201), version: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('version バリデーション', () => {
    it('versionが未指定の場合エラーになること', () => {
      const result = updateScheduleSchema.safeParse({ name: '工程表' });
      expect(result.success).toBe(false);
    });

    it('versionが負の値の場合エラーになること', () => {
      const result = updateScheduleSchema.safeParse({ name: '工程表', version: -1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.VERSION_MIN))).toBe(
          true
        );
      }
    });

    it('versionが整数でない場合エラーになること', () => {
      const result = updateScheduleSchema.safeParse({ name: '工程表', version: 1.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.VERSION_INTEGER))).toBe(
          true
        );
      }
    });

    it('versionが0の場合にバリデーションが成功すること', () => {
      const result = updateScheduleSchema.safeParse({ name: '工程表', version: 0 });
      expect(result.success).toBe(true);
    });
  });
});

// ================================================================
// bulkSaveScheduleItemsSchema テスト
// ================================================================
describe('bulkSaveScheduleItemsSchema', () => {
  const validBulkSaveData = {
    version: 1,
    items: [
      {
        id: null,
        itemName: '基礎工事',
        labelText: 'ラベル',
        detailText: '詳細テキスト',
        startDate: '2026-04-01',
        duration: 10,
        displayOrder: 0,
        isExportTarget: true,
      },
    ],
  };

  describe('有効なデータのバリデーション', () => {
    it('有効なデータでバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse(validBulkSaveData);
      expect(result.success).toBe(true);
    });

    it('空のitems配列でバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 0,
        items: [],
      });
      expect(result.success).toBe(true);
    });

    it('複数項目でバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            itemName: '基礎工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
          {
            id: null,
            itemName: '鉄骨工事',
            labelText: 'S造',
            detailText: '鉄骨組立',
            startDate: '2026-05-01',
            duration: 20,
            displayOrder: 1,
            isExportTarget: false,
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('version バリデーション', () => {
    it('versionが未指定の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it('versionが負の値の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: -1,
        items: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('items.itemName バリデーション', () => {
    it('itemNameが空文字列の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.ITEM_NAME_REQUIRED))
        ).toBe(true);
      }
    });

    it('itemNameが500文字の場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: 'A'.repeat(500),
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('itemNameが501文字の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: 'A'.repeat(501),
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.ITEM_NAME_MAX_LENGTH))
        ).toBe(true);
      }
    });
  });

  describe('items.labelText バリデーション', () => {
    it('labelTextが200文字の場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: 'L'.repeat(200),
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('labelTextが201文字の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: 'L'.repeat(201),
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.LABEL_TEXT_MAX_LENGTH))
        ).toBe(true);
      }
    });
  });

  describe('items.detailText バリデーション', () => {
    it('detailTextが500文字の場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: 'D'.repeat(500),
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('detailTextが501文字の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: 'D'.repeat(501),
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.DETAIL_TEXT_MAX_LENGTH))
        ).toBe(true);
      }
    });
  });

  describe('items.startDate バリデーション', () => {
    it('startDateがnullの場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('startDateが有効なISO日付形式の場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('startDateが不正な日付形式の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: 'not-a-date',
            duration: 5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('items.duration バリデーション', () => {
    it('durationがnullの場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('durationが正の整数の場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 1,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('durationが0の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 0,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.DURATION_MIN))).toBe(
          true
        );
      }
    });

    it('durationが負の値の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: -5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('durationが小数の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: '2026-04-01',
            duration: 1.5,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.DURATION_INTEGER))
        ).toBe(true);
      }
    });
  });

  describe('items.displayOrder バリデーション', () => {
    it('displayOrderが0の場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('displayOrderが負の値の場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: -1,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.DISPLAY_ORDER_MIN))
        ).toBe(true);
      }
    });
  });

  describe('items.isExportTarget バリデーション', () => {
    it('isExportTargetがtrueの場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('isExportTargetがfalseの場合にバリデーションが成功すること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: false,
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('items.id バリデーション', () => {
    it('idがnullの場合にバリデーションが成功すること（新規作成）', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: null,
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('idが有効なUUIDの場合にバリデーションが成功すること（更新）', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('idが不正なUUIDの場合エラーになること', () => {
      const result = bulkSaveScheduleItemsSchema.safeParse({
        version: 1,
        items: [
          {
            id: 'invalid-uuid',
            itemName: '工事',
            labelText: '',
            detailText: '',
            startDate: null,
            duration: null,
            displayOrder: 0,
            isExportTarget: true,
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });
});

// ================================================================
// exportQuerySchema テスト
// ================================================================
describe('exportQuerySchema', () => {
  it('format=xlsxの場合にバリデーションが成功すること', () => {
    const result = exportQuerySchema.safeParse({ format: 'xlsx' });
    expect(result.success).toBe(true);
  });

  it('format=pdfの場合にバリデーションが成功すること', () => {
    const result = exportQuerySchema.safeParse({ format: 'pdf' });
    expect(result.success).toBe(true);
  });

  it('formatが未指定の場合エラーになること', () => {
    const result = exportQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('formatが無効な値の場合エラーになること', () => {
    const result = exportQuerySchema.safeParse({ format: 'csv' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = getErrorMessages(result);
      expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.FORMAT_INVALID))).toBe(
        true
      );
    }
  });
});

// ================================================================
// scheduleListQuerySchema テスト
// ================================================================
describe('scheduleListQuerySchema', () => {
  it('空オブジェクトでデフォルト値が設定されること', () => {
    const result = scheduleListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('有効なクエリパラメータでバリデーションが成功すること', () => {
    const result = scheduleListQuerySchema.safeParse({
      page: '2',
      limit: '10',
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
      expect(result.data.sortBy).toBe('name');
      expect(result.data.sortOrder).toBe('asc');
    }
  });

  it('sortByにupdatedAtを指定した場合にバリデーションが成功すること', () => {
    const result = scheduleListQuerySchema.safeParse({ sortBy: 'updatedAt' });
    expect(result.success).toBe(true);
  });

  it('pageが0の場合エラーになること', () => {
    const result = scheduleListQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = getErrorMessages(result);
      expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.PAGE_MIN))).toBe(true);
    }
  });

  it('limitが0の場合エラーになること', () => {
    const result = scheduleListQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = getErrorMessages(result);
      expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.LIMIT_MIN))).toBe(true);
    }
  });

  it('limitが101の場合エラーになること', () => {
    const result = scheduleListQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = getErrorMessages(result);
      expect(messages.some((m) => m.includes(SCHEDULE_VALIDATION_MESSAGES.LIMIT_MAX))).toBe(true);
    }
  });

  it('limitが100の場合にバリデーションが成功すること', () => {
    const result = scheduleListQuerySchema.safeParse({ limit: '100' });
    expect(result.success).toBe(true);
  });

  it('無効なsortByの場合エラーになること', () => {
    const result = scheduleListQuerySchema.safeParse({ sortBy: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('無効なsortOrderの場合エラーになること', () => {
    const result = scheduleListQuerySchema.safeParse({ sortOrder: 'invalid' });
    expect(result.success).toBe(false);
  });
});
