/**
 * @fileoverview 論理削除された現場調査の画像への到達を遮断する五経路のテスト
 *
 * Task 115.124: 論理削除された現場調査の画像へ到達できる五経路を遮断する
 *
 * 現場調査の論理削除は画像の行に削除の印を付けないため、遮断は画像を読み書きする
 * 各経路が明示的に行うほかない。既に遮断済みの順序更新経路（PUT /order）は
 * 410 + code=SURVEY_DELETED で拒否する。本テストは以下の五経路が同じ扱いへ
 * 揃っていることを、経路ごとに独立して主張する。
 *
 * 1. PATCH /api/site-surveys/images/:imageId          （メタデータ更新・単件）
 * 2. PATCH /api/site-surveys/images/batch             （メタデータ更新・一括）
 * 3. DELETE /api/site-surveys/images/:imageId         （画像削除）
 * 4. PATCH /api/site-surveys/images/:imageId/annotated-thumbnail  （注釈付きサムネイル更新）
 * 5. DELETE /api/site-surveys/images/:imageId/annotated-thumbnail （注釈付きサムネイル削除）
 *
 * 本テストはサービス層をモックせず、保存基盤（prisma）とストレージのみを
 * 差し替える。遮断が実際に効いていることを、応答（状態コードと本文）と
 * 書き込みが行われないことの双方で確かめる。
 *
 * Requirements:
 * - 1.5: ユーザーが現場調査を削除すると、現場調査と関連する画像データを論理削除する
 *
 * @module tests/unit/routes/survey-images.soft-deleted-survey-guard.routes
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

const IMAGE_ID = '33333333-3333-4333-8333-333333333333';
const SURVEY_ID = '44444444-4444-4444-8444-444444444444';
const DELETED_AT = new Date('2026-01-01T00:00:00.000Z');
const IMAGE_DATA = `data:image/jpeg;base64,${Buffer.from('composited').toString('base64')}`;

const mockPrisma = vi.hoisted(() => ({
  surveyImage: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  imageAnnotation: {
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const mockStorageProvider = vi.hoisted(() => ({
  type: 'local',
  upload: vi.fn(),
  delete: vi.fn(),
  copy: vi.fn(),
  getSignedUrl: vi.fn(),
}));

const mockImageProcessorService = vi.hoisted(() => ({
  generateThumbnail: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  default: vi.fn(() => mockPrisma),
}));

vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: vi.fn(() => true),
  getStorageProvider: vi.fn(() => mockStorageProvider),
}));

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: 'test-user-id', email: 'test@example.com', roles: ['user'] };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../services/image-processor.service.js', () => ({
  ImageProcessorService: class {
    constructor() {
      return mockImageProcessorService;
    }
  },
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({})),
}));

import surveyImagesRouter, {
  initializeStorageServices,
} from '../../../routes/survey-images.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

function createApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/api/site-surveys/images', surveyImagesRouter);
  app.use(errorHandler);
  return app;
}

/** 論理削除済みの親を持つ画像の行（メタデータ経路が読む形） */
function deletedParentImageRow(): Record<string, unknown> {
  return {
    id: IMAGE_ID,
    surveyId: SURVEY_ID,
    originalPath: `surveys/${SURVEY_ID}/original.jpg`,
    thumbnailPath: `surveys/${SURVEY_ID}/thumb.jpg`,
    annotatedThumbnailPath: `annotated-thumbnails/${IMAGE_ID}.1700000000000.jpg`,
    fileName: 'photo.jpg',
    fileSize: 1024,
    width: 100,
    height: 100,
    displayOrder: 1,
    comment: null,
    includeInReport: false,
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
    annotation: null,
    survey: { deletedAt: DELETED_AT },
  };
}

/** 生存している親を持つ画像の行 */
function livingParentImageRow(): Record<string, unknown> {
  return { ...deletedParentImageRow(), survey: { deletedAt: null } };
}

describe('論理削除された現場調査の画像への到達遮断 (Task 115.124, Requirements 1.5)', () => {
  let app: Application;

  beforeAll(async () => {
    // DELETE /:imageId は初期化済みの ImageDeleteService を必要とする
    await initializeStorageServices();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
    );
    mockStorageProvider.upload.mockResolvedValue(undefined);
    mockStorageProvider.delete.mockResolvedValue(undefined);
    mockStorageProvider.getSignedUrl.mockResolvedValue('https://example.com/signed');
    mockImageProcessorService.generateThumbnail.mockResolvedValue(Buffer.from('thumb'));
  });

  describe('経路1: PATCH /api/site-surveys/images/:imageId（メタデータ更新・単件）', () => {
    it('親の現場調査が論理削除済みなら 410 SURVEY_DELETED で拒否し、行を書き換えない', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(deletedParentImageRow());
      // 遮断が無ければ 200 で書き込みが通ることを露わにするため、更新も成功させておく
      mockPrisma.surveyImage.update.mockResolvedValue({
        ...deletedParentImageRow(),
        comment: '削除済み調査への書き込み',
      });

      const response = await request(app)
        .patch(`/api/site-surveys/images/${IMAGE_ID}`)
        .send({ comment: '削除済み調査への書き込み' });

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('SURVEY_DELETED');
      expect(response.body.status).toBe(410);
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });

    it('親の現場調査が生存していれば従来どおり更新できる', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(livingParentImageRow());
      mockPrisma.surveyImage.update.mockResolvedValue({
        ...livingParentImageRow(),
        comment: '通常の更新',
      });

      const response = await request(app)
        .patch(`/api/site-surveys/images/${IMAGE_ID}`)
        .send({ comment: '通常の更新' });

      expect(response.status).toBe(200);
      expect(response.body.comment).toBe('通常の更新');
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('経路2: PATCH /api/site-surveys/images/batch（メタデータ更新・一括）', () => {
    it('親の現場調査が論理削除済みなら 410 SURVEY_DELETED で拒否し、行を書き換えない', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        { id: IMAGE_ID, surveyId: SURVEY_ID, survey: { deletedAt: DELETED_AT } },
      ]);
      // 遮断が無ければ 200 で書き込みが通ることを露わにするため、更新も成功させておく
      mockPrisma.surveyImage.update.mockResolvedValue({
        ...deletedParentImageRow(),
        comment: '削除済み調査への一括書き込み',
      });

      const response = await request(app)
        .patch('/api/site-surveys/images/batch')
        .send({ updates: [{ id: IMAGE_ID, comment: '削除済み調査への一括書き込み' }] });

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('SURVEY_DELETED');
      expect(response.body.status).toBe(410);
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });

    it('親の現場調査が生存していれば従来どおり一括更新できる', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        { id: IMAGE_ID, surveyId: SURVEY_ID, survey: { deletedAt: null } },
      ]);
      mockPrisma.surveyImage.update.mockResolvedValue({
        ...livingParentImageRow(),
        comment: '通常の一括更新',
      });

      const response = await request(app)
        .patch('/api/site-surveys/images/batch')
        .send({ updates: [{ id: IMAGE_ID, comment: '通常の一括更新' }] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].comment).toBe('通常の一括更新');
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('経路3: DELETE /api/site-surveys/images/:imageId（画像削除）', () => {
    it('親の現場調査が論理削除済みなら 410 SURVEY_DELETED で拒否し、行を消さない', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(deletedParentImageRow());

      const response = await request(app).delete(`/api/site-surveys/images/${IMAGE_ID}`);

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('SURVEY_DELETED');
      expect(response.body.status).toBe(410);
      expect(mockPrisma.surveyImage.delete).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('親の現場調査が生存していれば従来どおり削除できる', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(livingParentImageRow());
      mockPrisma.surveyImage.delete.mockResolvedValue(livingParentImageRow());

      const response = await request(app).delete(`/api/site-surveys/images/${IMAGE_ID}`);

      expect(response.status).toBe(204);
      expect(mockPrisma.surveyImage.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('経路4: PATCH /api/site-surveys/images/:imageId/annotated-thumbnail（注釈付きサムネイル更新）', () => {
    it('親の現場調査が論理削除済みなら 410 SURVEY_DELETED で拒否し、保存もしない', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(deletedParentImageRow());
      // 遮断が無ければ 200 で保存が通ることを露わにするため、更新も成功させておく
      mockPrisma.surveyImage.update.mockResolvedValue(deletedParentImageRow());

      const response = await request(app)
        .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
        .send({ imageData: IMAGE_DATA });

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('SURVEY_DELETED');
      expect(response.body.status).toBe(410);
      expect(mockStorageProvider.upload).not.toHaveBeenCalled();
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });

    it('親の現場調査が生存していれば従来どおり合成済みサムネイルを保存できる', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(livingParentImageRow());
      mockPrisma.surveyImage.update.mockResolvedValue(livingParentImageRow());

      const response = await request(app)
        .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
        .send({ imageData: IMAGE_DATA });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('経路5: DELETE /api/site-surveys/images/:imageId/annotated-thumbnail（注釈付きサムネイル削除）', () => {
    it('親の現場調査が論理削除済みなら 410 SURVEY_DELETED で拒否し、項目を空にしない', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(deletedParentImageRow());
      // 遮断が無ければ 200 で取り消しが通ることを露わにするため、更新も成功させておく
      mockPrisma.surveyImage.update.mockResolvedValue({
        ...deletedParentImageRow(),
        annotatedThumbnailPath: null,
      });

      const response = await request(app).delete(
        `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
      );

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('SURVEY_DELETED');
      expect(response.body.status).toBe(410);
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
    });

    it('親の現場調査が生存していれば従来どおり合成済みサムネイルを取り消せる', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(livingParentImageRow());
      mockPrisma.surveyImage.update.mockResolvedValue({
        ...livingParentImageRow(),
        annotatedThumbnailPath: null,
      });

      const response = await request(app).delete(
        `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
      );

      expect(response.status).toBe(200);
      expect(response.body.annotatedThumbnailPath).toBeNull();
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
    });
  });
});
