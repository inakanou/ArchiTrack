import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors/ApiError.js';
import { Prisma } from '@prisma/client';

/**
 * グローバルエラーハンドラーミドルウェア
 * すべての未処理エラーをキャッチして適切なレスポンスを返す
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // ApiErrorの場合
  if (err instanceof ApiError) {
    req.log.warn({ err, statusCode: err.statusCode }, 'API error');
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Zodバリデーションエラー
  if (err instanceof ZodError) {
    req.log.warn({ err }, 'Validation error');
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Prismaエラー
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    req.log.warn({ err, code: err.code }, 'Prisma error');

    // P2002: Unique constraint violation
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      res.status(409).json({
        error: 'Resource already exists',
        code: 'DUPLICATE_RESOURCE',
        details: {
          fields: target,
        },
      });
      return;
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      res.status(404).json({
        error: 'Resource not found',
        code: 'NOT_FOUND',
      });
      return;
    }

    // その他のPrismaエラー
    res.status(400).json({
      error: 'Database operation failed',
      code: 'DATABASE_ERROR',
    });
    return;
  }

  // Prisma接続エラー
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    req.log.error({ err }, 'Prisma connection error');
    res.status(503).json({
      error: 'Database connection error',
      code: 'DATABASE_UNAVAILABLE',
    });
    return;
  }

  // その他のエラー（予期しないエラー）
  req.log.error({ err }, 'Internal server error');

  // 本番環境ではスタックトレースを隠す
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
    ...(isDevelopment && { stack: err.stack }),
  });
}

/**
 * 404 Not Found ハンドラー
 * すべてのルートに一致しない場合に呼ばれる
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
  });
}
