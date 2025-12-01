/**
 * @fileoverview コントローラーヘルパー関数の単体テスト
 *
 * Task 14.1: Result型ユーティリティ実装検証
 * - handleServiceResult関数がResult型を処理しHTTPレスポンスを返す
 *
 * TDD: RED Phase - テストを先に書く
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { handleServiceResult } from '../../../utils/controller-helpers.js';
import { Ok, Err } from '../../../types/result.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../../errors/apiError.js';

describe('handleServiceResult', () => {
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('success cases', () => {
    it('should return 200 status with value for successful Result', async () => {
      const successValue = { id: '123', name: 'Test User' };
      const result = Ok(successValue);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(successValue);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use custom successStatus when provided', async () => {
      const successValue = { id: '456', name: 'New User' };
      const result = Ok(successValue);

      await handleServiceResult(result, mockRes as Response, mockNext, {
        successStatus: 201,
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(successValue);
    });

    it('should transform value when transform function is provided', async () => {
      const successValue = { id: '789', fullName: 'John Doe', secret: 'hidden' };
      const result = Ok(successValue);

      await handleServiceResult(result, mockRes as Response, mockNext, {
        transform: (value) => ({ id: value.id, fullName: value.fullName }),
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ id: '789', fullName: 'John Doe' });
    });

    it('should handle void success values', async () => {
      const result = Ok(undefined);

      await handleServiceResult(result, mockRes as Response, mockNext, {
        successStatus: 204,
      });

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.json).toHaveBeenCalledWith(undefined);
    });

    it('should handle array success values', async () => {
      const successValue = [{ id: '1' }, { id: '2' }];
      const result = Ok(successValue);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(successValue);
    });
  });

  describe('error cases', () => {
    it('should call next with ApiError for failed Result', async () => {
      const error = { type: 'INVITATION_INVALID' as const };
      const result = Err(error);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const calls = (mockNext as ReturnType<typeof vi.fn>).mock.calls;
      const calledError = calls[0]?.[0];
      expect(calledError).toBeInstanceOf(BadRequestError);
    });

    it('should map USER_NOT_FOUND to NotFoundError', async () => {
      const error = { type: 'USER_NOT_FOUND' as const };
      const result = Err(error);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const calls = (mockNext as ReturnType<typeof vi.fn>).mock.calls;
      const calledError = calls[0]?.[0];
      expect(calledError).toBeInstanceOf(NotFoundError);
    });

    it('should map INVALID_CREDENTIALS to UnauthorizedError', async () => {
      const error = { type: 'INVALID_CREDENTIALS' as const };
      const result = Err(error);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const calls = (mockNext as ReturnType<typeof vi.fn>).mock.calls;
      const calledError = calls[0]?.[0];
      expect(calledError).toBeInstanceOf(UnauthorizedError);
    });

    it('should not call res.status or res.json for errors', async () => {
      const error = { type: 'DATABASE_ERROR' as const, message: 'Connection failed' };
      const result = Err(error);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle null success values', async () => {
      const result = Ok(null);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(null);
    });

    it('should handle empty object success values', async () => {
      const result = Ok({});

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({});
    });

    it('should handle complex nested success values', async () => {
      const complexValue = {
        user: {
          id: '123',
          profile: {
            name: 'Test',
            settings: { theme: 'dark' },
          },
        },
        tokens: ['token1', 'token2'],
      };
      const result = Ok(complexValue);

      await handleServiceResult(result, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(complexValue);
    });
  });
});
