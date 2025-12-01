/**
 * @fileoverview Result型エラーマッパーの単体テスト
 *
 * Task 14.1: Result型ユーティリティ実装検証
 * - mapResultToApiError関数が全エラー型をApiErrorにマッピングする
 *
 * TDD: RED Phase - テストを先に書く
 */

import { describe, it, expect } from 'vitest';
import { mapResultToApiError, type ServiceError } from '../../../utils/result-mapper.js';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InternalServerError,
  ConflictError,
} from '../../../errors/apiError.js';
import { PasswordViolation } from '../../../types/password.types.js';

describe('mapResultToApiError', () => {
  describe('AuthError mapping', () => {
    it('should map INVITATION_INVALID to BadRequestError', () => {
      const error: ServiceError = { type: 'INVITATION_INVALID' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
      expect(result.message).toContain('invitation');
    });

    it('should map INVITATION_EXPIRED to BadRequestError', () => {
      const error: ServiceError = { type: 'INVITATION_EXPIRED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
      expect(result.message).toContain('expired');
    });

    it('should map INVITATION_ALREADY_USED to BadRequestError', () => {
      const error: ServiceError = { type: 'INVITATION_ALREADY_USED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map EMAIL_ALREADY_REGISTERED to ConflictError', () => {
      const error: ServiceError = { type: 'EMAIL_ALREADY_REGISTERED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ConflictError);
      expect(result.statusCode).toBe(409);
    });

    it('should map WEAK_PASSWORD to BadRequestError with violations', () => {
      const error: ServiceError = {
        type: 'WEAK_PASSWORD',
        violations: [PasswordViolation.TOO_SHORT, PasswordViolation.NO_DIGIT],
      };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
      expect(result.details).toBeDefined();
    });

    it('should map INVALID_CREDENTIALS to UnauthorizedError', () => {
      const error: ServiceError = { type: 'INVALID_CREDENTIALS' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
    });

    it('should map ACCOUNT_LOCKED to UnauthorizedError with unlockAt', () => {
      const unlockAt = new Date(Date.now() + 30 * 60 * 1000);
      const error: ServiceError = { type: 'ACCOUNT_LOCKED', unlockAt };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
      expect(result.message).toContain('locked');
    });

    it('should map USER_NOT_FOUND to NotFoundError', () => {
      const error: ServiceError = { type: 'USER_NOT_FOUND' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(NotFoundError);
      expect(result.statusCode).toBe(404);
    });

    it('should map INVALID_REFRESH_TOKEN to UnauthorizedError', () => {
      const error: ServiceError = { type: 'INVALID_REFRESH_TOKEN' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
    });

    it('should map REFRESH_TOKEN_EXPIRED to UnauthorizedError', () => {
      const error: ServiceError = { type: 'REFRESH_TOKEN_EXPIRED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
    });

    it('should map INVALID_2FA_CODE to UnauthorizedError', () => {
      const error: ServiceError = { type: 'INVALID_2FA_CODE' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
    });

    it('should map DATABASE_ERROR to InternalServerError', () => {
      const error: ServiceError = { type: 'DATABASE_ERROR', message: 'Connection failed' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('InvitationError mapping', () => {
    it('should map INVALID_TOKEN to BadRequestError', () => {
      const error: ServiceError = { type: 'INVALID_TOKEN' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map EXPIRED_TOKEN to BadRequestError', () => {
      const error: ServiceError = { type: 'EXPIRED_TOKEN' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map USED_TOKEN to BadRequestError', () => {
      const error: ServiceError = { type: 'USED_TOKEN' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map REVOKED_TOKEN to BadRequestError', () => {
      const error: ServiceError = { type: 'REVOKED_TOKEN' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map INVITATION_NOT_FOUND to NotFoundError', () => {
      const error: ServiceError = { type: 'INVITATION_NOT_FOUND' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(NotFoundError);
      expect(result.statusCode).toBe(404);
    });

    it('should map UNAUTHORIZED to ForbiddenError', () => {
      const error: ServiceError = { type: 'UNAUTHORIZED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ForbiddenError);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('PasswordError mapping', () => {
    it('should map RESET_TOKEN_INVALID to BadRequestError', () => {
      const error: ServiceError = { type: 'RESET_TOKEN_INVALID' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map RESET_TOKEN_EXPIRED to BadRequestError', () => {
      const error: ServiceError = { type: 'RESET_TOKEN_EXPIRED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map PASSWORD_REUSED to BadRequestError', () => {
      const error: ServiceError = { type: 'PASSWORD_REUSED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('TwoFactorError mapping', () => {
    it('should map ENCRYPTION_KEY_NOT_SET to InternalServerError', () => {
      const error: ServiceError = { type: 'ENCRYPTION_KEY_NOT_SET' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.statusCode).toBe(500);
    });

    it('should map ENCRYPTION_FAILED to InternalServerError', () => {
      const error: ServiceError = { type: 'ENCRYPTION_FAILED', message: 'Encryption error' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.statusCode).toBe(500);
    });

    it('should map DECRYPTION_FAILED to InternalServerError', () => {
      const error: ServiceError = { type: 'DECRYPTION_FAILED', message: 'Decryption error' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.statusCode).toBe(500);
    });

    it('should map QR_CODE_GENERATION_FAILED to InternalServerError', () => {
      const error: ServiceError = { type: 'QR_CODE_GENERATION_FAILED', message: 'QR error' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.statusCode).toBe(500);
    });

    it('should map INVALID_SECRET_FORMAT to BadRequestError', () => {
      const error: ServiceError = { type: 'INVALID_SECRET_FORMAT' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map TWO_FACTOR_NOT_ENABLED to BadRequestError', () => {
      const error: ServiceError = { type: 'TWO_FACTOR_NOT_ENABLED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map TWO_FACTOR_ALREADY_ENABLED to ConflictError', () => {
      const error: ServiceError = { type: 'TWO_FACTOR_ALREADY_ENABLED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ConflictError);
      expect(result.statusCode).toBe(409);
    });

    it('should map INVALID_TOTP_CODE to UnauthorizedError', () => {
      const error: ServiceError = { type: 'INVALID_TOTP_CODE' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
    });

    it('should map INVALID_BACKUP_CODE to UnauthorizedError', () => {
      const error: ServiceError = { type: 'INVALID_BACKUP_CODE' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
    });

    it('should map BACKUP_CODE_ALREADY_USED to BadRequestError', () => {
      const error: ServiceError = { type: 'BACKUP_CODE_ALREADY_USED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map INVALID_PASSWORD to UnauthorizedError', () => {
      const error: ServiceError = { type: 'INVALID_PASSWORD' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(UnauthorizedError);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('RoleError mapping', () => {
    it('should map ROLE_NOT_FOUND to NotFoundError', () => {
      const error: ServiceError = { type: 'ROLE_NOT_FOUND' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(NotFoundError);
      expect(result.statusCode).toBe(404);
    });

    it('should map ROLE_NAME_CONFLICT to ConflictError', () => {
      const error: ServiceError = { type: 'ROLE_NAME_CONFLICT', name: 'Admin' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ConflictError);
      expect(result.statusCode).toBe(409);
    });

    it('should map ROLE_IN_USE to BadRequestError', () => {
      const error: ServiceError = { type: 'ROLE_IN_USE', userCount: 5 };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map SYSTEM_ROLE_PROTECTED to ForbiddenError', () => {
      const error: ServiceError = { type: 'SYSTEM_ROLE_PROTECTED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ForbiddenError);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('PermissionError mapping', () => {
    it('should map PERMISSION_NOT_FOUND to NotFoundError', () => {
      const error: ServiceError = { type: 'PERMISSION_NOT_FOUND' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(NotFoundError);
      expect(result.statusCode).toBe(404);
    });

    it('should map PERMISSION_ALREADY_EXISTS to ConflictError', () => {
      const error: ServiceError = {
        type: 'PERMISSION_ALREADY_EXISTS',
        resource: 'user',
        action: 'read',
      };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ConflictError);
      expect(result.statusCode).toBe(409);
    });

    it('should map INVALID_PERMISSION_FORMAT to BadRequestError', () => {
      const error: ServiceError = {
        type: 'INVALID_PERMISSION_FORMAT',
        message: 'Invalid format',
      };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });

    it('should map PERMISSION_IN_USE to BadRequestError', () => {
      const error: ServiceError = { type: 'PERMISSION_IN_USE', roleCount: 3 };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(BadRequestError);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('RolePermissionError mapping', () => {
    it('should map ASSIGNMENT_NOT_FOUND to NotFoundError', () => {
      const error: ServiceError = { type: 'ASSIGNMENT_NOT_FOUND' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(NotFoundError);
      expect(result.statusCode).toBe(404);
    });

    it('should map ADMIN_WILDCARD_PROTECTED to ForbiddenError', () => {
      const error: ServiceError = { type: 'ADMIN_WILDCARD_PROTECTED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ForbiddenError);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('UserRoleError mapping', () => {
    it('should map LAST_ADMIN_PROTECTED to ForbiddenError', () => {
      const error: ServiceError = { type: 'LAST_ADMIN_PROTECTED' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(ForbiddenError);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('RBACError mapping', () => {
    it('should map CACHE_ERROR to InternalServerError', () => {
      const error: ServiceError = { type: 'CACHE_ERROR', message: 'Redis connection failed' };
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('Unknown error handling', () => {
    it('should return InternalServerError for unknown error types', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error = { type: 'UNKNOWN_ERROR_TYPE' } as any;
      const result = mapResultToApiError(error);

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.statusCode).toBe(500);
    });
  });
});
