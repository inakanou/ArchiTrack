/**
 * @fileoverview Claude Vision APIバリデーションスキーマ
 *
 * Requirements:
 * - 21.2: Base64画像データ受信
 * - 21.7: 明細行フィールド定義
 *
 * Task 51.1: Zodバリデーションスキーマの定義
 *
 * @module schemas/claude-vision
 */

import { z } from 'zod';

/**
 * Claude Vision画像データのバリデーションスキーマ
 */
export const claudeVisionImageSchema = z.object({
  /** Base64エンコードされた画像データ（data URL prefixなし） */
  base64Data: z.string().min(1, 'Base64データは必須です'),
  /** 画像のメディアタイプ */
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
});

/**
 * Claude Vision抽出リクエストのバリデーションスキーマ
 *
 * images配列: 1〜20要素
 * 各要素にbase64DataとmediaTypeを含む
 */
export const claudeVisionExtractRequestSchema = z.object({
  images: z
    .array(claudeVisionImageSchema)
    .min(1, '1つ以上の画像が必要です')
    .max(20, '一度に処理できる画像は最大20ページです'),
});

/** Claude Vision抽出リクエストの型 */
export type ClaudeVisionExtractRequest = z.infer<typeof claudeVisionExtractRequestSchema>;
