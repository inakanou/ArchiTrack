/**
 * @fileoverview 工事写真の署名付きURLの有効期限が一つの定数から決まることのテスト
 *
 * Task 24.7: 署名付き URL の 900 秒の定数の私的な複製を一つへ寄せる
 *
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * @requirement construction-photo/REQ-11.6
 *
 * Scope:
 * - アルバム一覧（`construction-photos.routes.ts`）の代表サムネイルと、メタの一括更新の応答
 *   （`construction-photo-metadata.service.ts`）のサムネイルの署名付きURLの有効期限が、
 *   `construction-photo-image.service.ts` が export する `SIGNED_URL_EXPIRES_IN` に追随すること。
 * - export された定数を 900 と異なる番兵の値へ差し替え、各呼び出しがその値で `getSignedUrl` を
 *   呼ぶことを主張する。私的な複製（900 の直書き）が残っていれば番兵の値が届かず赤になる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

/** export された定数の差し替え先。900 と異なる値にして、私的な複製を検出できるようにする */
const SENTINEL_EXPIRES_IN = vi.hoisted(() => 1234);

const mockAlbumService = vi.hoisted(() => ({
  findByProject: vi.fn(),
}));
const mockIsStorageConfigured = vi.hoisted(() => vi.fn());
const mockGetStorageProvider = vi.hoisted(() => vi.fn());

// 単一の出所: export された有効期限の定数だけを番兵の値へ差し替える（他の export は実物のまま）
vi.mock('../../../services/construction-photo-image.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SIGNED_URL_EXPIRES_IN: SENTINEL_EXPIRES_IN,
}));

vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/construction-photo-album.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ConstructionPhotoAlbumService: class {
    constructor() {
      return mockAlbumService;
    }
  },
}));

vi.mock('../../../storage/index', () => ({
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args),
  getStorageProvider: (...args: unknown[]) => mockGetStorageProvider(...args),
}));

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: 'test-user-id', email: 'test@example.com', roles: ['user'] };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// モックの後に実物を読み込む
import constructionPhotosRouter from '../../../routes/construction-photos.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import { ConstructionPhotoMetadataService } from '../../../services/construction-photo-metadata.service.js';
import { SIGNED_URL_EXPIRES_IN } from '../../../services/construction-photo-image.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

const PROJECT_ID = '223e4567-e89b-12d3-a456-426614174000';
const ALBUM_ID = '123e4567-e89b-12d3-a456-426614174000';
const PHOTO_ID = '423e4567-e89b-12d3-a456-426614174001';

describe('工事写真の署名付きURLの有効期限の単一の出所', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('前提: export された定数が番兵の値へ差し替わっており、900 と異なる', () => {
    expect(SIGNED_URL_EXPIRES_IN).toBe(SENTINEL_EXPIRES_IN);
    expect(SIGNED_URL_EXPIRES_IN).not.toBe(900);
  });

  describe('GET /api/projects/:projectId/construction-photos（アルバム一覧）', () => {
    let app: Application;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/projects/:projectId/construction-photos', constructionPhotosRouter);
      app.use(errorHandler);
    });

    it('代表サムネイルの署名付きURLを export された定数の有効期限で生成する', async () => {
      mockAlbumService.findByProject.mockResolvedValue({
        data: [
          {
            id: ALBUM_ID,
            projectId: PROJECT_ID,
            name: '基礎工事アルバム',
            memo: null,
            thumbnailUrl: `construction-photos/${ALBUM_ID}/thumb.jpg`,
            photoCount: 1,
            createdAt: '2026-01-12T00:00:00.000Z',
            updatedAt: '2026-01-12T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });
      mockIsStorageConfigured.mockReturnValue(true);
      const storage = { getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/a.jpg') };
      mockGetStorageProvider.mockReturnValue(storage);

      const response = await request(app).get(`/api/projects/${PROJECT_ID}/construction-photos`);

      expect(response.status).toBe(200);
      expect(response.body.data[0].thumbnailUrl).toBe('https://signed.example/a.jpg');
      expect(storage.getSignedUrl).toHaveBeenCalledTimes(1);
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        `construction-photos/${ALBUM_ID}/thumb.jpg`,
        {
          expiresIn: SENTINEL_EXPIRES_IN,
        }
      );
    });
  });

  describe('ConstructionPhotoMetadataService.updateMetadataBatch（メタの一括更新の応答）', () => {
    it('サムネイルの署名付きURLを export された定数の有効期限で生成する', async () => {
      const prisma = {
        constructionPhoto: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: PHOTO_ID,
              albumId: ALBUM_ID,
              album: { projectId: PROJECT_ID, deletedAt: null, project: { deletedAt: null } },
            },
          ]),
          update: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({
            id: where.id,
            albumId: ALBUM_ID,
            fileName: 'photo.jpg',
            fileSize: 1024,
            width: 800,
            height: 600,
            displayOrder: 1,
            comment: 'c',
            includeInReport: false,
            signboardId: null,
            signboardPlacement: null,
            thumbnailPath: `construction-photos/${ALBUM_ID}/1_thumb_photo.jpg`,
            originalPath: `construction-photos/${ALBUM_ID}/1_photo.jpg`,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          })),
        },
        constructionSignboard: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn(),
      } as unknown as PrismaClient;
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (cb: (tx: PrismaClient) => Promise<unknown>) => cb(prisma)
      );
      const storage = { getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/t.jpg') };
      const service = new ConstructionPhotoMetadataService({
        prisma,
        storageProvider: storage as never,
      });

      const result = await service.updateMetadataBatch([{ id: PHOTO_ID, comment: 'c' }]);

      expect(result[0]!.thumbnailUrl).toBe('https://signed.example/t.jpg');
      expect(storage.getSignedUrl).toHaveBeenCalledTimes(1);
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        `construction-photos/${ALBUM_ID}/1_thumb_photo.jpg`,
        { expiresIn: SENTINEL_EXPIRES_IN }
      );
    });
  });
});
