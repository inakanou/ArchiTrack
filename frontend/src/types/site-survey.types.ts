/**
 * @fileoverview 現場調査機能 型定義ファイル
 *
 * フロントエンド用の現場調査管理に関する型定義を提供します。
 *
 * Task 7.1: 現場調査APIクライアントの型定義
 *
 * Requirements:
 * - 1.1: 現場調査CRUD操作
 * - 1.2: 現場調査詳細表示
 * - 1.3: 楽観的排他制御
 * - 1.4: 論理削除
 * - 3.1: ページネーション
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 現場調査ソート可能フィールド
 */
export const SITE_SURVEY_SORTABLE_FIELDS = ['surveyDate', 'createdAt', 'updatedAt'] as const;

// ============================================================================
// 型定義
// ============================================================================

/**
 * ソート可能フィールド型
 */
export type SiteSurveySortableField = (typeof SITE_SURVEY_SORTABLE_FIELDS)[number];

/**
 * ソート順序型
 */
export type SiteSurveySortOrder = 'asc' | 'desc';

/**
 * プロジェクト情報サマリー（現場調査詳細表示用）
 */
export interface ProjectSummary {
  /** プロジェクトID */
  id: string;
  /** プロジェクト名 */
  name: string;
}

/**
 * 画像情報
 */
export interface SurveyImageInfo {
  /** 画像ID */
  id: string;
  /** 現場調査ID */
  surveyId: string;
  /** オリジナル画像パス（ストレージキー） */
  originalPath: string;
  /** サムネイル画像パス（ストレージキー） */
  thumbnailPath: string;
  /** オリジナル画像URL（署名付きURL） */
  originalUrl?: string | null;
  /** サムネイル画像URL（署名付きURL） */
  thumbnailUrl?: string | null;
  /** ファイル名 */
  fileName: string;
  /** ファイルサイズ（バイト） */
  fileSize: number;
  /** 画像幅（ピクセル） */
  width: number;
  /** 画像高さ（ピクセル） */
  height: number;
  /** 表示順序 */
  displayOrder: number;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
}

/**
 * 現場調査情報（一覧表示用）
 */
export interface SiteSurveyInfo {
  /** 現場調査ID */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** 現場調査名 */
  name: string;
  /** 調査日（ISO8601形式） */
  surveyDate: string;
  /** メモ（任意） */
  memo: string | null;
  /** サムネイルURL（最初の画像、存在しない場合はnull） */
  thumbnailUrl: string | null;
  /** 画像件数 */
  imageCount: number;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * 現場調査詳細情報（詳細表示用）
 * SiteSurveyInfoを拡張し、プロジェクト情報と画像一覧を含む
 */
export interface SiteSurveyDetail extends SiteSurveyInfo {
  /** プロジェクト情報 */
  project: ProjectSummary;
  /** 画像一覧 */
  images: SurveyImageInfo[];
}

/**
 * ページネーション情報
 */
export interface SiteSurveyPaginationInfo {
  /** 現在のページ番号（1始まり） */
  page: number;
  /** 1ページあたりの件数 */
  limit: number;
  /** 総件数 */
  total: number;
  /** 総ページ数 */
  totalPages: number;
}

/**
 * ページネーション付き現場調査一覧レスポンス
 */
export interface PaginatedSiteSurveys {
  /** 現場調査一覧 */
  data: SiteSurveyInfo[];
  /** ページネーション情報 */
  pagination: SiteSurveyPaginationInfo;
}

// ============================================================================
// 入力型定義
// ============================================================================

/**
 * 現場調査作成入力
 */
export interface CreateSiteSurveyInput {
  /** 現場調査名（1-200文字、必須） */
  name: string;
  /** 調査日（YYYY-MM-DD形式、必須） */
  surveyDate: string;
  /** メモ（最大2000文字、任意） */
  memo?: string | null;
}

/**
 * 現場調査更新入力
 */
export interface UpdateSiteSurveyInput {
  /** 現場調査名（1-200文字） */
  name?: string;
  /** 調査日（YYYY-MM-DD形式） */
  surveyDate?: string;
  /** メモ（最大2000文字） */
  memo?: string | null;
}

/**
 * 現場調査フィルタ
 */
export interface SiteSurveyFilter {
  /** 検索キーワード（名前・メモの部分一致） */
  search?: string;
  /** 調査日開始（YYYY-MM-DD形式） */
  surveyDateFrom?: string;
  /** 調査日終了（YYYY-MM-DD形式） */
  surveyDateTo?: string;
}

// ============================================================================
// エラーレスポンス型定義
// ============================================================================

/**
 * 現場調査競合エラーレスポンス（楽観的排他制御エラー）
 *
 * Requirements: 1.5
 *
 * 現場調査更新時に他のユーザーによって既に更新されている場合に返されるエラーレスポンス
 */
export interface SiteSurveyConflictErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（409） */
  status: 409;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'SITE_SURVEY_CONFLICT';
  /** 期待されていた更新日時（ISO8601形式） */
  expectedUpdatedAt?: string;
  /** 実際の更新日時（ISO8601形式） */
  actualUpdatedAt?: string;
}

/**
 * プロジェクト未発見エラーレスポンス
 *
 * Requirements: 1.6
 *
 * 現場調査作成時にプロジェクトが存在しない場合に返されるエラーレスポンス
 */
export interface ProjectNotFoundForSurveyErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'PROJECT_NOT_FOUND';
  /** 存在しないプロジェクトID */
  projectId: string;
}

/**
 * 現場調査未発見エラーレスポンス
 *
 * Requirements: 1.2, 1.3, 1.4
 *
 * 現場調査が存在しない場合に返されるエラーレスポンス
 */
export interface SiteSurveyNotFoundErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'SITE_SURVEY_NOT_FOUND';
  /** 現場調査ID（任意） */
  surveyId?: string;
}

// ============================================================================
// タイプガード関数
// ============================================================================

/**
 * 値がSiteSurveyConflictErrorResponseかどうかを判定するタイプガード
 *
 * 409エラーレスポンスが現場調査の楽観的排他制御エラーかどうかを判定します。
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがSiteSurveyConflictErrorResponseならtrue
 *
 * @example
 * ```typescript
 * try {
 *   await updateSiteSurvey(projectId, surveyId, input, expectedUpdatedAt);
 * } catch (error) {
 *   if (error instanceof ApiError && error.statusCode === 409) {
 *     if (isSiteSurveyConflictErrorResponse(error.response)) {
 *       // 楽観的排他制御エラー
 *       console.log('競合が発生しました。再読み込みしてください。');
 *     }
 *   }
 * }
 * ```
 */
export function isSiteSurveyConflictErrorResponse(
  value: unknown
): value is SiteSurveyConflictErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 409 &&
    typeof obj.detail === 'string' &&
    obj.code === 'SITE_SURVEY_CONFLICT'
  );
}

/**
 * 値がProjectNotFoundForSurveyErrorResponseかどうかを判定するタイプガード
 *
 * 404エラーレスポンスがプロジェクト未発見エラーかどうかを判定します。
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがProjectNotFoundForSurveyErrorResponseならtrue
 */
export function isProjectNotFoundForSurveyErrorResponse(
  value: unknown
): value is ProjectNotFoundForSurveyErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'PROJECT_NOT_FOUND' &&
    typeof obj.projectId === 'string'
  );
}

/**
 * 値がSiteSurveyNotFoundErrorResponseかどうかを判定するタイプガード
 *
 * 404エラーレスポンスが現場調査未発見エラーかどうかを判定します。
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがSiteSurveyNotFoundErrorResponseならtrue
 */
export function isSiteSurveyNotFoundErrorResponse(
  value: unknown
): value is SiteSurveyNotFoundErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'SITE_SURVEY_NOT_FOUND'
  );
}

/**
 * 値がSiteSurveySortableFieldかどうかを判定するタイプガード
 *
 * @param value - 判定する値
 * @returns valueがSiteSurveySortableFieldならtrue
 */
export function isSiteSurveySortableField(value: unknown): value is SiteSurveySortableField {
  return (
    typeof value === 'string' &&
    (SITE_SURVEY_SORTABLE_FIELDS as readonly string[]).includes(value as string)
  );
}

// ============================================================================
// 画像管理用型定義（Task 7.2）
// ============================================================================

/**
 * 画像アップロードオプション
 *
 * Requirements: 4.1
 */
export interface UploadImageOptions {
  /** 表示順序（省略時は自動設定） */
  displayOrder?: number;
}

/**
 * バッチアップロード進捗情報
 *
 * Requirements: 4.2, 4.3
 */
export interface BatchUploadProgress {
  /** 総ファイル数 */
  total: number;
  /** 完了したファイル数 */
  completed: number;
  /** 現在処理中のファイルインデックス（0始まり） */
  current: number;
  /** 成功した画像情報 */
  results: SurveyImageInfo[];
  /** エラー情報 */
  errors: BatchUploadError[];
}

/**
 * バッチアップロードエラー情報
 *
 * Requirements: 4.2
 */
export interface BatchUploadError {
  /** ファイルのインデックス（0始まり） */
  index: number;
  /** ファイル名 */
  fileName: string;
  /** エラーメッセージ */
  error: string;
}

/**
 * バッチアップロードオプション
 *
 * Requirements: 4.2, 4.3
 */
export interface BatchUploadOptions {
  /** 進捗コールバック */
  onProgress?: (progress: BatchUploadProgress) => void;
  /** 一度に処理するファイル数（デフォルト: 5） */
  batchSize?: number;
  /** 開始表示順序（省略時は自動設定） */
  startDisplayOrder?: number;
}

/**
 * 画像順序変更リクエスト
 *
 * Requirements: 4.10
 */
export interface ImageOrderItem {
  /** 画像ID */
  id: string;
  /** 新しい表示順序 */
  order: number;
}

/**
 * 画像未発見エラーレスポンス
 *
 * Requirements: 4.7
 */
export interface ImageNotFoundErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'IMAGE_NOT_FOUND';
  /** 画像ID（任意） */
  imageId?: string;
}

/**
 * ファイル形式エラーレスポンス
 *
 * Requirements: 4.5, 4.8
 */
export interface UnsupportedFileTypeErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（415） */
  status: 415;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'UNSUPPORTED_FILE_TYPE';
  /** 許可されたファイル形式 */
  allowedTypes: string[];
}

/**
 * 値がImageNotFoundErrorResponseかどうかを判定するタイプガード
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがImageNotFoundErrorResponseならtrue
 */
export function isImageNotFoundErrorResponse(value: unknown): value is ImageNotFoundErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'IMAGE_NOT_FOUND'
  );
}

/**
 * 値がUnsupportedFileTypeErrorResponseかどうかを判定するタイプガード
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがUnsupportedFileTypeErrorResponseならtrue
 */
export function isUnsupportedFileTypeErrorResponse(
  value: unknown
): value is UnsupportedFileTypeErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 415 &&
    typeof obj.detail === 'string' &&
    obj.code === 'UNSUPPORTED_FILE_TYPE' &&
    Array.isArray(obj.allowedTypes)
  );
}

// ============================================================================
// 注釈管理用型定義（Task 7.3）
// ============================================================================

/**
 * Fabric.jsオブジェクト型（簡略化）
 *
 * 実際のFabric.jsのオブジェクトは多くのプロパティを持つため、
 * 基本的なプロパティのみを定義し、その他はRecord型で許容する
 */
export interface FabricSerializedObject {
  /** オブジェクトタイプ（rect, circle, path, textbox等） */
  type: string;
  /** その他のFabric.jsオブジェクトプロパティ */
  [key: string]: unknown;
}

/**
 * 注釈データ（Fabric.js JSON形式）
 *
 * Requirements: 9.1, 9.2
 */
export interface AnnotationData {
  /** スキーマバージョン */
  version?: string;
  /** Fabric.jsオブジェクト配列 */
  objects: FabricSerializedObject[];
  /** 背景色または画像 */
  background?: string;
  /** ビューポート変換マトリックス */
  viewportTransform?: number[];
}

/**
 * 注釈情報（APIレスポンス）
 *
 * Requirements: 9.1, 9.2
 */
export interface AnnotationInfo {
  /** 注釈ID */
  id: string;
  /** 画像ID */
  imageId: string;
  /** 注釈データ（Fabric.js JSON形式） */
  data: AnnotationData;
  /** スキーマバージョン */
  version: string;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * 注釈データなしレスポンス
 *
 * 画像に注釈が存在しない場合のレスポンス形式
 */
export interface NoAnnotationResponse {
  /** 注釈データ（null） */
  data: null;
}

/**
 * 注釈取得APIレスポンス型
 *
 * 注釈が存在する場合はAnnotationInfo、存在しない場合は{ data: null }を返す
 */
export type GetAnnotationResponse = AnnotationInfo | NoAnnotationResponse;

/**
 * 注釈保存入力
 *
 * Requirements: 9.1, 9.4
 */
export interface SaveAnnotationInput {
  /** 注釈データ */
  data: AnnotationData;
  /** 楽観的排他制御用の期待される更新日時（ISO8601形式） */
  expectedUpdatedAt?: string;
}

// ============================================================================
// 注釈エラーレスポンス型定義
// ============================================================================

/**
 * 注釈画像未発見エラーレスポンス
 *
 * 注釈操作対象の画像が見つからない場合に返されるエラーレスポンス
 */
export interface AnnotationImageNotFoundErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'ANNOTATION_IMAGE_NOT_FOUND';
  /** 画像ID */
  imageId: string;
}

/**
 * 注釈未発見エラーレスポンス
 *
 * 注釈データが存在しない場合に返されるエラーレスポンス（エクスポート時）
 */
export interface AnnotationNotFoundErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（404） */
  status: 404;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'ANNOTATION_NOT_FOUND';
  /** 画像ID */
  imageId: string;
}

/**
 * 注釈競合エラーレスポンス（楽観的排他制御エラー）
 *
 * Requirements: 9.4
 *
 * 注釈保存時に他のユーザーによって既に更新されている場合に返されるエラーレスポンス
 */
export interface AnnotationConflictErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（409） */
  status: 409;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'ANNOTATION_CONFLICT';
  /** 期待されていた更新日時（ISO8601形式） */
  expectedUpdatedAt?: string;
  /** 実際の更新日時（ISO8601形式） */
  actualUpdatedAt?: string;
}

/**
 * 無効な注釈データエラーレスポンス
 *
 * 注釈データの形式が無効な場合に返されるエラーレスポンス
 */
export interface InvalidAnnotationDataErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード（400） */
  status: 400;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: 'INVALID_ANNOTATION_DATA';
}

// ============================================================================
// 注釈エラーレスポンス用タイプガード
// ============================================================================

/**
 * 値がAnnotationImageNotFoundErrorResponseかどうかを判定するタイプガード
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがAnnotationImageNotFoundErrorResponseならtrue
 */
export function isAnnotationImageNotFoundErrorResponse(
  value: unknown
): value is AnnotationImageNotFoundErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'ANNOTATION_IMAGE_NOT_FOUND' &&
    typeof obj.imageId === 'string'
  );
}

/**
 * 値がAnnotationNotFoundErrorResponseかどうかを判定するタイプガード
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがAnnotationNotFoundErrorResponseならtrue
 */
export function isAnnotationNotFoundErrorResponse(
  value: unknown
): value is AnnotationNotFoundErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 404 &&
    typeof obj.detail === 'string' &&
    obj.code === 'ANNOTATION_NOT_FOUND' &&
    typeof obj.imageId === 'string'
  );
}

/**
 * 値がAnnotationConflictErrorResponseかどうかを判定するタイプガード
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがAnnotationConflictErrorResponseならtrue
 *
 * @example
 * ```typescript
 * try {
 *   await saveAnnotation(imageId, input);
 * } catch (error) {
 *   if (error instanceof ApiError && error.statusCode === 409) {
 *     if (isAnnotationConflictErrorResponse(error.response)) {
 *       // 楽観的排他制御エラー
 *       console.log('競合が発生しました。再読み込みしてください。');
 *     }
 *   }
 * }
 * ```
 */
export function isAnnotationConflictErrorResponse(
  value: unknown
): value is AnnotationConflictErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 409 &&
    typeof obj.detail === 'string' &&
    obj.code === 'ANNOTATION_CONFLICT'
  );
}

/**
 * 値がInvalidAnnotationDataErrorResponseかどうかを判定するタイプガード
 *
 * @param value - 判定する値（通常はApiError.response）
 * @returns valueがInvalidAnnotationDataErrorResponseならtrue
 */
export function isInvalidAnnotationDataErrorResponse(
  value: unknown
): value is InvalidAnnotationDataErrorResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    obj.status === 400 &&
    typeof obj.detail === 'string' &&
    obj.code === 'INVALID_ANNOTATION_DATA'
  );
}

/**
 * 値がNoAnnotationResponseかどうかを判定するタイプガード
 *
 * 注釈が存在しない場合のレスポンスかどうかを判定します。
 *
 * @param value - 判定する値
 * @returns valueがNoAnnotationResponseならtrue
 */
export function isNoAnnotationResponse(value: unknown): value is NoAnnotationResponse {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return 'data' in obj && obj.data === null;
}

// ============================================================================
// 元画像ダウンロード用型定義（Task 20.2）
// ============================================================================

/**
 * 元画像ダウンロードオプション
 *
 * Requirements: 10.4
 */
export interface DownloadOriginalImageOptions {
  /** ダウンロード時のファイル名（省略時はサーバーから取得したファイル名を使用） */
  filename?: string;
}
