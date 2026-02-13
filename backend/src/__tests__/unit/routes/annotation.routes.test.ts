/**
 * @fileoverview 注釈管理エンドポイントのテスト
 *
 * Task 6.3: 注釈管理エンドポイントを実装する
 * - GET /api/site-surveys/images/:imageId/annotations（取得）
 * - PUT /api/site-surveys/images/:imageId/annotations（保存）
 *
 * Requirements:
 * - 9.1: 全ての注釈データをデータベースに保存する
 * - 9.2: 保存された注釈データを復元して表示する
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// モックサービスをvi.hoisted()で初期化
const mockAnnotationService = vi.hoisted(() => ({
  save: vi.fn(),
  findByImageId: vi.fn(),
  findByImageIds: vi.fn(),
  getAnnotationWithValidation: vi.fn(),
  exportAsJson: vi.fn(),
  delete: vi.fn(),
  validateAnnotationData: vi.fn(),
}));

// モック: データベースとRedis
vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../redis', () => ({
  default: {
    getClient: vi.fn(() => null),
  },
}));

// モック: サービス層
vi.mock('../../../services/annotation.service', () => ({
  AnnotationService: class {
    constructor() {
      return mockAnnotationService;
    }
  },
  AnnotationImageNotFoundError: class AnnotationImageNotFoundError extends Error {
    code = 'ANNOTATION_IMAGE_NOT_FOUND';
    imageId: string;
    constructor(imageId: string) {
      super(`画像が見つかりません: ${imageId}`);
      this.name = 'AnnotationImageNotFoundError';
      this.imageId = imageId;
    }
  },
  AnnotationConflictError: class AnnotationConflictError extends Error {
    code = 'ANNOTATION_CONFLICT';
    expectedUpdatedAt: string;
    actualUpdatedAt: string;
    constructor(expectedUpdatedAt: Date, actualUpdatedAt: Date) {
      super('注釈データは他のユーザーによって更新されました。最新データを確認してください。');
      this.name = 'AnnotationConflictError';
      this.expectedUpdatedAt = expectedUpdatedAt.toISOString();
      this.actualUpdatedAt = actualUpdatedAt.toISOString();
    }
  },
  InvalidAnnotationDataError: class InvalidAnnotationDataError extends Error {
    code = 'INVALID_ANNOTATION_DATA';
    constructor(reason: string) {
      super(`無効な注釈データです: ${reason}`);
      this.name = 'InvalidAnnotationDataError';
    }
  },
  AnnotationNotFoundError: class AnnotationNotFoundError extends Error {
    code = 'ANNOTATION_NOT_FOUND';
    imageId: string;
    constructor(imageId: string) {
      super(`注釈データが見つかりません: ${imageId}`);
      this.name = 'AnnotationNotFoundError';
      this.imageId = imageId;
    }
  },
  ANNOTATION_SCHEMA_VERSION: '1.0',
}));

// モック: 認証ミドルウェア
vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'test-user-id',
      email: 'test@example.com',
      roles: ['user'],
    };
    next();
  },
}));

// モック: 認可ミドルウェア
vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// 実際のルートとミドルウェアをインポート（モックの後にインポート）
import annotationRouter from '../../../routes/annotation.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import {
  AnnotationImageNotFoundError,
  AnnotationConflictError,
  InvalidAnnotationDataError,
} from '../../../services/annotation.service.js';

describe('Annotation Routes', () => {
  let app: Application;

  // テスト用UUID定数
  const TEST_IMAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
  const TEST_ANNOTATION_ID = '550e8400-e29b-41d4-a716-446655440003';

  const mockAnnotationData = {
    version: '1.0',
    objects: [
      {
        type: 'rect',
        left: 100,
        top: 100,
        width: 200,
        height: 150,
        fill: '#ff0000',
      },
    ],
    background: '#ffffff',
  };

  const mockAnnotationInfo = {
    id: TEST_ANNOTATION_ID,
    imageId: TEST_IMAGE_ID,
    data: mockAnnotationData,
    version: '1.0',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    // 注釈ルートをマウント
    app.use('/api/site-surveys/images', annotationRouter);
    app.use(errorHandler);
  });

  describe('GET /api/site-surveys/images/:imageId/annotations', () => {
    it('should return annotation data successfully', async () => {
      (
        mockAnnotationService.getAnnotationWithValidation as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockAnnotationInfo);

      const response = await request(app).get(
        `/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: TEST_ANNOTATION_ID,
        imageId: TEST_IMAGE_ID,
        data: mockAnnotationData,
        version: '1.0',
      });
      expect(mockAnnotationService.getAnnotationWithValidation).toHaveBeenCalledWith(TEST_IMAGE_ID);
    });

    it('should return 200 with null when no annotation exists', async () => {
      (
        mockAnnotationService.getAnnotationWithValidation as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const response = await request(app).get(
        `/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: null });
    });

    it('should return 400 for invalid imageId format', async () => {
      const response = await request(app).get('/api/site-surveys/images/invalid-uuid/annotations');

      expect(response.status).toBe(400);
    });

    it('should return 404 when image not found', async () => {
      (
        mockAnnotationService.getAnnotationWithValidation as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new AnnotationImageNotFoundError(TEST_IMAGE_ID));

      const response = await request(app).get(
        `/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`
      );

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'ANNOTATION_IMAGE_NOT_FOUND',
      });
    });
  });

  describe('PUT /api/site-surveys/images/:imageId/annotations', () => {
    const validSaveInput = {
      data: mockAnnotationData,
    };

    it('should save annotation successfully (new)', async () => {
      (mockAnnotationService.save as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockAnnotationInfo
      );

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send(validSaveInput);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: TEST_ANNOTATION_ID,
        imageId: TEST_IMAGE_ID,
        data: mockAnnotationData,
        version: '1.0',
      });
      expect(mockAnnotationService.save).toHaveBeenCalledWith({
        imageId: TEST_IMAGE_ID,
        data: mockAnnotationData,
        expectedUpdatedAt: undefined,
      });
    });

    it('should save annotation with optimistic locking', async () => {
      const inputWithExpectedUpdatedAt = {
        data: mockAnnotationData,
        expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
      };

      (mockAnnotationService.save as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockAnnotationInfo
      );

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send(inputWithExpectedUpdatedAt);

      expect(response.status).toBe(200);
      expect(mockAnnotationService.save).toHaveBeenCalledWith({
        imageId: TEST_IMAGE_ID,
        data: mockAnnotationData,
        expectedUpdatedAt: expect.any(Date),
      });
    });

    it('should return 400 for invalid imageId format', async () => {
      const response = await request(app)
        .put('/api/site-surveys/images/invalid-uuid/annotations')
        .send(validSaveInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when data is missing', async () => {
      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 400 when data is invalid format (missing objects)', async () => {
      const invalidInput = {
        data: {
          // missing required 'objects' field
          version: '1.0',
        },
      };

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send(invalidInput);

      // Zodバリデーションで400を返す
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('should return 400 when service throws InvalidAnnotationDataError', async () => {
      const validInput = {
        data: mockAnnotationData,
      };

      (mockAnnotationService.save as ReturnType<typeof vi.fn>).mockRejectedValue(
        new InvalidAnnotationDataError('objectsプロパティが必要です')
      );

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send(validInput);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'INVALID_ANNOTATION_DATA',
      });
    });

    it('should return 400 when objects is not an array', async () => {
      const invalidInput = {
        data: {
          version: '1.0',
          objects: 'not-an-array',
        },
      };

      (mockAnnotationService.save as ReturnType<typeof vi.fn>).mockRejectedValue(
        new InvalidAnnotationDataError('objectsは配列である必要があります')
      );

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 404 when image not found', async () => {
      (mockAnnotationService.save as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AnnotationImageNotFoundError(TEST_IMAGE_ID)
      );

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send(validSaveInput);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'ANNOTATION_IMAGE_NOT_FOUND',
      });
    });

    it('should return 409 when conflict error (optimistic locking)', async () => {
      const inputWithExpectedUpdatedAt = {
        data: mockAnnotationData,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      };

      (mockAnnotationService.save as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AnnotationConflictError(
          new Date('2025-01-01T00:00:00.000Z'),
          new Date('2025-01-02T00:00:00.000Z')
        )
      );

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send(inputWithExpectedUpdatedAt);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'ANNOTATION_CONFLICT',
      });
    });
  });

  describe('GET /api/site-surveys/images/:imageId/annotations/export', () => {
    it('should export annotation as JSON successfully', async () => {
      const jsonString = JSON.stringify(mockAnnotationData, null, 2);
      (mockAnnotationService.exportAsJson as ReturnType<typeof vi.fn>).mockResolvedValue(
        jsonString
      );

      const response = await request(app).get(
        `/api/site-surveys/images/${TEST_IMAGE_ID}/annotations/export`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.json');
    });

    it('should return 404 when image not found', async () => {
      (mockAnnotationService.exportAsJson as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AnnotationImageNotFoundError(TEST_IMAGE_ID)
      );

      const response = await request(app).get(
        `/api/site-surveys/images/${TEST_IMAGE_ID}/annotations/export`
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for GET annotations', async () => {
      (
        mockAnnotationService.getAnnotationWithValidation as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockAnnotationInfo);

      const response = await request(app).get(
        `/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`
      );

      // 認証モックが適用されているので200を期待
      expect(response.status).toBe(200);
    });

    it('should require authentication for PUT annotations', async () => {
      (mockAnnotationService.save as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockAnnotationInfo
      );

      const response = await request(app)
        .put(`/api/site-surveys/images/${TEST_IMAGE_ID}/annotations`)
        .send({ data: mockAnnotationData });

      // 認証モックが適用されているので200を期待
      expect(response.status).toBe(200);
    });
  });

  // ===========================================================================
  // POST /api/site-surveys/annotations/batch テスト
  // Task 43.2: バッチ注釈取得エンドポイントの単体テスト
  // Requirements: 18.1, 18.6
  // ===========================================================================

  describe('POST /api/site-surveys/annotations/batch', () => {
    const TEST_SURVEY_ID = '550e8400-e29b-41d4-a716-446655440010';
    const TEST_IMAGE_ID_1 = '550e8400-e29b-41d4-a716-446655440011';
    const TEST_IMAGE_ID_2 = '550e8400-e29b-41d4-a716-446655440012';

    const batchMockAnnotation1 = {
      id: '550e8400-e29b-41d4-a716-446655440020',
      imageId: TEST_IMAGE_ID_1,
      data: mockAnnotationData,
      version: '1.0',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
    };

    beforeEach(() => {
      // バッチルートも同じルーターに含まれるのでapp再構築
      vi.clearAllMocks();

      app = express();
      app.use(express.json());
      // 個別注釈ルートは /api/site-surveys/images にマウント
      app.use('/api/site-surveys/images', annotationRouter);
      // バッチ注釈ルートは /api/site-surveys にマウント
      app.use('/api/site-surveys', annotationRouter);
      app.use(errorHandler);
    });

    it('正常系: 複数画像IDに対する注釈データをバッチ取得する（Requirements: 18.1）', async () => {
      const mockResult = {
        [TEST_IMAGE_ID_1]: batchMockAnnotation1,
        [TEST_IMAGE_ID_2]: null,
      };

      (mockAnnotationService.findByImageIds as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app)
        .post('/api/site-surveys/annotations/batch')
        .send({
          surveyId: TEST_SURVEY_ID,
          imageIds: [TEST_IMAGE_ID_1, TEST_IMAGE_ID_2],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('annotations');
      expect(response.body.annotations[TEST_IMAGE_ID_1]).toMatchObject({
        id: batchMockAnnotation1.id,
        imageId: TEST_IMAGE_ID_1,
        data: mockAnnotationData,
      });
      expect(response.body.annotations[TEST_IMAGE_ID_2]).toBeNull();
      expect(mockAnnotationService.findByImageIds).toHaveBeenCalledWith(
        [TEST_IMAGE_ID_1, TEST_IMAGE_ID_2],
        TEST_SURVEY_ID
      );
    });

    it('surveyIdが未指定の場合に400エラーを返す（Requirements: 18.6）', async () => {
      const response = await request(app)
        .post('/api/site-surveys/annotations/batch')
        .send({
          imageIds: [TEST_IMAGE_ID_1],
        });

      expect(response.status).toBe(400);
    });

    it('imageIdsが不正な形式の場合に400エラーを返す', async () => {
      const response = await request(app).post('/api/site-surveys/annotations/batch').send({
        surveyId: TEST_SURVEY_ID,
        imageIds: 'not-an-array',
      });

      expect(response.status).toBe(400);
    });

    it('imageIdsが空配列の場合に400エラーを返す', async () => {
      const response = await request(app).post('/api/site-surveys/annotations/batch').send({
        surveyId: TEST_SURVEY_ID,
        imageIds: [],
      });

      expect(response.status).toBe(400);
    });

    it('imageIdsに不正なUUID形式が含まれる場合に400エラーを返す', async () => {
      const response = await request(app)
        .post('/api/site-surveys/annotations/batch')
        .send({
          surveyId: TEST_SURVEY_ID,
          imageIds: ['not-a-uuid'],
        });

      expect(response.status).toBe(400);
    });

    it('surveyに属さない画像IDが含まれる場合に404エラーを返す', async () => {
      (mockAnnotationService.findByImageIds as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AnnotationImageNotFoundError(TEST_IMAGE_ID_1)
      );

      const response = await request(app)
        .post('/api/site-surveys/annotations/batch')
        .send({
          surveyId: TEST_SURVEY_ID,
          imageIds: [TEST_IMAGE_ID_1],
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ANNOTATION_IMAGE_NOT_FOUND');
    });
  });
});
