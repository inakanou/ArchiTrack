/**
 * @fileoverview Claude Vision APIルートのユニットテスト
 *
 * Requirements:
 * - 21.1: Claude Vision APIエンドポイント（POST）
 * - 21.9: APIエンドポイント認証
 * - 22.6: 機能無効時のHTTP 503レスポンス
 * - 23.7: エラー種別レスポンス
 *
 * @module tests/unit/routes/claude-vision.routes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

// Hoisted mocks
const { mockIsEnabled, mockExtractLineItems, mockRequirePermission, mockState } = vi.hoisted(
  () => ({
    mockIsEnabled: vi.fn(),
    mockExtractLineItems: vi.fn(),
    mockRequirePermission: vi.fn(),
    mockState: { shouldRejectAuth: false, shouldRejectPermission: false },
  })
);

// Mock dependencies
vi.mock('../../../services/claude-vision.service.js', () => ({
  ClaudeVisionService: class {
    isEnabled = mockIsEnabled;
    extractLineItems = mockExtractLineItems;
  },
}));

vi.mock('../../../errors/claudeVisionError.js', async () => {
  const actual = await vi.importActual<typeof import('../../../errors/claudeVisionError.js')>(
    '../../../errors/claudeVisionError.js'
  );
  return actual;
});

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    if (mockState.shouldRejectAuth) {
      const err = new Error('Unauthorized');
      (err as unknown as { statusCode: number }).statusCode = 401;
      return next(err);
    }
    (req as unknown as { user: { id: string } }).user = { id: 'test-user-id' };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: () => {
    mockRequirePermission();
    return (_req: Request, _res: Response, next: NextFunction) => {
      if (mockState.shouldRejectPermission) {
        const err = new Error('Forbidden');
        (err as unknown as { statusCode: number }).statusCode = 403;
        return next(err);
      }
      next();
    };
  },
}));

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import claudeVisionRoutes from '../../../routes/claude-vision.routes.js';
import { ClaudeVisionError } from '../../../errors/claudeVisionError.js';

function createApp() {
  const app = express();
  // Claude Vision routes BEFORE global body-parser (route has its own 50MB limit)
  // In production app.ts, this route is registered before the global express.json({ limit: '5mb' })
  app.use('/api/claude-vision', claudeVisionRoutes);
  // Global 5MB limit (same as production app.ts) - applies to all other routes
  app.use(express.json({ limit: '5mb' }));
  // Simple error handler for tests
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

describe('claude-vision.routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.shouldRejectAuth = false;
    mockState.shouldRejectPermission = false;
    app = createApp();
  });

  describe('POST /api/claude-vision/extract', () => {
    const validRequest = {
      images: [
        {
          base64Data: 'dGVzdA==',
          mediaType: 'image/png',
        },
      ],
    };

    it('should return 200 with extraction result on success', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockExtractLineItems.mockResolvedValueOnce({
        lineItems: [
          {
            customCategory: null,
            workType: '土工',
            name: '掘削工',
            specification: 'バックホウ',
            unit: 'm3',
            quantity: 100,
            unitPrice: 2500,
            amount: 250000,
            remarks: null,
          },
        ],
        pageCount: 1,
      });

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(200);
      expect(res.body.lineItems).toHaveLength(1);
      expect(res.body.lineItems[0].name).toBe('掘削工');
      expect(res.body.pageCount).toBe(1);
    });

    it('should return 503 when Claude Vision is not enabled', async () => {
      mockIsEnabled.mockReturnValue(false);

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(503);
      expect(res.body.errorType).toBe('service_unavailable');
    });

    it('should return 400 for empty images array', async () => {
      mockIsEnabled.mockReturnValue(true);

      const res = await request(app).post('/api/claude-vision/extract').send({ images: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid mediaType', async () => {
      mockIsEnabled.mockReturnValue(true);

      const res = await request(app)
        .post('/api/claude-vision/extract')
        .send({
          images: [{ base64Data: 'dGVzdA==', mediaType: 'image/bmp' }],
        });

      expect(res.status).toBe(400);
    });

    it('should return ClaudeVisionError errorType on service error', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.timeout());

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(504);
      expect(res.body.errorType).toBe('timeout');
    });

    it('should return 429 for rate limit errors', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.rateLimit());

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(429);
      expect(res.body.errorType).toBe('rate_limit');
    });

    it('should return 422 for parse errors', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.parseError());

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(422);
      expect(res.body.errorType).toBe('parse_error');
    });

    it('should call extractLineItems with validated images', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockExtractLineItems.mockResolvedValueOnce({
        lineItems: [],
        pageCount: 1,
      });

      await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(mockExtractLineItems).toHaveBeenCalledWith([
        {
          base64Data: 'dGVzdA==',
          mediaType: 'image/png',
        },
      ]);
    });

    it('should use authenticate middleware', async () => {
      mockState.shouldRejectAuth = true;

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(401);
    });

    it('should use requirePermission middleware', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app).post('/api/claude-vision/extract').send(validRequest);

      expect(res.status).toBe(403);
    });

    it('should accept request bodies larger than 5MB (route-level 50MB limit)', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockExtractLineItems.mockResolvedValueOnce({
        lineItems: [],
        pageCount: 1,
      });

      // Create a request with ~6MB of base64 data (larger than the global 5MB limit)
      const largeBase64 = 'A'.repeat(6 * 1024 * 1024);
      const res = await request(app)
        .post('/api/claude-vision/extract')
        .send({
          images: [
            {
              base64Data: largeBase64,
              mediaType: 'image/png',
            },
          ],
        });

      // Should succeed (not 413 Payload Too Large) because route-level parser allows 50MB
      expect(res.status).toBe(200);
    });
  });
});
