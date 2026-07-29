/**
 * @fileoverview 工事看板スキーマのユニットテスト
 *
 * TDD: RED phase - テストを先に書く（実装より先に失敗を確認する）
 *
 * Requirements:
 * - 8.3: ラベルと値の組からなる任意数の自由項目行を保持する
 * - 8.4: 下部記入欄の固定テキスト（複数行を許容）を保持する
 */

import { describe, it, expect } from 'vitest';
import {
  createConstructionSignboardSchema,
  updateConstructionSignboardSchema,
  signboardFreeItemSchema,
  SIGNBOARD_WORK_NAME_MAX_LENGTH,
  SIGNBOARD_WORK_LOCATION_MAX_LENGTH,
  SIGNBOARD_FREE_ITEM_LABEL_MAX_LENGTH,
  SIGNBOARD_FREE_ITEM_VALUE_MAX_LENGTH,
  SIGNBOARD_FREE_ITEMS_MAX,
  SIGNBOARD_FOOTER_TEXT_MAX_LENGTH,
} from '../../../schemas/construction-signboard.schema.js';

// ================================================================
// 定数
// ================================================================
describe('工事看板の長さ制限定数', () => {
  it('自由項目の最大行数が定義されていること (8.3)', () => {
    expect(SIGNBOARD_FREE_ITEMS_MAX).toBe(20);
  });
  it('固定テキストの最大長が定義されていること (8.4)', () => {
    expect(SIGNBOARD_FOOTER_TEXT_MAX_LENGTH).toBe(2000);
  });
  it('標準項目の値の最大長が定義されていること', () => {
    expect(SIGNBOARD_WORK_NAME_MAX_LENGTH).toBe(200);
    expect(SIGNBOARD_WORK_LOCATION_MAX_LENGTH).toBe(200);
  });
  it('自由項目のラベル・値の最大長が定義されていること', () => {
    expect(SIGNBOARD_FREE_ITEM_LABEL_MAX_LENGTH).toBe(50);
    expect(SIGNBOARD_FREE_ITEM_VALUE_MAX_LENGTH).toBe(200);
  });
});

// ================================================================
// signboardFreeItemSchema
// ================================================================
describe('signboardFreeItemSchema', () => {
  it('ラベルと値で成功すること', () => {
    const result = signboardFreeItemSchema.safeParse({ label: '天候', value: '晴れ' });
    expect(result.success).toBe(true);
  });

  it('ラベルが上限超過で失敗すること', () => {
    const result = signboardFreeItemSchema.safeParse({
      label: 'あ'.repeat(SIGNBOARD_FREE_ITEM_LABEL_MAX_LENGTH + 1),
      value: 'v',
    });
    expect(result.success).toBe(false);
  });

  it('値が上限超過で失敗すること', () => {
    const result = signboardFreeItemSchema.safeParse({
      label: 'l',
      value: 'あ'.repeat(SIGNBOARD_FREE_ITEM_VALUE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('ラベルが空文字で失敗すること', () => {
    const result = signboardFreeItemSchema.safeParse({ label: '', value: 'v' });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// createConstructionSignboardSchema
// ================================================================
describe('createConstructionSignboardSchema', () => {
  it('標準項目のみで成功すること（freeItems 既定 []）', () => {
    const result = createConstructionSignboardSchema.safeParse({
      workName: '○○新築工事',
      workLocation: '東京都',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.freeItems).toEqual([]);
    }
  });

  it('自由項目・固定テキスト込みで成功すること', () => {
    const result = createConstructionSignboardSchema.safeParse({
      workName: '工事件名',
      workLocation: '工事場所',
      freeItems: [
        { label: '天候', value: '晴れ' },
        { label: '施工者', value: '△△建設' },
      ],
      footerText: '状況\n摘要',
    });
    expect(result.success).toBe(true);
  });

  it('workName が空文字で失敗すること', () => {
    const result = createConstructionSignboardSchema.safeParse({
      workName: '',
      workLocation: '東京都',
    });
    expect(result.success).toBe(false);
  });

  it('workName が上限超過で失敗すること', () => {
    const result = createConstructionSignboardSchema.safeParse({
      workName: 'あ'.repeat(SIGNBOARD_WORK_NAME_MAX_LENGTH + 1),
      workLocation: '東京都',
    });
    expect(result.success).toBe(false);
  });

  it('workLocation が上限超過で失敗すること', () => {
    const result = createConstructionSignboardSchema.safeParse({
      workName: '工事件名',
      workLocation: 'あ'.repeat(SIGNBOARD_WORK_LOCATION_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('freeItems が上限行数を超えて失敗すること (8.3)', () => {
    const freeItems = Array.from({ length: SIGNBOARD_FREE_ITEMS_MAX + 1 }, () => ({
      label: 'l',
      value: 'v',
    }));
    const result = createConstructionSignboardSchema.safeParse({
      workName: '工事件名',
      workLocation: '東京都',
      freeItems,
    });
    expect(result.success).toBe(false);
  });

  it('freeItems が上限行数ちょうどは成功すること (8.3 境界)', () => {
    const freeItems = Array.from({ length: SIGNBOARD_FREE_ITEMS_MAX }, () => ({
      label: 'l',
      value: 'v',
    }));
    const result = createConstructionSignboardSchema.safeParse({
      workName: '工事件名',
      workLocation: '東京都',
      freeItems,
    });
    expect(result.success).toBe(true);
  });

  it('footerText が上限超過で失敗すること (8.4)', () => {
    const result = createConstructionSignboardSchema.safeParse({
      workName: '工事件名',
      workLocation: '東京都',
      footerText: 'x'.repeat(SIGNBOARD_FOOTER_TEXT_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('footerText を null にできること', () => {
    const result = createConstructionSignboardSchema.safeParse({
      workName: '工事件名',
      workLocation: '東京都',
      footerText: null,
    });
    expect(result.success).toBe(true);
  });
});

// ================================================================
// updateConstructionSignboardSchema（楽観排他）
// ================================================================
describe('updateConstructionSignboardSchema', () => {
  it('updatedAt 付きで成功すること', () => {
    const result = updateConstructionSignboardSchema.safeParse({
      workName: '更新後',
      updatedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('updatedAt が無い場合に失敗すること（楽観排他必須）', () => {
    const result = updateConstructionSignboardSchema.safeParse({ workName: '更新後' });
    expect(result.success).toBe(false);
  });

  it('footerText 上限超過で失敗すること', () => {
    const result = updateConstructionSignboardSchema.safeParse({
      footerText: 'x'.repeat(SIGNBOARD_FOOTER_TEXT_MAX_LENGTH + 1),
      updatedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-8.4
 */
