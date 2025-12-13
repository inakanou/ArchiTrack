/**
 * @fileoverview プロジェクト管理機能のカスタムエラークラス
 *
 * Requirements:
 * - 1.15: プロジェクト作成時のプロジェクト名重複エラー（DuplicateProjectNameError）
 * - 8.6: 楽観的排他制御エラー（ProjectConflictError）
 * - 8.7: プロジェクト更新時のプロジェクト名重複エラー（DuplicateProjectNameError）
 * - 10.9: 無効なステータス遷移エラー（InvalidStatusTransitionError）
 * - 10.14: 差し戻し理由未入力エラー（ReasonRequiredError）
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';
import type { ProjectStatus, TransitionType } from '../types/project.types.js';

/**
 * 許可された遷移情報
 */
export interface AllowedTransition {
  status: ProjectStatus;
  type: TransitionType;
}

/**
 * プロジェクトが見つからない場合のエラー
 * 404 Not Found
 */
export class ProjectNotFoundError extends ApiError {
  constructor(public readonly projectId: string) {
    super(
      404,
      `Project not found: ${projectId}`,
      'PROJECT_NOT_FOUND',
      { projectId },
      PROBLEM_TYPES.NOT_FOUND
    );
    this.name = 'ProjectNotFoundError';
  }
}

/**
 * プロジェクトバリデーションエラー
 * 400 Bad Request
 */
export class ProjectValidationError extends ApiError {
  constructor(public readonly validationErrors: Record<string, string>) {
    super(
      400,
      'Validation failed',
      'PROJECT_VALIDATION_ERROR',
      validationErrors,
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'ProjectValidationError';
  }
}

/**
 * プロジェクト競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 */
export class ProjectConflictError extends ApiError {
  constructor(message: string, conflictDetails?: Record<string, unknown>) {
    super(409, message, 'PROJECT_CONFLICT', conflictDetails, PROBLEM_TYPES.CONFLICT);
    this.name = 'ProjectConflictError';
  }
}

/**
 * 無効なステータス遷移エラー
 * 422 Unprocessable Entity
 */
export class InvalidStatusTransitionError extends ApiError {
  constructor(
    public readonly fromStatus: ProjectStatus,
    public readonly toStatus: ProjectStatus,
    public readonly allowed: AllowedTransition[]
  ) {
    super(
      422,
      `Invalid transition from ${fromStatus} to ${toStatus}`,
      'INVALID_STATUS_TRANSITION',
      {
        fromStatus,
        toStatus,
        allowed,
      },
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'InvalidStatusTransitionError';
  }
}

/**
 * 差し戻し理由未入力エラー
 * 422 Unprocessable Entity
 */
export class ReasonRequiredError extends ApiError {
  constructor() {
    super(
      422,
      'Reason is required for backward transition',
      'REASON_REQUIRED',
      undefined,
      PROBLEM_TYPES.VALIDATION_ERROR
    );
    this.name = 'ReasonRequiredError';
  }
}

/**
 * プロジェクト名重複エラー
 * 409 Conflict
 *
 * Requirements:
 * - 1.15: プロジェクト作成時、同一のプロジェクト名が既に存在する場合のエラー
 * - 8.7: プロジェクト更新時、別のプロジェクトと重複するプロジェクト名に変更しようとした場合のエラー
 */
export class DuplicateProjectNameError extends ApiError {
  constructor(public readonly projectName: string) {
    super(
      409,
      'このプロジェクト名は既に使用されています',
      'PROJECT_NAME_DUPLICATE',
      { projectName },
      PROBLEM_TYPES.PROJECT_NAME_DUPLICATE
    );
    this.name = 'DuplicateProjectNameError';
  }
}
