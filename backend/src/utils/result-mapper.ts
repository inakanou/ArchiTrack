/**
 * @fileoverview Result型エラーマッパー
 *
 * Task 14.1: Result型ユーティリティ実装
 * - サービス層のエラー型をApiErrorに変換
 * - エラーマッピングロジックを一箇所に集約
 *
 * Requirements:
 * - design.md: Result型統合パターンの実装
 */

import {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
} from '../errors/apiError.js';
import { PasswordViolation } from '../types/password.types.js';

/**
 * サービス層のエラー型定義
 *
 * 各サービスが返すエラー型を統合した型
 */
export type ServiceError =
  // AuthError
  | { type: 'INVALID_CREDENTIALS' }
  | { type: 'ACCOUNT_LOCKED'; unlockAt: Date }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'INVALID_REFRESH_TOKEN' }
  | { type: 'REFRESH_TOKEN_EXPIRED' }
  | { type: 'INVALID_2FA_CODE' }
  | { type: 'DATABASE_ERROR'; message: string }
  // InvitationError
  | { type: 'INVITATION_INVALID' }
  | { type: 'INVITATION_EXPIRED' }
  | { type: 'INVITATION_ALREADY_USED' }
  | { type: 'EMAIL_ALREADY_REGISTERED' }
  | { type: 'INVALID_TOKEN' }
  | { type: 'EXPIRED_TOKEN' }
  | { type: 'USED_TOKEN' }
  | { type: 'REVOKED_TOKEN' }
  | { type: 'INVITATION_NOT_FOUND' }
  | { type: 'UNAUTHORIZED' }
  // PasswordError
  | { type: 'WEAK_PASSWORD'; violations: PasswordViolation[] }
  | { type: 'RESET_TOKEN_INVALID' }
  | { type: 'RESET_TOKEN_EXPIRED' }
  | { type: 'PASSWORD_REUSED' }
  // TwoFactorError
  | { type: 'ENCRYPTION_KEY_NOT_SET' }
  | { type: 'ENCRYPTION_FAILED'; message: string }
  | { type: 'DECRYPTION_FAILED'; message: string }
  | { type: 'QR_CODE_GENERATION_FAILED'; message: string }
  | { type: 'INVALID_SECRET_FORMAT' }
  | { type: 'TWO_FACTOR_NOT_ENABLED' }
  | { type: 'TWO_FACTOR_ALREADY_ENABLED' }
  | { type: 'INVALID_TOTP_CODE' }
  | { type: 'INVALID_BACKUP_CODE' }
  | { type: 'BACKUP_CODE_ALREADY_USED' }
  | { type: 'INVALID_PASSWORD' }
  // RoleError
  | { type: 'ROLE_NOT_FOUND' }
  | { type: 'ROLE_NAME_CONFLICT'; name: string }
  | { type: 'ROLE_IN_USE'; userCount: number }
  | { type: 'SYSTEM_ROLE_PROTECTED' }
  // PermissionError
  | { type: 'PERMISSION_NOT_FOUND' }
  | { type: 'PERMISSION_ALREADY_EXISTS'; resource: string; action: string }
  | { type: 'INVALID_PERMISSION_FORMAT'; message: string }
  | { type: 'PERMISSION_IN_USE'; roleCount: number }
  // RolePermissionError
  | { type: 'ASSIGNMENT_NOT_FOUND' }
  | { type: 'ADMIN_WILDCARD_PROTECTED' }
  // UserRoleError
  | { type: 'LAST_ADMIN_PROTECTED' }
  // RBACError
  | { type: 'CACHE_ERROR'; message: string };

/**
 * Result型エラーをApiErrorに変換するユーティリティ
 *
 * サービス層で発生したエラーを、コントローラー層でHTTPレスポンスに
 * 変換できるApiErrorに変換します。
 *
 * @param error - サービス層のエラー
 * @returns ApiErrorのインスタンス
 */
export function mapResultToApiError(error: ServiceError): ApiError {
  switch (error.type) {
    // === AuthError ===
    case 'INVALID_CREDENTIALS':
      return new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');

    case 'ACCOUNT_LOCKED':
      return new UnauthorizedError(
        `Account locked until ${error.unlockAt.toISOString()}`,
        'ACCOUNT_LOCKED'
      );

    case 'USER_NOT_FOUND':
      return new NotFoundError('User not found', 'USER_NOT_FOUND');

    case 'INVALID_REFRESH_TOKEN':
      return new UnauthorizedError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');

    case 'REFRESH_TOKEN_EXPIRED':
      return new UnauthorizedError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');

    case 'INVALID_2FA_CODE':
      return new UnauthorizedError('Invalid 2FA code', 'INVALID_2FA_CODE');

    case 'DATABASE_ERROR':
      return new InternalServerError(error.message || 'Database error', 'DATABASE_ERROR');

    // === InvitationError ===
    case 'INVITATION_INVALID':
    case 'INVALID_TOKEN':
      return new BadRequestError('Invalid invitation token', 'INVALID_TOKEN');

    case 'INVITATION_EXPIRED':
    case 'EXPIRED_TOKEN':
      return new BadRequestError('Invitation token expired', 'EXPIRED_TOKEN');

    case 'INVITATION_ALREADY_USED':
    case 'USED_TOKEN':
      return new BadRequestError('Invitation token already used', 'USED_TOKEN');

    case 'REVOKED_TOKEN':
      return new BadRequestError('Invitation token revoked', 'REVOKED_TOKEN');

    case 'INVITATION_NOT_FOUND':
      return new NotFoundError('Invitation not found', 'INVITATION_NOT_FOUND');

    case 'EMAIL_ALREADY_REGISTERED':
      return new ConflictError('Email already registered', 'EMAIL_ALREADY_REGISTERED');

    case 'UNAUTHORIZED':
      return new ForbiddenError('Unauthorized to perform this action', 'UNAUTHORIZED');

    // === PasswordError ===
    case 'WEAK_PASSWORD':
      return new BadRequestError('Password does not meet requirements', 'WEAK_PASSWORD', {
        violations: error.violations,
      });

    case 'RESET_TOKEN_INVALID':
      return new BadRequestError('Invalid password reset token', 'RESET_TOKEN_INVALID');

    case 'RESET_TOKEN_EXPIRED':
      return new BadRequestError('Password reset token expired', 'RESET_TOKEN_EXPIRED');

    case 'PASSWORD_REUSED':
      return new BadRequestError('Password was used in recent history', 'PASSWORD_REUSED');

    // === TwoFactorError ===
    case 'ENCRYPTION_KEY_NOT_SET':
      return new InternalServerError('2FA encryption key not configured', 'ENCRYPTION_KEY_NOT_SET');

    case 'ENCRYPTION_FAILED':
      return new InternalServerError(error.message || 'Encryption failed', 'ENCRYPTION_FAILED');

    case 'DECRYPTION_FAILED':
      return new InternalServerError(error.message || 'Decryption failed', 'DECRYPTION_FAILED');

    case 'QR_CODE_GENERATION_FAILED':
      return new InternalServerError(
        error.message || 'QR code generation failed',
        'QR_CODE_GENERATION_FAILED'
      );

    case 'INVALID_SECRET_FORMAT':
      return new BadRequestError('Invalid secret format', 'INVALID_SECRET_FORMAT');

    case 'TWO_FACTOR_NOT_ENABLED':
      return new BadRequestError('Two-factor authentication not enabled', 'TWO_FACTOR_NOT_ENABLED');

    case 'TWO_FACTOR_ALREADY_ENABLED':
      return new ConflictError(
        'Two-factor authentication already enabled',
        'TWO_FACTOR_ALREADY_ENABLED'
      );

    case 'INVALID_TOTP_CODE':
      return new UnauthorizedError('Invalid TOTP code', 'INVALID_TOTP_CODE');

    case 'INVALID_BACKUP_CODE':
      return new UnauthorizedError('Invalid backup code', 'INVALID_BACKUP_CODE');

    case 'BACKUP_CODE_ALREADY_USED':
      return new BadRequestError('Backup code already used', 'BACKUP_CODE_ALREADY_USED');

    case 'INVALID_PASSWORD':
      return new UnauthorizedError('Invalid password', 'INVALID_PASSWORD');

    // === RoleError ===
    case 'ROLE_NOT_FOUND':
      return new NotFoundError('Role not found', 'ROLE_NOT_FOUND');

    case 'ROLE_NAME_CONFLICT':
      return new ConflictError(`Role name '${error.name}' already exists`, 'ROLE_NAME_CONFLICT');

    case 'ROLE_IN_USE':
      return new BadRequestError(`Role is assigned to ${error.userCount} users`, 'ROLE_IN_USE');

    case 'SYSTEM_ROLE_PROTECTED':
      return new ForbiddenError('System roles cannot be modified', 'SYSTEM_ROLE_PROTECTED');

    // === PermissionError ===
    case 'PERMISSION_NOT_FOUND':
      return new NotFoundError('Permission not found', 'PERMISSION_NOT_FOUND');

    case 'PERMISSION_ALREADY_EXISTS':
      return new ConflictError(
        `Permission '${error.resource}:${error.action}' already exists`,
        'PERMISSION_ALREADY_EXISTS'
      );

    case 'INVALID_PERMISSION_FORMAT':
      return new BadRequestError(
        error.message || 'Invalid permission format',
        'INVALID_PERMISSION_FORMAT'
      );

    case 'PERMISSION_IN_USE':
      return new BadRequestError(
        `Permission is assigned to ${error.roleCount} roles`,
        'PERMISSION_IN_USE'
      );

    // === RolePermissionError ===
    case 'ASSIGNMENT_NOT_FOUND':
      return new NotFoundError('Assignment not found', 'ASSIGNMENT_NOT_FOUND');

    case 'ADMIN_WILDCARD_PROTECTED':
      return new ForbiddenError(
        'Cannot remove wildcard permission from admin role',
        'ADMIN_WILDCARD_PROTECTED'
      );

    // === UserRoleError ===
    case 'LAST_ADMIN_PROTECTED':
      return new ForbiddenError('Cannot remove last admin role from user', 'LAST_ADMIN_PROTECTED');

    // === RBACError ===
    case 'CACHE_ERROR':
      return new InternalServerError(error.message || 'Cache error', 'CACHE_ERROR');

    default:
      return new InternalServerError('An unexpected error occurred', 'UNKNOWN_ERROR');
  }
}
