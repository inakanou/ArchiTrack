/**
 * Claude Vision APIスキーマのmodeフィールドテスト
 *
 * Task 43.2: Claude Vision APIエンドポイントを数量表モードに対応する
 *
 * Requirements:
 * - 30.1: mode='quantity-table'の場合は数量表用プロンプトを使用
 * - 30.2: modeパラメータのZodスキーマ追加
 *
 * @module tests/unit/schemas/claude-vision-mode.schema
 */
import { describe, it, expect } from 'vitest';
import { claudeVisionExtractRequestSchema } from '../../../schemas/claude-vision.schema.js';

describe('claudeVisionExtractRequestSchema - modeフィールド', () => {
  const validImage = {
    base64Data: 'dGVzdA==',
    mediaType: 'image/png',
  };

  it('mode未指定の場合はバリデーション成功する（後方互換性）', () => {
    const result = claudeVisionExtractRequestSchema.safeParse({
      images: [validImage],
    });
    expect(result.success).toBe(true);
  });

  it('mode="estimate"の場合はバリデーション成功する', () => {
    const result = claudeVisionExtractRequestSchema.safeParse({
      images: [validImage],
      mode: 'estimate',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('estimate');
    }
  });

  it('mode="quantity-table"の場合はバリデーション成功する', () => {
    const result = claudeVisionExtractRequestSchema.safeParse({
      images: [validImage],
      mode: 'quantity-table',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('quantity-table');
    }
  });

  it('不正なmode値の場合はバリデーション失敗する', () => {
    const result = claudeVisionExtractRequestSchema.safeParse({
      images: [validImage],
      mode: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('mode未指定の場合のデフォルト値はundefined（後方互換性維持）', () => {
    const result = claudeVisionExtractRequestSchema.safeParse({
      images: [validImage],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBeUndefined();
    }
  });
});
