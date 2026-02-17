/**
 * ClaudeVisionErrorのユニットテスト
 *
 * Requirements:
 * - 23.1: タイムアウトエラー（30秒）
 * - 23.2: レート制限エラー（429）
 * - 23.3: 認証エラー（401）
 * - 23.4: レスポンスパースエラー
 * - 23.5: 汎用エラー
 * - 23.7: エラー種別レスポンス
 *
 * @module tests/unit/errors/claudeVisionError
 */
import { describe, it, expect } from 'vitest';
import { ClaudeVisionError } from '../../../errors/claudeVisionError.js';
import { ApiError } from '../../../errors/apiError.js';

describe('ClaudeVisionError', () => {
  describe('inheritance', () => {
    it('should extend ApiError', () => {
      const error = ClaudeVisionError.timeout();
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(ClaudeVisionError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should have name property set to ClaudeVisionError', () => {
      const error = ClaudeVisionError.timeout();
      expect(error.name).toBe('ClaudeVisionError');
    });
  });

  describe('static timeout()', () => {
    it('should create a timeout error with correct properties', () => {
      const error = ClaudeVisionError.timeout();
      expect(error.statusCode).toBe(504);
      expect(error.errorType).toBe('timeout');
      expect(error.message).toContain('タイムアウト');
      expect(error.message).toContain('30秒');
    });
  });

  describe('static rateLimit()', () => {
    it('should create a rate limit error with correct properties', () => {
      const error = ClaudeVisionError.rateLimit();
      expect(error.statusCode).toBe(429);
      expect(error.errorType).toBe('rate_limit');
      expect(error.message).toContain('レート制限');
    });
  });

  describe('static authError()', () => {
    it('should create an auth error with correct properties', () => {
      const error = ClaudeVisionError.authError();
      expect(error.statusCode).toBe(401);
      expect(error.errorType).toBe('auth_error');
      expect(error.message).toContain('認証');
      expect(error.message).toContain('APIキー');
    });
  });

  describe('static parseError()', () => {
    it('should create a parse error with correct properties', () => {
      const error = ClaudeVisionError.parseError();
      expect(error.statusCode).toBe(422);
      expect(error.errorType).toBe('parse_error');
      expect(error.message).toContain('構造化データを抽出');
    });
  });

  describe('static serviceUnavailable()', () => {
    it('should create a service unavailable error with correct properties', () => {
      const error = ClaudeVisionError.serviceUnavailable();
      expect(error.statusCode).toBe(503);
      expect(error.errorType).toBe('service_unavailable');
      expect(error.message).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('static unknown()', () => {
    it('should create an unknown error with original message', () => {
      const error = ClaudeVisionError.unknown('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.errorType).toBe('unknown');
      expect(error.message).toContain('Something went wrong');
      expect(error.message).toContain('予期しないエラー');
    });
  });

  describe('toJSON()', () => {
    it('should include errorType in JSON output for timeout', () => {
      const json = ClaudeVisionError.timeout().toJSON();
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('errorType', 'timeout');
    });

    it('should include errorType in JSON output for rate_limit', () => {
      const json = ClaudeVisionError.rateLimit().toJSON();
      expect(json).toHaveProperty('errorType', 'rate_limit');
    });

    it('should include errorType in JSON output for auth_error', () => {
      const json = ClaudeVisionError.authError().toJSON();
      expect(json).toHaveProperty('errorType', 'auth_error');
    });

    it('should include errorType in JSON output for parse_error', () => {
      const json = ClaudeVisionError.parseError().toJSON();
      expect(json).toHaveProperty('errorType', 'parse_error');
    });

    it('should include errorType in JSON output for service_unavailable', () => {
      const json = ClaudeVisionError.serviceUnavailable().toJSON();
      expect(json).toHaveProperty('errorType', 'service_unavailable');
    });

    it('should include errorType in JSON output for unknown', () => {
      const json = ClaudeVisionError.unknown('test').toJSON();
      expect(json).toHaveProperty('errorType', 'unknown');
    });
  });

  describe('constructor argument order', () => {
    it('should accept (statusCode, message, code, details, problemType) matching ApiError', () => {
      // Verify constructor order matches ApiError: (statusCode, message, code?, details?, problemType?)
      const error = new ClaudeVisionError(504, 'test message', 'timeout');
      expect(error.statusCode).toBe(504);
      expect(error.message).toBe('test message');
      expect(error.errorType).toBe('timeout');
    });
  });
});
