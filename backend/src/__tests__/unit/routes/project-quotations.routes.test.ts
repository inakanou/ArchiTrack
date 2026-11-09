/**
 * @fileoverview 案件の配下の受領見積書の経路（一覧・登録）の単体テスト
 *
 * estimate-request タスク114.1（design の Requirements 43-50 の章の D2・D3・D6）。
 * - 一覧: 既定は見積依頼に紐づくものだけ、`include=all` で全件
 * - 登録: authenticate → requirePermission → 案件 ID の検証 → 案件の範囲 → ファイルの受信 → 本文の検証 の順。
 *   範囲外はファイルを受け取る前に 404 にする
 * - 同じ原本の二重登録は 409 `DUPLICATE_ORIGINAL`、成功の応答は `sharedOriginalCount` を持つ
 *
 * @module __tests__/unit/routes/project-quotations.routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

const { mockCreate, mockFindByProjectId, mockRequirePermission, mockCallOrder, mockState } =
  vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockFindByProjectId: vi.fn(),
    mockRequirePermission: vi.fn(),
    mockCallOrder: [] as string[],
    mockState: { shouldRejectPermission: false, outOfScope: false },
  }));

// ファイルの受信（multer）を包み、呼ばれた順を記録する（範囲の判定より後に受信することを確かめる）
vi.mock('multer', async (importOriginal) => {
  const actual = (await importOriginal()) as { default: typeof import('multer') };
  const original = actual.default;
  const wrapped = ((options: Parameters<typeof original>[0]) => {
    const instance = original(options);
    return {
      ...instance,
      single: (field: string) => {
        const middleware = instance.single(field);
        return (req: Request, res: Response, next: NextFunction) => {
          mockCallOrder.push('upload');
          middleware(req, res, next);
        };
      },
    };
  }) as unknown as typeof original;
  Object.assign(wrapped, original);
  return { default: wrapped };
});

// 案件の範囲の判定（mockState.outOfScope で範囲外にする）。判定そのものは部品の単体と統合が確かめる
vi.mock('../../../middleware/estimate-creation-project-scope.middleware.js', () => ({
  requireProjectParamScope:
    () =>
    (_req: Request, res: Response, next: NextFunction): void => {
      mockCallOrder.push('scope');
      if (mockState.outOfScope) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', detail: 'Resource not found' });
        return;
      }
      next();
    },
}));

vi.mock('../../../middleware/estimate-request-project-scope.middleware.js', () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    requireProjectParamScope: pass,
    requireEstimateRequestProjectScope: pass,
    requireReceivedQuotationProjectScope: pass,
    requireBodyItemizedStatementProjectScope: pass,
  };
});

vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/received-quotation.service.js', () => ({
  ReceivedQuotationService: class {
    create = mockCreate;
    findByProjectId = mockFindByProjectId;
  },
}));

vi.mock('../../../storage/storage-factory.js', () => ({
  getStorageProvider: vi.fn(() => ({ upload: vi.fn(), delete: vi.fn(), getSignedUrl: vi.fn() })),
}));

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    req.user = { userId: 'test-user-id', email: 'test@example.com', roles: ['user'] };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: (permission: string) => {
    return (_req: Request, res: Response, next: NextFunction): void => {
      mockRequirePermission(permission);
      if (mockState.shouldRejectPermission) {
        res.status(403).json({ status: 403, code: 'FORBIDDEN' });
        return;
      }
      next();
    };
  },
}));

import projectQuotationsRoutes from '../../../routes/project-quotations.routes.js';
import { DuplicateOriginalError } from '../../../errors/receivedQuotationError.js';
import { ApiError } from '../../../errors/apiError.js';

describe('project-quotations.routes', () => {
  let app: express.Express;

  const projectId = '550e8400-e29b-41d4-a716-446655440010';
  const quotationId = '550e8400-e29b-41d4-a716-446655440011';
  const partnerId = '550e8400-e29b-41d4-a716-446655440012';

  const savedQuotation = {
    id: quotationId,
    estimateRequestId: null,
    name: '業者の見積',
    vendorName: '山田設備',
    tradingPartnerId: null,
    submittedAt: '2026-11-01T00:00:00.000Z',
    fileName: 'quote.pdf',
    lineItems: [],
    totalAmount: null,
    updatedAt: '2026-11-08T00:00:00.000Z',
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/projects/:projectId/quotations', projectQuotationsRoutes);
    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof ApiError) {
        res.status(err.statusCode).json(err.toProblemDetails(req.url));
        return;
      }
      res.status(500).json({ error: err.message });
    });
    mockState.shouldRejectPermission = false;
    mockState.outOfScope = false;
    mockCallOrder.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/projects/:projectId/quotations', () => {
    it('指定が無ければ見積依頼に紐づくものだけを求める', async () => {
      mockFindByProjectId.mockResolvedValue([{ id: quotationId }]);

      const response = await request(app).get(`/api/projects/${projectId}/quotations`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ id: quotationId }]);
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId, { include: 'requested' });
      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:read');
    });

    it('include=all なら見積依頼の無いものを含む全件を求める', async () => {
      mockFindByProjectId.mockResolvedValue([]);

      const response = await request(app).get(`/api/projects/${projectId}/quotations?include=all`);

      expect(response.status).toBe(200);
      expect(mockFindByProjectId).toHaveBeenCalledWith(projectId, { include: 'all' });
    });

    it('include に知らない値を渡すと 400 にし、一覧を読まない', async () => {
      const response = await request(app).get(
        `/api/projects/${projectId}/quotations?include=deleted`
      );

      expect(response.status).toBe(400);
      expect(mockFindByProjectId).not.toHaveBeenCalled();
    });

    it('範囲外の案件は 404 にし、一覧を読まない', async () => {
      mockState.outOfScope = true;

      const response = await request(app).get(`/api/projects/${projectId}/quotations?include=all`);

      expect(response.status).toBe(404);
      expect(mockFindByProjectId).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/projects/:projectId/quotations', () => {
    function postMultipart() {
      return request(app)
        .post(`/api/projects/${projectId}/quotations`)
        .field('name', '業者の見積')
        .field('submittedAt', '2026-11-01T00:00:00.000Z')
        .field('vendorName', '山田設備')
        .field('tradingPartnerId', partnerId)
        .field('quoteNumber', 'Q-001')
        .field('siteLocation', '東京都')
        .field('constructionKind', 'RENOVATION')
        .field('constructionPrice', '1200000')
        .field('distanceKm', '12.5')
        .field('adoption', 'ADOPTED')
        .field('readingStatus', 'CONFIRMED')
        .field('quoteDiscriminator', 'A案')
        .field(
          'lineItems',
          JSON.stringify([
            {
              name: '配管',
              sortOrder: 0,
              quantity: 2,
              unitPrice: 1000,
              amount: 2000,
              category: 'DIRECT',
            },
          ])
        )
        .attach('file', Buffer.from('%PDF-1.4 quote'), {
          filename: 'quote.pdf',
          contentType: 'application/pdf',
        });
    }

    it('案件の文脈で登録し、201 と同じ原本の他の件数を返す', async () => {
      mockCreate.mockResolvedValue({ quotation: savedQuotation, sharedOriginalCount: 2 });

      const response = await postMultipart();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ ...savedQuotation, sharedOriginalCount: 2 });
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const [context, input, actorId] = mockCreate.mock.calls[0]!;
      expect(context).toEqual({ kind: 'project', projectId });
      expect(actorId).toBe('test-user-id');
      expect(input).toMatchObject({
        name: '業者の見積',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        vendorName: '山田設備',
        tradingPartnerId: partnerId,
        quoteNumber: 'Q-001',
        siteLocation: '東京都',
        constructionKind: 'RENOVATION',
        constructionPrice: 1200000,
        distanceKm: 12.5,
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        quoteDiscriminator: 'A案',
        lineItems: [expect.objectContaining({ name: '配管', amount: 2000, category: 'DIRECT' })],
        file: expect.objectContaining({
          originalName: 'quote.pdf',
          mimeType: 'application/pdf',
        }),
      });
      expect(Buffer.isBuffer(input.file.buffer)).toBe(true);
      // 範囲の判定はファイルの受信より先
      expect(mockCallOrder).toEqual(['scope', 'upload']);
    });

    it('登録には見積依頼の更新の権限を求め、無ければ 403 にして範囲の判定もファイルの受信もしない', async () => {
      mockState.shouldRejectPermission = true;

      const response = await postMultipart();

      expect(response.status).toBe(403);
      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:update');
      expect(mockCallOrder).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('範囲外の案件はファイルを受け取る前に 404 にし、登録しない', async () => {
      mockState.outOfScope = true;

      const response = await postMultipart();

      expect(response.status).toBe(404);
      expect(mockCallOrder).toEqual(['scope']);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('案件 ID の形式が誤っていれば 400 にし、範囲の判定へ進まない', async () => {
      const response = await request(app)
        .post('/api/projects/not-a-uuid/quotations')
        .field('name', '業者の見積')
        .field('submittedAt', '2026-11-01T00:00:00.000Z');

      expect(response.status).toBe(400);
      expect(mockCallOrder).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('明細行の JSON が壊れていれば 400 にし、登録しない', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/quotations`)
        .field('name', '業者の見積')
        .field('submittedAt', '2026-11-01T00:00:00.000Z')
        .field('vendorName', '山田設備')
        .field('lineItems', '{broken');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('同じ原本・同じ区別が既にあれば 409 DUPLICATE_ORIGINAL と既存の名前・業者名・提出日を返す', async () => {
      mockCreate.mockRejectedValue(
        new DuplicateOriginalError({
          name: '先に登録した見積',
          vendorName: '山田設備',
          submittedAt: '2026-10-20T00:00:00.000Z',
        })
      );

      const response = await postMultipart();

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        type: 'https://architrack.example.com/problems/duplicate-original',
        title: 'Duplicate Original',
        status: 409,
        detail: '同じ原本の受領見積書が既に登録されています',
        code: 'DUPLICATE_ORIGINAL',
        existing: {
          name: '先に登録した見積',
          vendorName: '山田設備',
          submittedAt: '2026-10-20T00:00:00.000Z',
        },
      });
    });
  });
});
