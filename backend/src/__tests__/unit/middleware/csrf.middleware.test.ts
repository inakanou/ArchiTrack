import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { csrfProtection, generateCsrfToken } from '../../../middleware/csrf.middleware.js';

describe('CSRF Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      cookies: {},
      headers: {},
      log: {
        warn: vi.fn(),
      } as unknown as Request['log'],
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis(),
    };

    nextFunction = vi.fn();
  });

  describe('csrfProtection', () => {
    beforeEach(() => {
      // テスト環境フラグを一時的に無効化
      delete process.env.NODE_ENV;
    });

    it('GET/HEAD/OPTIONSリクエストはスキップする', () => {
      mockRequest.method = 'GET';

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('テスト環境ではスキップする', () => {
      process.env.NODE_ENV = 'test';

      mockRequest.method = 'POST';

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();

      delete process.env.NODE_ENV;
    });

    it('CSRFトークンが一致する場合は通過する', () => {
      const token = 'valid-csrf-token-12345';
      mockRequest.cookies = { 'csrf-token': token };
      mockRequest.headers = { 'x-csrf-token': token };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('CSRFトークンがCookieに存在しない場合は403エラーを返す', () => {
      mockRequest.cookies = {};
      mockRequest.headers = { 'x-csrf-token': 'some-token' };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'CSRF token missing',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('CSRFトークンがヘッダーに存在しない場合は403エラーを返す', () => {
      mockRequest.cookies = { 'csrf-token': 'some-token' };
      mockRequest.headers = {};

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'CSRF token missing',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('CSRFトークンが一致しない場合は403エラーを返す', () => {
      mockRequest.cookies = { 'csrf-token': 'token-in-cookie' };
      mockRequest.headers = { 'x-csrf-token': 'token-in-header' };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid CSRF token',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('CSRF検証失敗時に警告ログを記録する', () => {
      mockRequest.cookies = { 'csrf-token': 'token-in-cookie' };
      mockRequest.headers = { 'x-csrf-token': 'token-in-header' };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.log?.warn).toHaveBeenCalledWith('CSRF token validation failed');
    });
  });

  describe('generateCsrfToken', () => {
    it('32バイトのランダムなCSRFトークンを生成する', () => {
      const token = generateCsrfToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(40); // hex文字列なので64文字（32バイト * 2）
    });

    it('毎回異なるトークンを生成する', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      expect(token1).not.toBe(token2);
    });
  });
});
