import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { errorHandler, notFoundHandler } from '../../../middleware/errorHandler.middleware.js';
import { ApiError, BadRequestError, ValidationError } from '../../../errors/ApiError.js';

// Prismaモジュールのモック（ホイスティングされるため、クラス定義をモック内に移動）
vi.mock('@prisma/client', async () => {
  // Prismaエラークラスのモック
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    meta?: Record<string, unknown>;
    clientVersion: string;

    constructor(
      message: string,
      {
        code,
        clientVersion,
        meta,
      }: { code: string; clientVersion: string; meta?: Record<string, unknown> }
    ) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = code;
      this.clientVersion = clientVersion;
      this.meta = meta;
      Object.setPrototypeOf(this, MockPrismaClientKnownRequestError.prototype);
    }
  }

  class MockPrismaClientInitializationError extends Error {
    clientVersion: string;

    constructor(message: string, clientVersion: string) {
      super(message);
      this.name = 'PrismaClientInitializationError';
      this.clientVersion = clientVersion;
      Object.setPrototypeOf(this, MockPrismaClientInitializationError.prototype);
    }
  }

  class MockPrismaClientRustPanicError extends Error {
    clientVersion: string;

    constructor(message: string, clientVersion: string) {
      super(message);
      this.name = 'PrismaClientRustPanicError';
      this.clientVersion = clientVersion;
      Object.setPrototypeOf(this, MockPrismaClientRustPanicError.prototype);
    }
  }

  return {
    Prisma: {
      PrismaClientKnownRequestError: MockPrismaClientKnownRequestError,
      PrismaClientInitializationError: MockPrismaClientInitializationError,
      PrismaClientRustPanicError: MockPrismaClientRustPanicError,
    },
  };
});

// モック後にPrismaをインポート
const { Prisma } = await import('@prisma/client');

describe('errorHandler middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // モックのリセット
    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn();

    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockRequest = {
      log: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      } as unknown as Request['log'],
      method: 'POST',
      url: '/api/test',
      ip: '127.0.0.1',
      body: { test: 'data' },
      query: { page: '1' },
      params: { id: '123' },
    };

    mockResponse = {
      status: statusMock as unknown as Response['status'],
      json: jsonMock as unknown as Response['json'],
    };

    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockNext = vi.fn() as unknown as NextFunction;
  });

  describe('ApiError処理', () => {
    it('ApiErrorを適切に処理すること', () => {
      const error = new ApiError(400, 'Test error', 'TEST_CODE', { detail: 'test' });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.warn).toHaveBeenCalledWith(
        { err: error, statusCode: 400 },
        'API error'
      );
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Test error',
        code: 'TEST_CODE',
        details: { detail: 'test' },
      });
    });

    it('BadRequestErrorを適切に処理すること', () => {
      const error = new BadRequestError('Invalid input');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid input',
        code: 'BAD_REQUEST',
      });
    });

    it('ValidationErrorを適切に処理すること', () => {
      const error = new ValidationError('Validation failed', [
        { path: 'email', message: 'Invalid email' },
      ]);

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ path: 'email', message: 'Invalid email' }],
      });
    });
  });

  describe('ZodError処理', () => {
    it('ZodErrorを適切に処理すること', () => {
      const zodIssues: ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Expected string, received number',
        } as ZodIssue,
        {
          code: 'too_small',
          minimum: 8,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['password'],
          message: 'String must contain at least 8 character(s)',
          origin: 'value',
        } as unknown as ZodIssue,
      ];

      const zodError = new ZodError(zodIssues);

      errorHandler(zodError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.warn).toHaveBeenCalledWith({ err: zodError }, 'Validation error');
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [
          {
            path: 'email',
            message: 'Expected string, received number',
          },
          {
            path: 'password',
            message: 'String must contain at least 8 character(s)',
          },
        ],
      });
    });

    it('ネストされたパスを持つZodErrorを処理すること', () => {
      const zodIssues: ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['user', 'profile', 'name'],
          message: 'Required',
        } as ZodIssue,
      ];

      const zodError = new ZodError(zodIssues);

      errorHandler(zodError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [
          {
            path: 'user.profile.name',
            message: 'Required',
          },
        ],
      });
    });
  });

  describe('Prismaエラー処理', () => {
    it('P2002 (Unique constraint violation) を適切に処理すること', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: {
          target: ['email'],
        },
      });

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.warn).toHaveBeenCalledWith(
        { err: prismaError, code: 'P2002' },
        'Prisma error'
      );
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Resource already exists',
        code: 'DUPLICATE_RESOURCE',
        details: {
          fields: ['email'],
        },
      });
    });

    it('P2025 (Record not found) を適切に処理すること', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Resource not found',
        code: 'NOT_FOUND',
      });
    });

    it('その他のPrismaClientKnownRequestErrorを処理すること', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Some error', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Database operation failed',
        code: 'DATABASE_ERROR',
      });
    });

    it('PrismaClientInitializationErrorを処理すること', () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Cannot connect to database',
        '5.0.0'
      );

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.error).toHaveBeenCalledWith(
        { err: prismaError },
        'Prisma connection error'
      );
      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Database connection error',
        code: 'DATABASE_UNAVAILABLE',
      });
    });

    it('PrismaClientRustPanicErrorを処理すること', () => {
      const prismaError = new Prisma.PrismaClientRustPanicError('Panic occurred', '5.0.0');

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.error).toHaveBeenCalledWith(
        { err: prismaError },
        'Prisma connection error'
      );
      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Database connection error',
        code: 'DATABASE_UNAVAILABLE',
      });
    });
  });

  describe('一般的なエラー処理', () => {
    it('予期しないエラーを500として処理すること', () => {
      const error = new Error('Unexpected error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.error).toHaveBeenCalledWith({ err: error }, 'Internal server error');
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('開発環境でスタックトレースを含むこと', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        stack: error.stack,
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('本番環境でスタックトレースを隠すこと', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
      });

      const call = jsonMock.mock.calls[0]?.[0];
      expect(call).not.toHaveProperty('stack');

      process.env.NODE_ENV = originalEnv;
    });
  });
});

describe('notFoundHandler middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn();

    mockRequest = {};

    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockResponse = {
      status: statusMock as unknown as Response['status'],
      json: jsonMock as unknown as Response['json'],
    };
  });

  it('404レスポンスを返すこと', () => {
    notFoundHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Not found',
      code: 'NOT_FOUND',
    });
  });
});
