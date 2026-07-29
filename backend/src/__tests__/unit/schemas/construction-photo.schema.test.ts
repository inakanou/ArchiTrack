/**
 * @fileoverview 工事写真スキーマのユニットテスト
 *
 * TDD: RED phase - テストを先に書く（実装より先に失敗を確認する）
 *
 * Requirements:
 * - 7.2: 写真項目のコメントは最大2000文字
 * - 12.1: 1リクエストの最大ファイル数は10件
 * - 12.2: 1ファイルあたりのサイズ上限は10MB
 * - 12.4: アップロードされたファイルが許可された画像形式であることを検証
 */

import { describe, it, expect } from 'vitest';
import {
  createConstructionPhotoAlbumSchema,
  updateConstructionPhotoAlbumSchema,
  constructionPhotoAlbumListQuerySchema,
  signboardPlacementSchema,
  updatePhotoMetadataBatchSchema,
  updatePhotoOrderSchema,
  addFromSurveyImagesSchema,
  uploadedImagesSchema,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_SIZE,
  COMMENT_MAX_LENGTH,
} from '../../../schemas/construction-photo.schema.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

// ================================================================
// 定数
// ================================================================
describe('工事写真アップロード制約の定数', () => {
  it('許可MIMEはJPEG/PNG/WEBPであること (12.4)', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
  it('最大ファイル数が10件であること (12.1)', () => {
    expect(MAX_UPLOAD_FILES).toBe(10);
  });
  it('最大ファイルサイズが10MBであること (12.2)', () => {
    expect(MAX_UPLOAD_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
  it('コメント上限が2000文字であること (7.2)', () => {
    expect(COMMENT_MAX_LENGTH).toBe(2000);
  });
});

// ================================================================
// createConstructionPhotoAlbumSchema
// ================================================================
describe('createConstructionPhotoAlbumSchema', () => {
  it('name のみで成功すること', () => {
    const result = createConstructionPhotoAlbumSchema.safeParse({ name: 'アルバムA' });
    expect(result.success).toBe(true);
  });

  it('name と memo で成功すること', () => {
    const result = createConstructionPhotoAlbumSchema.safeParse({
      name: 'アルバムB',
      memo: 'メモ',
    });
    expect(result.success).toBe(true);
  });

  it('name が空文字の場合に失敗すること', () => {
    const result = createConstructionPhotoAlbumSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('name が空白のみの場合に失敗すること', () => {
    const result = createConstructionPhotoAlbumSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('name が201文字で失敗すること', () => {
    const result = createConstructionPhotoAlbumSchema.safeParse({ name: 'あ'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('memo が2001文字で失敗すること', () => {
    const result = createConstructionPhotoAlbumSchema.safeParse({
      name: 'A',
      memo: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// updateConstructionPhotoAlbumSchema（楽観排他）
// ================================================================
describe('updateConstructionPhotoAlbumSchema', () => {
  it('updatedAt と name で成功すること', () => {
    const result = updateConstructionPhotoAlbumSchema.safeParse({
      name: '更新名',
      updatedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('updatedAt が無い場合に失敗すること（楽観排他必須）', () => {
    const result = updateConstructionPhotoAlbumSchema.safeParse({ name: '更新名' });
    expect(result.success).toBe(false);
  });

  it('updatedAt が不正な形式で失敗すること', () => {
    const result = updateConstructionPhotoAlbumSchema.safeParse({
      name: '更新名',
      updatedAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// constructionPhotoAlbumListQuerySchema
// ================================================================
describe('constructionPhotoAlbumListQuerySchema', () => {
  it('未指定でデフォルトが適用されること（limit=50）', () => {
    const result = constructionPhotoAlbumListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it('limit が50を超える場合に失敗すること (11.1)', () => {
    const result = constructionPhotoAlbumListQuerySchema.safeParse({ limit: '51' });
    expect(result.success).toBe(false);
  });

  it('sort は createdAt / updatedAt のみ許可されること', () => {
    expect(constructionPhotoAlbumListQuerySchema.safeParse({ sort: 'createdAt' }).success).toBe(
      true
    );
    expect(constructionPhotoAlbumListQuerySchema.safeParse({ sort: 'name' }).success).toBe(false);
  });
});

// ================================================================
// signboardPlacementSchema
// ================================================================
describe('signboardPlacementSchema', () => {
  it('非負矩形で成功すること', () => {
    const result = signboardPlacementSchema.safeParse({
      left: 0,
      top: 10,
      width: 100,
      height: 50,
    });
    expect(result.success).toBe(true);
  });

  it('left が負値で失敗すること', () => {
    const result = signboardPlacementSchema.safeParse({
      left: -1,
      top: 0,
      width: 10,
      height: 10,
    });
    expect(result.success).toBe(false);
  });

  it('width が0以下で失敗すること', () => {
    const result = signboardPlacementSchema.safeParse({
      left: 0,
      top: 0,
      width: 0,
      height: 10,
    });
    expect(result.success).toBe(false);
  });

  it('height が負値で失敗すること', () => {
    const result = signboardPlacementSchema.safeParse({
      left: 0,
      top: 0,
      width: 10,
      height: -5,
    });
    expect(result.success).toBe(false);
  });

  it('数値以外で失敗すること', () => {
    const result = signboardPlacementSchema.safeParse({
      left: 'x',
      top: 0,
      width: 10,
      height: 10,
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// updatePhotoMetadataBatchSchema
// ================================================================
describe('updatePhotoMetadataBatchSchema', () => {
  it('コメント/印刷対象/看板配置の更新で成功すること', () => {
    const result = updatePhotoMetadataBatchSchema.safeParse({
      items: [
        {
          id: VALID_UUID,
          comment: 'コメント',
          includeInReport: true,
          signboardId: VALID_UUID_2,
          signboardPlacement: { left: 0, top: 0, width: 10, height: 10 },
          displayOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('comment を null にできること（クリア）', () => {
    const result = updatePhotoMetadataBatchSchema.safeParse({
      items: [{ id: VALID_UUID, comment: null }],
    });
    expect(result.success).toBe(true);
  });

  it('signboardId を null にできること（解除）', () => {
    const result = updatePhotoMetadataBatchSchema.safeParse({
      items: [{ id: VALID_UUID, signboardId: null, signboardPlacement: null }],
    });
    expect(result.success).toBe(true);
  });

  it('comment が2001文字で失敗すること (7.2)', () => {
    const result = updatePhotoMetadataBatchSchema.safeParse({
      items: [{ id: VALID_UUID, comment: 'x'.repeat(2001) }],
    });
    expect(result.success).toBe(false);
  });

  it('id が UUID でない場合に失敗すること', () => {
    const result = updatePhotoMetadataBatchSchema.safeParse({
      items: [{ id: 'not-uuid', comment: 'a' }],
    });
    expect(result.success).toBe(false);
  });

  it('items が空配列で失敗すること', () => {
    const result = updatePhotoMetadataBatchSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it('負の signboardPlacement で失敗すること', () => {
    const result = updatePhotoMetadataBatchSchema.safeParse({
      items: [{ id: VALID_UUID, signboardPlacement: { left: -1, top: 0, width: 10, height: 10 } }],
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// updatePhotoOrderSchema
// ================================================================
describe('updatePhotoOrderSchema', () => {
  it('順序更新で成功すること', () => {
    const result = updatePhotoOrderSchema.safeParse({
      orders: [
        { id: VALID_UUID, order: 1 },
        { id: VALID_UUID_2, order: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('orders が空で失敗すること', () => {
    const result = updatePhotoOrderSchema.safeParse({ orders: [] });
    expect(result.success).toBe(false);
  });

  it('order が負値で失敗すること', () => {
    const result = updatePhotoOrderSchema.safeParse({
      orders: [{ id: VALID_UUID, order: -1 }],
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// addFromSurveyImagesSchema
// ================================================================
describe('addFromSurveyImagesSchema', () => {
  it('現調画像IDの配列で成功すること', () => {
    const result = addFromSurveyImagesSchema.safeParse({ surveyImageIds: [VALID_UUID] });
    expect(result.success).toBe(true);
  });

  it('空配列で失敗すること', () => {
    const result = addFromSurveyImagesSchema.safeParse({ surveyImageIds: [] });
    expect(result.success).toBe(false);
  });

  it('UUIDでない要素で失敗すること', () => {
    const result = addFromSurveyImagesSchema.safeParse({ surveyImageIds: ['x'] });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// uploadedImagesSchema（件数/サイズ/形式の境界検証）
// ================================================================
describe('uploadedImagesSchema', () => {
  const file = (over: Partial<{ mimetype: string; size: number }> = {}) => ({
    mimetype: 'image/jpeg',
    size: 1024,
    ...over,
  });

  it('許可形式・件数・サイズ内で成功すること', () => {
    const result = uploadedImagesSchema.safeParse([file(), file({ mimetype: 'image/png' })]);
    expect(result.success).toBe(true);
  });

  it('0件で失敗すること', () => {
    const result = uploadedImagesSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('11件で失敗すること (12.1)', () => {
    const files = Array.from({ length: 11 }, () => file());
    const result = uploadedImagesSchema.safeParse(files);
    expect(result.success).toBe(false);
  });

  it('10件ちょうどは成功すること (12.1 境界)', () => {
    const files = Array.from({ length: 10 }, () => file());
    const result = uploadedImagesSchema.safeParse(files);
    expect(result.success).toBe(true);
  });

  it('10MB超で失敗すること (12.2)', () => {
    const result = uploadedImagesSchema.safeParse([file({ size: MAX_UPLOAD_FILE_SIZE + 1 })]);
    expect(result.success).toBe(false);
  });

  it('10MBちょうどは成功すること (12.2 境界)', () => {
    const result = uploadedImagesSchema.safeParse([file({ size: MAX_UPLOAD_FILE_SIZE })]);
    expect(result.success).toBe(true);
  });

  it('許可外形式で失敗すること (12.4)', () => {
    const result = uploadedImagesSchema.safeParse([file({ mimetype: 'image/gif' })]);
    expect(result.success).toBe(false);
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-4.4
 * @requirement construction-photo/REQ-7.2
 * @requirement construction-photo/REQ-12.1
 */
