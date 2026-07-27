/**
 * @fileoverview 工事写真機能のフロントエンド共有型
 *
 * Task 5.1: フロントAPIクライアントと型
 *
 * バックエンドの共有型（backend/src/types/construction-photo.types.ts）および各サービスの
 * レスポンス形状に厳密に一致させる。既存の `site-survey.types.ts` の規約（DTO/入力/
 * ページング/型ガードの分離）に倣う。
 *
 * Requirements:
 * - 1.1, 3.1: アルバムCRUD・一覧（ページング）
 * - 4.1, 6.1: 画像アップロード・現調コピー（部分失敗 {successful, failed}）
 * - 7.1: 写真項目メタデータ・並び替え
 * - 8.1: 工事看板マスタCRUD・一覧
 *
 * @module types/construction-photo
 */

// ============================================================================
// 配置ジオメトリ / 自由項目
// ============================================================================

/**
 * 看板の配置ジオメトリ（画像ピクセル座標系）
 *
 * 画像内に収まる非負矩形（left/top >= 0、width/height > 0）。
 * Requirements: 9.1
 */
export interface SignboardPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 工事看板の自由項目（ラベルと値の組）
 *
 * Requirements: 8.3
 */
export interface SignboardFreeItem {
  label: string;
  value: string;
}

// ============================================================================
// DTO（サーバレスポンス形状）
// ============================================================================

/**
 * 工事写真アルバムDTO
 *
 * Requirements: 1.1, 1.2
 */
export interface ConstructionPhotoAlbum {
  id: string;
  projectId: string;
  name: string;
  memo: string | null;
  /**
   * 代表サムネイルの表示用署名付きURL（一覧のサムネ優先表示）。
   * 代表写真なし・ストレージ未設定・署名失敗時は null。
   * Requirements: 3.5, 11.3
   */
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工事看板DTO（プロジェクト単位マスタ）
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export interface ConstructionSignboard {
  id: string;
  projectId: string;
  /** 工事件名の値 */
  workName: string;
  /** 工事場所の値 */
  workLocation: string;
  /** 自由項目（ラベルと値の組の配列、既定 []） */
  freeItems: SignboardFreeItem[];
  /** 下部記入欄の固定テキスト（複数行可） */
  footerText: string | null;
  /**
   * 当該看板を参照している写真項目の件数（使用中削除の確認に用いる）。未使用=0。
   * Requirements: 8.8
   */
  inUseCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 画像リストDTO（署名付きURL同梱、写真項目ごとの個別リクエスト不要）
 *
 * Requirements: 11.2, 11.3
 */
export interface ConstructionPhotoWithUrls {
  id: string;
  albumId: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  displayOrder: number;
  comment: string | null;
  includeInReport: boolean;
  signboardId: string | null;
  signboardPlacement: SignboardPlacement | null;
  /** 一覧・詳細のサムネ優先表示（未生成時 null） */
  thumbnailUrl: string | null;
  /** PDF用: 印字画像取得エンドポイント。看板ありはサーバでオンデマンド合成、なしは原本 */
  printImageUrl: string;
  createdAt: string;
}

// ============================================================================
// ページネーション（アルバム一覧）
// ============================================================================

/**
 * ソート可能フィールド（作成日・更新日）
 * Requirements: 3.4
 */
export type ConstructionPhotoAlbumSortableField = 'createdAt' | 'updatedAt';

/**
 * ソート順序
 */
export type ConstructionPhotoSortOrder = 'asc' | 'desc';

/**
 * ページネーション情報
 */
export interface ConstructionPhotoAlbumPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション付きアルバム一覧
 *
 * Requirements: 3.1, 11.1
 */
export interface PaginatedConstructionPhotoAlbums {
  data: ConstructionPhotoAlbum[];
  pagination: ConstructionPhotoAlbumPagination;
}

// ============================================================================
// 入力型（リクエストボディ）
// ============================================================================

/**
 * アルバム作成入力
 * Requirements: 1.1
 */
export interface CreateConstructionPhotoAlbumInput {
  name: string;
  memo?: string | null;
}

/**
 * アルバム更新入力（楽観排他 updatedAt はクライアント関数の引数で受け取る）
 * Requirements: 1.3
 */
export interface UpdateConstructionPhotoAlbumInput {
  name?: string;
  memo?: string | null;
}

/**
 * 看板作成入力
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export interface CreateConstructionSignboardInput {
  workName: string;
  workLocation: string;
  /** 省略時はサーバ側で [] が既定される */
  freeItems?: SignboardFreeItem[];
  footerText?: string | null;
}

/**
 * 看板更新入力（楽観排他 updatedAt はクライアント関数の引数で受け取る）
 * Requirements: 8.6
 */
export interface UpdateConstructionSignboardInput {
  workName?: string;
  workLocation?: string;
  freeItems?: SignboardFreeItem[];
  footerText?: string | null;
}

/**
 * 写真項目メタデータ一括更新の1項目
 * Requirements: 7.1, 7.5, 7.6, 9.1, 9.5
 */
export interface BatchUpdatePhotoMetadataItem {
  /** 写真項目ID */
  id: string;
  /** 写真コメント（最大2000文字、null でクリア） */
  comment?: string | null;
  /** 印刷対象フラグ */
  includeInReport?: boolean;
  /** 関連付ける工事看板ID（null で解除） */
  signboardId?: string | null;
  /** 看板配置ジオメトリ（null でクリア） */
  signboardPlacement?: SignboardPlacement | null;
  /** 表示順序（送信された相対順序は 1..n に正規化される） */
  displayOrder?: number;
}

/**
 * 並び替えの1項目
 * Requirements: 7.3, 7.4
 */
export interface PhotoOrderItem {
  /** 写真項目ID */
  id: string;
  /** 新しい表示順序（相対順序、1..n に正規化される） */
  order: number;
}

/**
 * アルバム一覧取得オプション
 * Requirements: 3.1, 3.3, 3.4
 */
export interface GetConstructionPhotoAlbumsOptions {
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 50、最大: 50） */
  limit?: number;
  /** アルバム名の部分一致検索（2文字以上） */
  search?: string;
  /** ソートフィールド */
  sort?: ConstructionPhotoAlbumSortableField;
  /** ソート順序 */
  order?: ConstructionPhotoSortOrder;
}

// ============================================================================
// レスポンス型（部分失敗・削除結果）
// ============================================================================

/**
 * アップロード結果（部分失敗を許容: 成功分は確定、失敗分のみ通知）
 * Requirements: 4.1, 12.5
 */
export interface ConstructionPhotoUploadResult {
  /** 追加された写真項目（署名付きURL同梱） */
  successful: ConstructionPhotoWithUrls[];
  /** 失敗したファイル（ファイル名とエラーメッセージ） */
  failed: Array<{ fileName: string; error: string }>;
}

/**
 * 現調コピー結果（部分失敗を許容）
 * Requirements: 6.1, 12.5
 */
export interface ConstructionPhotoCopyResult {
  /** 追加された写真項目（署名付きURL同梱） */
  successful: ConstructionPhotoWithUrls[];
  /** 失敗した現調画像ID（IDとエラーメッセージ） */
  failed: Array<{ surveyImageId: string; error: string }>;
}

/**
 * 看板削除結果（使用件数）
 * Requirements: 8.8
 */
export interface DeleteSignboardResult {
  /** 当該看板を参照している写真項目の件数（>0 は使用中） */
  inUseCount: number;
}

// ============================================================================
// 型ガード（RFC 7807 Problem Details のエラーレスポンス識別）
// ============================================================================

/**
 * オブジェクトが指定した code を持つ Problem Details かどうかを判定する内部ヘルパー
 */
function hasErrorCode(response: unknown, code: string): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    (response as { code: unknown }).code === code
  );
}

/**
 * アルバム楽観的排他制御の競合エラー（409）レスポンスかどうかを判定する
 *
 * Requirements: 1.5
 */
export function isConstructionPhotoAlbumConflictErrorResponse(response: unknown): boolean {
  return hasErrorCode(response, 'CONSTRUCTION_PHOTO_ALBUM_CONFLICT');
}

/**
 * 看板楽観的排他制御の競合エラー（409）レスポンスかどうかを判定する
 *
 * Requirements: 8.6
 */
export function isConstructionSignboardConflictErrorResponse(response: unknown): boolean {
  return hasErrorCode(response, 'CONSTRUCTION_SIGNBOARD_CONFLICT');
}
