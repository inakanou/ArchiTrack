import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { httpsRedirect, hsts } from '../../../middleware/httpsRedirect.middleware.js';

// loggerのモック
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('httpsRedirect middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let redirectMock: ReturnType<typeof vi.fn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;

    redirectMock = vi.fn();
    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockNext = vi.fn() as unknown as NextFunction;

    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockRequest = {
      header: vi.fn() as unknown as Request['header'],
      secure: false,
      url: '/api/test',
    };

    mockResponse = {
      redirect: redirectMock as unknown as Response['redirect'],
    };
  });

  afterEach(() => {
    // テスト環境でのprocess.env操作のため、anyが必要
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env.NODE_ENV as any) = originalEnv;
  });

  describe('開発環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('HTTPSにリダイレクトしないこと', () => {
      httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(redirectMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('テスト環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('HTTPSにリダイレクトしないこと', () => {
      httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(redirectMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('本番環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    describe('ヘルスチェックエンドポイント', () => {
      it('/healthエンドポイントはリダイレクトしないこと', () => {
        mockRequest = {
          ...mockRequest,
          path: '/health',
          secure: false,
        };
        (mockRequest.header as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    describe('x-forwarded-protoヘッダーがある場合（プロキシ経由）', () => {
      it('HTTPからHTTPSにリダイレクトすること', () => {
        (mockRequest.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
          if (name === 'x-forwarded-proto') return 'http';
          if (name === 'host') return 'example.com';
          return undefined;
        });

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).toHaveBeenCalledWith(301, 'https://example.com/api/test');
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('既にHTTPSの場合はリダイレクトしないこと', () => {
        (mockRequest.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
          if (name === 'x-forwarded-proto') return 'https';
          return undefined;
        });

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('クエリパラメータを保持してリダイレクトすること', () => {
        mockRequest.url = '/api/test?page=1&limit=10';
        (mockRequest.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
          if (name === 'x-forwarded-proto') return 'http';
          if (name === 'host') return 'example.com';
          return undefined;
        });

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).toHaveBeenCalledWith(
          301,
          'https://example.com/api/test?page=1&limit=10'
        );
      });

      it('ポート番号を保持してリダイレクトすること', () => {
        (mockRequest.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
          if (name === 'x-forwarded-proto') return 'http';
          if (name === 'host') return 'example.com:8080';
          return undefined;
        });

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).toHaveBeenCalledWith(301, 'https://example.com:8080/api/test');
      });
    });

    describe('x-forwarded-protoヘッダーがない場合（直接接続）', () => {
      it('req.secureがfalseの場合、HTTPSにリダイレクトすること', () => {
        mockRequest = {
          ...mockRequest,
          secure: false,
        };
        (mockRequest.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
          if (name === 'host') return 'example.com';
          return undefined;
        });

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).toHaveBeenCalledWith(301, 'https://example.com/api/test');
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('req.secureがtrueの場合、リダイレクトしないこと', () => {
        mockRequest = {
          ...mockRequest,
          secure: true,
        };
        (mockRequest.header as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    describe('301 Permanent Redirectの使用', () => {
      it('301ステータスコードでリダイレクトすること', () => {
        (mockRequest.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
          if (name === 'x-forwarded-proto') return 'http';
          if (name === 'host') return 'example.com';
          return undefined;
        });

        httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);

        expect(redirectMock).toHaveBeenCalledWith(301, expect.any(String));
      });
    });
  });
});

describe('hsts middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderMock: ReturnType<typeof vi.fn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;

    setHeaderMock = vi.fn();
    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockNext = vi.fn() as unknown as NextFunction;

    mockRequest = {};

    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockResponse = {
      setHeader: setHeaderMock as unknown as Response['setHeader'],
    };
  });

  afterEach(() => {
    // テスト環境でのprocess.env操作のため、anyが必要
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env.NODE_ENV as any) = originalEnv;
  });

  describe('本番環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('Strict-Transport-Securityヘッダーを設定すること', () => {
      hsts(mockRequest as Request, mockResponse as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('max-age=31536000 (1年)を設定すること', () => {
      hsts(mockRequest as Request, mockResponse as Response, mockNext);

      const headerValue = setHeaderMock.mock.calls[0]?.[1] as string;
      expect(headerValue).toContain('max-age=31536000');
    });

    it('includeSubDomainsディレクティブを含むこと', () => {
      hsts(mockRequest as Request, mockResponse as Response, mockNext);

      const headerValue = setHeaderMock.mock.calls[0]?.[1] as string;
      expect(headerValue).toContain('includeSubDomains');
    });

    it('preloadディレクティブを含むこと', () => {
      hsts(mockRequest as Request, mockResponse as Response, mockNext);

      const headerValue = setHeaderMock.mock.calls[0]?.[1] as string;
      expect(headerValue).toContain('preload');
    });
  });

  describe('開発環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('HSTSヘッダーを設定しないこと', () => {
      hsts(mockRequest as Request, mockResponse as Response, mockNext);

      expect(setHeaderMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('テスト環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('HSTSヘッダーを設定しないこと', () => {
      hsts(mockRequest as Request, mockResponse as Response, mockNext);

      expect(setHeaderMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('環境未設定', () => {
    beforeEach(() => {
      delete process.env.NODE_ENV;
    });

    it('HSTSヘッダーを設定しないこと', () => {
      hsts(mockRequest as Request, mockResponse as Response, mockNext);

      expect(setHeaderMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});

describe('httpsRedirect と hsts の統合', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockNext = vi.fn() as unknown as NextFunction;

    mockRequest = {
      header: vi.fn((name: string) => {
        if (name === 'x-forwarded-proto') return 'https';
        if (name === 'host') return 'example.com';
        return undefined;
      }) as unknown as Request['header'],
      secure: true,
      url: '/api/test',
    };

    // Vitestのモック型とExpressの型の互換性のため、型アサーションが必要
    mockResponse = {
      setHeader: vi.fn() as unknown as Response['setHeader'],
      redirect: vi.fn() as unknown as Response['redirect'],
    };
  });

  afterEach(() => {
    // テスト環境でのprocess.env操作のため、anyが必要
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env.NODE_ENV as any) = originalEnv;
  });

  it('HTTPSリクエストに対してHSTSヘッダーを設定すること', () => {
    httpsRedirect(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalledWith();

    // 次のミドルウェアとしてhstsを呼び出し
    hsts(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  });
});
