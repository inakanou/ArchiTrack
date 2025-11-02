import { describe, it, expect } from 'vitest';
import {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
} from '../../../errors/ApiError.js';

describe('ApiError', () => {
  describe('ApiError基底クラス', () => {
    it('正しいプロパティを持つこと', () => {
      const error = new ApiError(400, 'Test error', 'TEST_CODE', { detail: 'test' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ detail: 'test' });
    });

    it('スタックトレースをキャプチャすること', () => {
      const error = new ApiError(500, 'Internal error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ApiError.test.ts');
    });

    it('toJSON()でシリアライズ可能なオブジェクトを返すこと', () => {
      const error = new ApiError(400, 'Bad request', 'BAD_REQUEST', { field: 'email' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Bad request',
        code: 'BAD_REQUEST',
        details: { field: 'email' },
      });
    });

    it('codeがない場合、toJSON()でcodeを含まないこと', () => {
      const error = new ApiError(500, 'Internal error');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Internal error',
      });
      expect(json).not.toHaveProperty('code');
    });

    it('detailsがない場合、toJSON()でdetailsを含まないこと', () => {
      const error = new ApiError(404, 'Not found', 'NOT_FOUND');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Not found',
        code: 'NOT_FOUND',
      });
      expect(json).not.toHaveProperty('details');
    });
  });

  describe('BadRequestError', () => {
    it('400ステータスコードを持つこと', () => {
      const error = new BadRequestError('Invalid input');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('BadRequestError');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('BAD_REQUEST');
    });

    it('カスタムコードとdetailsを設定できること', () => {
      const error = new BadRequestError('Invalid email', 'INVALID_EMAIL', { field: 'email' });

      expect(error.code).toBe('INVALID_EMAIL');
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('UnauthorizedError', () => {
    it('401ステータスコードを持つこと', () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('UnauthorizedError');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('カスタムメッセージとコードを設定できること', () => {
      const error = new UnauthorizedError('Token expired', 'TOKEN_EXPIRED');

      expect(error.message).toBe('Token expired');
      expect(error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('ForbiddenError', () => {
    it('403ステータスコードを持つこと', () => {
      const error = new ForbiddenError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ForbiddenError');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Forbidden');
      expect(error.code).toBe('FORBIDDEN');
    });

    it('カスタムメッセージを設定できること', () => {
      const error = new ForbiddenError('Access denied');

      expect(error.message).toBe('Access denied');
    });
  });

  describe('NotFoundError', () => {
    it('404ステータスコードを持つこと', () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('NotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not found');
      expect(error.code).toBe('NOT_FOUND');
    });

    it('カスタムメッセージを設定できること', () => {
      const error = new NotFoundError('User not found');

      expect(error.message).toBe('User not found');
    });
  });

  describe('ConflictError', () => {
    it('409ステータスコードを持つこと', () => {
      const error = new ConflictError('Resource already exists');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Resource already exists');
      expect(error.code).toBe('CONFLICT');
    });

    it('カスタムコードとdetailsを設定できること', () => {
      const error = new ConflictError('Email already exists', 'DUPLICATE_EMAIL', {
        field: 'email',
      });

      expect(error.code).toBe('DUPLICATE_EMAIL');
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('ValidationError', () => {
    it('400ステータスコードとVALIDATION_ERRORコードを持つこと', () => {
      const error = new ValidationError('Validation failed');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('バリデーション詳細を含むdetailsを設定できること', () => {
      const details = [
        { path: 'email', message: 'Invalid email format' },
        { path: 'password', message: 'Password too short' },
      ];
      const error = new ValidationError('Validation failed', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('InternalServerError', () => {
    it('500ステータスコードを持つこと', () => {
      const error = new InternalServerError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('InternalServerError');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Internal server error');
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('カスタムメッセージを設定できること', () => {
      const error = new InternalServerError('Database connection failed');

      expect(error.message).toBe('Database connection failed');
    });
  });

  describe('エラーの継承チェーン', () => {
    it('すべてのカスタムエラーがApiErrorを継承していること', () => {
      expect(new BadRequestError('test')).toBeInstanceOf(ApiError);
      expect(new UnauthorizedError()).toBeInstanceOf(ApiError);
      expect(new ForbiddenError()).toBeInstanceOf(ApiError);
      expect(new NotFoundError()).toBeInstanceOf(ApiError);
      expect(new ConflictError('test')).toBeInstanceOf(ApiError);
      expect(new ValidationError('test')).toBeInstanceOf(ApiError);
      expect(new InternalServerError()).toBeInstanceOf(ApiError);
    });

    it('すべてのエラーがErrorを継承していること', () => {
      expect(new ApiError(400, 'test')).toBeInstanceOf(Error);
      expect(new BadRequestError('test')).toBeInstanceOf(Error);
      expect(new UnauthorizedError()).toBeInstanceOf(Error);
    });
  });
});
