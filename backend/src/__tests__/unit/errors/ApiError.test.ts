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
} from '../../../errors/apiError.js';
import { PROBLEM_TYPES } from '../../../types/problem-details.js';

describe('ApiError', () => {
  describe('ApiError base class', () => {
    it('should have correct properties', () => {
      const error = new ApiError(400, 'Test error', 'TEST_CODE', { detail: 'test' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ detail: 'test' });
    });

    it('should capture stack trace', () => {
      const error = new ApiError(500, 'Internal error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ApiError.test.ts');
    });

    it('toJSON() should return serializable object (legacy)', () => {
      const error = new ApiError(400, 'Bad request', 'BAD_REQUEST', { field: 'email' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Bad request',
        code: 'BAD_REQUEST',
        details: { field: 'email' },
      });
    });

    it('toJSON() should not include code when absent', () => {
      const error = new ApiError(500, 'Internal error');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Internal error',
      });
      expect(json).not.toHaveProperty('code');
    });

    it('toJSON() should not include details when absent', () => {
      const error = new ApiError(404, 'Not found', 'NOT_FOUND');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Not found',
        code: 'NOT_FOUND',
      });
      expect(json).not.toHaveProperty('details');
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new ApiError(
        400,
        'Test error',
        'TEST_CODE',
        { detail: 'test' },
        PROBLEM_TYPES.BAD_REQUEST
      );
      const problemDetails = error.toProblemDetails('/api/test');

      expect(problemDetails).toEqual({
        type: PROBLEM_TYPES.BAD_REQUEST,
        title: 'TEST_CODE',
        status: 400,
        detail: 'Test error',
        instance: '/api/test',
        details: { detail: 'test' },
      });
    });

    it('toProblemDetails() should use default type when problemType is absent', () => {
      const error = new ApiError(500, 'Internal error');
      const problemDetails = error.toProblemDetails('/api/test');

      expect(problemDetails.type).toBe(PROBLEM_TYPES.INTERNAL_SERVER_ERROR);
    });

    it('toProblemDetails() should not include extensions when details is absent', () => {
      const error = new ApiError(404, 'Not found', 'NOT_FOUND', undefined, PROBLEM_TYPES.NOT_FOUND);
      const problemDetails = error.toProblemDetails('/api/test');

      expect(problemDetails).not.toHaveProperty('details');
    });
  });

  describe('BadRequestError', () => {
    it('should have 400 status code', () => {
      const error = new BadRequestError('Invalid input');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('BadRequestError');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.problemType).toBe(PROBLEM_TYPES.BAD_REQUEST);
    });

    it('should set custom code and details', () => {
      const error = new BadRequestError('Invalid email', 'INVALID_EMAIL', { field: 'email' });

      expect(error.code).toBe('INVALID_EMAIL');
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('UnauthorizedError', () => {
    it('should have 401 status code', () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('UnauthorizedError');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.problemType).toBe(PROBLEM_TYPES.UNAUTHORIZED);
    });

    it('should set custom message and code', () => {
      const error = new UnauthorizedError('Token expired', 'TOKEN_EXPIRED');

      expect(error.message).toBe('Token expired');
      expect(error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('ForbiddenError', () => {
    it('should have 403 status code', () => {
      const error = new ForbiddenError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ForbiddenError');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Forbidden');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.problemType).toBe(PROBLEM_TYPES.FORBIDDEN);
    });

    it('should set custom message', () => {
      const error = new ForbiddenError('Access denied');

      expect(error.message).toBe('Access denied');
    });
  });

  describe('NotFoundError', () => {
    it('should have 404 status code', () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('NotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.problemType).toBe(PROBLEM_TYPES.NOT_FOUND);
    });

    it('should set custom message', () => {
      const error = new NotFoundError('User not found');

      expect(error.message).toBe('User not found');
    });
  });

  describe('ConflictError', () => {
    it('should have 409 status code', () => {
      const error = new ConflictError('Resource already exists');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Resource already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
    });

    it('should set custom code and details', () => {
      const error = new ConflictError('Email already exists', 'DUPLICATE_EMAIL', {
        field: 'email',
      });

      expect(error.code).toBe('DUPLICATE_EMAIL');
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('ValidationError', () => {
    it('should have 400 status code and VALIDATION_ERROR code', () => {
      const error = new ValidationError('Validation failed');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.problemType).toBe(PROBLEM_TYPES.VALIDATION_ERROR);
    });

    it('should set details with validation errors', () => {
      const details = [
        { path: 'email', message: 'Invalid email format' },
        { path: 'password', message: 'Password too short' },
      ];
      const error = new ValidationError('Validation failed', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('InternalServerError', () => {
    it('should have 500 status code', () => {
      const error = new InternalServerError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('InternalServerError');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Internal server error');
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.problemType).toBe(PROBLEM_TYPES.INTERNAL_SERVER_ERROR);
    });

    it('should set custom message', () => {
      const error = new InternalServerError('Database connection failed');

      expect(error.message).toBe('Database connection failed');
    });
  });

  describe('Error inheritance chain', () => {
    it('all custom errors should inherit from ApiError', () => {
      expect(new BadRequestError('test')).toBeInstanceOf(ApiError);
      expect(new UnauthorizedError()).toBeInstanceOf(ApiError);
      expect(new ForbiddenError()).toBeInstanceOf(ApiError);
      expect(new NotFoundError()).toBeInstanceOf(ApiError);
      expect(new ConflictError('test')).toBeInstanceOf(ApiError);
      expect(new ValidationError('test')).toBeInstanceOf(ApiError);
      expect(new InternalServerError()).toBeInstanceOf(ApiError);
    });

    it('all errors should inherit from Error', () => {
      expect(new ApiError(400, 'test')).toBeInstanceOf(Error);
      expect(new BadRequestError('test')).toBeInstanceOf(Error);
      expect(new UnauthorizedError()).toBeInstanceOf(Error);
    });
  });
});
