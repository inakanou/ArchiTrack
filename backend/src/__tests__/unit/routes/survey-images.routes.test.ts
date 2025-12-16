/**
 * @fileoverview 画像管理エンドポイントの基本テスト
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 *
 * Note: ルートファイルのテストは複雑な依存関係により制限があるため、
 * 基本的なインポートチェックとエクスポートの検証を行う。
 * 実際のエンドポイント動作は結合テストで検証する。
 *
 * @module tests/unit/routes/survey-images.routes
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Router } from 'express';

// すべてのモックをセットアップ
vi.mock('../../../middleware/validate.middleware.js', () => ({
  validate: vi.fn(() => vi.fn((_req: unknown, _res: unknown, next: () => void) => next())),
}));

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: vi.fn(() => vi.fn((_req: unknown, _res: unknown, next: () => void) => next())),
}));

vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../config/storage.js', () => ({
  getS3Client: vi.fn(() => ({})),
  getStorageConfig: vi.fn(() => ({ bucketName: 'test-bucket' })),
  isStorageConfigured: vi.fn(() => false),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {
    constructor() {}
  },
}));

vi.mock('../../../services/site-survey.service.js', () => ({
  SiteSurveyService: class {
    constructor() {}
    findById = vi.fn();
  },
}));

vi.mock('../../../services/signed-url.service.js', () => ({
  SignedUrlService: class {
    constructor() {}
  },
}));

vi.mock('../../../services/image-list.service.js', () => ({
  ImageListService: class {
    constructor() {}
  },
}));

vi.mock('../../../services/image-order.service.js', () => ({
  ImageOrderService: class {
    constructor() {}
  },
  ImageOrderError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('../../../services/image-delete.service.js', () => ({
  ImageDeleteService: class {
    constructor() {}
  },
  ImageNotFoundError: class extends Error {
    imageId: string;
    constructor(imageId: string) {
      super(`画像が見つかりません: ${imageId}`);
      this.imageId = imageId;
    }
  },
}));

vi.mock('../../../services/survey-image.service.js', () => ({
  SurveyImageService: class {
    constructor() {}
  },
}));

vi.mock('../../../services/image-processor.service.js', () => ({
  ImageProcessorService: class {
    constructor() {}
  },
}));

vi.mock('../../../services/image-upload.service.js', () => ({
  ImageUploadService: class {
    constructor() {}
  },
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
  default: vi.fn(),
}));

describe('survey-images.routes', () => {
  let router: Router;

  beforeAll(async () => {
    // ルーターをダイナミックインポート
    const module = await import('../../../routes/survey-images.routes.js');
    router = module.default;
  });

  it('ルーターがエクスポートされていること', () => {
    expect(router).toBeDefined();
  });

  it('ルーターがExpressのRouterインスタンスであること', () => {
    expect(typeof router).toBe('function');
    // Express routerは関数として実装されている
    expect(router.stack).toBeDefined();
    expect(Array.isArray(router.stack)).toBe(true);
  });

  it('ルーターにルートが登録されていること', () => {
    // router.stackにはルート定義が含まれる
    expect(router.stack.length).toBeGreaterThan(0);
  });

  describe('登録されているルート', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type RouterLayer = any;

    it('GET / (画像一覧) が登録されていること', () => {
      const getRoutes = router.stack
        .filter((layer: RouterLayer) => layer.route && layer.route.methods?.get)
        .map((layer: RouterLayer) => layer.route.path);

      expect(getRoutes).toContain('/');
    });

    it('PUT /order (順序変更) が登録されていること', () => {
      const putRoutes = router.stack
        .filter((layer: RouterLayer) => layer.route && layer.route.methods?.put)
        .map((layer: RouterLayer) => layer.route.path);

      expect(putRoutes).toContain('/order');
    });

    it('DELETE /:imageId (画像削除) が登録されていること', () => {
      const deleteRoutes = router.stack
        .filter((layer: RouterLayer) => layer.route && layer.route.methods?.delete)
        .map((layer: RouterLayer) => layer.route.path);

      expect(deleteRoutes).toContain('/:imageId');
    });

    it('POST / (画像アップロード) が登録されていること', () => {
      const postRoutes = router.stack
        .filter((layer: RouterLayer) => layer.route && layer.route.methods?.post)
        .map((layer: RouterLayer) => layer.route.path);

      expect(postRoutes).toContain('/');
    });
  });
});
