/**
 * @fileoverview Claude Vision APIクライアント
 *
 * Task 53.1: api/claude-vision.tsクライアントモジュールの実装
 *
 * Requirements:
 * - 24.4: Base64エンコード・バックエンド送信
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

// ============================================================================
// エラークラス
// ============================================================================

/**
 * Claude Vision API固有のエラークラス
 *
 * errorType, statusCode, shouldFallbackプロパティを持つ
 */
export class ClaudeVisionApiError extends Error {
  readonly errorType: ClaudeVisionErrorType;
  readonly statusCode: number;
  /** すべてのエラー種別でフォールバックを推奨 */
  readonly shouldFallback: boolean = true;

  constructor(message: string, errorType: ClaudeVisionErrorType, statusCode: number) {
    super(message);
    this.name = 'ClaudeVisionApiError';
    this.errorType = errorType;
    this.statusCode = statusCode;
  }
}

/**
 * ClaudeVisionApiError型ガード関数
 */
export function isClaudeVisionApiError(error: unknown): error is ClaudeVisionApiError {
  return error instanceof ClaudeVisionApiError;
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
    if (error instanceof ApiError) {
      // エラーレスポンスからerrorTypeを抽出
      const response = error.response as Record<string, unknown> | undefined;
      const errorType = (response?.errorType as ClaudeVisionErrorType) || 'unknown';

      throw new ClaudeVisionApiError(error.message, errorType, error.statusCode);
    }

    // その他のエラー（ネットワークエラー等）
    throw new ClaudeVisionApiError(
      error instanceof Error ? error.message : 'Unknown error',
      'unknown',
      0
    );
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
    if (error instanceof ApiError) {
      const response = error.response as Record<string, unknown> | undefined;
      const errorType = (response?.errorType as ClaudeVisionErrorType) || 'unknown';
      throw new ClaudeVisionApiError(error.message, errorType, error.statusCode);
    }

    throw new ClaudeVisionApiError(
      error instanceof Error ? error.message : 'Unknown error',
      'unknown',
      0
    );
  }
}
