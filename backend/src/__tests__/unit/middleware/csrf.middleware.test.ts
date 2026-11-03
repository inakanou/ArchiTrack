import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const FRONTEND_URL = 'https://app.example.com';

vi.mock('../../../config/env.js', () => ({
  getEnv: () => ({ FRONTEND_URL }),
}));

import { csrfProtection, generateCsrfToken } from '../../../middleware/csrf.middleware.js';

describe('CSRF Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      cookies: {},
      headers: { origin: FRONTEND_URL },
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
    it('GET/HEAD/OPTIONSリクエストはスキップする', () => {
      mockRequest.method = 'GET';

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('テスト環境（NODE_ENV=test）でも素通りさせず、トークンが無ければ403エラーを返す', () => {
      // vitest は NODE_ENV=test で動く
      expect(process.env.NODE_ENV).toBe('test');

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('CSRFトークンが一致する場合は通過する', () => {
      const token = 'valid-csrf-token-12345';
      mockRequest.cookies = { 'csrf-token': token };
      mockRequest.headers = { 'x-csrf-token': token, origin: FRONTEND_URL };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('Originが無いときはRefererのオリジンで照合して通過する', () => {
      const token = 'valid-csrf-token-12345';
      mockRequest.cookies = { 'csrf-token': token };
      mockRequest.headers = { 'x-csrf-token': token, referer: `${FRONTEND_URL}/dashboard?x=1` };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it.each([
      ['異なるオリジンのOrigin', { origin: 'https://attacker.example' }],
      ['ポートの異なるOrigin', { origin: 'https://app.example.com:8443' }],
      ['不透明なOrigin（null）', { origin: 'null' }],
      ['解釈できないOrigin', { origin: 'not a url' }],
      ['異なるオリジンのReferer', { referer: 'https://attacker.example/page' }],
      ['OriginもRefererも無い', {}],
    ])('%sの場合はトークンが一致しても403エラーを返す', (_label, originHeaders) => {
      const token = 'valid-csrf-token-12345';
      mockRequest.cookies = { 'csrf-token': token };
      mockRequest.headers = { 'x-csrf-token': token, ...originHeaders };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid request origin',
        code: 'CSRF_ORIGIN_MISMATCH',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('Originが一致すればRefererが異なっていても通過する（Originを優先する）', () => {
      const token = 'valid-csrf-token-12345';
      mockRequest.cookies = { 'csrf-token': token };
      mockRequest.headers = {
        'x-csrf-token': token,
        origin: FRONTEND_URL,
        referer: 'https://attacker.example/page',
      };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('長さの異なるトークンは一致しないとして403エラーを返す', () => {
      mockRequest.cookies = { 'csrf-token': 'short' };
      mockRequest.headers = { 'x-csrf-token': 'short-but-longer', origin: FRONTEND_URL };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
      });
    });

    it('CSRFトークンがCookieに存在しない場合は403エラーを返す', () => {
      mockRequest.cookies = {};
      mockRequest.headers = { 'x-csrf-token': 'some-token', origin: FRONTEND_URL };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'CSRF token missing',
        code: 'CSRF_TOKEN_MISSING',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('CSRFトークンがヘッダーに存在しない場合は403エラーを返す', () => {
      mockRequest.cookies = { 'csrf-token': 'some-token' };
      mockRequest.headers = { origin: FRONTEND_URL };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'CSRF token missing',
        code: 'CSRF_TOKEN_MISSING',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('CSRFトークンが一致しない場合は403エラーを返す', () => {
      mockRequest.cookies = { 'csrf-token': 'token-in-cookie' };
      mockRequest.headers = { 'x-csrf-token': 'token-in-header', origin: FRONTEND_URL };

      csrfProtection(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('CSRF検証失敗時に警告ログを記録する', () => {
      mockRequest.cookies = { 'csrf-token': 'token-in-cookie' };
      mockRequest.headers = { 'x-csrf-token': 'token-in-header', origin: FRONTEND_URL };

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
