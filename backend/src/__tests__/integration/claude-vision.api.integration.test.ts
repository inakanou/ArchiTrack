/**
 * @fileoverview Claude Vision API統合テスト
 *
 * Task 57.1: Claude Vision API統合テスト
 *
 * 認証・認可フロー、Zodスキーマバリデーション、ANTHROPIC_API_KEY未設定時の503、
 * 各エラー種別レスポンス形式を検証する。
 *
 * Requirements:
 * - 21.1: Claude Vision APIエンドポイント（POST /api/claude-vision/extract）
 * - 21.9: APIエンドポイント認証（authenticate + requirePermission）
 * - 22.6: ANTHROPIC_API_KEY未設定時のHTTP 503レスポンス
 * - 23.1, 23.2, 23.3, 23.4, 23.7: エラー種別レスポンス形式
 *
 * タスク116.2 で経路が設定・監査・回数制限を依存として受け取る形（createClaudeVisionRouter）になったため、
 * 本ファイルは設定を有効・記録を成功に固定した依存で従来の主張を保つ。送信の権限は専用の権限
 * （claude_vision:use）へ改めた。停止・権限・回数制限・記録を実 DB で確かめる統合は
 * claude-vision-controls.api.integration.test.ts に置く。
 *
 * @module __tests__/integration/claude-vision.api.integration.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

// Hoisted mocks
const { mockIsEnabled, mockExtractLineItems, mockRequirePermission, mockState } = vi.hoisted(
  () => ({
    mockIsEnabled: vi.fn(),
    mockExtractLineItems: vi.fn(),
    mockRequirePermission: vi.fn(),
    mockState: { shouldRejectAuth: false, shouldRejectPermission: false },
  })
);

// Mock ClaudeVisionService
vi.mock('../../services/claude-vision.service.js', () => ({
  ClaudeVisionService: class {
    isEnabled = mockIsEnabled;
    extractLineItems = mockExtractLineItems;
    extractQuantityTableData = vi.fn();
  },
}));

// Keep real ClaudeVisionError for integration testing
vi.mock('../../errors/claudeVisionError.js', async () => {
  const actual = await vi.importActual<typeof import('../../errors/claudeVisionError.js')>(
    '../../errors/claudeVisionError.js'
  );
  return actual;
});

// Mock authentication middleware
vi.mock('../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    if (mockState.shouldRejectAuth) {
      const err = new Error('認証が必要です');
      (err as unknown as { statusCode: number }).statusCode = 401;
      return next(err);
    }
    req.user = {
      userId: 'integration-test-user',
      email: 'integration@test.com',
      roles: ['user'],
    };
    next();
  },
}));

// Mock authorization middleware
vi.mock('../../middleware/authorize.middleware.js', () => ({
  requirePermission: (permission: string) => {
    mockRequirePermission(permission);
    return (_req: Request, _res: Response, next: NextFunction) => {
      if (mockState.shouldRejectPermission) {
        const err = new Error('権限がありません');
        (err as unknown as { statusCode: number }).statusCode = 403;
        return next(err);
      }
      next();
    };
  },
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import {
  createClaudeVisionRouter,
  CLAUDE_VISION_USE_PERMISSION,
} from '../../routes/claude-vision.routes.js';
import { ClaudeVisionService } from '../../services/claude-vision.service.js';
import { ClaudeVisionError } from '../../errors/claudeVisionError.js';

/** 制限を掛けない（回数制限は claude-vision-controls.api.integration.test.ts で確かめる） */
const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * 統合テスト用Expressアプリを構築
 * 本番app.tsと同じルート登録順序を再現する
 */
function createIntegrationApp() {
  const app = express();
  // Claude Vision routes BEFORE global body-parser (本番と同じ順序)
  // 設定は有効・記録は成功に固定する（停止と記録は claude-vision-controls.api.integration.test.ts）
  app.use(
    '/api/claude-vision',
    createClaudeVisionRouter({
      claudeVisionService: new ClaudeVisionService(undefined),
      systemSettingService: {
        getExternalAiReading: vi.fn().mockResolvedValue({ enabled: true, version: 0 }),
      },
      auditLogService: { createLog: vi.fn().mockResolvedValue({ id: 'audit-log-id' }) },
      hasPermission: vi.fn().mockResolvedValue(true),
      limiter: passThrough,
    })
  );
  // Global body-parser (本番の5MB制限と同じ)
  app.use(express.json({ limit: '5mb' }));
  // エラーハンドラ (本番同等)
  app.use(
    (err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof ClaudeVisionError) {
        res.status(err.statusCode).json(err.toJSON());
        return;
      }
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message });
    }
  );
  return app;
}

describe('Claude Vision API Integration Tests', () => {
  let app: ReturnType<typeof createIntegrationApp>;

  const validRequest = {
    images: [
      {
        base64Data: 'dGVzdEltYWdlRGF0YQ==',
        mediaType: 'image/png',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.shouldRejectAuth = false;
    mockState.shouldRejectPermission = false;
    app = createIntegrationApp();
  });

  // ==========================================================================
  // 認証・認可フロー（21.9）
  // ==========================================================================

  describe('認証・認可フロー（21.9）', () => {
    it('未認証リクエストを401で拒否する', async () => {
      mockState.shouldRejectAuth = true;

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('認証が必要です');
    });

    it('claude_vision:use権限がないリクエストを403で拒否する', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('権限がありません');
      expect(mockRequirePermission).toHaveBeenCalledWith(CLAUDE_VISION_USE_PERMISSION);
      expect(mockRequirePermission).not.toHaveBeenCalledWith('estimate_request:read');
      expect(mockExtractLineItems).not.toHaveBeenCalled();
    });

    it('認証済み・権限ありリクエストが正常に処理される', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockExtractLineItems.mockResolvedValueOnce({ lineItems: [], pageCount: 0 });

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(200);
      expect(res.body.lineItems).toEqual([]);
    });
  });

  // ==========================================================================
  // Zodスキーマバリデーション
  // ==========================================================================

  describe('Zodスキーマバリデーション', () => {
    it('空のimages配列で400を返す', async () => {
      mockIsEnabled.mockReturnValue(true);

      const res = await request(app).post('/api/claude-vision/extract').send({ images: [] });

      expect(res.status).toBe(400);
    });

    it('imagesフィールドなしで400を返す', async () => {
      mockIsEnabled.mockReturnValue(true);

      const res = await request(app).post('/api/claude-vision/extract').send({});

      expect(res.status).toBe(400);
    });

    it('無効なmediaTypeで400を返す', async () => {
      mockIsEnabled.mockReturnValue(true);

      const res = await request(app)
        .post('/api/claude-vision/extract')
        .send({
          images: [{ base64Data: 'dGVzdA==', mediaType: 'image/bmp' }],
        });

      expect(res.status).toBe(400);
    });

    it('空のbase64Dataで400を返す', async () => {
      mockIsEnabled.mockReturnValue(true);

      const res = await request(app)
        .post('/api/claude-vision/extract')
        .send({
          images: [{ base64Data: '', mediaType: 'image/png' }],
        });

      expect(res.status).toBe(400);
    });

    it('21要素のimages配列で400を返す（最大20要素制約）', async () => {
      mockIsEnabled.mockReturnValue(true);

      const images = Array.from({ length: 21 }, () => ({
        base64Data: 'dGVzdA==',
        mediaType: 'image/png',
      }));

      const res = await request(app).post('/api/claude-vision/extract').send({ images });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // ANTHROPIC_API_KEY未設定時のHTTP 503レスポンス（22.6）
  // ==========================================================================

  describe('ANTHROPIC_API_KEY未設定時のHTTP 503レスポンス（22.6）', () => {
    it('isEnabled()=falseでHTTP 503 + errorType=service_unavailableを返す', async () => {
      mockIsEnabled.mockReturnValue(false);

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(503);
      expect(res.body).toEqual(
        expect.objectContaining({
          errorType: 'service_unavailable',
          error: expect.stringContaining('Claude Vision機能は無効です'),
        })
      );
    });
  });

  // ==========================================================================
  // 各エラー種別のレスポンス形式検証（23.1-23.4, 23.7）
  // ==========================================================================

  describe('各エラー種別のレスポンス形式検証（23.1-23.4, 23.7）', () => {
    beforeEach(() => {
      mockIsEnabled.mockReturnValue(true);
    });

    it('timeoutエラー: HTTP 504 + errorType=timeout', async () => {
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.timeout());

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(504);
      expect(res.body.errorType).toBe('timeout');
      expect(res.body.error).toBeDefined();
    });

    it('rate_limitエラー: HTTP 429 + errorType=rate_limit', async () => {
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.rateLimit());

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(429);
      expect(res.body.errorType).toBe('rate_limit');
      expect(res.body.error).toBeDefined();
    });

    it('auth_errorエラー: HTTP 401 + errorType=auth_error', async () => {
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.authError());

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(401);
      expect(res.body.errorType).toBe('auth_error');
      expect(res.body.error).toBeDefined();
    });

    it('parse_errorエラー: HTTP 422 + errorType=parse_error', async () => {
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.parseError());

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(422);
      expect(res.body.errorType).toBe('parse_error');
      expect(res.body.error).toBeDefined();
    });

    it('unknownエラー: HTTP 500 + errorType=unknown', async () => {
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.unknown('unexpected'));

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(500);
      expect(res.body.errorType).toBe('unknown');
      expect(res.body.error).toBeDefined();
    });

    it('正常レスポンス: HTTP 200 + lineItems + pageCount', async () => {
      mockExtractLineItems.mockResolvedValueOnce({
        lineItems: [
          {
            customCategory: '仮設',
            workType: '仮設工',
            name: '足場工',
            specification: '枠組足場',
            unit: 'm2',
            quantity: 500,
            unitPrice: 1200,
            amount: 600000,
            remarks: '4階建て',
          },
        ],
        pageCount: 2,
      });

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(200);
      expect(res.body.lineItems).toHaveLength(1);
      expect(res.body.lineItems[0]).toEqual(
        expect.objectContaining({
          name: '足場工',
          specification: '枠組足場',
          unit: 'm2',
          quantity: 500,
          unitPrice: 1200,
          amount: 600000,
        })
      );
      expect(res.body.pageCount).toBe(2);
    });
  });
});
