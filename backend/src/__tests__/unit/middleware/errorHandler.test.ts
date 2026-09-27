import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { ZodError, ZodIssue } from 'zod';
import { errorHandler, notFoundHandler } from '../../../middleware/errorHandler.middleware.js';
import { ApiError, BadRequestError, ValidationError } from '../../../errors/apiError.js';

// Mock Prisma module (class definitions moved inside mock due to hoisting)
vi.mock('../../../generated/prisma/client.js', async () => {
  // Mock Prisma error classes
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

// Import Prisma after mock
const { Prisma } = await import('../../../generated/prisma/client.js');

describe('errorHandler middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks
    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn();

    // Type assertion needed for compatibility between Vitest mock types and Express types
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

    // Type assertion needed for compatibility between Vitest mock types and Express types
    mockNext = vi.fn() as unknown as NextFunction;
  });

  describe('ApiError handling', () => {
    it('should handle ApiError properly', () => {
      const error = new ApiError(400, 'Test error', 'TEST_CODE', { detail: 'test' });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.warn).toHaveBeenCalledWith(
        { err: error, statusCode: 400 },
        'API error'
      );
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.architrack.com/errors/internal-server-error',
          title: 'TEST_CODE',
          status: 400,
          detail: 'Test error',
          instance: '/api/test',
          details: { detail: 'test' },
          code: 'TEST_CODE',
          message: 'Test error',
        })
      );
    });

    it('should handle BadRequestError properly', () => {
      const error = new BadRequestError('Invalid input');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.architrack.com/errors/bad-request',
          title: 'BAD_REQUEST',
          status: 400,
          detail: 'Invalid input',
          instance: '/api/test',
          code: 'BAD_REQUEST',
          message: 'Invalid input',
        })
      );
    });

    it('should handle ValidationError properly', () => {
      const error = new ValidationError('Validation failed', [
        { path: 'email', message: 'Invalid email' },
      ]);

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.architrack.com/errors/validation-error',
          title: 'VALIDATION_ERROR',
          status: 400,
          detail: 'Validation failed',
          instance: '/api/test',
          details: [{ path: 'email', message: 'Invalid email' }],
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
        })
      );
    });
  });

  describe('ZodError handling', () => {
    it('should handle ZodError properly', () => {
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
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.architrack.com/errors/validation-error',
          title: 'VALIDATION_ERROR',
          status: 400,
          detail: 'Validation failed',
          instance: '/api/test',
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
        })
      );
    });

    it('should handle ZodError with nested paths', () => {
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

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.architrack.com/errors/validation-error',
          title: 'VALIDATION_ERROR',
          status: 400,
          detail: 'Validation failed',
          instance: '/api/test',
          details: [
            {
              path: 'user.profile.name',
              message: 'Required',
            },
          ],
        })
      );
    });
  });

  describe('Prisma error handling', () => {
    it('should handle P2002 (Unique constraint violation) properly', () => {
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
        type: 'https://api.architrack.com/errors/conflict',
        title: 'Duplicate Resource',
        status: 409,
        detail: 'Resource already exists',
        instance: '/api/test',
        fields: ['email'],
      });
    });

    it('should handle P2025 (Record not found) properly', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        type: 'https://api.architrack.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'Resource not found',
        instance: '/api/test',
      });
    });

    // Task 57.6 / Requirements (estimate-creation) 42.3:
    // トランザクションの制限時間超過は「変更が全て破棄された」ことと原因が分かる応答にする。
    // P2028 専用の分岐が無いと `Database Error`（400・形式不正の色）に紛れ、
    // 利用者にも運用にも原因が伝わらない。
    it('should handle P2028 (transaction timeout) as a rolled-back server-side failure', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Transaction API error: A query cannot be executed on an expired transaction.',
        {
          code: 'P2028',
          clientVersion: '7.8.0',
          meta: { operation: 'query', timeout: 15000, timeTaken: 15100 },
        }
      );

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        type: 'https://api.architrack.com/errors/internal-server-error',
        title: 'Transaction Timeout',
        status: 500,
        detail:
          'The transaction did not finish within the time limit. All changes were rolled back and nothing was saved.',
        instance: '/api/test',
      });
    });

    it('should handle other PrismaClientKnownRequestError', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Some error', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        type: 'https://api.architrack.com/errors/bad-request',
        title: 'Database Error',
        status: 400,
        detail: 'Database operation failed',
        instance: '/api/test',
      });
    });

    it('should handle PrismaClientInitializationError', () => {
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
        type: 'https://api.architrack.com/errors/internal-server-error',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Database connection error',
        instance: '/api/test',
      });
    });

    it('should handle PrismaClientRustPanicError', () => {
      const prismaError = new Prisma.PrismaClientRustPanicError('Panic occurred', '5.0.0');

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.error).toHaveBeenCalledWith(
        { err: prismaError },
        'Prisma connection error'
      );
      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith({
        type: 'https://api.architrack.com/errors/internal-server-error',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Database connection error',
        instance: '/api/test',
      });
    });
  });

  // errorHandler の接続タイムアウトの対応づけ（要件24.1 の前提。実エンドポイントへの到達はタスク35.11）。
  // 被覆印は付けない: 実際の認証系エンドポイントはサービス層で DB 例外を捕まえるため、ここへ届かない
  describe('Database connection timeout handling', () => {
    const SERVICE_UNAVAILABLE_BODY = {
      type: 'https://api.architrack.com/errors/internal-server-error',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Database connection error',
      instance: '/api/test',
    };

    /**
     * 接続の再試行を使い切った pg-pool の接続タイムアウト（Prisma から素の Error として届く）を 503 Service Unavailable の Problem Details で返す
     */
    it('再試行を使い切った接続タイムアウト（Connection terminated due to connection timeout）を503で返す', () => {
      // 実測（タスク35.2）: Prisma から投げられるのは code・meta の無い素の Error
      const error = new Error('Connection terminated due to connection timeout');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.error).toHaveBeenCalledWith(
        { err: error },
        'Database connection timeout'
      );
      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(SERVICE_UNAVAILABLE_BODY);
    });

    /**
     * プールが制限時間内に接続を渡せないタイムアウト（timeout exceeded when trying to connect）を 503 で返す
     */
    it('プールが制限時間内に接続を渡せないタイムアウトを503で返す', () => {
      const error = new Error('timeout exceeded when trying to connect');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(SERVICE_UNAVAILABLE_BODY);
    });

    /**
     * アダプタが包まずに届く OS の TCP 接続タイムアウト（code: ETIMEDOUT）を 503 で返す
     */
    it('素の Error のまま届く ETIMEDOUT を503で返す', () => {
      const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(SERVICE_UNAVAILABLE_BODY);
    });

    /**
     * @prisma/adapter-pg が SocketTimeout へ包み Prisma が P1008 へ変換した接続タイムアウトを、既知のエラーの 400 ではなく 503 で返す
     */
    it('アダプタが SocketTimeout へ包み P1008 として届くタイムアウトを400ではなく503で返す', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Operation has timed out', {
        code: 'P1008',
        clientVersion: '7.9.1',
        meta: { driverAdapterError: { name: 'DriverAdapterError' } },
      });

      errorHandler(prismaError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(SERVICE_UNAVAILABLE_BODY);
    });

    /**
     * 503 への対応づけは接続タイムアウトに限り、他の接続エラーや文言の一部が似た一般のエラーは 500 のままにする
     */
    it.each([
      ['接続の予期しない切断', new Error('Connection terminated unexpectedly')],
      ['文言の一部だけが一致するエラー', new Error('Query read timeout: connection timeout')],
      [
        'ETIMEDOUT 以外の code を持つエラー',
        Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      ],
    ])('%sは503にせず500で返す', (_label, error) => {
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500, title: 'Internal Server Error' })
      );
    });

    /**
     * 接続タイムアウトを投げるルートへの HTTP 要求が 503 と Problem Details を返す
     */
    it('接続タイムアウトを投げるルートへの要求が503とProblem Detailsを返す', async () => {
      const app = express();
      app.get('/__test__/db-timeout', (_req, _res, next) => {
        next(new Error('Connection terminated due to connection timeout'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/__test__/db-timeout');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        ...SERVICE_UNAVAILABLE_BODY,
        instance: '/__test__/db-timeout',
      });
    });
  });

  describe('General error handling', () => {
    it('should handle unexpected errors as 500', () => {
      const error = new Error('Unexpected error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.log?.error).toHaveBeenCalledWith({ err: error }, 'Internal server error');
      expect(statusMock).toHaveBeenCalledWith(500);
      // 開発環境ではstackが含まれるため、必須フィールドのみをチェック
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.architrack.com/errors/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Internal server error',
          instance: '/api/test',
        })
      );
    });

    it('should include stack trace in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        type: 'https://api.architrack.com/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Internal server error',
        instance: '/api/test',
        stack: error.stack,
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide stack trace in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        type: 'https://api.architrack.com/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Internal server error',
        instance: '/api/test',
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

    mockRequest = {
      url: '/api/unknown',
    };

    // Type assertion needed for compatibility between Vitest mock types and Express types
    mockResponse = {
      status: statusMock as unknown as Response['status'],
      json: jsonMock as unknown as Response['json'],
    };
  });

  it('should return 404 response', () => {
    notFoundHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      type: 'https://api.architrack.com/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'The requested resource was not found',
      instance: '/api/unknown',
    });
  });
});
