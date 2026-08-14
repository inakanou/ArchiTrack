/**
 * @fileoverview 合成済みサムネイル更新エンドポイントのテスト
 *
 * Task 115.1: 合成済み画像の保存先を注釈付きサムネイルの項目へ統一する
 *
 * PATCH /api/site-surveys/images/:imageId/annotated-thumbnail
 * - 画像編集画面でクライアント合成した画像を受け取り、注釈付きサムネイル
 *   (annotatedThumbnailPath) にのみ保存する
 * - 通常サムネイル (thumbnailPath) は保存操作によって一切書き換えない
 *
 * Requirements:
 * - 20.4: 注釈が編集モードで保存されると注釈をレンダリングしたサムネイル画像を生成・更新する
 * - 23.1: 注釈の追加・編集・削除の保存後、注釈をレンダリングしたサムネイル画像を再生成する
 * - 38.5: 注釈をレンダリングしたサムネイル画像が利用可能なら縮小表示に当該画像を用いる
 *
 * TDD: RED phase - テストを先に作成
 *
 * @module tests/unit/routes/survey-images.annotated-thumbnail.routes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

const IMAGE_ID = '11111111-1111-4111-8111-111111111111';
const SURVEY_ID = '22222222-2222-4222-8222-222222222222';
const NORMAL_THUMBNAIL_PATH = `surveys/${SURVEY_ID}/1700000000000_thumb_photo.jpg`;
const OLD_ANNOTATED_PATH = `annotated-thumbnails/${IMAGE_ID}.1700000000000.jpg`;
const IMAGE_DATA = `data:image/jpeg;base64,${Buffer.from('composited').toString('base64')}`;

// 呼び出し順序の記録（置換の途中で表示元が失われないことの検証に使う）
const callOrder = vi.hoisted(() => [] as string[]);

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
vi.mock('sharp', () => ({
  default: vi.fn(() => ({})),
}));

import surveyImagesRouter from '../../../routes/survey-images.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

function createApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/api/site-surveys/images', surveyImagesRouter);
  app.use(errorHandler);
  return app;
}

describe('PATCH /api/site-surveys/images/:imageId/annotated-thumbnail (Task 115.1)', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;

    mockPrisma.surveyImage.findUnique.mockResolvedValue({
      id: IMAGE_ID,
      surveyId: SURVEY_ID,
      thumbnailPath: NORMAL_THUMBNAIL_PATH,
      annotatedThumbnailPath: OLD_ANNOTATED_PATH,
      fileName: 'photo.jpg',
    });
    mockPrisma.surveyImage.update.mockImplementation(async () => {
      callOrder.push('db-update');
      return { id: IMAGE_ID };
    });
    mockStorageProvider.upload.mockImplementation(async (key: string) => {
      callOrder.push(`upload:${key}`);
      return { key, size: 1 };
    });
    mockStorageProvider.delete.mockImplementation(async (key: string) => {
      callOrder.push(`delete:${key}`);
    });
    mockStorageProvider.getSignedUrl.mockImplementation(
      async (key: string) => `https://signed.example.com/${key}?sig=test`
    );
    mockImageProcessorService.generateThumbnail.mockResolvedValue(Buffer.from('thumb'));

    app = createApp();
  });

  it('合成済み画像を注釈付きサムネイルの区画のキーへ保存する (Req 20.4, 23.1)', async () => {
    const response = await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(response.status).toBe(200);
    expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);
    const uploadedKey = mockStorageProvider.upload.mock.calls[0]![0] as string;
    expect(uploadedKey).toMatch(new RegExp(`^annotated-thumbnails/${IMAGE_ID}\\.\\d+\\.jpg$`));
    // 通常サムネイルの区画（surveys/...）と識別できること
    expect(uploadedKey).not.toContain(`surveys/${SURVEY_ID}`);
  });

  it('合成済み画像の保存先として annotatedThumbnailPath のみを更新する (Req 20.4)', async () => {
    await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
    const updateArg = mockPrisma.surveyImage.update.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArg.where).toEqual({ id: IMAGE_ID });
    expect(Object.keys(updateArg.data)).toEqual(['annotatedThumbnailPath']);
    expect(updateArg.data.annotatedThumbnailPath).toMatch(
      new RegExp(`^annotated-thumbnails/${IMAGE_ID}\\.\\d+\\.jpg$`)
    );
  });

  it('通常サムネイル (thumbnailPath) を書き換えない (Req 38.5)', async () => {
    await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    const updateArg = mockPrisma.surveyImage.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data).not.toHaveProperty('thumbnailPath');
  });

  it('通常サムネイルのストレージ実体を削除しない (Req 38.5)', async () => {
    await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(mockStorageProvider.delete).not.toHaveBeenCalledWith(NORMAL_THUMBNAIL_PATH);
  });

  it('旧い合成済みサムネイルのキーは新キー保存とDB更新の完了後に削除する (Req 23.1)', async () => {
    await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(mockStorageProvider.delete).toHaveBeenCalledWith(OLD_ANNOTATED_PATH);

    const uploadIndex = callOrder.findIndex((entry) => entry.startsWith('upload:'));
    const updateIndex = callOrder.indexOf('db-update');
    const deleteIndex = callOrder.indexOf(`delete:${OLD_ANNOTATED_PATH}`);

    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThan(uploadIndex);
    expect(deleteIndex).toBeGreaterThan(updateIndex);
  });

  it('旧い合成済みサムネイルが無い場合は削除を行わない (Req 23.1)', async () => {
    mockPrisma.surveyImage.findUnique.mockResolvedValue({
      id: IMAGE_ID,
      surveyId: SURVEY_ID,
      thumbnailPath: NORMAL_THUMBNAIL_PATH,
      annotatedThumbnailPath: null,
      fileName: 'photo.jpg',
    });

    await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(mockStorageProvider.delete).not.toHaveBeenCalled();
  });

  it('更新後の合成済みサムネイルの表示元を応答で返す (Req 38.5)', async () => {
    const response = await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.annotatedThumbnailPath).toMatch(
      new RegExp(`^annotated-thumbnails/${IMAGE_ID}\\.\\d+\\.jpg$`)
    );
    expect(response.body.annotatedThumbnailUrl).toBe(
      `https://signed.example.com/${response.body.annotatedThumbnailPath}?sig=test`
    );
  });

  it('新キーの保存に失敗した場合はDBを更新せず旧い表示元を残す (Req 23.1)', async () => {
    mockStorageProvider.upload.mockRejectedValue(new Error('upload failed'));

    const response = await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    expect(mockStorageProvider.delete).not.toHaveBeenCalled();
  });

  it('画像が存在しない場合は404を返す', async () => {
    mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('IMAGE_NOT_FOUND');
    expect(mockStorageProvider.upload).not.toHaveBeenCalled();
  });

  it('無効な画像データ形式は400を返す', async () => {
    const response = await request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: 'not-an-image' });

    expect(response.status).toBe(400);
    expect(mockStorageProvider.upload).not.toHaveBeenCalled();
  });
});

/**
 * Task 115.3: 注釈も回転も無い保存では合成済みサムネイルが存在しない状態へ収束させる。
 *
 * 収束の受け口として合成済みサムネイルの取り消しを設ける。
 *
 * Requirements:
 * - 22.5: 保存された回転状態を復元して表示する（回転が無い状態へ戻した場合は素の状態に戻る）
 * - 23.2: 回転後の画像状態を反映したサムネイル画像を再生成する
 * - 23.3: 回転と注釈の両方を反映した最終状態のサムネイル画像を再生成する
 * - 23.8: 変更を伴わない保存でも冪等に動作し、既存サムネイルを破損させない
 */
describe('DELETE /api/site-surveys/images/:imageId/annotated-thumbnail (Task 115.3)', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;

    mockPrisma.surveyImage.findUnique.mockResolvedValue({
      id: IMAGE_ID,
      surveyId: SURVEY_ID,
      thumbnailPath: NORMAL_THUMBNAIL_PATH,
      annotatedThumbnailPath: OLD_ANNOTATED_PATH,
      fileName: 'photo.jpg',
    });
    mockPrisma.surveyImage.update.mockImplementation(async () => {
      callOrder.push('db-update');
      return { id: IMAGE_ID };
    });
    mockStorageProvider.delete.mockImplementation(async (key: string) => {
      callOrder.push(`delete:${key}`);
    });

    app = createApp();
  });

  it('合成済みサムネイルの項目を空へ更新する (Req 22.5, 23.2)', async () => {
    const response = await request(app).delete(
      `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
    const updateArg = mockPrisma.surveyImage.update.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArg.where).toEqual({ id: IMAGE_ID });
    expect(Object.keys(updateArg.data)).toEqual(['annotatedThumbnailPath']);
    expect(updateArg.data.annotatedThumbnailPath).toBeNull();
    expect(response.body).toEqual({
      success: true,
      annotatedThumbnailPath: null,
      annotatedThumbnailUrl: null,
    });
  });

  it('通常サムネイルの項目も実体も触らない (Req 38.5)', async () => {
    await request(app).delete(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`);

    const updateArg = mockPrisma.surveyImage.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data).not.toHaveProperty('thumbnailPath');
    expect(mockStorageProvider.delete).not.toHaveBeenCalledWith(NORMAL_THUMBNAIL_PATH);
  });

  it('表示元を失う瞬間を作らないよう項目の更新後に実体を削除する (Req 22.5)', async () => {
    await request(app).delete(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`);

    expect(mockStorageProvider.delete).toHaveBeenCalledWith(OLD_ANNOTATED_PATH);

    const updateIndex = callOrder.indexOf('db-update');
    const deleteIndex = callOrder.indexOf(`delete:${OLD_ANNOTATED_PATH}`);
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(updateIndex);
  });

  it('既に合成済みサムネイルが無い場合も成功し何も変更しない (Req 23.8)', async () => {
    mockPrisma.surveyImage.findUnique.mockResolvedValue({
      id: IMAGE_ID,
      surveyId: SURVEY_ID,
      thumbnailPath: NORMAL_THUMBNAIL_PATH,
      annotatedThumbnailPath: null,
      fileName: 'photo.jpg',
    });

    const response = await request(app).delete(
      `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      annotatedThumbnailPath: null,
      annotatedThumbnailUrl: null,
    });
    expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    expect(mockStorageProvider.delete).not.toHaveBeenCalled();
  });

  it('実体の削除に失敗しても項目は空のまま成功を返す (Req 23.8)', async () => {
    mockStorageProvider.delete.mockRejectedValue(new Error('delete failed'));

    const response = await request(app).delete(
      `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
  });

  it('画像が存在しない場合は404を返す', async () => {
    mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

    const response = await request(app).delete(
      `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('IMAGE_NOT_FOUND');
    expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    expect(mockStorageProvider.delete).not.toHaveBeenCalled();
  });
});

/**
 * Task 115.4: 変更を伴わない保存が既存表示を壊さない
 *
 * 115.1〜115.3 の各テストは 1 回の要求を切り出して検証しており、要求をまたいだ
 * 状態遷移（項目が指す保存先と実体の対応）は検証していない。ここでは項目と実体を
 * 保持する模擬を用意し、同一内容の保存を繰り返した後も「項目が指す実体が必ず存在する」
 * ことを不変条件として確認する。
 *
 * Requirements:
 * - 23.8: 画像変更を伴わない保存操作でもサムネイル再生成処理が冪等に動作し、
 *   既存サムネイルを破損させない
 */
describe('変更を伴わない保存の繰り返し (Task 115.4, Req 23.8)', () => {
  let app: Application;
  /** 項目 annotatedThumbnailPath の現在値 */
  let dbAnnotatedThumbnailPath: string | null;
  /** ストレージ上に実在するキーの集合 */
  let storedObjects: Set<string>;

  /** 合成済みサムネイル区画に実在するキー一覧 */
  function annotatedObjects(): string[] {
    return [...storedObjects].filter((key) => key.startsWith('annotated-thumbnails/'));
  }

  /**
   * 表示元の不変条件
   *
   * - 退避先である素のサムネイルの実体は常に残っている
   * - 合成済みサムネイルの項目が値を持つなら、その実体は必ず存在する
   *   （実体を失ったキーを指す＝表示が壊れた状態）
   */
  function expectDisplaySourceIntact(): void {
    expect(storedObjects.has(NORMAL_THUMBNAIL_PATH)).toBe(true);
    if (dbAnnotatedThumbnailPath !== null) {
      expect(storedObjects.has(dbAnnotatedThumbnailPath)).toBe(true);
    }
  }

  async function saveWithoutChange(): Promise<request.Response> {
    return request(app)
      .patch(`/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`)
      .send({ imageData: IMAGE_DATA });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;

    dbAnnotatedThumbnailPath = OLD_ANNOTATED_PATH;
    storedObjects = new Set([NORMAL_THUMBNAIL_PATH, OLD_ANNOTATED_PATH]);

    mockPrisma.surveyImage.findUnique.mockImplementation(async () => ({
      id: IMAGE_ID,
      surveyId: SURVEY_ID,
      thumbnailPath: NORMAL_THUMBNAIL_PATH,
      annotatedThumbnailPath: dbAnnotatedThumbnailPath,
      fileName: 'photo.jpg',
    }));
    mockPrisma.surveyImage.update.mockImplementation(
      async (args: { where: { id: string }; data: { annotatedThumbnailPath?: string | null } }) => {
        if ('annotatedThumbnailPath' in args.data) {
          dbAnnotatedThumbnailPath = args.data.annotatedThumbnailPath ?? null;
        }
        return { id: IMAGE_ID };
      }
    );
    mockStorageProvider.upload.mockImplementation(async (key: string) => {
      storedObjects.add(key);
      return { key, size: 1 };
    });
    mockStorageProvider.delete.mockImplementation(async (key: string) => {
      storedObjects.delete(key);
    });
    mockStorageProvider.copy.mockImplementation(async (source: string, destination: string) => {
      if (!storedObjects.has(source)) {
        throw new Error(`object not found: ${source}`);
      }
      storedObjects.add(destination);
    });
    mockStorageProvider.getSignedUrl.mockImplementation(async (key: string) => {
      if (!storedObjects.has(key)) {
        throw new Error(`object not found: ${key}`);
      }
      return `https://signed.example.com/${key}?sig=test`;
    });
    mockImageProcessorService.generateThumbnail.mockResolvedValue(Buffer.from('thumb'));

    app = createApp();
  });

  it('同一内容の保存を繰り返しても表示元は常に有効な実体を指す (Req 23.8)', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await saveWithoutChange();

      expect(response.status).toBe(200);
      // 応答が指す表示元は項目の現在値と一致し、その実体は存在する
      expect(response.body.annotatedThumbnailPath).toBe(dbAnnotatedThumbnailPath);
      expect(response.body.annotatedThumbnailUrl).toBe(
        `https://signed.example.com/${dbAnnotatedThumbnailPath}?sig=test`
      );
      expectDisplaySourceIntact();
    }

    // 繰り返しても合成済みサムネイルの実体は 1 件に収束する（旧キーが積み上がらない）
    expect(annotatedObjects()).toEqual([dbAnnotatedThumbnailPath]);
    // 通常サムネイルの項目は一度も書き換えられない
    for (const call of mockPrisma.surveyImage.update.mock.calls) {
      const updateArg = call[0] as { data: Record<string, unknown> };
      expect(Object.keys(updateArg.data)).toEqual(['annotatedThumbnailPath']);
    }
  });

  it('同一ミリ秒に連続保存して保存先が同一キーになっても実体を消さない (Req 23.8)', async () => {
    // 保存先キーは時刻から作られるため、連続保存では前回と同一キーになり得る。
    // このとき旧キーの後始末が新キーと同一の実体を消すと、項目が実体を失った
    // キーを指したまま残る（＝既存サムネイルの破損）。
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000009000);

    try {
      const first = await saveWithoutChange();
      expect(first.status).toBe(200);
      expectDisplaySourceIntact();

      const second = await saveWithoutChange();
      expect(second.status).toBe(200);
      expect(second.body.annotatedThumbnailPath).toBe(first.body.annotatedThumbnailPath);
      expectDisplaySourceIntact();
      expect(storedObjects.has(second.body.annotatedThumbnailPath)).toBe(true);
      expect(annotatedObjects()).toEqual([second.body.annotatedThumbnailPath]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('保存先の項目更新に失敗しても既存の表示元は有効なまま残り再保存で復帰する (Req 23.8)', async () => {
    mockPrisma.surveyImage.update.mockRejectedValueOnce(new Error('db update failed'));

    const failed = await saveWithoutChange();

    expect(failed.status).toBeGreaterThanOrEqual(500);
    // 項目は旧い保存先を指したままで、その実体も残っている
    expect(dbAnnotatedThumbnailPath).toBe(OLD_ANNOTATED_PATH);
    expectDisplaySourceIntact();

    const retried = await saveWithoutChange();

    expect(retried.status).toBe(200);
    expectDisplaySourceIntact();
    // 復帰後は項目が指す実体が存在し、旧い保存先は後始末されている
    expect(annotatedObjects()).toContain(dbAnnotatedThumbnailPath);
    expect(annotatedObjects()).not.toContain(OLD_ANNOTATED_PATH);
    // 失敗した試行が保存した実体はどこからも参照されないまま残る。項目の更新が
    // 実際には適用されたうえで応答だけ失う場合があり、失敗を理由に消すと
    // 項目が実体を失ったキーを指す危険があるため、ここでは消さない方を選ぶ。
    expect(dbAnnotatedThumbnailPath).toBe(retried.body.annotatedThumbnailPath);
  });

  it('取り消しを繰り返しても素のサムネイルを壊さず2回目以降は何も変更しない (Req 23.8)', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app).delete(
        `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
      );

      expect(response.status).toBe(200);
      expect(dbAnnotatedThumbnailPath).toBeNull();
      expectDisplaySourceIntact();
    }

    // 収束後の繰り返しでは項目更新も実体削除も発生しない
    expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
    expect(mockStorageProvider.delete).toHaveBeenCalledTimes(1);
    expect(mockStorageProvider.delete).toHaveBeenCalledWith(OLD_ANNOTATED_PATH);
    expect(annotatedObjects()).toEqual([]);
  });

  it('項目更新に失敗して残った実体は孤立ファイルの回収対象になる (Req 4.8, 23.8)', async () => {
    mockPrisma.surveyImage.update.mockRejectedValueOnce(new Error('db update failed'));

    const failed = await saveWithoutChange();

    expect(failed.status).toBeGreaterThanOrEqual(500);

    // 保存に成功した新しい実体（どこからも参照されない）
    const strandedPath = mockStorageProvider.upload.mock.calls[0]![0] as string;
    expect(strandedPath).toMatch(new RegExp(`^annotated-thumbnails/${IMAGE_ID}\\.\\d+\\.jpg$`));

    // 既定の孤立ファイル回収と同じ扱い（orphaned/ 区画へ移し 7 日後に自動削除）に載る
    expect(mockStorageProvider.copy).toHaveBeenCalledWith(strandedPath, `orphaned/${strandedPath}`);
    expect(storedObjects.has(`orphaned/${strandedPath}`)).toBe(true);

    // 回収であって即時削除ではない（項目の更新が実際には適用されている場合に備える）
    expect(mockStorageProvider.delete).not.toHaveBeenCalledWith(strandedPath);
    expect(storedObjects.has(strandedPath)).toBe(true);

    // 既存の表示元は旧い保存先を指したまま有効
    expect(dbAnnotatedThumbnailPath).toBe(OLD_ANNOTATED_PATH);
    expectDisplaySourceIntact();
  });

  it('孤立ファイルの回収は警告として記録される (Req 4.8)', async () => {
    const logger = (await import('../../../utils/logger.js')).default;
    mockPrisma.surveyImage.update.mockRejectedValueOnce(new Error('db update failed'));

    await saveWithoutChange();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('orphaned/') }),
      expect.stringContaining('孤立ファイル')
    );
  });

  it('孤立ファイルの回収に失敗しても実体を消さず元の失敗を返す (Req 4.8, 23.8)', async () => {
    const logger = (await import('../../../utils/logger.js')).default;
    mockPrisma.surveyImage.update.mockRejectedValueOnce(new Error('db update failed'));
    mockStorageProvider.copy.mockRejectedValueOnce(new Error('copy failed'));

    const failed = await saveWithoutChange();

    expect(failed.status).toBeGreaterThanOrEqual(500);

    const strandedPath = mockStorageProvider.upload.mock.calls[0]![0] as string;
    expect(mockStorageProvider.delete).not.toHaveBeenCalledWith(strandedPath);
    expect(storedObjects.has(strandedPath)).toBe(true);
    expect(dbAnnotatedThumbnailPath).toBe(OLD_ANNOTATED_PATH);
    expectDisplaySourceIntact();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ originalPath: strandedPath, error: 'copy failed' }),
      expect.stringContaining('孤立ファイルの移動に失敗')
    );
  });

  it('項目更新に成功した保存では回収を行わない (Req 4.8)', async () => {
    const response = await saveWithoutChange();

    expect(response.status).toBe(200);
    expect(mockStorageProvider.copy).not.toHaveBeenCalled();
  });

  it('更新と取り消しを往復しても表示元が有効なまま保たれる (Req 23.8)', async () => {
    const updated = await saveWithoutChange();
    expect(updated.status).toBe(200);
    expectDisplaySourceIntact();

    const cleared = await request(app).delete(
      `/api/site-surveys/images/${IMAGE_ID}/annotated-thumbnail`
    );
    expect(cleared.status).toBe(200);
    expect(dbAnnotatedThumbnailPath).toBeNull();
    expectDisplaySourceIntact();
    // 取り消し後は合成済みの実体が残らない（表示は素のサムネイルへ退避する）
    expect(annotatedObjects()).toEqual([]);

    const reupdated = await saveWithoutChange();
    expect(reupdated.status).toBe(200);
    expect(dbAnnotatedThumbnailPath).toBe(reupdated.body.annotatedThumbnailPath);
    expectDisplaySourceIntact();
    expect(annotatedObjects()).toEqual([dbAnnotatedThumbnailPath]);
  });
});
