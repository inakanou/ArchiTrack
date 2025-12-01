import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate, validateMultiple } from '../../../middleware/validate.middleware.js';
import { ValidationError } from '../../../errors/apiError.js';

describe('validate middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
    };
    mockResponse = {};
    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockNext = vi.fn() as unknown as NextFunction;
  });

  describe('validate() - 単一ソースバリデーション', () => {
    describe('bodyバリデーション', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string().min(1).max(100),
        age: z.number().int().positive().optional(),
      });

      it('有効なbodyデータをバリデーションすること', async () => {
        mockRequest.body = {
          email: 'test@example.com',
          name: 'Test User',
          age: 25,
        };

        const middleware = validate(userSchema, 'body');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockRequest.body).toEqual({
          email: 'test@example.com',
          name: 'Test User',
          age: 25,
        });
      });

      it('オプションフィールドがない場合でもバリデーションすること', async () => {
        mockRequest.body = {
          email: 'test@example.com',
          name: 'Test User',
        };

        const middleware = validate(userSchema, 'body');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequest.body).toEqual({
          email: 'test@example.com',
          name: 'Test User',
        });
      });

      it('無効なデータの場合ValidationErrorを渡すこと', async () => {
        mockRequest.body = {
          email: 'invalid-email',
          name: '',
        };

        const middleware = validate(userSchema, 'body');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledTimes(1);
        // mockNextの型アサーション後、mockプロパティにアクセス
        const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(error).toBeInstanceOf(ValidationError);
        // 最初のエラーメッセージが使用される（バリデーション改善のため）
        expect(error.message).toBe('Invalid email address');
        expect(error.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'email',
              message: expect.stringContaining('email'),
            }),
            expect.objectContaining({
              path: 'name',
              message: expect.any(String),
            }),
          ])
        );
      });

      it('デフォルトでbodyをバリデーションすること', async () => {
        mockRequest.body = {
          email: 'test@example.com',
          name: 'Test User',
        };

        const middleware = validate(userSchema); // sourceを省略
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequest.body).toBeDefined();
      });
    });

    describe('queryバリデーション', () => {
      const querySchema = z.object({
        page: z.string().regex(/^\d+$/).transform(Number),
        limit: z.string().regex(/^\d+$/).transform(Number),
        search: z.string().optional(),
      });

      it('有効なqueryデータをバリデーションすること', async () => {
        mockRequest.query = {
          page: '1',
          limit: '10',
          search: 'test',
        };

        const middleware = validate(querySchema, 'query');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequest.validatedQuery).toEqual({
          page: 1,
          limit: 10,
          search: 'test',
        });
      });

      it('無効なqueryの場合エラーを返すこと', async () => {
        mockRequest.query = {
          page: 'abc', // 数字ではない
          limit: '10',
        };

        const middleware = validate(querySchema, 'query');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        // mockNextの型アサーション後、mockプロパティにアクセス
        const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(error).toBeInstanceOf(ValidationError);
      });
    });

    describe('paramsバリデーション', () => {
      const paramsSchema = z.object({
        id: z.string().cuid(),
      });

      it('有効なparamsデータをバリデーションすること', async () => {
        mockRequest.params = {
          id: 'cl9x0v3q40000qwer1234abcd',
        };

        const middleware = validate(paramsSchema, 'params');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
      });

      it('無効なparamsの場合エラーを返すこと', async () => {
        mockRequest.params = {
          id: 'invalid-id',
        };

        const middleware = validate(paramsSchema, 'params');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        // mockNextの型アサーション後、mockプロパティにアクセス
        const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(error).toBeInstanceOf(ValidationError);
      });
    });

    describe('エラーハンドリング', () => {
      it('ZodError以外のエラーをそのまま渡すこと', async () => {
        const schemaWithError = z.object({}).transform(() => {
          throw new Error('Custom error');
        });

        mockRequest.body = {};

        const middleware = validate(schemaWithError, 'body');
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        // mockNextの型アサーション後、mockプロパティにアクセス
        const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(ValidationError);
        expect(error.message).toBe('Custom error');
      });
    });
  });

  describe('validateMultiple() - 複数ソースバリデーション', () => {
    it('body, query, paramsすべてをバリデーションすること', async () => {
      const schemas = {
        body: z.object({
          name: z.string(),
        }),
        query: z.object({
          page: z.string(),
        }),
        params: z.object({
          id: z.string(),
        }),
      };

      mockRequest.body = { name: 'Test' };
      mockRequest.query = { page: '1' };
      mockRequest.params = { id: '123' };

      const middleware = validateMultiple(schemas);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.body).toEqual({ name: 'Test' });
      expect(mockRequest.query).toEqual({ page: '1' });
      expect(mockRequest.params).toEqual({ id: '123' });
    });

    it('一部のスキーマのみを指定できること', async () => {
      const schemas = {
        body: z.object({
          name: z.string(),
        }),
      };

      mockRequest.body = { name: 'Test' };

      const middleware = validateMultiple(schemas);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('複数のソースでエラーがある場合、すべてのエラーを収集すること', async () => {
      const schemas = {
        body: z.object({
          email: z.string().email(),
        }),
        query: z.object({
          page: z.string().regex(/^\d+$/),
        }),
      };

      mockRequest.body = { email: 'invalid-email' };
      mockRequest.query = { page: 'abc' };

      const middleware = validateMultiple(schemas);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // mockNextの型アサーション後、mockプロパティにアクセス
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'body',
          }),
          expect.objectContaining({
            source: 'query',
          }),
        ])
      );
    });

    it('すべてのバリデーションが成功した場合のみ次に進むこと', async () => {
      const schemas = {
        body: z.object({
          name: z.string(),
        }),
        query: z.object({
          page: z.string(),
        }),
      };

      mockRequest.body = { name: 'Test' };
      mockRequest.query = { page: '1' };

      const middleware = validateMultiple(schemas);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(); // エラーなし
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('予期しないエラーをnextに渡すこと', async () => {
      const schemas = {
        body: z.object({}).transform(() => {
          throw new Error('Unexpected error');
        }),
      };

      mockRequest.body = {};

      const middleware = validateMultiple(schemas);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // mockNextの型アサーション後、mockプロパティにアクセス
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Unexpected error');
    });
  });

  describe('実践的な使用例', () => {
    it('ユーザー作成リクエストをバリデーションすること', async () => {
      const createUserSchema = z.object({
        email: z.string().email(),
        name: z.string().min(1).max(100),
        password: z.string().min(8),
      });

      mockRequest.body = {
        email: 'newuser@example.com',
        name: 'New User',
        password: 'SecurePassword123',
      };

      const middleware = validate(createUserSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.body.email).toBe('newuser@example.com');
    });

    it('ページネーションクエリをバリデーションすること', async () => {
      const paginationSchema = z.object({
        page: z.string().regex(/^\d+$/).transform(Number).default(1),
        limit: z.string().regex(/^\d+$/).transform(Number).default(10),
        sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional(),
        order: z.enum(['asc', 'desc']).optional().default('desc'),
      });

      mockRequest.query = {
        page: '2',
        limit: '20',
        sortBy: 'createdAt',
      };

      const middleware = validate(paginationSchema, 'query');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.validatedQuery).toEqual({
        page: 2,
        limit: 20,
        sortBy: 'createdAt',
        order: 'desc',
      });
    });
  });
});
