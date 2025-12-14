import {
  createProblemDetails,
  PROBLEM_TYPES,
  type ProblemDetails,
} from '../types/problem-details.js';

/**
 * Custom API Error class
 * Supports RFC 7807 Problem Details format
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
    public problemType?: string
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to RFC 7807 Problem Details format
   * Also includes code and message fields for backward compatibility
   */
  toProblemDetails(instance?: string): ProblemDetails {
    const problemDetails = createProblemDetails({
      type: this.problemType || PROBLEM_TYPES.INTERNAL_SERVER_ERROR,
      title: this.code || 'Internal Server Error',
      status: this.statusCode,
      detail: this.message,
      instance,
      extensions: this.details ? { details: this.details } : undefined,
    });
    // Add code and message fields for backward compatibility
    if (this.code) {
      problemDetails.code = this.code;
    }
    if (this.message) {
      problemDetails.message = this.message;
    }
    return problemDetails;
  }

  /**
   * JSON format response body (legacy support)
   * @deprecated Use toProblemDetails() for RFC 7807 compliant responses
   */
  toJSON(): Record<string, unknown> {
    const response: Record<string, unknown> = {
      error: this.message,
    };

    if (this.code) {
      response.code = this.code;
    }

    if (this.details) {
      response.details = this.details;
    }

    return response;
  }
}

/**
 * Common error factory classes
 */
export class BadRequestError extends ApiError {
  constructor(message: string, code?: string, details?: unknown) {
    super(400, message, code || 'BAD_REQUEST', details, PROBLEM_TYPES.BAD_REQUEST);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', code?: string) {
    super(401, message, code || 'UNAUTHORIZED', undefined, PROBLEM_TYPES.UNAUTHORIZED);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', code?: string) {
    super(403, message, code || 'FORBIDDEN', undefined, PROBLEM_TYPES.FORBIDDEN);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found', code?: string) {
    super(404, message, code || 'NOT_FOUND', undefined, PROBLEM_TYPES.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code?: string, details?: unknown) {
    super(409, message, code || 'CONFLICT', details, PROBLEM_TYPES.CONFLICT);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'VALIDATION_ERROR', details, PROBLEM_TYPES.VALIDATION_ERROR);
    this.name = 'ValidationError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', code?: string) {
    super(
      500,
      message,
      code || 'INTERNAL_SERVER_ERROR',
      undefined,
      PROBLEM_TYPES.INTERNAL_SERVER_ERROR
    );
    this.name = 'InternalServerError';
  }
}
