/**
 * @fileoverview Claude Vision APIクライアント
 *
 * Task 53.1: api/claude-vision.tsクライアントモジュールの実装
 *
 * Requirements:
 * - 24.4: Base64エンコード・バックエンド送信
 *
 * タスク117.1（estimate-request の design.md の章「Requirements 43-50」の D7）: 状態の取得
 * （`GET /api/claude-vision/status`）と、誤りの `code` による判別（管理者の停止・利用者の上限・
 * 外部のサービスの上限・記録の失敗）を足した。どの誤りも従来どおり端末の読み取りへ切り替える（shouldFallback）。
 *
 * @module api/claude-vision
 */

import { apiClient, ApiError } from './client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * Claude Vision APIに送信する画像データ
 */
export interface ClaudeVisionImageInput {
  /** Base64エンコードされた画像データ（data URL prefixなし） */
  base64Data: string;
  /** 画像のメディアタイプ */
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

/**
 * Claude Vision APIから抽出された明細行データ
 */
export interface ClaudeVisionLineItem {
  customCategory: string | null;
  workType: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
}

/**
 * Claude Vision抽出レスポンス
 */
export interface ClaudeVisionExtractResponse {
  lineItems: ClaudeVisionLineItem[];
  pageCount: number;
}

/**
 * Claude Vision APIエラー種別
 */
export type ClaudeVisionErrorType =
  | 'timeout'
  | 'rate_limit'
  | 'auth_error'
  | 'parse_error'
  | 'service_unavailable'
  | 'unknown';

const CLAUDE_VISION_ERROR_TYPES: readonly ClaudeVisionErrorType[] = [
  'timeout',
  'rate_limit',
  'auth_error',
  'parse_error',
  'service_unavailable',
  'unknown',
];

/**
 * 判別に使う誤りの `code`（D7）
 *
 * - DISABLED_BY_ADMIN: 管理者が外部の AI での読み取りを止めている（503。errorType は service_unavailable）
 * - USER_RATE_LIMITED: 利用者ごとの回数の上限を超えた（429。本文に errorType を持たない）
 * - UPSTREAM_RATE_LIMIT: 外部のサービスの回数の制限（429。errorType は rate_limit）
 * - AUDIT_FAILED: 送信の記録に失敗し、結果を返さなかった（500）
 */
export const CLAUDE_VISION_ERROR_CODES = {
  DISABLED_BY_ADMIN: 'CLAUDE_VISION_DISABLED_BY_ADMIN',
  USER_RATE_LIMITED: 'CLAUDE_VISION_USER_RATE_LIMITED',
  UPSTREAM_RATE_LIMIT: 'CLAUDE_VISION_RATE_LIMIT',
  AUDIT_FAILED: 'CLAUDE_VISION_AUDIT_FAILED',
} as const;

/** 外部の AI での読み取りを使えない理由（D7） */
export type ClaudeVisionUnavailableReason =
  | 'disabled_by_admin'
  | 'no_permission'
  | 'not_configured';

/**
 * 外部の AI での読み取りの状態（`GET /api/claude-vision/status`）
 *
 * 使えるときは理由が null、使えないときは理由を持つ
 */
export type ClaudeVisionStatus =
  | { available: true; reason: null }
  | { available: false; reason: ClaudeVisionUnavailableReason };

// ============================================================================
// エラークラス
// ============================================================================

/**
 * Claude Vision API固有のエラークラス
 *
 * errorType, statusCode, shouldFallbackプロパティを持つ。`code` は応答の本文の `code`（無ければ null）で、
 * 管理者の停止・利用者の上限・外部のサービスの上限・記録の失敗の判別に使う（D7）
 */
export class ClaudeVisionApiError extends Error {
  readonly errorType: ClaudeVisionErrorType;
  readonly statusCode: number;
  /** 応答の本文の `code`（無ければ null） */
  readonly code: string | null;
  /** すべてのエラー種別でフォールバックを推奨 */
  readonly shouldFallback: boolean = true;

  constructor(
    message: string,
    errorType: ClaudeVisionErrorType,
    statusCode: number,
    code: string | null = null
  ) {
    super(message);
    this.name = 'ClaudeVisionApiError';
    this.errorType = errorType;
    this.statusCode = statusCode;
    this.code = code;
  }

  /** 管理者が外部の AI での読み取りを止めている（49.4） */
  get isDisabledByAdmin(): boolean {
    return this.code === CLAUDE_VISION_ERROR_CODES.DISABLED_BY_ADMIN;
  }

  /** 利用者ごとの回数の上限を超えた（49.8） */
  get isUserRateLimited(): boolean {
    return this.code === CLAUDE_VISION_ERROR_CODES.USER_RATE_LIMITED;
  }

  /** 外部のサービスの回数の制限（利用者の上限ではない） */
  get isUpstreamRateLimited(): boolean {
    return !this.isUserRateLimited && this.errorType === 'rate_limit';
  }

  /** 送信の記録に失敗し、結果が返らなかった（49.7） */
  get isAuditFailed(): boolean {
    return this.code === CLAUDE_VISION_ERROR_CODES.AUDIT_FAILED;
  }
}

/**
 * ClaudeVisionApiError型ガード関数
 */
export function isClaudeVisionApiError(error: unknown): error is ClaudeVisionApiError {
  return error instanceof ClaudeVisionApiError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClaudeVisionErrorType(value: unknown): value is ClaudeVisionErrorType {
  return (
    typeof value === 'string' && (CLAUDE_VISION_ERROR_TYPES as readonly string[]).includes(value)
  );
}

/**
 * 抽出の失敗を ClaudeVisionApiError にする
 *
 * 本文の errorType（知らない値は unknown）と code（無ければ null）を写す
 */
function toClaudeVisionApiError(error: unknown): ClaudeVisionApiError {
  if (error instanceof ApiError) {
    const body = isRecord(error.response) ? error.response : undefined;
    const errorType = isClaudeVisionErrorType(body?.errorType) ? body.errorType : 'unknown';
    const code = typeof body?.code === 'string' ? body.code : null;
    return new ClaudeVisionApiError(error.message, errorType, error.statusCode, code);
  }

  // その他のエラー（ネットワークエラー等）
  return new ClaudeVisionApiError(
    error instanceof Error ? error.message : 'Unknown error',
    'unknown',
    0
  );
}

// ============================================================================
// 数量表用型定義
// ============================================================================

/**
 * 数量表用のClaude Vision抽出結果の明細行データ
 *
 * Task 43.2: 数量表モード対応
 */
export interface ClaudeVisionQuantityLineItem {
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  remarks: string | null;
}

/**
 * 数量表用のClaude Vision抽出レスポンス
 */
export interface ClaudeVisionQuantityExtractResponse {
  lineItems: ClaudeVisionQuantityLineItem[];
  pageCount: number;
}

// ============================================================================
// APIクライアント関数
// ============================================================================

/**
 * Claude Vision APIでPDFページ画像から明細行データを抽出する
 *
 * @param images - Base64エンコードされた画像データの配列
 * @returns 抽出された明細行データとページ数
 * @throws ClaudeVisionApiError - Claude Vision API固有エラー（errorType付き）
 */
export async function extractWithClaudeVision(
  images: ClaudeVisionImageInput[]
): Promise<ClaudeVisionExtractResponse> {
  try {
    const response = await apiClient.post<ClaudeVisionExtractResponse>(
      '/api/claude-vision/extract',
      { images },
      { disableRetry: true, timeout: 60000 } // リトライ無効、60秒タイムアウト（サーバー側は30秒）
    );
    return response;
  } catch (error) {
    throw toClaudeVisionApiError(error);
  }
}

/**
 * Claude Vision APIで数量表データを抽出する（mode='quantity-table'）
 *
 * Task 44.3: Claude Vision API連携によるPDF高精度抽出
 *
 * @param images - Base64エンコードされた画像データの配列
 * @returns 抽出された数量項目データとページ数
 * @throws ClaudeVisionApiError - Claude Vision API固有エラー
 */
export async function extractWithClaudeVisionForQuantityTable(
  images: ClaudeVisionImageInput[]
): Promise<ClaudeVisionQuantityExtractResponse> {
  try {
    const response = await apiClient.post<ClaudeVisionQuantityExtractResponse>(
      '/api/claude-vision/extract',
      { images, mode: 'quantity-table' },
      { disableRetry: true, timeout: 60000 }
    );
    return response;
  } catch (error) {
    throw toClaudeVisionApiError(error);
  }
}

/**
 * 外部の AI での読み取りを今の利用者が使えるかと、使えない理由を取得する（D7）
 *
 * 外部へは送らず、回数にも数えない。取得の失敗は ApiError のまま投げる
 *
 * @returns 状態（使えるか・使えない理由）
 */
export async function getClaudeVisionStatus(): Promise<ClaudeVisionStatus> {
  return apiClient.get<ClaudeVisionStatus>('/api/claude-vision/status');
}
