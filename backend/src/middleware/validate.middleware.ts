import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/ApiError.js';

/**
 * Zodスキーマを使用したバリデーションミドルウェア
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
 * app.post('/users', validate(createUserSchema), createUserHandler);
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req[source];

      // Zodでバリデーション
      const validated = await schema.parseAsync(data);

      // バリデーション済みデータで置き換え
      req[source] = validated;

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
 * 複数ソースのバリデーション（body + query + params）
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
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'body', issues: error.issues });
          }
        }
      }

      // Query のバリデーション
      if (schemas.query) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          req.query = (await schemas.query.parseAsync(req.query)) as any;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'query', issues: error.issues });
          }
        }
      }

      // Params のバリデーション
      if (schemas.params) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          req.params = (await schemas.params.parseAsync(req.params)) as any;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({ source: 'params', issues: error.issues });
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
