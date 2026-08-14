/**
 * @fileoverview 合成済みサムネイルの保存形式の一致を検証するテスト
 *
 * Task 115.18: 合成済みサムネイルの保存形式と申告する形式の食い違いを解消する
 *
 * PATCH /api/site-surveys/images/:imageId/annotated-thumbnail は
 * 保存キーの拡張子と Content-Type を JPEG で申告する。実体の生成もこれに一致させる。
 *
 * 実体の形式を確かめる必要があるため、本ファイルでは画像処理サービスと sharp を
 * モックせず実体で動かす（他の合成済みサムネイルのテストは処理を差し替えており、
 * 申告と実体の食い違いを検出できない）。
 *
 * Requirements:
 * - 20.4: 注釈が編集モードで保存されると注釈をレンダリングしたサムネイル画像を生成・更新する
 * - 23.1: 注釈の追加・編集・削除の保存後、注釈をレンダリングしたサムネイル画像を再生成する
 * - 38.5: 注釈をレンダリングしたサムネイル画像が利用可能なら縮小表示に当該画像を用いる
 *
 * @module tests/unit/routes/survey-images.annotated-thumbnail.format.routes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

const IMAGE_ID = '33333333-3333-4333-8333-333333333333';
const SURVEY_ID = '44444444-4444-4444-8444-444444444444';

const mockPrisma = vi.hoisted(() => ({
  surveyImage: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const mockStorageProvider = vi.hoisted(() => ({
  type: 'local',
  upload: vi.fn(),
  delete: vi.fn(),
  copy: vi.fn(),
  getSignedUrl: vi.fn(),
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

// モジュール読み込み時に生成される依存サービス群（本テストでは未使用）
vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {},
}));
vi.mock('../../../services/site-survey.service.js', () => ({
  SiteSurveyService: class {
    findById = vi.fn();
  },
}));
vi.mock('../../../services/signed-url.service.js', () => ({
  SignedUrlService: class {},
}));
vi.mock('../../../services/image-list.service.js', () => ({
  ImageListService: class {},
}));
vi.mock('../../../services/image-order.service.js', () => ({
  ImageOrderService: class {},
  ImageOrderError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock('../../../services/image-delete.service.js', () => ({
  ImageDeleteService: class {},
  ImageNotFoundError: class extends Error {
    imageId: string;
    constructor(imageId: string) {
      super(`画像が見つかりません: ${imageId}`);
      this.imageId = imageId;
    }
  },
}));
vi.mock('../../../services/survey-image.service.js', () => ({
  SurveyImageService: class {},
}));
vi.mock('../../../services/image-metadata.service.js', () => ({
  ImageMetadataService: class {
    updateMetadata = vi.fn();
    getMetadata = vi.fn();
    findForReport = vi.fn();
  },
  ImageNotFoundError: class extends Error {
    code = 'IMAGE_NOT_FOUND';
    imageId: string;
    constructor(imageId: string) {
      super(`画像が見つかりません: ${imageId}`);
      this.imageId = imageId;
    }
  },
  CommentTooLongError: class extends Error {
    code = 'COMMENT_TOO_LONG';
    constructor() {
      super('コメントが長すぎます');
    }
  },
}));
vi.mock('../../../services/image-upload.service.js', () => ({
  ImageUploadService: class {},
  SurveyNotFoundError: class extends Error {
    surveyId: string;
    constructor(surveyId: string) {
      super(`現場調査が見つかりません: ${surveyId}`);
      this.surveyId = surveyId;
    }
  },
  MaxImagesExceededError: class extends Error {
    constructor() {
      super('上限');
    }
  },
}));

import surveyImagesRouter from '../../../routes/survey-images.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

function createApp(): Application {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/site-surveys/images', surveyImagesRouter);
  app.use(errorHandler);
  return app;
}

/**
 * 指定形式の実画像を生成する
 */
async function createImage(format: 'png' | 'webp' | 'jpeg'): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const base = sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 30, b: 90 } },
  });
  if (format === 'png') return await base.png().toBuffer();
  if (format === 'webp') return await base.webp().toBuffer();
  return await base.jpeg().toBuffer();
}

/**
 * バッファの実体の形式を読み出す
 */
async function detectFormat(buffer: Buffer): Promise<string | undefined> {
  const sharp = (await import('sharp')).default;
  return (await sharp(buffer).metadata()).format;
}

function toDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

describe('PATCH /:imageId/annotated-thumbnail の保存形式の一致 (Task 115.18)', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.surveyImage.findUnique.mockResolvedValue({
      id: IMAGE_ID,
      annotatedThumbnailPath: null,
    });
    mockPrisma.surveyImage.update.mockResolvedValue({ id: IMAGE_ID });
    mockStorageProvider.upload.mockImplementation(async (key: string) => ({ key, size: 1 }));
    mockStorageProvider.getSignedUrl.mockImplementation(
      async (key: string) => `https://signed.example.com/${key}?sig=test`
    );

    app = createApp();
  });

  /**
   * 保存キーの拡張子・Content-Type・実体の3者が一致することを、
   * 入力の形式（PNG / WebP / JPEG）によらず確かめる。
   */
  it.each([
    { label: 'PNG', format: 'png' as const, mime: 'image/png' },
    { label: 'WebP', format: 'webp' as const, mime: 'image/webp' },
    { label: 'JPEG', format: 'jpeg' as const, mime: 'image/jpeg' },
  ])('入力が$labelでも保存キーの拡張子・Content-Type・実体が一致する', async ({ format, mime }) => {
    const source = await createImage(format);
    expect(await detectFormat(source), `前提: 入力の実体が${format}である`).toBe(format);

    const response = await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: toDataUrl(mime, source) });

    expect(response.status).toBe(200);
    expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);

    const [uploadedKey, uploadedBuffer, uploadOptions] = mockStorageProvider.upload.mock
      .calls[0]! as [string, Buffer, { contentType?: string }];

    const actualFormat = await detectFormat(uploadedBuffer);

    // 実体の形式と、保存キーの拡張子・Content-Type の申告が一致すること
    expect(actualFormat, '保存した実体の形式').toBe('jpeg');
    expect(uploadedKey, '保存キーの拡張子は実体の形式と一致する').toMatch(/\.jpg$/);
    expect(uploadOptions.contentType, 'Content-Type は実体の形式と一致する').toBe('image/jpeg');

    // 応答が申告する保存キーも同一であること
    expect(response.body.annotatedThumbnailPath).toBe(uploadedKey);
  });

  it('通常サムネイルの区画とは別区画のキーで保存される', async () => {
    const source = await createImage('png');

    await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: toDataUrl('image/png', source) });

    const uploadedKey = mockStorageProvider.upload.mock.calls[0]![0] as string;
    expect(uploadedKey).toMatch(new RegExp(`^annotated-thumbnails/${IMAGE_ID}\\.\\d+\\.jpg$`));
    expect(uploadedKey).not.toContain(`surveys/${SURVEY_ID}`);
  });
});
