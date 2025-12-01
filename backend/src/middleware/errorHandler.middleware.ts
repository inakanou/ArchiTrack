import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError, ValidationError } from '../errors/apiError.js';
import { Prisma } from '@prisma/client';
import { captureException } from '../utils/sentry.js';
import logger from '../utils/logger.js';
import { createProblemDetails, PROBLEM_TYPES } from '../types/problem-details.js';

/**
 * Global error handler middleware
 * Catches all unhandled errors and returns appropriate responses in RFC 7807 format
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Use default logger if req.log doesn't exist (e.g., in test environments)
  const log = req.log || logger;

  // Handle ApiError instances
  if (err instanceof ApiError) {
    log.warn({ err, statusCode: err.statusCode }, 'API error');

    // Send 5xx errors to Sentry
    if (err.statusCode >= 500) {
      captureException(err, {
        url: req.url,
        method: req.method,
        ip: req.ip,
        statusCode: err.statusCode,
      });
    }

    res.status(err.statusCode).json(err.toProblemDetails(req.url));
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    log.warn({ err }, 'Validation error');
    const validationError = new ValidationError(
      'Validation failed',
      err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
    res.status(400).json(validationError.toProblemDetails(req.url));
    return;
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    log.warn({ err, code: err.code }, 'Prisma error');

    // P2002: Unique constraint violation
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      res.status(409).json(
        createProblemDetails({
          type: PROBLEM_TYPES.CONFLICT,
          title: 'Duplicate Resource',
          status: 409,
          detail: 'Resource already exists',
          instance: req.url,
          extensions: { fields: target },
        })
      );
      return;
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      res.status(404).json(
        createProblemDetails({
          type: PROBLEM_TYPES.NOT_FOUND,
          title: 'Not Found',
          status: 404,
          detail: 'Resource not found',
          instance: req.url,
        })
      );
      return;
    }

    // Other Prisma errors
    res.status(400).json(
      createProblemDetails({
        type: PROBLEM_TYPES.BAD_REQUEST,
        title: 'Database Error',
        status: 400,
        detail: 'Database operation failed',
        instance: req.url,
      })
    );
    return;
  }

  // Handle Prisma connection errors
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    log.error({ err }, 'Prisma connection error');

    // Send database connection errors to Sentry
    captureException(err, {
      url: req.url,
      method: req.method,
      errorType: 'database_connection',
    });

    res.status(503).json(
      createProblemDetails({
        type: PROBLEM_TYPES.INTERNAL_SERVER_ERROR,
        title: 'Service Unavailable',
        status: 503,
        detail: 'Database connection error',
        instance: req.url,
      })
    );
    return;
  }

  // Handle unexpected errors
  log.error({ err }, 'Internal server error');

  // Send unexpected errors to Sentry
  captureException(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Hide stack trace in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json(
    createProblemDetails({
      type: PROBLEM_TYPES.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      status: 500,
      detail: 'Internal server error',
      instance: req.url,
      extensions: isDevelopment ? { stack: err.stack } : undefined,
    })
  );
}

/**
 * 404 Not Found handler
 * Called when no routes match the request
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(
    createProblemDetails({
      type: PROBLEM_TYPES.NOT_FOUND,
      title: 'Not Found',
      status: 404,
      detail: 'The requested resource was not found',
      instance: req.url,
    })
  );
}
