/**
 * @fileoverview コントローラーヘルパー関数
 *
 * Task 14.1: Result型ユーティリティ実装
 * - Result型を処理し、HTTPレスポンスまたはエラーをスローする
 * - コントローラー層でのResult型処理を標準化
 *
 * Requirements:
 * - design.md: handleServiceResult関数の実装
 */

import type { Response, NextFunction } from 'express';
import type { Result } from '../types/result.js';
import { mapResultToApiError, type ServiceError } from './result-mapper.js';

/**
 * handleServiceResultのオプション
 */
interface HandleServiceResultOptions<T> {
  /**
   * 成功時のHTTPステータスコード（デフォルト: 200）
   */
  successStatus?: number;
  /**
   * レスポンスを変換する関数
   */
  transform?: (value: T) => unknown;
}

/**
 * サービス層のResult型を処理し、HTTPレスポンスまたはエラーをスローする
 *
 * @template T - 成功時の値の型
 * @template E - エラーの型
 * @param result - サービス層から返されたResult型
 * @param res - Expressレスポンスオブジェクト
 * @param next - Express next関数
 * @param options - オプション設定
 */
export async function handleServiceResult<T, E extends ServiceError>(
  result: Result<T, E>,
  res: Response,
  next: NextFunction,
  options?: HandleServiceResultOptions<T>
): Promise<void> {
  const { successStatus = 200, transform } = options || {};

  // エラーの場合
  if (!result.ok) {
    const apiError = mapResultToApiError(result.error);
    return next(apiError);
  }

  // 成功の場合
  const responseData = transform ? transform(result.value) : result.value;
  res.status(successStatus).json(responseData);
}
