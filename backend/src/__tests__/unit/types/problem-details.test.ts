/**
 * @fileoverview RFC 9457 Problem Details単体テスト
 *
 * RFC 9457 (Problem Details for HTTP APIs) 準拠の
 * Problem Details実装の単体テストです。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9457
 */

import { describe, it, expect } from 'vitest';
import {
  createProblemDetails,
  PROBLEM_TYPES,
  ProblemDetails,
} from '../../../types/problem-details.js';

describe('Problem Details (RFC 9457)', () => {
  describe('createProblemDetails()', () => {
    it('必須フィールドのみでProblem Detailsを作成できる', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.BAD_REQUEST,
        title: 'Bad Request',
        status: 400,
      });

      expect(problem).toEqual({
        type: PROBLEM_TYPES.BAD_REQUEST,
        title: 'Bad Request',
        status: 400,
      });
    });

    it('detailフィールドを含めて作成できる', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'Validation Error',
        status: 400,
        detail: 'The email field is required',
      });

      expect(problem).toEqual({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'Validation Error',
        status: 400,
        detail: 'The email field is required',
      });
    });

    it('instanceフィールドを含めて作成できる', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.NOT_FOUND,
        title: 'Not Found',
        status: 404,
        instance: '/api/users/123',
      });

      expect(problem).toEqual({
        type: PROBLEM_TYPES.NOT_FOUND,
        title: 'Not Found',
        status: 404,
        instance: '/api/users/123',
      });
    });

    it('全てのフィールドを含めて作成できる', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.FORBIDDEN,
        title: 'Forbidden',
        status: 403,
        detail: 'You do not have permission to access this resource',
        instance: '/api/admin/settings',
      });

      expect(problem).toEqual({
        type: PROBLEM_TYPES.FORBIDDEN,
        title: 'Forbidden',
        status: 403,
        detail: 'You do not have permission to access this resource',
        instance: '/api/admin/settings',
      });
    });

    it('拡張フィールドを含めて作成できる', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'Validation Error',
        status: 400,
        extensions: {
          errors: [
            { field: 'email', message: 'Invalid email format' },
            { field: 'password', message: 'Password too weak' },
          ],
        },
      });

      expect(problem).toEqual({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'Validation Error',
        status: 400,
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'password', message: 'Password too weak' },
        ],
      });
    });

    it('複数の拡張フィールドを含めて作成できる', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'Conflict',
        status: 409,
        detail: 'Email already exists',
        extensions: {
          existingUserId: 'user-123',
          conflictField: 'email',
          suggestedAction: 'Try logging in instead',
        },
      });

      expect(problem).toEqual({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'Conflict',
        status: 409,
        detail: 'Email already exists',
        existingUserId: 'user-123',
        conflictField: 'email',
        suggestedAction: 'Try logging in instead',
      });
    });

    it('空の拡張フィールドでも正常に作成できる', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.INTERNAL_SERVER_ERROR,
        title: 'Internal Server Error',
        status: 500,
        extensions: {},
      });

      expect(problem).toEqual({
        type: PROBLEM_TYPES.INTERNAL_SERVER_ERROR,
        title: 'Internal Server Error',
        status: 500,
      });
    });

    it('undefinedのオプショナルフィールドは含まれない', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.UNAUTHORIZED,
        title: 'Unauthorized',
        status: 401,
        detail: undefined,
        instance: undefined,
      });

      expect(problem).not.toHaveProperty('detail');
      expect(problem).not.toHaveProperty('instance');
      expect(Object.keys(problem)).toEqual(['type', 'title', 'status']);
    });
  });

  describe('PROBLEM_TYPES 定数', () => {
    it('全てのPROBLEM_TYPESが正しいURI形式である', () => {
      const uriPattern = /^https:\/\/api\.architrack\.com\/errors\/.+$/;

      Object.values(PROBLEM_TYPES).forEach((type) => {
        expect(type).toMatch(uriPattern);
      });
    });

    it('VALIDATION_ERROR タイプが定義されている', () => {
      expect(PROBLEM_TYPES.VALIDATION_ERROR).toBe(
        'https://api.architrack.com/errors/validation-error'
      );
    });

    it('UNAUTHORIZED タイプが定義されている', () => {
      expect(PROBLEM_TYPES.UNAUTHORIZED).toBe('https://api.architrack.com/errors/unauthorized');
    });

    it('FORBIDDEN タイプが定義されている', () => {
      expect(PROBLEM_TYPES.FORBIDDEN).toBe('https://api.architrack.com/errors/forbidden');
    });

    it('NOT_FOUND タイプが定義されている', () => {
      expect(PROBLEM_TYPES.NOT_FOUND).toBe('https://api.architrack.com/errors/not-found');
    });

    it('CONFLICT タイプが定義されている', () => {
      expect(PROBLEM_TYPES.CONFLICT).toBe('https://api.architrack.com/errors/conflict');
    });

    it('INTERNAL_SERVER_ERROR タイプが定義されている', () => {
      expect(PROBLEM_TYPES.INTERNAL_SERVER_ERROR).toBe(
        'https://api.architrack.com/errors/internal-server-error'
      );
    });

    it('BAD_REQUEST タイプが定義されている', () => {
      expect(PROBLEM_TYPES.BAD_REQUEST).toBe('https://api.architrack.com/errors/bad-request');
    });

    it('WEAK_PASSWORD タイプが定義されている', () => {
      expect(PROBLEM_TYPES.WEAK_PASSWORD).toBe('https://api.architrack.com/errors/weak-password');
    });

    it('ACCOUNT_LOCKED タイプが定義されている', () => {
      expect(PROBLEM_TYPES.ACCOUNT_LOCKED).toBe('https://api.architrack.com/errors/account-locked');
    });

    it('INVALID_CREDENTIALS タイプが定義されている', () => {
      expect(PROBLEM_TYPES.INVALID_CREDENTIALS).toBe(
        'https://api.architrack.com/errors/invalid-credentials'
      );
    });

    it('TOKEN_EXPIRED タイプが定義されている', () => {
      expect(PROBLEM_TYPES.TOKEN_EXPIRED).toBe('https://api.architrack.com/errors/token-expired');
    });

    it('重複するPROBLEM_TYPESが存在しない', () => {
      const types = Object.values(PROBLEM_TYPES);
      const uniqueTypes = new Set(types);

      expect(types.length).toBe(uniqueTypes.size);
    });

    it('PROBLEM_TYPESの構造が正しい', () => {
      // TypeScriptのas constは型レベルでの読み取り専用を保証
      // コンパイル時に型エラーとなるため、実行時テストは不要

      // 全てのプロパティが文字列であることを確認
      Object.values(PROBLEM_TYPES).forEach((type) => {
        expect(typeof type).toBe('string');
      });

      // 期待されるプロパティ数を確認
      expect(Object.keys(PROBLEM_TYPES).length).toBe(13);
    });

    it('PROJECT_NAME_DUPLICATE タイプが定義されている', () => {
      expect(PROBLEM_TYPES.PROJECT_NAME_DUPLICATE).toBe(
        'https://api.architrack.com/errors/project-name-duplicate'
      );
    });
  });

  describe('ProblemDetails インターフェース準拠', () => {
    it('必須フィールドを持つオブジェクトはProblemDetailsとして有効', () => {
      const problem: ProblemDetails = {
        type: 'https://example.com/error',
        title: 'Error Title',
        status: 500,
      };

      expect(problem.type).toBeDefined();
      expect(problem.title).toBeDefined();
      expect(problem.status).toBeDefined();
    });

    it('オプショナルフィールドを持つオブジェクトはProblemDetailsとして有効', () => {
      const problem: ProblemDetails = {
        type: 'https://example.com/error',
        title: 'Error Title',
        status: 500,
        detail: 'Detailed explanation',
        instance: '/api/resource/123',
      };

      expect(problem.detail).toBeDefined();
      expect(problem.instance).toBeDefined();
    });

    it('拡張フィールドを持つオブジェクトはProblemDetailsとして有効', () => {
      const problem: ProblemDetails = {
        type: 'https://example.com/error',
        title: 'Error Title',
        status: 500,
        customField: 'custom value',
        anotherField: 123,
      };

      expect(problem.customField).toBe('custom value');
      expect(problem.anotherField).toBe(123);
    });
  });

  describe('RFC 9457準拠性', () => {
    it('typeフィールドはURI参照である', () => {
      const problem = createProblemDetails({
        type: 'https://example.com/errors/out-of-credit',
        title: 'Out of Credit',
        status: 403,
      });

      // URI参照の基本的な形式チェック
      expect(problem.type).toMatch(/^https?:\/\/.+/);
    });

    it('statusフィールドはHTTPステータスコードである', () => {
      const validStatusCodes = [200, 201, 400, 401, 403, 404, 409, 500, 502, 503];

      validStatusCodes.forEach((status) => {
        const problem = createProblemDetails({
          type: PROBLEM_TYPES.INTERNAL_SERVER_ERROR,
          title: 'Test',
          status,
        });

        expect(problem.status).toBeGreaterThanOrEqual(100);
        expect(problem.status).toBeLessThan(600);
      });
    });

    it('titleフィールドは人間が読める形式である', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.NOT_FOUND,
        title: 'Resource Not Found',
        status: 404,
      });

      expect(problem.title).toBeTruthy();
      expect(typeof problem.title).toBe('string');
      expect(problem.title.length).toBeGreaterThan(0);
    });

    it('detailフィールドは問題の具体的な説明である', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'Validation Error',
        status: 400,
        detail: 'The provided email address is already registered in the system',
      });

      expect(problem.detail).toBeTruthy();
      expect(typeof problem.detail).toBe('string');
    });

    it('instanceフィールドは問題の発生箇所を示すURI参照である', () => {
      const problem = createProblemDetails({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'Conflict',
        status: 409,
        instance: '/api/v1/users/create',
      });

      expect(problem.instance).toBeTruthy();
      expect(typeof problem.instance).toBe('string');
      expect(problem.instance).toMatch(/^\/api\//);
    });
  });
});
