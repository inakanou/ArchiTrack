import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// vitest.setup.tsのグローバルモックを解除してテスト独自のモックを使用
vi.unmock('../../../middleware/logger.middleware.js');

// pino-httpのモック
vi.mock('pino-http', () => ({
  default: vi.fn((config) => config),
}));

// loggerのモック
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    level: 'info',
  },
}));

// モック設定後にインポート
const { httpLogger } = await import('../../../middleware/logger.middleware.js');

describe('logger middleware', () => {
  describe('httpLogger configuration', () => {
    it('httpLoggerが正しく設定されること', () => {
      expect(httpLogger).toBeDefined();
      expect(httpLogger).toHaveProperty('genReqId');
      expect(httpLogger).toHaveProperty('customLogLevel');
      expect(httpLogger).toHaveProperty('customSuccessMessage');
      expect(httpLogger).toHaveProperty('autoLogging');
      expect(httpLogger).toHaveProperty('serializers');
    });
  });

  describe('genReqId', () => {
    it('x-request-idヘッダーを優先すること', () => {
      const mockReq = {
        headers: {
          'x-request-id': 'test-request-id',
          'x-railway-request-id': 'railway-id',
        },
      } as unknown as IncomingMessage;

      const genReqId = (httpLogger as unknown as { genReqId: (req: IncomingMessage) => string })
        .genReqId;
      const requestId = genReqId(mockReq);

      expect(requestId).toBe('test-request-id');
    });

    it('x-railway-request-idをフォールバックとして使用すること', () => {
      const mockReq = {
        headers: {
          'x-railway-request-id': 'railway-id',
        },
      } as unknown as IncomingMessage;

      const genReqId = (httpLogger as unknown as { genReqId: (req: IncomingMessage) => string })
        .genReqId;
      const requestId = genReqId(mockReq);

      expect(requestId).toBe('railway-id');
    });

    it('ヘッダーがない場合、UUIDを生成すること', () => {
      const mockReq = {
        headers: {},
      } as IncomingMessage;

      const genReqId = (httpLogger as unknown as { genReqId: (req: IncomingMessage) => string })
        .genReqId;
      const requestId = genReqId(mockReq);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      // UUID v4の形式をチェック
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('customLogLevel', () => {
    let customLogLevel: (req: IncomingMessage, res: ServerResponse, err?: Error) => string;

    beforeEach(() => {
      customLogLevel = (
        httpLogger as unknown as {
          customLogLevel: (req: IncomingMessage, res: ServerResponse, err?: Error) => string;
        }
      ).customLogLevel;
    });

    it('500番台のエラーはerrorレベルであること', () => {
      const mockReq = {} as IncomingMessage;
      const mockRes = { statusCode: 500 } as ServerResponse;

      const level = customLogLevel(mockReq, mockRes);

      expect(level).toBe('error');
    });

    it('エラーオブジェクトがある場合はerrorレベルであること', () => {
      const mockReq = {} as IncomingMessage;
      const mockRes = { statusCode: 200 } as ServerResponse;
      const error = new Error('Test error');

      const level = customLogLevel(mockReq, mockRes, error);

      expect(level).toBe('error');
    });

    it('400番台のエラーはwarnレベルであること', () => {
      const mockReq = {} as IncomingMessage;
      const mockRes = { statusCode: 404 } as ServerResponse;

      const level = customLogLevel(mockReq, mockRes);

      expect(level).toBe('warn');
    });

    it('300番台のリダイレクトはinfoレベルであること', () => {
      const mockReq = {} as IncomingMessage;
      const mockRes = { statusCode: 301 } as ServerResponse;

      const level = customLogLevel(mockReq, mockRes);

      expect(level).toBe('info');
    });

    it('200番台の成功はinfoレベルであること', () => {
      const mockReq = {} as IncomingMessage;
      const mockRes = { statusCode: 200 } as ServerResponse;

      const level = customLogLevel(mockReq, mockRes);

      expect(level).toBe('info');
    });
  });

  describe('customSuccessMessage', () => {
    let customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => string;

    beforeEach(() => {
      customSuccessMessage = (
        httpLogger as unknown as {
          customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => string;
        }
      ).customSuccessMessage;
    });

    it('ヘルスチェックの場合、簡略メッセージを返すこと', () => {
      const mockReq = {
        url: '/health',
        method: 'GET',
      } as IncomingMessage;
      const mockRes = {} as ServerResponse;

      const message = customSuccessMessage(mockReq, mockRes);

      expect(message).toBe('health check');
    });

    it('通常のリクエストの場合、メソッドとURLを返すこと', () => {
      const mockReq = {
        url: '/api/users',
        method: 'POST',
      } as IncomingMessage;
      const mockRes = {} as ServerResponse;

      const message = customSuccessMessage(mockReq, mockRes);

      expect(message).toBe('POST /api/users');
    });
  });

  describe('autoLogging.ignore', () => {
    let ignoreFn: (req: IncomingMessage) => boolean;

    beforeEach(() => {
      ignoreFn = (
        httpLogger as unknown as { autoLogging: { ignore: (req: IncomingMessage) => boolean } }
      ).autoLogging.ignore;
    });

    it('debugレベルでない場合、ヘルスチェックを無視すること', () => {
      const mockReq = {
        url: '/health',
      } as IncomingMessage;

      const shouldIgnore = ignoreFn(mockReq);

      expect(shouldIgnore).toBe(true);
    });

    it('debugレベルでない場合、faviconを無視すること', () => {
      const mockReq = {
        url: '/favicon.ico',
      } as IncomingMessage;

      const shouldIgnore = ignoreFn(mockReq);

      expect(shouldIgnore).toBe(true);
    });

    it('通常のリクエストは無視しないこと', () => {
      const mockReq = {
        url: '/api/users',
      } as IncomingMessage;

      const shouldIgnore = ignoreFn(mockReq);

      expect(shouldIgnore).toBe(false);
    });
  });

  describe('serializers', () => {
    describe('req serializer', () => {
      it('リクエスト情報を正しくシリアライズすること', () => {
        const reqSerializer = (
          httpLogger as unknown as {
            serializers: { req: (req: IncomingMessage & { id?: string }) => unknown };
          }
        ).serializers.req;

        const mockReq = {
          id: 'test-id',
          method: 'GET',
          url: '/api/test',
          headers: {
            'user-agent': 'Mozilla/5.0',
            'x-forwarded-for': '203.0.113.1',
            'x-railway-request-id': 'railway-123',
          },
          remoteAddress: '192.168.1.1',
          remotePort: 12345,
        } as unknown as IncomingMessage & { id?: string };

        const serialized = reqSerializer(mockReq);

        expect(serialized).toEqual({
          id: 'test-id',
          method: 'GET',
          url: '/api/test',
          headers: {
            'user-agent': 'Mozilla/5.0',
            'x-forwarded-for': '203.0.113.1',
            'x-railway-request-id': 'railway-123',
          },
          remoteAddress: '192.168.1.1',
          remotePort: 12345,
        });
      });

      it('ヘッダーが存在しない場合でもエラーにならないこと', () => {
        const reqSerializer = (
          httpLogger as unknown as {
            serializers: { req: (req: IncomingMessage & { id?: string }) => unknown };
          }
        ).serializers.req;

        const mockReq = {
          id: 'test-id',
          method: 'GET',
          url: '/api/test',
        } as unknown as IncomingMessage & { id?: string };

        const serialized = reqSerializer(mockReq);

        expect(serialized).toHaveProperty('id');
        expect(serialized).toHaveProperty('method');
        expect(serialized).toHaveProperty('url');
      });
    });

    describe('res serializer', () => {
      it('レスポンス情報を正しくシリアライズすること', () => {
        const resSerializer = (
          httpLogger as unknown as {
            serializers: { res: (res: ServerResponse & { statusCode: number }) => unknown };
          }
        ).serializers.res;

        const mockRes = {
          statusCode: 200,
        } as ServerResponse & { statusCode: number };

        const serialized = resSerializer(mockRes);

        expect(serialized).toEqual({
          statusCode: 200,
        });
      });
    });
  });
});
