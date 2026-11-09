/**
 * @fileoverview Claude Vision APIルートのユニットテスト
 *
 * Requirements:
 * - 21.1: Claude Vision APIエンドポイント（POST）
 * - 21.9: APIエンドポイント認証
 * - 22.6: 機能無効時のHTTP 503レスポンス
 * - 23.7: エラー種別レスポンス
 *
 * タスク116.2（design の章「Requirements 43-50」の D7）で、状態の API、管理者の停止、専用の権限
 * （claude_vision:use）、利用者ごとの回数制限、送信の記録を経路に足した。経路は依存を注入して組み立て
 * （createClaudeVisionRouter）、外部の API の呼び出し・設定・監査・権限の判定を差し替えて確かめる。
 * 回数制限は本番の判定（production）で組み立てた実物の制限をメモリの記録で数え、時計だけを進めて
 * 時間窓の後の回復を確かめる（実行環境による無効化に頼らない）。
 *
 * @requirement estimate-request/REQ-49.4 管理者の停止中は外部へ送らず受け付けない
 * @requirement estimate-request/REQ-49.6 専用の権限を持つ利用者に限って受け付ける
 * @requirement estimate-request/REQ-49.7 送信を利用者つきで記録し、画像と結果を記録に含めない
 * @requirement estimate-request/REQ-49.8 利用者ごとの上限を超えたら外部へ送らず 429 を返す
 *
 * @module tests/unit/routes/claude-vision.routes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

// Hoisted mocks
const {
  mockIsEnabled,
  mockExtractLineItems,
  mockExtractQuantityTableData,
  mockGetExternalAiReading,
  mockCreateLog,
  mockHasPermission,
  requiredPermissions,
  mockState,
} = vi.hoisted(() => ({
  mockIsEnabled: vi.fn(),
  mockExtractLineItems: vi.fn(),
  mockExtractQuantityTableData: vi.fn(),
  mockGetExternalAiReading: vi.fn(),
  mockCreateLog: vi.fn(),
  mockHasPermission: vi.fn(),
  // ルーターの組み立て時に requirePermission へ渡された権限（clearAllMocks で消えないよう配列に持つ）
  requiredPermissions: [] as string[],
  mockState: {
    shouldRejectAuth: false,
    shouldRejectPermission: false,
    userId: 'test-user-id',
  },
}));

// 既定の依存の組み立て（モジュールの既定のルーター）が DB・Redis・外部の API に触れないようにする
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: vi.fn(),
}));

// Mock dependencies
vi.mock('../../../services/claude-vision.service.js', () => ({
  ClaudeVisionService: class {
    isEnabled = mockIsEnabled;
    extractLineItems = mockExtractLineItems;
    extractQuantityTableData = mockExtractQuantityTableData;
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
    req.user = {
      userId: mockState.userId,
      email: `${mockState.userId}@example.com`,
      roles: ['user'],
    };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: (permission: string) => {
    requiredPermissions.push(permission);
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
import {
  createClaudeVisionRouter,
  CLAUDE_VISION_USE_PERMISSION,
} from '../../../routes/claude-vision.routes.js';
import {
  ClaudeVisionError,
  CLAUDE_VISION_DISABLED_BY_ADMIN_MESSAGE,
} from '../../../errors/claudeVisionError.js';
import {
  createRateLimiters,
  CLAUDE_VISION_RATE_LIMIT,
} from '../../../middleware/rateLimit.middleware.js';
import { createRuntimeMode } from '../../../config/runtime-mode.js';

/** 制限を掛けない（回数制限以外の振る舞いを確かめるとき） */
const passThrough: RequestHandler = (_req, _res, next) => next();

/** 本番の判定で組み立てた回数制限（メモリの記録で数える） */
function productionLimiter(): RequestHandler {
  return createRateLimiters({
    runtimeMode: createRuntimeMode({ NODE_ENV: 'production' }),
    getRedisClient: () => null,
  }).claudeVision;
}

function createApp(limiter: RequestHandler = passThrough) {
  const app = express();
  // 回数制限の超過の記録は req.log へ書く（本番は pino-http が設定する）
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: { warn: () => void } }).log = { warn: vi.fn() };
    next();
  });
  // Claude Vision routes BEFORE global body-parser (route has its own 50MB limit)
  // In production app.ts, this route is registered before the global express.json({ limit: '5mb' })
  app.use(
    '/api/claude-vision',
    createClaudeVisionRouter({
      claudeVisionService: {
        isEnabled: mockIsEnabled,
        extractLineItems: mockExtractLineItems,
        extractQuantityTableData: mockExtractQuantityTableData,
      },
      systemSettingService: { getExternalAiReading: mockGetExternalAiReading },
      auditLogService: { createLog: mockCreateLog },
      hasPermission: mockHasPermission,
      limiter,
    })
  );
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

const extractionResult = {
  lineItems: [
    {
      customCategory: null,
      workType: '土工',
      name: '掘削工の読み取り結果',
      specification: 'バックホウ',
      unit: 'm3',
      quantity: 100,
      unitPrice: 2500,
      amount: 250000,
      remarks: null,
    },
  ],
  pageCount: 1,
};

describe('claude-vision.routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    requiredPermissions.length = 0;
    mockState.shouldRejectAuth = false;
    mockState.shouldRejectPermission = false;
    mockState.userId = 'test-user-id';
    // 既定は送信できる状態（設定は有効・権限あり・鍵あり・記録は成功）
    mockGetExternalAiReading.mockResolvedValue({ enabled: true, version: 0 });
    mockHasPermission.mockResolvedValue(true);
    mockIsEnabled.mockReturnValue(true);
    mockCreateLog.mockResolvedValue({ id: 'audit-log-id' });
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
      // 送信の権限は見積依頼の閲覧ではなく専用の権限で判定する
      expect(CLAUDE_VISION_USE_PERMISSION).toBe('claude_vision:use');
      expect(requiredPermissions).toEqual([CLAUDE_VISION_USE_PERMISSION]);
      expect(requiredPermissions).not.toContain('estimate_request:read');
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

  describe('GET /api/claude-vision/status', () => {
    it('設定が有効・権限あり・鍵ありなら使える（理由なし）', async () => {
      const res = await request(app).get('/api/claude-vision/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: true, reason: null });
      expect(mockHasPermission).toHaveBeenCalledWith('test-user-id', 'claude_vision:use');
    });

    it('管理者が止めていれば disabled_by_admin を返す', async () => {
      mockGetExternalAiReading.mockResolvedValue({ enabled: false, version: 3 });

      const res = await request(app).get('/api/claude-vision/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false, reason: 'disabled_by_admin' });
    });

    it('専用の権限が無ければ no_permission を返す', async () => {
      mockHasPermission.mockResolvedValue(false);

      const res = await request(app).get('/api/claude-vision/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false, reason: 'no_permission' });
    });

    it('API キーが無ければ not_configured を返す', async () => {
      mockIsEnabled.mockReturnValue(false);

      const res = await request(app).get('/api/claude-vision/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false, reason: 'not_configured' });
    });

    it('理由は停止 → 権限なし → 未設定の順に判定する', async () => {
      // 三つとも当てはまるときは停止
      mockGetExternalAiReading.mockResolvedValue({ enabled: false, version: 1 });
      mockHasPermission.mockResolvedValue(false);
      mockIsEnabled.mockReturnValue(false);
      expect((await request(app).get('/api/claude-vision/status')).body).toEqual({
        available: false,
        reason: 'disabled_by_admin',
      });

      // 停止が外れ、権限なしと未設定が当てはまるときは権限なし
      mockGetExternalAiReading.mockResolvedValue({ enabled: true, version: 2 });
      expect((await request(app).get('/api/claude-vision/status')).body).toEqual({
        available: false,
        reason: 'no_permission',
      });

      // 権限があれば未設定
      mockHasPermission.mockResolvedValue(true);
      expect((await request(app).get('/api/claude-vision/status')).body).toEqual({
        available: false,
        reason: 'not_configured',
      });
    });

    it('認証だけを求め、専用の権限の拒否の部品を通さない', async () => {
      mockState.shouldRejectPermission = true;
      mockHasPermission.mockResolvedValue(false);

      const res = await request(app).get('/api/claude-vision/status');

      expect(res.status).toBe(200);
      expect(res.body.reason).toBe('no_permission');
    });

    it('未認証は 401', async () => {
      mockState.shouldRejectAuth = true;

      const res = await request(app).get('/api/claude-vision/status');

      expect(res.status).toBe(401);
      expect(mockGetExternalAiReading).not.toHaveBeenCalled();
    });

    it('状態を読んでも外部の API を呼ばず、送信の記録も残さない', async () => {
      await request(app).get('/api/claude-vision/status');

      expect(mockExtractLineItems).not.toHaveBeenCalled();
      expect(mockExtractQuantityTableData).not.toHaveBeenCalled();
      expect(mockCreateLog).not.toHaveBeenCalled();
    });
  });

  describe.each([
    { mode: undefined, label: '受領見積書の読み取り' },
    { mode: 'quantity-table' as const, label: '数量表の取り込み' },
  ])('送信の可否（$label）', ({ mode }) => {
    const body = {
      images: [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }],
      ...(mode !== undefined && { mode }),
    };

    it('管理者が止めているときは 503 で拒み、外部の API を呼ばず記録も残さない', async () => {
      mockGetExternalAiReading.mockResolvedValue({ enabled: false, version: 1 });

      const res = await request(app).post('/api/claude-vision/extract').send(body);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('CLAUDE_VISION_DISABLED_BY_ADMIN');
      expect(res.body.error).toBe(CLAUDE_VISION_DISABLED_BY_ADMIN_MESSAGE);
      expect(mockExtractLineItems).not.toHaveBeenCalled();
      expect(mockExtractQuantityTableData).not.toHaveBeenCalled();
      expect(mockCreateLog).not.toHaveBeenCalled();
    });

    it('API キーが無くても、止めているときは停止の 503 を返す', async () => {
      mockGetExternalAiReading.mockResolvedValue({ enabled: false, version: 1 });
      mockIsEnabled.mockReturnValue(false);

      const res = await request(app).post('/api/claude-vision/extract').send(body);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('CLAUDE_VISION_DISABLED_BY_ADMIN');
    });

    it('専用の権限が無いときは 403 で拒み、設定も外部の API も読まない', async () => {
      mockState.shouldRejectPermission = true;

      const res = await request(app).post('/api/claude-vision/extract').send(body);

      expect(res.status).toBe(403);
      expect(mockGetExternalAiReading).not.toHaveBeenCalled();
      expect(mockExtractLineItems).not.toHaveBeenCalled();
      expect(mockExtractQuantityTableData).not.toHaveBeenCalled();
      expect(mockCreateLog).not.toHaveBeenCalled();
    });

    it('本文の検証は設定の確認より先に行う', async () => {
      mockGetExternalAiReading.mockResolvedValue({ enabled: false, version: 1 });

      const res = await request(app)
        .post('/api/claude-vision/extract')
        .send({ images: [], ...(mode !== undefined && { mode }) });

      expect(res.status).toBe(400);
      expect(mockGetExternalAiReading).not.toHaveBeenCalled();
    });
  });

  describe('送信の記録', () => {
    const twoImages = {
      images: [
        { base64Data: 'aW1hZ2UtcGFnZS0x', mediaType: 'image/png' },
        { base64Data: 'aW1hZ2UtcGFnZS0y', mediaType: 'image/jpeg' },
      ],
    };

    it('受領見積書の読み取りの成功を、利用者・機能・枚数・結果だけで記録する', async () => {
      mockExtractLineItems.mockResolvedValueOnce(extractionResult);

      const res = await request(app).post('/api/claude-vision/extract').send(twoImages);

      expect(res.status).toBe(200);
      expect(mockCreateLog).toHaveBeenCalledTimes(1);
      expect(mockCreateLog).toHaveBeenCalledWith({
        action: 'CLAUDE_VISION_SENT',
        actorId: 'test-user-id',
        targetType: 'ClaudeVision',
        targetId: 'received_quotation',
        metadata: { feature: 'received_quotation', imageCount: 2, outcome: 'success' },
      });
    });

    it('数量表の取り込みは機能 quantity_table として記録する', async () => {
      mockExtractQuantityTableData.mockResolvedValueOnce(extractionResult);

      const res = await request(app)
        .post('/api/claude-vision/extract')
        .send({ ...twoImages, mode: 'quantity-table' });

      expect(res.status).toBe(200);
      expect(mockExtractQuantityTableData).toHaveBeenCalledTimes(1);
      expect(mockExtractLineItems).not.toHaveBeenCalled();
      expect(mockCreateLog).toHaveBeenCalledWith({
        action: 'CLAUDE_VISION_SENT',
        actorId: 'test-user-id',
        targetType: 'ClaudeVision',
        targetId: 'quantity_table',
        metadata: { feature: 'quantity_table', imageCount: 2, outcome: 'success' },
      });
    });

    it('記録に画像の中身と読み取りの結果が現れない', async () => {
      mockExtractLineItems.mockResolvedValueOnce(extractionResult);

      await request(app).post('/api/claude-vision/extract').send(twoImages);

      const recorded = JSON.stringify(mockCreateLog.mock.calls);
      expect(recorded).not.toContain('aW1hZ2UtcGFnZS0x');
      expect(recorded).not.toContain('aW1hZ2UtcGFnZS0y');
      expect(recorded).not.toContain('掘削工の読み取り結果');
      expect(recorded).not.toContain('lineItems');
      expect(recorded).not.toContain('250000');
    });

    it('外部の API の失敗も、失敗の種別つきで記録して従来の誤りを返す', async () => {
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.timeout());

      const res = await request(app).post('/api/claude-vision/extract').send(twoImages);

      expect(res.status).toBe(504);
      expect(res.body.errorType).toBe('timeout');
      expect(mockCreateLog).toHaveBeenCalledWith({
        action: 'CLAUDE_VISION_SENT',
        actorId: 'test-user-id',
        targetType: 'ClaudeVision',
        targetId: 'received_quotation',
        metadata: {
          feature: 'received_quotation',
          imageCount: 2,
          outcome: 'failure',
          errorType: 'timeout',
        },
      });
    });

    it('想定外の失敗は種別 unknown として記録する', async () => {
      mockExtractLineItems.mockRejectedValueOnce(new Error('socket hang up'));

      await request(app).post('/api/claude-vision/extract').send(twoImages);

      expect(mockCreateLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            feature: 'received_quotation',
            imageCount: 2,
            outcome: 'failure',
            errorType: 'unknown',
          },
        })
      );
      expect(JSON.stringify(mockCreateLog.mock.calls)).not.toContain('socket hang up');
    });

    it('記録に失敗したら読み取りの結果を返さず 500 にする', async () => {
      mockExtractLineItems.mockResolvedValueOnce(extractionResult);
      mockCreateLog.mockRejectedValueOnce(new Error('audit write failed'));

      const res = await request(app).post('/api/claude-vision/extract').send(twoImages);

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('CLAUDE_VISION_AUDIT_FAILED');
      expect(res.body.lineItems).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('掘削工の読み取り結果');
    });

    it('外部の API の失敗の記録に失敗したときも 500 にする', async () => {
      mockExtractLineItems.mockRejectedValueOnce(ClaudeVisionError.parseError());
      mockCreateLog.mockRejectedValueOnce(new Error('audit write failed'));

      const res = await request(app).post('/api/claude-vision/extract').send(twoImages);

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('CLAUDE_VISION_AUDIT_FAILED');
    });

    it('数量表の取り込みでも記録の失敗は結果を返さず 500 にする', async () => {
      mockExtractQuantityTableData.mockResolvedValueOnce(extractionResult);
      mockCreateLog.mockRejectedValueOnce(new Error('audit write failed'));

      const res = await request(app)
        .post('/api/claude-vision/extract')
        .send({ ...twoImages, mode: 'quantity-table' });

      expect(res.status).toBe(500);
      expect(res.body.lineItems).toBeUndefined();
    });

    it('API キーが無いときは送っていないので記録しない', async () => {
      mockIsEnabled.mockReturnValue(false);

      const res = await request(app).post('/api/claude-vision/extract').send(twoImages);

      expect(res.status).toBe(503);
      expect(mockCreateLog).not.toHaveBeenCalled();
    });
  });

  describe('利用者ごとの回数制限', () => {
    const body = { images: [{ base64Data: 'dGVzdA==', mediaType: 'image/png' }] };
    const start = new Date('2026-11-08T09:00:00.000Z');

    beforeEach(() => {
      // 時間窓の経過を確かめるため、時計（Date）だけを差し替える
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(start);
      mockExtractLineItems.mockResolvedValue({ lineItems: [], pageCount: 1 });
      mockExtractQuantityTableData.mockResolvedValue({ lineItems: [], pageCount: 1 });
      app = createApp(productionLimiter());
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('上限は 1 時間に 30 回', () => {
      expect(CLAUDE_VISION_RATE_LIMIT).toEqual({ windowMs: 60 * 60 * 1000, limit: 30 });
    });

    it('31 回目は外部へ送らず 429 と専用の code を返し、1 時間の後に回復する', async () => {
      for (let i = 0; i < 30; i++) {
        expect((await request(app).post('/api/claude-vision/extract').send(body)).status).toBe(200);
      }
      expect(mockExtractLineItems).toHaveBeenCalledTimes(30);

      const limited = await request(app).post('/api/claude-vision/extract').send(body);

      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe('CLAUDE_VISION_USER_RATE_LIMITED');
      expect(limited.body.error).toEqual(expect.any(String));
      expect(limited.body.retryAfter).toBeDefined();
      expect(mockExtractLineItems).toHaveBeenCalledTimes(30);
      expect(mockCreateLog).toHaveBeenCalledTimes(30);

      // 時間窓の直前はまだ拒む
      vi.setSystemTime(new Date(start.getTime() + CLAUDE_VISION_RATE_LIMIT.windowMs - 1000));
      expect((await request(app).post('/api/claude-vision/extract').send(body)).status).toBe(429);

      // 時間窓が過ぎれば回復する
      vi.setSystemTime(new Date(start.getTime() + CLAUDE_VISION_RATE_LIMIT.windowMs + 1000));
      const recovered = await request(app).post('/api/claude-vision/extract').send(body);
      expect(recovered.status).toBe(200);
      expect(mockExtractLineItems).toHaveBeenCalledTimes(31);
    });

    it('数量表の取り込みも同じ上限を共有する', async () => {
      for (let i = 0; i < 30; i++) {
        const payload = i % 2 === 0 ? body : { ...body, mode: 'quantity-table' };
        await request(app).post('/api/claude-vision/extract').send(payload);
      }

      const limited = await request(app)
        .post('/api/claude-vision/extract')
        .send({ ...body, mode: 'quantity-table' });

      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe('CLAUDE_VISION_USER_RATE_LIMITED');
      expect(mockExtractQuantityTableData).toHaveBeenCalledTimes(15);
    });

    it('利用者ごとに数え、別の利用者は巻き込まれない', async () => {
      mockState.userId = 'user-a';
      for (let i = 0; i < 30; i++) {
        await request(app).post('/api/claude-vision/extract').send(body);
      }
      expect((await request(app).post('/api/claude-vision/extract').send(body)).status).toBe(429);

      mockState.userId = 'user-b';
      expect((await request(app).post('/api/claude-vision/extract').send(body)).status).toBe(200);
    });

    it('回数制限は権限の判定より前に掛かる', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app).post('/api/claude-vision/extract').send(body);
      }
      mockState.shouldRejectPermission = true;

      const res = await request(app).post('/api/claude-vision/extract').send(body);

      expect(res.status).toBe(429);
    });

    it('状態の API は回数に数えない', async () => {
      for (let i = 0; i < 35; i++) {
        expect((await request(app).get('/api/claude-vision/status')).status).toBe(200);
      }
      expect((await request(app).post('/api/claude-vision/extract').send(body)).status).toBe(200);
    });

    it('他の制限と同じく、開発での無効化の明示があれば数えない', async () => {
      const bypassed = createRateLimiters({
        runtimeMode: createRuntimeMode({ NODE_ENV: 'development', DISABLE_RATE_LIMIT: 'true' }),
        getRedisClient: () => null,
      }).claudeVision;
      app = createApp(bypassed);

      for (let i = 0; i < 31; i++) {
        expect((await request(app).post('/api/claude-vision/extract').send(body)).status).toBe(200);
      }
    });

    it('本番では無効化の変数があっても数える', async () => {
      const notBypassed = createRateLimiters({
        runtimeMode: createRuntimeMode({ NODE_ENV: 'production', DISABLE_RATE_LIMIT: 'true' }),
        getRedisClient: () => null,
      }).claudeVision;
      app = createApp(notBypassed);

      for (let i = 0; i < 30; i++) {
        await request(app).post('/api/claude-vision/extract').send(body);
      }
      expect((await request(app).post('/api/claude-vision/extract').send(body)).status).toBe(429);
    });
  });
});
