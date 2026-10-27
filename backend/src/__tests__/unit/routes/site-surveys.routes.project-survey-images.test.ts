/**
 * @fileoverview プロジェクト写真一覧エンドポイントの検証
 *
 * GET /api/projects/:projectId/survey-images
 *
 * 写真選択・変更ダイアログが選択可能な写真を1回の要求でまとめて取得するための入口。
 * 取得そのものは `ImageListService.findAnnotatedByProjectIdWithUrls` が担い、
 * 本エンドポイントは認証・権限・クエリの検証を担う。
 *
 * 案件の閲覧範囲の判定は経路の判定部品（requireProjectScope）が行い、範囲外と不在を同じ汎用の
 * 404 にする（site-survey タスク119.1、Requirement 39.2・39.3）。以前の 403（範囲外）と
 * 404（`PROJECT_NOT_FOUND`、案件 ID つき）の出し分けは、範囲外と不在を区別できるためやめた。
 *
 * Requirements (quantity-table-generation): 49.9
 * Task 74.3: プロジェクト写真一覧のエンドポイントを公開する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// 認証・認可ミドルウェアは検証ごとに挙動を差し替えられるようにする
const mockAuthenticate = vi.hoisted(() => vi.fn());
const mockRequirePermission = vi.hoisted(() => vi.fn());

const mockImageListService = vi.hoisted(() => ({
  findBySurveyIdWithUrls: vi.fn(),
  findAnnotatedByProjectIdWithUrls: vi.fn(),
}));

const mockSiteSurveyService = vi.hoisted(() => ({
  createSiteSurvey: vi.fn(),
  findById: vi.fn(),
  findLatestByProjectId: vi.fn(),
}));

const mockProjectFindUnique = vi.hoisted(() => vi.fn());

// 案件の閲覧範囲の判定部品は素通りさせる（判定と経路への適用は
// site-survey-project-scope.middleware.test.ts と統合テストが確かめる。site-survey タスク119.1）
vi.mock('../../../middleware/site-survey-project-scope.middleware.js', () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    requireProjectParamScope: pass,
    requireSurveyProjectScope: pass,
    requireImageProjectScope: pass,
    requireBodySurveyProjectScope: pass,
    requireImagesProjectScope: pass,
    imageIdsFromBodyArray: () => () => [],
  };
});

vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    project: { findUnique: mockProjectFindUnique },
  })),
}));

vi.mock('../../../services/site-survey.service.js', () => ({
  SiteSurveyService: class {
    constructor() {
      return mockSiteSurveyService;
    }
  },
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {
    constructor() {
      return { createLog: vi.fn() };
    }
  },
}));

// 上限・既定値の定数は実物を通す。モックした値で検証すると、
// 検証が実装の値ではなく検証自身の値を確かめることになる。
vi.mock('../../../services/image-list.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/image-list.service.js')>();
  return {
    ...actual,
    ImageListService: class {
      constructor() {
        return mockImageListService;
      }
    },
  };
});

vi.mock('../../../services/signed-url.service.js', () => ({
  SignedUrlService: class {
    constructor() {}
  },
}));

vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: vi.fn().mockReturnValue(false),
  getStorageProvider: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    mockAuthenticate(req, res, next);
  },
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: (permission: string) => (req: Request, res: Response, next: NextFunction) => {
    mockRequirePermission(permission)(req, res, next);
  },
}));

const { projectSurveyImagesRouter } = await import('../../../routes/site-surveys.routes.js');
const { errorHandler } = await import('../../../middleware/errorHandler.middleware.js');
const { ProjectSurveyImagesAccessDeniedError } = await import('../../../errors/siteSurveyError.js');
const { PROJECT_SURVEY_IMAGE_DEFAULT_LIMIT, PROJECT_SURVEY_IMAGE_MAX_LIMIT } =
  await import('../../../services/image-list.service.js');

const VALID_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = 'test-user-id';
const ENDPOINT = `/api/projects/${VALID_PROJECT_ID}/survey-images`;

const buildApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects/:projectId/survey-images', projectSurveyImagesRouter);
  app.use(errorHandler);
  return app;
};

/** 認証・認可をいずれも通過させる既定の設定 */
const allowAuth = (): void => {
  mockAuthenticate.mockImplementation((req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: USER_ID, email: 'test@example.com', roles: ['admin'] };
    next();
  });
  mockRequirePermission.mockImplementation(
    () => (_req: Request, _res: Response, next: NextFunction) => {
      next();
    }
  );
};

const sampleImage = {
  id: 'image-1',
  surveyId: 'survey-1',
  surveyName: '第1回現場調査',
  fileName: 'photo-1.jpg',
  displayUrl: 'https://storage.example.com/signed/annotated-thumb-1',
  originalUrl: 'https://storage.example.com/signed/original-1',
  comment: null,
  width: 1600,
  height: 1200,
  displayOrder: 1,
};

// app.ts の装着は既存の `router-integration.test.ts` と同じく静的に検証する。
// app.ts を実際に読み込むと Redis・Prisma などの起動時依存を丸ごと引くため、
// 単体の検証では装着の記述そのものを見る。装着先を取り違えると、ルーター単体が
// 正しくても本番の経路からは到達できない。
const appSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../app.ts'),
  'utf-8'
);

describe('app.ts への装着', () => {
  it('プロジェクト写真一覧ルーターをインポートしている', () => {
    expect(appSource).toContain(
      "import siteSurveysRoutes, { projectSurveyImagesRouter } from './routes/site-surveys.routes.js';"
    );
  });

  it('プロジェクト配下の写真一覧パスへ装着している', () => {
    expect(appSource).toContain(
      "app.use('/api/projects/:projectId/survey-images', projectSurveyImagesRouter);"
    );
  });
});

describe('GET /api/projects/:projectId/survey-images', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    vi.clearAllMocks();
    allowAuth();
    mockProjectFindUnique.mockResolvedValue({ id: VALID_PROJECT_ID, deletedAt: null });
    request = supertest(buildApp());
  });

  describe('正常系', () => {
    it('注釈付き写真の一覧と切り捨ての有無を返す（Requirements (quantity-table-generation): 49.9）', async () => {
      mockImageListService.findAnnotatedByProjectIdWithUrls.mockResolvedValue({
        images: [sampleImage],
        hasMore: false,
      });

      const response = await request.get(ENDPOINT);

      expect(response.status).toBe(200);
      expect(response.body.images).toHaveLength(1);
      expect(response.body.images[0]).toMatchObject({
        id: 'image-1',
        surveyName: '第1回現場調査',
        displayUrl: 'https://storage.example.com/signed/annotated-thumb-1',
      });
      expect(response.body.hasMore).toBe(false);
    });

    it('上限に達した場合は切り捨ての有無が真として応答に含まれる', async () => {
      mockImageListService.findAnnotatedByProjectIdWithUrls.mockResolvedValue({
        images: [sampleImage],
        hasMore: true,
      });

      const response = await request.get(ENDPOINT);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hasMore', true);
    });

    it('件数の指定が無い場合は既定値をサービスへ渡す', async () => {
      mockImageListService.findAnnotatedByProjectIdWithUrls.mockResolvedValue({
        images: [],
        hasMore: false,
      });

      const response = await request.get(ENDPOINT);

      expect(response.status).toBe(200);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).toHaveBeenCalledWith(
        VALID_PROJECT_ID,
        USER_ID,
        { limit: PROJECT_SURVEY_IMAGE_DEFAULT_LIMIT }
      );
    });

    it('件数をクエリで指定できる', async () => {
      mockImageListService.findAnnotatedByProjectIdWithUrls.mockResolvedValue({
        images: [],
        hasMore: false,
      });

      const response = await request.get(ENDPOINT).query({ limit: 50 });

      expect(response.status).toBe(200);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).toHaveBeenCalledWith(
        VALID_PROJECT_ID,
        USER_ID,
        { limit: 50 }
      );
    });

    it('正常な経路ではプロジェクトの存在確認を行わない（問い合わせ回数を増やさない）', async () => {
      mockImageListService.findAnnotatedByProjectIdWithUrls.mockResolvedValue({
        images: [sampleImage],
        hasMore: false,
      });

      const response = await request.get(ENDPOINT);

      expect(response.status).toBe(200);
      expect(mockProjectFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('クエリ不正', () => {
    it('上限を超える件数の指定を拒否する（丸めない）', async () => {
      const response = await request.get(ENDPOINT).query({
        limit: PROJECT_SURVEY_IMAGE_MAX_LIMIT + 1,
      });

      expect(response.status).toBe(400);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).not.toHaveBeenCalled();
    });

    it('1未満の件数の指定を拒否する（丸めない）', async () => {
      const response = await request.get(ENDPOINT).query({ limit: 0 });

      expect(response.status).toBe(400);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).not.toHaveBeenCalled();
    });

    it('整数でない件数の指定を拒否する', async () => {
      const response = await request.get(ENDPOINT).query({ limit: '1.5' });

      expect(response.status).toBe(400);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).not.toHaveBeenCalled();
    });

    it('数値でない件数の指定を拒否する', async () => {
      const response = await request.get(ENDPOINT).query({ limit: 'all' });

      expect(response.status).toBe(400);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).not.toHaveBeenCalled();
    });

    it('プロジェクトIDがUUIDでない場合を拒否する', async () => {
      const response = await request.get('/api/projects/not-a-uuid/survey-images');

      expect(response.status).toBe(400);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).not.toHaveBeenCalled();
    });
  });

  describe('認証・権限', () => {
    it('未認証の場合は401を返す', async () => {
      mockAuthenticate.mockImplementation((_req: Request, res: Response) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const response = await request.get(ENDPOINT);

      expect(response.status).toBe(401);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).not.toHaveBeenCalled();
    });

    it('site_survey:read 権限を要求する', async () => {
      mockImageListService.findAnnotatedByProjectIdWithUrls.mockResolvedValue({
        images: [],
        hasMore: false,
      });

      await request.get(ENDPOINT);

      expect(mockRequirePermission).toHaveBeenCalledWith('site_survey:read');
    });

    it('権限のない利用者は403で拒否される', async () => {
      mockRequirePermission.mockImplementation(
        () => (_req: Request, res: Response, _next: NextFunction) => {
          res.status(403).json({ error: 'Forbidden' });
        }
      );

      const response = await request.get(ENDPOINT);

      expect(response.status).toBe(403);
      expect(mockImageListService.findAnnotatedByProjectIdWithUrls).not.toHaveBeenCalled();
    });
  });

  /**
   * 403 と 404 の出し分けをやめた（site-survey タスク119.1、Requirement 39.2・39.3）。
   * 範囲外と不在は経路の判定部品（requireProjectScope）が同じ汎用の 404 にする。判定の通過の後に
   * サービスが拒否する（担当の変更との競合）場合も、案件を引き直さずに同じ汎用の 404 を返し、
   * 本文に案件 ID を含めない。
   */
  describe('判定の通過の後の拒否', () => {
    it('サービスが拒否した場合は案件を引き直さず、汎用の404を返して案件IDを含めない', async () => {
      mockImageListService.findAnnotatedByProjectIdWithUrls.mockRejectedValue(
        new ProjectSurveyImagesAccessDeniedError(VALID_PROJECT_ID, USER_ID)
      );

      const response = await request.get(ENDPOINT);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(response.body.projectId).toBeUndefined();
      expect(JSON.stringify({ ...response.body, instance: undefined })).not.toContain(
        VALID_PROJECT_ID
      );
      expect(mockProjectFindUnique).not.toHaveBeenCalled();
    });
  });
});
