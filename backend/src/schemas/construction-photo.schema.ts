/**
 * @fileoverview 工事写真用バリデーションスキーマ（境界での fail fast）
 *
 * 既存の site-survey / annotation スキーマ規約（zod・メッセージ定数・UUID_REGEX・
 * z.infer による型導出）に準拠する。`validate()` ミドルウェアから利用される。
 *
 * Requirements:
 * - 7.2: 写真項目のコメントは最大2000文字
 * - 12.1: 1リクエストの最大ファイル数は10件
 * - 12.2: 1ファイルあたりのサイズ上限は10MB
 * - 12.4: アップロードされたファイルが許可された画像形式であることを検証
 *
 * @module schemas/construction-photo
 */

import { z } from 'zod';
import type { SignboardPlacement } from '../types/construction-photo.types.js';

/**
 * UUIDバリデーション用正規表現（既存スキーマと同一）
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// 制約定数
// ============================================================================

/**
 * 写真項目コメントの最大長
 * Requirements: 7.2
 */
export const COMMENT_MAX_LENGTH = 2000;

/**
 * アルバム名の最大長（site-survey の name=200 に合わせる）
 */
export const ALBUM_NAME_MAX_LENGTH = 200;

/**
 * アルバムメモの最大長（site-survey の memo=2000 に合わせる）
 */
export const ALBUM_MEMO_MAX_LENGTH = 2000;

/**
 * 1リクエストの最大ファイル数
 * Requirements: 12.1
 */
export const MAX_UPLOAD_FILES = 10;

/**
 * 1ファイルあたりの最大サイズ（10MB）
 * Requirements: 12.2
 */
export const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 許可する画像MIMEタイプ（JPEG/PNG/WEBP）
 * Requirements: 4.4, 12.4
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * 一覧取得の最大件数
 * Requirements: 11.1
 */
export const ALBUM_LIST_MAX_LIMIT = 50;

/**
 * バリデーションエラーメッセージ定数
 */
export const CONSTRUCTION_PHOTO_VALIDATION_MESSAGES = {
  // アルバム名
  NAME_REQUIRED: 'アルバム名は必須です',
  NAME_TOO_LONG: `アルバム名は${ALBUM_NAME_MAX_LENGTH}文字以内で入力してください`,
  // メモ
  MEMO_TOO_LONG: `メモは${ALBUM_MEMO_MAX_LENGTH}文字以内で入力してください`,
  // 楽観排他
  UPDATED_AT_REQUIRED: '更新日時（updatedAt）は必須です',
  UPDATED_AT_INVALID: '更新日時の形式が不正です',
  // ID
  ID_REQUIRED: 'IDは必須です',
  ID_INVALID_UUID: 'IDの形式が不正です',
  IMAGE_ID_REQUIRED: '画像IDは必須です',
  IMAGE_ID_INVALID_UUID: '画像IDの形式が不正です',
  PROJECT_ID_REQUIRED: 'プロジェクトIDは必須です',
  PROJECT_ID_INVALID_UUID: 'プロジェクトIDの形式が不正です',
  // コメント
  COMMENT_TOO_LONG: `コメントは${COMMENT_MAX_LENGTH}文字以内で入力してください`,
  // 配置
  PLACEMENT_NEGATIVE: '看板の位置は0以上で指定してください',
  PLACEMENT_SIZE_INVALID: '看板の大きさは正の値で指定してください',
  // バッチ
  ITEMS_MIN: '更新対象は1件以上必要です',
  ORDERS_MIN: '並び替え対象は1件以上必要です',
  ORDER_NEGATIVE: '表示順は0以上で指定してください',
  // 現調コピー
  SURVEY_IMAGE_IDS_MIN: '現場調査画像IDは1件以上必要です',
  SURVEY_IMAGE_IDS_MAX: `現場調査画像IDは${MAX_UPLOAD_FILES}件以下で指定してください`,
  SURVEY_IMAGE_ID_INVALID_UUID: '現場調査画像IDの形式が不正です',
  // アップロード
  FILES_MIN: 'アップロードするファイルを1件以上指定してください',
  FILES_MAX: `一度にアップロードできるファイル数の上限は${MAX_UPLOAD_FILES}件です`,
  FILE_SIZE_EXCEEDED: `ファイルサイズが上限（${MAX_UPLOAD_FILE_SIZE / (1024 * 1024)}MB）を超えています`,
  FILE_TYPE_INVALID: '許可されていない画像形式です（JPEG/PNG/WEBPのみ）',
} as const;

// ============================================================================
// 共通スキーマ
// ============================================================================

const uuidSchema = (message: string) => z.string().min(1, message).regex(UUID_REGEX, message);

const nonEmptyName = z
  .string()
  .min(1, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.NAME_REQUIRED)
  .max(ALBUM_NAME_MAX_LENGTH, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.NAME_TOO_LONG)
  .refine((val) => val.trim().length > 0, {
    message: CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.NAME_REQUIRED,
  });

const memoSchema = z
  .string()
  .max(ALBUM_MEMO_MAX_LENGTH, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.MEMO_TOO_LONG)
  .nullable()
  .optional();

const updatedAtSchema = z
  .string({ message: CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.UPDATED_AT_REQUIRED })
  .datetime({ message: CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.UPDATED_AT_INVALID });

/**
 * 看板配置ジオメトリ（画像ピクセル座標系）スキーマ
 *
 * 画像内に収まる非負矩形（left/top >= 0、width/height > 0）。
 * Requirements: 9.1
 */
export const signboardPlacementSchema: z.ZodType<SignboardPlacement> = z.object({
  left: z.number().finite().min(0, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.PLACEMENT_NEGATIVE),
  top: z.number().finite().min(0, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.PLACEMENT_NEGATIVE),
  width: z
    .number()
    .finite()
    .positive(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.PLACEMENT_SIZE_INVALID),
  height: z
    .number()
    .finite()
    .positive(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.PLACEMENT_SIZE_INVALID),
});

// ============================================================================
// アルバム CRUD / 一覧
// ============================================================================

/**
 * アルバム作成スキーマ
 * Requirements: 1.1
 */
export const createConstructionPhotoAlbumSchema = z.object({
  name: nonEmptyName,
  memo: memoSchema,
});
export type CreateConstructionPhotoAlbumInput = z.infer<typeof createConstructionPhotoAlbumSchema>;

/**
 * アルバム更新スキーマ（楽観排他 updatedAt 必須）
 * Requirements: 1.3
 */
export const updateConstructionPhotoAlbumSchema = z.object({
  name: nonEmptyName.optional(),
  memo: memoSchema,
  updatedAt: updatedAtSchema,
});
export type UpdateConstructionPhotoAlbumInput = z.infer<typeof updateConstructionPhotoAlbumSchema>;

/**
 * ソート可能フィールド
 * Requirements: 3.4
 */
export const CONSTRUCTION_PHOTO_ALBUM_SORTABLE_FIELDS = ['createdAt', 'updatedAt'] as const;
export type ConstructionPhotoAlbumSortableField =
  (typeof CONSTRUCTION_PHOTO_ALBUM_SORTABLE_FIELDS)[number];

/**
 * アルバム一覧クエリスキーマ（最大50件）
 * Requirements: 3.1, 3.3, 3.4, 11.1
 */
export const constructionPhotoAlbumListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'ページ番号は1以上を指定してください').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, '表示件数は1以上を指定してください')
    .max(ALBUM_LIST_MAX_LIMIT, `表示件数は${ALBUM_LIST_MAX_LIMIT}以下を指定してください`)
    .default(ALBUM_LIST_MAX_LIMIT),
  search: z.string().min(2, '検索キーワードは2文字以上を指定してください').optional(),
  sort: z.enum(CONSTRUCTION_PHOTO_ALBUM_SORTABLE_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ConstructionPhotoAlbumListQuery = z.infer<typeof constructionPhotoAlbumListQuerySchema>;

// ============================================================================
// 写真項目メタデータ（バッチ更新）・並び替え
// ============================================================================

/**
 * メタデータ更新の1項目
 * Requirements: 7.1, 7.5, 7.6, 9.1, 9.5
 */
export const updatePhotoMetadataItemSchema = z.object({
  id: uuidSchema(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ID_INVALID_UUID),
  comment: z
    .string()
    .max(COMMENT_MAX_LENGTH, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.COMMENT_TOO_LONG)
    .nullable()
    .optional(),
  includeInReport: z.boolean().optional(),
  signboardId: uuidSchema(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ID_INVALID_UUID)
    .nullable()
    .optional(),
  signboardPlacement: signboardPlacementSchema.nullable().optional(),
  displayOrder: z
    .number()
    .int()
    .min(0, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ORDER_NEGATIVE)
    .optional(),
});
export type UpdatePhotoMetadataItemInput = z.infer<typeof updatePhotoMetadataItemSchema>;

/**
 * メタデータ一括更新スキーマ
 * Requirements: 11.4
 */
export const updatePhotoMetadataBatchSchema = z.object({
  items: z
    .array(updatePhotoMetadataItemSchema)
    .min(1, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ITEMS_MIN),
});
export type UpdatePhotoMetadataBatchInput = z.infer<typeof updatePhotoMetadataBatchSchema>;

/**
 * 並び替えスキーマ
 * Requirements: 7.3, 7.4, 11.4
 */
export const updatePhotoOrderSchema = z.object({
  orders: z
    .array(
      z.object({
        id: uuidSchema(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ID_INVALID_UUID),
        order: z.number().int().min(0, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ORDER_NEGATIVE),
      })
    )
    .min(1, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ORDERS_MIN),
});
export type UpdatePhotoOrderInput = z.infer<typeof updatePhotoOrderSchema>;

// ============================================================================
// 現調写真コピー
// ============================================================================

/**
 * 現調写真コピー用スキーマ
 * Requirements: 6.1, 6.2
 */
export const addFromSurveyImagesSchema = z.object({
  surveyImageIds: z
    .array(uuidSchema(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.SURVEY_IMAGE_ID_INVALID_UUID))
    .min(1, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.SURVEY_IMAGE_IDS_MIN)
    .max(MAX_UPLOAD_FILES, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.SURVEY_IMAGE_IDS_MAX),
});
export type AddFromSurveyImagesInput = z.infer<typeof addFromSurveyImagesSchema>;

// ============================================================================
// アップロードファイルの制約（件数/サイズ/形式）
// ============================================================================

/**
 * アップロード1ファイルのメタデータスキーマ（multer 受信後の実体検証を補完）
 * Requirements: 12.2, 12.4
 */
export const uploadedImageFileSchema = z.object({
  mimetype: z.enum(ALLOWED_IMAGE_MIME_TYPES, {
    message: CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILE_TYPE_INVALID,
  }),
  size: z
    .number()
    .int()
    .min(1, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILES_MIN)
    .max(MAX_UPLOAD_FILE_SIZE, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILE_SIZE_EXCEEDED),
});

/**
 * アップロードファイル配列スキーマ（最大10件）
 * Requirements: 12.1, 12.2, 12.4
 */
export const uploadedImagesSchema = z
  .array(uploadedImageFileSchema)
  .min(1, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILES_MIN)
  .max(MAX_UPLOAD_FILES, CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILES_MAX);
export type UploadedImagesInput = z.infer<typeof uploadedImagesSchema>;

// ============================================================================
// パラメータスキーマ
// ============================================================================

export const constructionPhotoIdParamSchema = z.object({
  id: uuidSchema(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.ID_INVALID_UUID),
});
export type ConstructionPhotoIdParam = z.infer<typeof constructionPhotoIdParamSchema>;

export const constructionPhotoImageIdParamSchema = z.object({
  imageId: uuidSchema(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.IMAGE_ID_INVALID_UUID),
});
export type ConstructionPhotoImageIdParam = z.infer<typeof constructionPhotoImageIdParamSchema>;

export const constructionPhotoProjectIdParamSchema = z.object({
  projectId: uuidSchema(CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.PROJECT_ID_INVALID_UUID),
});
export type ConstructionPhotoProjectIdParam = z.infer<typeof constructionPhotoProjectIdParamSchema>;
