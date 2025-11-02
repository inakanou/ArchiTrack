/**
 * カスタムAPIエラークラス
 * HTTPステータスコードとエラーコードを持つ
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * JSON形式のレスポンスボディを生成
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
 * よく使うエラーのファクトリー関数
 */
export class BadRequestError extends ApiError {
  constructor(message: string, code?: string, details?: unknown) {
    super(400, message, code || 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', code?: string) {
    super(401, message, code || 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', code?: string) {
    super(403, message, code || 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found', code?: string) {
    super(404, message, code || 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code?: string, details?: unknown) {
    super(409, message, code || 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', code?: string) {
    super(500, message, code || 'INTERNAL_SERVER_ERROR');
    this.name = 'InternalServerError';
  }
}
