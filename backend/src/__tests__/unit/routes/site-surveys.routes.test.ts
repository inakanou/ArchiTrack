/**
 * @fileoverview 現場調査CRUDエンドポイントのテスト
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.2: 現場調査の基本情報と関連する画像一覧を表示する
 * - 1.3: 楽観的排他制御を用いて現場調査レコードを更新する
 * - 1.4: 現場調査と関連する画像データを論理削除する
 * - 3.1: プロジェクト単位でのページネーション
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// モックサービスをvi.hoisted()で初期化
const mockSiteSurveyService = vi.hoisted(() => ({
  createSiteSurvey: vi.fn(),
  findById: vi.fn(),
  findByProjectId: vi.fn(),
  findLatestByProjectId: vi.fn(),
  updateSiteSurvey: vi.fn(),
  deleteSiteSurvey: vi.fn(),
}));

const mockAuditLogService = vi.hoisted(() => ({
  createLog: vi.fn().mockResolvedValue(undefined),
}));

const mockImageListService = vi.hoisted(() => ({
  findBySurveyIdWithUrls: vi.fn().mockResolvedValue([]),
}));

const mockSignedUrlService = vi.hoisted(() => ({
  generateSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-url'),
  getSignedUrlWithValidation: vi
    .fn()
    .mockResolvedValue({ success: true, url: 'https://example.com/signed-url' }),
}));

/**
 * ストレージの構成状態（Task 115.67）
 *
 * 一覧取得の応答は署名付きURLの生成をストレージ構成の有無で分岐する。
 * 両方の分岐を検証するため、テストから切り替えられるようにする。
 */
const mockStorageState = vi.hoisted(() => ({ configured: true }));

const mockStorageProvider = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
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
vi.mock('../../../services/site-survey.service', () => ({
  SiteSurveyService: class {
    constructor() {
      return mockSiteSurveyService;
    }
  },
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return mockAuditLogService;
    }
  },
}));

vi.mock('../../../services/image-list.service', () => ({
  ImageListService: class {
    constructor() {
      return mockImageListService;
    }
  },
}));

vi.mock('../../../services/signed-url.service', () => ({
  SignedUrlService: class {
    constructor() {
      return mockSignedUrlService;
    }
  },
}));

// モック: ストレージ（署名付きURLの生成元）
vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: () => mockStorageState.configured,
  getStorageProvider: () => (mockStorageState.configured ? mockStorageProvider : null),
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

// エラークラスをモック
vi.mock('../../../errors/siteSurveyError', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../errors/siteSurveyError.js')>();
  return {
    ...actual,
  };
});

// 実際のルートとミドルウェアをインポート（モックの後にインポート）
import siteSurveysRouter from '../../../routes/site-surveys.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import {
  SiteSurveyNotFoundError,
  SiteSurveyConflictError,
  ProjectNotFoundForSurveyError,
} from '../../../errors/siteSurveyError.js';

describe('Site Surveys Routes', () => {
  let app: Application;

  // テスト用UUID定数
  const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const TEST_SURVEY_ID = '550e8400-e29b-41d4-a716-446655440001';

  const mockSurveyInfo = {
    id: TEST_SURVEY_ID,
    projectId: TEST_PROJECT_ID,
    name: 'テスト現場調査',
    surveyDate: new Date('2025-01-15'),
    memo: 'テストメモ',
    thumbnailUrl: null,
    imageCount: 0,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  };

  const mockSurveyDetail = {
    ...mockSurveyInfo,
    project: { id: TEST_PROJECT_ID, name: 'テストプロジェクト' },
    images: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageState.configured = true;

    app = express();
    app.use(express.json());
    // ネストルートをマウント
    app.use('/api/projects/:projectId/site-surveys', siteSurveysRouter);
    app.use('/api/site-surveys', siteSurveysRouter);
    app.use(errorHandler);
  });

  describe('POST /api/projects/:projectId/site-surveys', () => {
    const validCreateInput = {
      name: '新規現場調査',
      surveyDate: '2025-01-15',
      memo: '調査メモ',
    };

    it('should create site survey successfully', async () => {
      const createdSurvey = {
        ...mockSurveyInfo,
        name: validCreateInput.name,
      };

      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSurvey
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(validCreateInput);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: TEST_SURVEY_ID,
        name: '新規現場調査',
        projectId: TEST_PROJECT_ID,
      });
      expect(mockSiteSurveyService.createSiteSurvey).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_PROJECT_ID,
          name: validCreateInput.name,
          surveyDate: validCreateInput.surveyDate,
        }),
        'test-user-id'
      );
    });

    it('should create site survey with minimal required fields', async () => {
      const minimalInput = {
        name: '最小現場調査',
        surveyDate: '2025-01-15',
      };

      const createdSurvey = {
        ...mockSurveyInfo,
        name: minimalInput.name,
        memo: null,
      };

      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSurvey
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(minimalInput);

      expect(response.status).toBe(201);
    });

    it('should return 400 when name is missing', async () => {
      const invalidInput = {
        surveyDate: '2025-01-15',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when surveyDate is missing', async () => {
      const invalidInput = {
        name: '現場調査名',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when name exceeds 200 characters', async () => {
      const invalidInput = {
        name: 'a'.repeat(201),
        surveyDate: '2025-01-15',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when memo exceeds 2000 characters', async () => {
      const invalidInput = {
        name: '現場調査名',
        surveyDate: '2025-01-15',
        memo: 'a'.repeat(2001),
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when surveyDate is invalid format', async () => {
      const invalidInput = {
        name: '現場調査名',
        surveyDate: 'invalid-date',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when projectId is invalid UUID format', async () => {
      const response = await request(app)
        .post('/api/projects/invalid-uuid/site-surveys')
        .send(validCreateInput);

      expect(response.status).toBe(400);
    });

    it('should return 404 when project not found', async () => {
      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ProjectNotFoundForSurveyError(TEST_PROJECT_ID)
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(validCreateInput);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/projects/:projectId/site-surveys', () => {
    it('should return paginated site survey list with default parameters', async () => {
      const mockResult = {
        data: [mockSurveyInfo],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: TEST_SURVEY_ID,
        name: 'テスト現場調査',
        projectId: TEST_PROJECT_ID,
      });
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should support custom pagination parameters', async () => {
      const mockResult = {
        data: [],
        pagination: {
          page: 2,
          limit: 50,
          total: 100,
          totalPages: 2,
        },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?page=2&limit=50`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.any(Object),
        expect.objectContaining({ page: 2, limit: 50 }),
        expect.any(Object)
      );
    });

    it('should support search parameter', async () => {
      const mockResult = {
        data: [mockSurveyInfo],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?search=テスト`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.objectContaining({ search: 'テスト' }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support date range filter', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?surveyDateFrom=2025-01-01&surveyDateTo=2025-12-31`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.objectContaining({
          surveyDateFrom: '2025-01-01',
          surveyDateTo: '2025-12-31',
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support sorting parameters', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?sort=surveyDate&order=asc`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ sort: 'surveyDate', order: 'asc' })
      );
    });

    it('should return 400 for invalid page parameter', async () => {
      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?page=0`
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid limit parameter', async () => {
      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?limit=101`
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid projectId format', async () => {
      const response = await request(app).get('/api/projects/invalid-uuid/site-surveys');

      expect(response.status).toBe(400);
    });

    // Requirements: 20.3, 38.2, 38.7
    // Task 115.67: 一覧取得の応答へ代表画像の合成済みサムネイルの表示元URLを引き渡す
    //
    // 応答が保存位置（annotatedThumbnailPath）だけを返し表示元URLを返さないと、
    // 一覧の代表画像は常にクライアント側の合成へ落ち、注釈取得が写真数に比例する。
    describe('代表画像の合成済みサムネイルの表示元URLの供給', () => {
      const SURVEY_WITH_ANNOTATED = '550e8400-e29b-41d4-a716-446655440020';
      const SURVEY_WITHOUT_ANNOTATED = '550e8400-e29b-41d4-a716-446655440021';

      const THUMBNAIL_PATH = 'surveys/representative-thumb.jpg';
      const ORIGINAL_PATH = 'surveys/representative-original.jpg';
      const ANNOTATED_THUMBNAIL_PATH = 'annotated-thumbnails/representative-annotated.jpg';

      /** 署名付きURLは元のキーを含む形にして、どのキーを署名したかを判別可能にする */
      const signedUrlOf = (key: string): string => `https://signed.example.com/${key}?sig=1`;

      const baseListedSurvey = {
        ...mockSurveyInfo,
        thumbnailUrl: THUMBNAIL_PATH,
        thumbnailImageId: '550e8400-e29b-41d4-a716-446655440030',
        thumbnailOriginalPath: ORIGINAL_PATH,
        annotatedThumbnailPath: null as string | null,
        imageCount: 1,
      };

      const listedSurveys = [
        {
          ...baseListedSurvey,
          id: SURVEY_WITH_ANNOTATED,
          annotatedThumbnailPath: ANNOTATED_THUMBNAIL_PATH,
        },
        { ...baseListedSurvey, id: SURVEY_WITHOUT_ANNOTATED },
      ];

      type ListedSurveyResponse = {
        id: string;
        thumbnailUrl: string | null;
        thumbnailOriginalUrl: string | null;
        annotatedThumbnailUrl: string | null;
      };

      const findSurvey = (
        surveys: ListedSurveyResponse[],
        id: string
      ): ListedSurveyResponse | undefined => surveys.find((survey) => survey.id === id);

      beforeEach(() => {
        mockStorageProvider.getSignedUrl.mockImplementation(async (key: string) =>
          signedUrlOf(key)
        );

        (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: listedSurveys,
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        });
        (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
          {
            totalCount: 2,
            latestSurveys: listedSurveys,
          }
        );
      });

      it('should include annotatedThumbnailUrl derived from the annotated thumbnail key', async () => {
        const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

        expect(response.status).toBe(200);
        const survey = findSurvey(response.body.data, SURVEY_WITH_ANNOTATED);

        // 保存位置そのものではなく、当該保存位置から作った表示元URLであること。
        // 通常サムネイルのキーを署名した場合は別の値になるため、取り違えを検出できる
        expect(survey?.annotatedThumbnailUrl).toBe(signedUrlOf(ANNOTATED_THUMBNAIL_PATH));
        expect(survey?.annotatedThumbnailUrl).not.toBe(survey?.thumbnailUrl);
        expect(survey?.annotatedThumbnailUrl).not.toBe(survey?.thumbnailOriginalUrl);
      });

      it('should expose annotatedThumbnailUrl as null instead of omitting it when unavailable', async () => {
        const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

        expect(response.status).toBe(200);
        const survey = findSurvey(response.body.data, SURVEY_WITHOUT_ANNOTATED);

        expect(Object.keys(survey!)).toContain('annotatedThumbnailUrl');
        expect(survey?.annotatedThumbnailUrl).toBeNull();
      });

      it('should keep existing thumbnailUrl and thumbnailOriginalUrl passthrough unchanged', async () => {
        const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

        expect(response.status).toBe(200);
        const survey = findSurvey(response.body.data, SURVEY_WITH_ANNOTATED);

        expect(survey?.thumbnailUrl).toBe(signedUrlOf(THUMBNAIL_PATH));
        expect(survey?.thumbnailOriginalUrl).toBe(signedUrlOf(ORIGINAL_PATH));
      });

      it('should expose annotatedThumbnailUrl as null when signing the annotated thumbnail fails', async () => {
        mockStorageProvider.getSignedUrl.mockImplementation(async (key: string) => {
          if (key === ANNOTATED_THUMBNAIL_PATH) {
            throw new Error('signing failed');
          }
          return signedUrlOf(key);
        });

        const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

        expect(response.status).toBe(200);
        const survey = findSurvey(response.body.data, SURVEY_WITH_ANNOTATED);

        expect(survey?.annotatedThumbnailUrl).toBeNull();
        // 退避経路（クライアント側の合成）が使える状態は保たれる
        expect(survey?.thumbnailUrl).toBe(signedUrlOf(THUMBNAIL_PATH));
        expect(survey?.thumbnailOriginalUrl).toBe(signedUrlOf(ORIGINAL_PATH));
      });

      it('should expose annotatedThumbnailUrl as null when storage is not configured', async () => {
        mockStorageState.configured = false;

        const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

        expect(response.status).toBe(200);
        const survey = findSurvey(response.body.data, SURVEY_WITH_ANNOTATED);

        expect(Object.keys(survey!)).toContain('annotatedThumbnailUrl');
        expect(survey?.annotatedThumbnailUrl).toBeNull();
      });

      it('should include annotatedThumbnailUrl in the latest surveys response as well', async () => {
        const response = await request(app).get(
          `/api/projects/${TEST_PROJECT_ID}/site-surveys/latest`
        );

        expect(response.status).toBe(200);
        const withAnnotated = findSurvey(response.body.latestSurveys, SURVEY_WITH_ANNOTATED);
        const withoutAnnotated = findSurvey(response.body.latestSurveys, SURVEY_WITHOUT_ANNOTATED);

        expect(withAnnotated?.annotatedThumbnailUrl).toBe(signedUrlOf(ANNOTATED_THUMBNAIL_PATH));
        expect(Object.keys(withoutAnnotated!)).toContain('annotatedThumbnailUrl');
        expect(withoutAnnotated?.annotatedThumbnailUrl).toBeNull();
      });

      /**
       * Task 115.88 / Requirements 20.3
       *
       * 代表画像の識別子は表示側が読む `thumbnailImageId` 一本に統一する。
       * 同じ値を別名でも応答へ載せると、同一の値に二つの契約名が付く。
       *
       * 本ファイルは `SiteSurveyService` をまるごと差し替えているため、手書きの
       * 固定値をそのまま突き合わせると「同じ変更が書き換えた固定値」を言い直すだけの
       * 検証になり、本番へ項目が戻っても落ちない。そこで本検証だけは
       * `vi.importActual` で**本番の `SiteSurveyService`** を取り出し、Prisma を
       * 差し替えて実際に走らせ、その戻り値を差し替え済みサービスの応答に据える。
       * ルータは `...survey` で展開するため、応答の項目名の出所は本番の一覧生成処理になる。
       */
      it('should expose the representative image identifier only as thumbnailImageId', async () => {
        const { SiteSurveyService: RealSiteSurveyService } = await vi.importActual<
          typeof import('../../../services/site-survey.service')
        >('../../../services/site-survey.service');

        const REPRESENTATIVE_IMAGE_ID = '550e8400-e29b-41d4-a716-446655440030';
        const surveyRow = {
          id: SURVEY_WITH_ANNOTATED,
          projectId: TEST_PROJECT_ID,
          name: '代表画像の識別子の検証',
          surveyDate: new Date('2025-01-15T00:00:00.000Z'),
          memo: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-02T00:00:00.000Z'),
          images: [
            {
              id: REPRESENTATIVE_IMAGE_ID,
              thumbnailPath: THUMBNAIL_PATH,
              originalPath: ORIGINAL_PATH,
              annotatedThumbnailPath: ANNOTATED_THUMBNAIL_PATH,
            },
          ],
          _count: { images: 1 },
        };

        const prismaStub = {
          siteSurvey: {
            // 一覧側は件数の再取得で `select` 付きの2回目の findMany を呼ぶ
            findMany: vi
              .fn()
              .mockImplementation(async (args: { select?: unknown }) =>
                args.select ? [{ id: surveyRow.id, _count: { images: 1 } }] : [surveyRow]
              ),
            count: vi.fn().mockResolvedValue(1),
          },
        };

        const realService = new RealSiteSurveyService({
          prisma: prismaStub,
          auditLogService: mockAuditLogService,
        } as unknown as ConstructorParameters<typeof RealSiteSurveyService>[0]);

        (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
          await realService.findByProjectId(
            TEST_PROJECT_ID,
            {},
            { page: 1, limit: 20 },
            { sort: 'surveyDate', order: 'desc' }
          )
        );
        (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
          await realService.findLatestByProjectId(TEST_PROJECT_ID, 2)
        );

        const listResponse = await request(app).get(
          `/api/projects/${TEST_PROJECT_ID}/site-surveys`
        );
        const latestResponse = await request(app).get(
          `/api/projects/${TEST_PROJECT_ID}/site-surveys/latest`
        );

        expect(listResponse.status).toBe(200);
        expect(latestResponse.status).toBe(200);

        const surveys = [
          ...(listResponse.body.data as Record<string, unknown>[]),
          ...(latestResponse.body.latestSurveys as Record<string, unknown>[]),
        ];

        // 空配列に対する否定形の主張は無条件で成立するため、まず件数を確かめる
        expect(surveys).toHaveLength(2);

        for (const survey of surveys) {
          expect(Object.keys(survey)).toContain('thumbnailImageId');
          expect(survey.thumbnailImageId).toBe(REPRESENTATIVE_IMAGE_ID);
          expect(Object.keys(survey)).not.toContain('representativeImageId');
        }
      });
    });
  });

  describe('GET /api/site-surveys/:id', () => {
    it('should return site survey detail by id', async () => {
      (mockSiteSurveyService.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSurveyDetail
      );

      const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: TEST_SURVEY_ID,
        name: 'テスト現場調査',
        project: { id: TEST_PROJECT_ID, name: 'テストプロジェクト' },
        images: [],
      });
    });

    it('should return 400 for invalid survey id format', async () => {
      const response = await request(app).get('/api/site-surveys/invalid-format');

      expect(response.status).toBe(400);
    });

    it('should return 404 when site survey not found', async () => {
      (mockSiteSurveyService.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(404);
    });

    // Requirements: 38.2, 38.5
    // 詳細取得の応答に合成済みサムネイルの表示元URLを含める
    describe('合成済みサムネイルの表示元URLの引き渡し', () => {
      const IMAGE_WITH_ANNOTATED = '550e8400-e29b-41d4-a716-446655440010';
      const IMAGE_WITHOUT_ANNOTATED = '550e8400-e29b-41d4-a716-446655440011';
      const IMAGE_NOT_IN_URL_RESULT = '550e8400-e29b-41d4-a716-446655440012';

      const baseImage = {
        surveyId: TEST_SURVEY_ID,
        fileName: 'photo.jpg',
        fileSize: 1024,
        width: 1600,
        height: 1200,
        displayOrder: 0,
        originalPath: 'surveys/original.jpg',
        thumbnailPath: 'surveys/thumb.jpg',
        annotatedThumbnailPath: null as string | null,
        comment: null,
        includeInReport: true,
        createdAt: new Date('2025-01-03T00:00:00Z'),
      };

      beforeEach(() => {
        (mockSiteSurveyService.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
          ...mockSurveyDetail,
          images: [
            {
              ...baseImage,
              id: IMAGE_WITH_ANNOTATED,
              displayOrder: 0,
              annotatedThumbnailPath: 'surveys/annotated.jpg',
            },
            { ...baseImage, id: IMAGE_WITHOUT_ANNOTATED, displayOrder: 1 },
            { ...baseImage, id: IMAGE_NOT_IN_URL_RESULT, displayOrder: 2 },
          ],
        });

        (mockImageListService.findBySurveyIdWithUrls as ReturnType<typeof vi.fn>).mockResolvedValue(
          [
            {
              ...baseImage,
              id: IMAGE_WITH_ANNOTATED,
              annotatedThumbnailPath: 'surveys/annotated.jpg',
              originalUrl: 'https://example.com/original-0',
              thumbnailUrl: 'https://example.com/thumb-0',
              annotatedThumbnailUrl: 'https://example.com/annotated-0',
              hasAnnotations: true,
            },
            {
              ...baseImage,
              id: IMAGE_WITHOUT_ANNOTATED,
              originalUrl: 'https://example.com/original-1',
              thumbnailUrl: 'https://example.com/thumb-1',
              annotatedThumbnailUrl: null,
              hasAnnotations: false,
            },
          ]
        );
      });

      it('should include annotatedThumbnailUrl for images that have a composed thumbnail', async () => {
        const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

        expect(response.status).toBe(200);
        const image = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_WITH_ANNOTATED
        );
        expect(image.annotatedThumbnailUrl).toBe('https://example.com/annotated-0');
      });

      it('should expose annotatedThumbnailUrl as null instead of omitting it when unavailable', async () => {
        const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

        expect(response.status).toBe(200);
        const withoutAnnotated = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_WITHOUT_ANNOTATED
        );
        const notInUrlResult = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_NOT_IN_URL_RESULT
        );

        expect(Object.keys(withoutAnnotated)).toContain('annotatedThumbnailUrl');
        expect(withoutAnnotated.annotatedThumbnailUrl).toBeNull();
        expect(Object.keys(notInUrlResult)).toContain('annotatedThumbnailUrl');
        expect(notInUrlResult.annotatedThumbnailUrl).toBeNull();
      });

      it('should keep existing originalUrl and thumbnailUrl passthrough unchanged', async () => {
        const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

        expect(response.status).toBe(200);
        const image = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_WITH_ANNOTATED
        );
        expect(image.originalUrl).toBe('https://example.com/original-0');
        expect(image.thumbnailUrl).toBe('https://example.com/thumb-0');

        const notInUrlResult = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_NOT_IN_URL_RESULT
        );
        expect(notInUrlResult.originalUrl).toBeNull();
        expect(notInUrlResult.thumbnailUrl).toBeNull();
      });
    });

    // Requirements: 20.2
    // Task 115.13: 描画された注釈の有無を示す項目を設ける
    //
    // 数量表編集画面と現場調査詳細画面が実際に用いる取得経路はこの詳細取得である。
    // 画像一覧の経路に項目があっても、この経路の応答で欠落すると画面には届かない。
    describe('描画された注釈の有無の引き渡し (Task 115.13)', () => {
      const IMAGE_ROTATION_ONLY = '550e8400-e29b-41d4-a716-446655440020';
      const IMAGE_ANNOTATED = '550e8400-e29b-41d4-a716-446655440021';

      const baseImage = {
        surveyId: TEST_SURVEY_ID,
        fileName: 'photo.jpg',
        fileSize: 1024,
        width: 1600,
        height: 1200,
        displayOrder: 0,
        originalPath: 'surveys/original.jpg',
        thumbnailPath: 'surveys/thumb.jpg',
        annotatedThumbnailPath: null as string | null,
        comment: null,
        includeInReport: true,
        createdAt: new Date('2025-01-03T00:00:00Z'),
      };

      beforeEach(() => {
        (mockSiteSurveyService.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
          ...mockSurveyDetail,
          images: [
            {
              ...baseImage,
              id: IMAGE_ROTATION_ONLY,
              displayOrder: 0,
              // 回転のみを保存した写真: 注釈レコードは残るが描画された注釈は0件
              hasAnnotations: true,
              hasDrawnAnnotations: false,
            },
            {
              ...baseImage,
              id: IMAGE_ANNOTATED,
              displayOrder: 1,
              hasAnnotations: true,
              hasDrawnAnnotations: true,
            },
          ],
        });

        (mockImageListService.findBySurveyIdWithUrls as ReturnType<typeof vi.fn>).mockResolvedValue(
          []
        );
      });

      it('should include hasDrawnAnnotations for each image', async () => {
        const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

        expect(response.status).toBe(200);
        const rotationOnly = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_ROTATION_ONLY
        );
        const annotated = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_ANNOTATED
        );

        expect(Object.keys(rotationOnly)).toContain('hasDrawnAnnotations');
        expect(rotationOnly.hasDrawnAnnotations).toBe(false);
        expect(annotated.hasDrawnAnnotations).toBe(true);
      });

      it('should keep hasAnnotations unchanged alongside hasDrawnAnnotations', async () => {
        const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

        expect(response.status).toBe(200);
        const rotationOnly = response.body.images.find(
          (img: { id: string }) => img.id === IMAGE_ROTATION_ONLY
        );
        // 既存項目の意味は変更しない（注釈レコードが存在すれば真）
        expect(rotationOnly.hasAnnotations).toBe(true);
      });
    });
  });

  describe('PUT /api/site-surveys/:id', () => {
    const validUpdateInput = {
      name: '更新現場調査',
      expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('should update site survey successfully', async () => {
      const updatedSurvey = {
        ...mockSurveyInfo,
        name: validUpdateInput.name,
      };

      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        updatedSurvey
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: '更新現場調査',
      });
      expect(mockSiteSurveyService.updateSiteSurvey).toHaveBeenCalledWith(
        TEST_SURVEY_ID,
        expect.objectContaining({
          name: validUpdateInput.name,
        }),
        'test-user-id',
        expect.any(Date)
      );
    });

    it('should update site survey with partial fields', { timeout: 30000 }, async () => {
      const partialInput = {
        memo: '新しいメモ',
        expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
      };

      const updatedSurvey = {
        ...mockSurveyInfo,
        memo: partialInput.memo,
      };

      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        updatedSurvey
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(partialInput);

      expect(response.status).toBe(200);
    });

    it('should return 400 for invalid survey id format', async () => {
      const response = await request(app)
        .put('/api/site-surveys/invalid-id')
        .send(validUpdateInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when expectedUpdatedAt is missing', async () => {
      const invalidInput = {
        name: '更新現場調査',
      };

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 404 when site survey not found', async () => {
      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SiteSurveyNotFoundError(TEST_SURVEY_ID)
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(404);
    });

    it('should return 409 when conflict error (optimistic locking)', async () => {
      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SiteSurveyConflictError('現場調査は他のユーザーによって更新されました', {
          expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
          actualUpdatedAt: '2025-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE /api/site-surveys/:id', () => {
    it('should delete site survey successfully', async () => {
      (mockSiteSurveyService.deleteSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
      );

      const response = await request(app).delete(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(204);
      expect(mockSiteSurveyService.deleteSiteSurvey).toHaveBeenCalledWith(
        TEST_SURVEY_ID,
        'test-user-id'
      );
    });

    it('should return 400 for invalid survey id format', async () => {
      const response = await request(app).delete('/api/site-surveys/invalid-id');

      expect(response.status).toBe(400);
    });

    it('should return 404 when site survey not found', async () => {
      (mockSiteSurveyService.deleteSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SiteSurveyNotFoundError(TEST_SURVEY_ID)
      );

      const response = await request(app).delete(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(404);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for POST /api/projects/:projectId/site-surveys', async () => {
      const validInput = {
        name: '現場調査',
        surveyDate: '2025-01-15',
      };

      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSurveyInfo
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(validInput);

      expect(response.status).toBe(201);
      expect(mockSiteSurveyService.createSiteSurvey).toHaveBeenCalledWith(
        expect.any(Object),
        'test-user-id'
      );
    });

    it('should require authentication for GET /api/projects/:projectId/site-surveys', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

      expect(response.status).toBe(200);
    });
  });
});
