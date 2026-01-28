/**
 * @fileoverview 自社情報管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 2.8: 楽観的排他制御で競合が検出された場合、「他のユーザーによって更新されました。画面を更新してください」エラー
 * - 6.9: 権限のないユーザーが操作を試みた場合、403 Forbiddenエラーを返却
 * - 7.1: ネットワークエラー発生時の適切なエラー表示
 * - 7.2: サーバーエラー（5xx）発生時の適切なエラー表示
 *
 * Design Reference: design.md - Error Handling セクション
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * 自社情報競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 *
 * Requirements:
 * - 2.8: 楽観的排他制御で競合が検出された場合のエラー
 * - 9.9: versionが一致しない場合、409 Conflictエラーを返却
 */
export class CompanyInfoConflictError extends ApiError {
  constructor(message?: string, conflictDetails?: Record<string, unknown>) {
    super(
      409,
      message || '他のユーザーによって更新されました。画面を更新してください',
      'COMPANY_INFO_CONFLICT',
      conflictDetails,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'CompanyInfoConflictError';
  }
}
