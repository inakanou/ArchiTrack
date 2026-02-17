/**
 * Claude Vision Zodスキーマのユニットテスト
 *
 * Requirements:
 * - 21.2: Base64画像データ受信
 * - 21.7: 明細行フィールド定義
 *
 * @module tests/unit/schemas/claude-vision.schema
 */
import { describe, it, expect } from 'vitest';
import { claudeVisionExtractRequestSchema } from '../../../schemas/claude-vision.schema.js';

describe('claudeVisionExtractRequestSchema', () => {
  it('should validate a valid request with single image', () => {
    const data = {
      images: [
        {
          base64Data: 'dGVzdA==',
          mediaType: 'image/png',
        },
      ],
    };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate a valid request with multiple images', () => {
    const data = {
      images: [
        { base64Data: 'aW1hZ2Ux', mediaType: 'image/png' },
        { base64Data: 'aW1hZ2Uy', mediaType: 'image/jpeg' },
        { base64Data: 'aW1hZ2Uz', mediaType: 'image/gif' },
        { base64Data: 'aW1hZ2U0', mediaType: 'image/webp' },
      ],
    };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject empty images array', () => {
    const data = {
      images: [],
    };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain('1つ以上');
    }
  });

  it('should reject images array exceeding 20 elements', () => {
    const images = Array.from({ length: 21 }, (_, i) => ({
      base64Data: `image${i}`,
      mediaType: 'image/png' as const,
    }));

    const data = { images };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain('20');
    }
  });

  it('should accept exactly 20 images', () => {
    const images = Array.from({ length: 20 }, (_, i) => ({
      base64Data: `image${i}data`,
      mediaType: 'image/png' as const,
    }));

    const data = { images };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject invalid mediaType', () => {
    const data = {
      images: [
        {
          base64Data: 'dGVzdA==',
          mediaType: 'image/bmp',
        },
      ],
    };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject empty base64Data', () => {
    const data = {
      images: [
        {
          base64Data: '',
          mediaType: 'image/png',
        },
      ],
    };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain('Base64');
    }
  });

  it('should reject missing base64Data field', () => {
    const data = {
      images: [
        {
          mediaType: 'image/png',
        },
      ],
    };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing mediaType field', () => {
    const data = {
      images: [
        {
          base64Data: 'dGVzdA==',
        },
      ],
    };

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing images field', () => {
    const data = {};

    const result = claudeVisionExtractRequestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should accept all supported mediaTypes', () => {
    const mediaTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

    for (const mediaType of mediaTypes) {
      const data = {
        images: [{ base64Data: 'dGVzdA==', mediaType }],
      };
      const result = claudeVisionExtractRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });
});
