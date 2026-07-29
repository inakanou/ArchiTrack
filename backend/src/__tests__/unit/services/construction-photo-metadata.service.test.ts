/**
 * @fileoverview ConstructionPhotoMetadataService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 2.5: メタ一括更新・並び替え・削除（メタ/順序担当）
 *
 * Requirements:
 * - 7.1: コメントを未保存として保持し保存で確定
 * - 7.3, 7.4: 表示順序の変更（並び替え）
 * - 7.5: 印刷対象フラグの切替
 * - 7.6: 未保存のコメント・印刷対象・順序をまとめて確定（displayOrder 1..n 正規化）
 * - 7.7: 写真項目削除時に関連看板配置データも削除（削除は image サービスで検証）
 * - 9.1: 写真項目への工事看板の関連付け（signboardId）
 * - 9.5: 看板・表示位置・大きさの指定を確定（保持のみ、合成しない）
 * - 11.4: メタ一括更新＋順序更新の最大2リクエストで反映
 * - 13.2: 対象アルバムのプロジェクト境界検証
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConstructionPhotoMetadataService,
  ConstructionPhotoBatchAlbumMismatchError,
  SignboardNotAllowedError,
  type ConstructionPhotoMetadataServiceDependencies,
  type BatchUpdatePhotoMetadataInput,
} from '../../../services/construction-photo-metadata.service.js';
import { ConstructionPhotoNotFoundError } from '../../../services/construction-photo-image.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

const ALBUM_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ALBUM_ID = '133e4567-e89b-12d3-a456-426614174000';
const PROJECT_ID = '223e4567-e89b-12d3-a456-426614174000';
const OTHER_PROJECT_ID = '323e4567-e89b-12d3-a456-426614174000';
const USER_ID = '523e4567-e89b-12d3-a456-426614174010';
const SIGNBOARD_ID = '623e4567-e89b-12d3-a456-426614174020';
const OTHER_SIGNBOARD_ID = '723e4567-e89b-12d3-a456-426614174021';

const PHOTO_1 = '423e4567-e89b-12d3-a456-426614174001';
const PHOTO_2 = '423e4567-e89b-12d3-a456-426614174002';
const PHOTO_3 = '423e4567-e89b-12d3-a456-426614174003';

/** constructionPhoto.findMany（id/album 参照）の読取形状 */
function photoRef(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    albumId: ALBUM_ID,
    album: { projectId: PROJECT_ID, deletedAt: null },
    ...overrides,
  };
}

/** update/findUnique が返す完全な行（DTO 変換用） */
function photoRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    albumId: ALBUM_ID,
    fileName: 'photo.jpg',
    fileSize: 250 * 1024,
    width: 800,
    height: 600,
    displayOrder: 1,
    comment: null,
    includeInReport: false,
    signboardId: null,
    signboardPlacement: null,
    thumbnailPath: `construction-photos/${ALBUM_ID}/1_thumb_photo.jpg`,
    originalPath: `construction-photos/${ALBUM_ID}/1_photo.jpg`,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createMockStorage() {
  return {
    type: 'local' as const,
    upload: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
    exists: vi.fn(),
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/thumb.jpg'),
    getPublicUrl: vi.fn(),
    testConnection: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockPrisma() {
  const prisma = {
    constructionPhoto: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    constructionSignboard: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        deletedAt: null,
        createdById: USER_ID,
        salesPersonId: 'someone-else',
        constructionPersonId: null,
      }),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient;

  // $transaction は同じ prisma モックをトランザクションクライアントとして渡す
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (cb: (tx: PrismaClient) => Promise<unknown>) => cb(prisma)
  );
  return prisma;
}

describe('ConstructionPhotoMetadataService.updateMetadataBatch', () => {
  let service: ConstructionPhotoMetadataService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockStorage = createMockStorage();
    const deps: ConstructionPhotoMetadataServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
    };
    service = new ConstructionPhotoMetadataService(deps);
  });

  it('存在しない写真項目を含む場合は NotFound を投げる', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    await expect(
      service.updateMetadataBatch(
        [{ id: PHOTO_1 }, { id: PHOTO_2 }] as BatchUpdatePhotoMetadataInput[],
        USER_ID
      )
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
  });

  it('複数アルバムにまたがるIDは precondition 違反として弾く', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1, { albumId: ALBUM_ID }),
      photoRef(PHOTO_2, { albumId: OTHER_ALBUM_ID }),
    ]);
    await expect(
      service.updateMetadataBatch(
        [{ id: PHOTO_1 }, { id: PHOTO_2 }] as BatchUpdatePhotoMetadataInput[],
        USER_ID
      )
    ).rejects.toThrow(ConstructionPhotoBatchAlbumMismatchError);
  });

  it('(a) comment/includeInReport/signboardId/placement を更新し displayOrder を 1..n に正規化する（Requirements: 7.5,7.6,9.1,9.5）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
      photoRef(PHOTO_2),
      photoRef(PHOTO_3),
    ]);
    (mockPrisma.constructionSignboard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: SIGNBOARD_ID, projectId: PROJECT_ID, deletedAt: null },
    ]);
    const updateMock = mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>;
    updateMock.mockImplementation(async ({ where, data }) =>
      photoRow(where.id as string, data as Record<string, unknown>)
    );

    // displayOrder は 30/10/20（欠番・非連番）→ 正規化後 3/1/2
    const inputs: BatchUpdatePhotoMetadataInput[] = [
      {
        id: PHOTO_1,
        comment: 'コメント1',
        includeInReport: true,
        signboardId: SIGNBOARD_ID,
        signboardPlacement: { left: 10, top: 20, width: 100, height: 80 },
        displayOrder: 30,
      },
      { id: PHOTO_2, displayOrder: 10 },
      { id: PHOTO_3, displayOrder: 20 },
    ];

    const result = await service.updateMetadataBatch(inputs, USER_ID);

    expect(result).toHaveLength(3);

    // 更新データを id ごとに集約
    const dataById = new Map<string, Record<string, unknown>>();
    for (const call of updateMock.mock.calls) {
      const arg = call[0] as { where: { id: string }; data: Record<string, unknown> };
      dataById.set(arg.where.id, arg.data);
    }

    // comment / includeInReport / signboardId / placement が反映される
    expect(dataById.get(PHOTO_1)!.comment).toBe('コメント1');
    expect(dataById.get(PHOTO_1)!.includeInReport).toBe(true);
    expect(dataById.get(PHOTO_1)!.signboardId).toBe(SIGNBOARD_ID);
    expect(dataById.get(PHOTO_1)!.signboardPlacement).toEqual({
      left: 10,
      top: 20,
      width: 100,
      height: 80,
    });

    // displayOrder 1..n 正規化（10→1, 20→2, 30→3）
    expect(dataById.get(PHOTO_2)!.displayOrder).toBe(1);
    expect(dataById.get(PHOTO_3)!.displayOrder).toBe(2);
    expect(dataById.get(PHOTO_1)!.displayOrder).toBe(3);

    // 1トランザクションで確定（11.4 のメタ側=1リクエスト）
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('(b) 看板合成は一切行わない（画像バイトの読み書き・合成が発生しない）（Requirements: 7.6, 9.5）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionSignboard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: SIGNBOARD_ID, projectId: PROJECT_ID, deletedAt: null },
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where, data }) => photoRow(where.id as string, data as Record<string, unknown>)
    );

    await service.updateMetadataBatch(
      [
        {
          id: PHOTO_1,
          signboardId: SIGNBOARD_ID,
          signboardPlacement: { left: 0, top: 0, width: 50, height: 50 },
        },
      ],
      USER_ID
    );

    // 合成は原本取得＋書込みを伴う。メタ保存では一切発生しない（オンデマンド合成）
    expect(mockStorage.get).not.toHaveBeenCalled();
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(mockStorage.copy).not.toHaveBeenCalled();
  });

  it('signboardId=null / placement=null で看板指定を解除できる', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    const updateMock = mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>;
    updateMock.mockImplementation(async ({ where }) => photoRow(where.id as string));

    await service.updateMetadataBatch(
      [{ id: PHOTO_1, signboardId: null, signboardPlacement: null }],
      USER_ID
    );

    const data = (updateMock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.signboardId).toBeNull();
    // Json クリアは Prisma の null 表現に変換される（undefined ではない）
    expect(data.signboardPlacement).not.toBeUndefined();
    // 存在しない signboardId 検証はスキップされる（null のため）
    expect(mockPrisma.constructionSignboard.findMany).not.toHaveBeenCalled();
  });

  it('(f) 存在しない signboardId は弾く（Requirements: 9.1）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionSignboard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.updateMetadataBatch([{ id: PHOTO_1, signboardId: SIGNBOARD_ID }], USER_ID)
    ).rejects.toThrow(SignboardNotAllowedError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('(f) 他プロジェクトの signboardId は弾く（Requirements: 9.1, 13.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionSignboard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: OTHER_SIGNBOARD_ID, projectId: OTHER_PROJECT_ID, deletedAt: null },
    ]);

    await expect(
      service.updateMetadataBatch([{ id: PHOTO_1, signboardId: OTHER_SIGNBOARD_ID }], USER_ID)
    ).rejects.toThrow(SignboardNotAllowedError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('(f) アクセスできないプロジェクトのアルバムは 404 とする（Requirements: 13.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PROJECT_ID,
      deletedAt: null,
      createdById: 'other-user',
      salesPersonId: 'another-user',
      constructionPersonId: null,
    });
    (mockPrisma.userRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.updateMetadataBatch([{ id: PHOTO_1, comment: 'x' }], USER_ID)
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('admin ロールは関係者でなくても更新できる（Requirements: 13.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PROJECT_ID,
      deletedAt: null,
      createdById: 'other-user',
      salesPersonId: 'another-user',
      constructionPersonId: null,
    });
    (mockPrisma.userRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { role: { name: 'admin' } },
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where, data }) => photoRow(where.id as string, data as Record<string, unknown>)
    );

    const result = await service.updateMetadataBatch([{ id: PHOTO_1, comment: 'ok' }], USER_ID);
    expect(result).toHaveLength(1);
  });

  it('DTO に thumbnailUrl と印字画像エンドポイントURLを含む', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }) => photoRow(where.id as string, { id: 'updated-xyz' })
    );

    const result = await service.updateMetadataBatch([{ id: PHOTO_1, comment: 'c' }], USER_ID);
    const dto = result[0]!;
    expect(dto.thumbnailUrl).toBe('https://signed.example/thumb.jpg');
    expect(dto.printImageUrl).toBe('/api/construction-photos/images/updated-xyz/print-image');
    // 原本URLは含まない（サムネ優先, 11.3）
    expect(Object.keys(dto)).not.toContain('originalUrl');
  });
});

describe('ConstructionPhotoMetadataService.updateOrder', () => {
  let service: ConstructionPhotoMetadataService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockStorage = createMockStorage();
    const deps: ConstructionPhotoMetadataServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
    };
    service = new ConstructionPhotoMetadataService(deps);
  });

  it('存在しないアルバムの順序更新は NotFound を投げる', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // アルバム参照は findMany 経由（写真から albumId 検証）。空 → NotFound
    await expect(
      service.updateOrder(ALBUM_ID, [{ id: PHOTO_1, order: 1 }], USER_ID)
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
  });

  it('(c) 順序更新1リクエストで全件を 1..n に正規化して反映する（Requirements: 7.3, 7.4, 7.6, 11.4）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
      photoRef(PHOTO_2),
      photoRef(PHOTO_3),
    ]);
    const updateMock = mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>;
    updateMock.mockResolvedValue(photoRow(PHOTO_1));

    // 相対順序 30/10/20 → 正規化 3/1/2
    await service.updateOrder(
      ALBUM_ID,
      [
        { id: PHOTO_1, order: 30 },
        { id: PHOTO_2, order: 10 },
        { id: PHOTO_3, order: 20 },
      ],
      USER_ID
    );

    const dataById = new Map<string, number>();
    for (const call of updateMock.mock.calls) {
      const arg = call[0] as { where: { id: string }; data: { displayOrder: number } };
      dataById.set(arg.where.id, arg.data.displayOrder);
    }
    expect(dataById.get(PHOTO_2)).toBe(1);
    expect(dataById.get(PHOTO_3)).toBe(2);
    expect(dataById.get(PHOTO_1)).toBe(3);

    // 1トランザクション=1リクエスト（11.4 の順序側）
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('アルバムに属さない写真IDを含む順序更新は NotFound を投げる', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    await expect(
      service.updateOrder(
        ALBUM_ID,
        [
          { id: PHOTO_1, order: 1 },
          { id: PHOTO_2, order: 2 },
        ],
        USER_ID
      )
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
  });

  it('(f) アクセスできないプロジェクトのアルバムは 404 とする（Requirements: 13.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PROJECT_ID,
      deletedAt: null,
      createdById: 'other-user',
      salesPersonId: 'another-user',
      constructionPersonId: null,
    });
    (mockPrisma.userRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.updateOrder(ALBUM_ID, [{ id: PHOTO_1, order: 1 }], USER_ID)
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });
});
