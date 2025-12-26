/**
 * @fileoverview 注釈データ用バリデーションスキーマ
 *
 * Task 6.3: 注釈管理エンドポイントを実装する
 *
 * Requirements:
 * - 9.1: 全ての注釈データをデータベースに保存する
 * - 9.2: 保存された注釈データを復元して表示する
 *
 * @module schemas/annotation
 */

import { z } from 'zod';

/**
 * バリデーションエラーメッセージ定数
 */
export const ANNOTATION_VALIDATION_MESSAGES = {
  // 画像ID
  IMAGE_ID_REQUIRED: '画像IDは必須です',
  IMAGE_ID_INVALID_UUID: '画像IDの形式が不正です',

  // 注釈データ
  DATA_REQUIRED: '注釈データは必須です',
  DATA_INVALID: '注釈データの形式が不正です',
  OBJECTS_REQUIRED: 'objectsプロパティは必須です',
  OBJECTS_INVALID: 'objectsは配列である必要があります',

  // expectedUpdatedAt
  EXPECTED_UPDATED_AT_INVALID: '日時の形式が不正です',
} as const;

/**
 * UUIDバリデーション用正規表現
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 画像IDパラメータ用スキーマ
 */
export const imageIdParamSchema = z.object({
  imageId: z
    .string()
    .min(1, ANNOTATION_VALIDATION_MESSAGES.IMAGE_ID_REQUIRED)
    .regex(UUID_REGEX, ANNOTATION_VALIDATION_MESSAGES.IMAGE_ID_INVALID_UUID),
});

/**
 * 画像IDパラメータの型
 */
export type ImageIdParam = z.infer<typeof imageIdParamSchema>;

/**
 * Fabric.js シリアライズオブジェクトスキーマ
 *
 * Fabric.jsでシリアライズされたオブジェクトの基本構造。
 * 柔軟性のために最小限の検証のみ行う。
 */
const fabricSerializedObjectSchema = z
  .object({
    type: z.string(),
  })
  .passthrough(); // 追加プロパティを許可

/**
 * 注釈データスキーマ
 */
export const annotationDataSchema = z.object({
  version: z.string().optional(),
  objects: z.array(fabricSerializedObjectSchema),
  background: z.string().optional(),
  viewportTransform: z.array(z.number()).optional(),
});

/**
 * 注釈データの型
 */
export type AnnotationDataInput = z.infer<typeof annotationDataSchema>;

/**
 * 注釈保存用ボディスキーマ
 */
export const saveAnnotationBodySchema = z.object({
  data: annotationDataSchema,
  expectedUpdatedAt: z
    .string()
    .datetime({ message: ANNOTATION_VALIDATION_MESSAGES.EXPECTED_UPDATED_AT_INVALID })
    .optional(),
});

/**
 * 注釈保存入力の型
 */
export type SaveAnnotationBodyInput = z.infer<typeof saveAnnotationBodySchema>;
