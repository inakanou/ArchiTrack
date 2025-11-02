import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/ApiError.js';

/**
 * Zodスキーマを使用したバリデーションミドルウェア（型安全版）
 *
 * @param schema Zodスキーマ
 * @param source バリデーション対象（body | query | params）
 * @returns Express ミドルウェア
 *
 * @example
 * const createUserSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(1).max(100),
 * });
 *
 * app.post('/users', validate(createUserSchema), (req, res) => {
 *   const data = req.validatedBody as z.infer<typeof createUserSchema>;
 *   // data.email, data.name が型安全に利用可能
 * });
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req[source];

      // Zodでバリデーション
      const validated = await schema.parseAsync(data);

      // バリデーション済みデータを専用プロパティに格納（型安全）
      // validated*プロパティを使用することで、型安全なアクセスが可能
      if (source === 'body') {
        req.validatedBody = validated;
      } else if (source === 'query') {
        req.validatedQuery = validated;
      } else if (source === 'params') {
        req.validatedParams = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Zodエラーを ValidationError に変換
        const details = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));

        next(new ValidationError('Validation failed', details));
      } else {
        next(error);
      }
    }
  };
}

/**
 * 複数ソースのバリデーション（body + query + params）型安全版
 *
 * @example
 * app.get('/users/:id', validateMultiple({
 *   params: z.object({ id: z.string().cuid() }),
 *   query: z.object({ include: z.string().optional() }),
 * }), (req, res) => {
 *   const params = req.validatedParams as { id: string };
 *   const query = req.validatedQuery as { include?: string };
 * });
 */
export function validateMultiple(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors: Array<{ source: string; issues: unknown[] }> = [];

      // Body のバリデーション
      if (schemas.body) {
        try {
          const validated = await schemas.body.parseAsync(req.body);
          req.validatedBody = validated;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'body', issues: error.issues });
          } else {
            // ZodError以外の予期しないエラーはスロー
            throw error;
          }
        }
      }

      // Query のバリデーション
      if (schemas.query) {
        try {
          const validated = await schemas.query.parseAsync(req.query);
          req.validatedQuery = validated;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'query', issues: error.issues });
          } else {
            // ZodError以外の予期しないエラーはスロー
            throw error;
          }
        }
      }

      // Params のバリデーション
      if (schemas.params) {
        try {
          const validated = await schemas.params.parseAsync(req.params);
          req.validatedParams = validated;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'params', issues: error.issues });
          } else {
            // ZodError以外の予期しないエラーはスロー
            throw error;
          }
        }
      }

      // エラーがあれば ValidationError をスロー
      if (errors.length > 0) {
        next(new ValidationError('Validation failed', errors));
      } else {
        next();
      }
    } catch (error) {
      next(error);
    }
  };
}
