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
 * - 13.2: 対象アルバムが実在し取り除かれていないプロジェクト配下であることの検証（担当者や admin
 *   ロールでの絞り込みは行わず、認可はルートの RBAC 権限が担う）
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
    album: { projectId: PROJECT_ID, deletedAt: null, project: { deletedAt: null } },
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
    // 看板の検証はトランザクションの中で看板の行を FOR SHARE でロックして読む（Task 24.1）
    $queryRaw: vi.fn().mockResolvedValue([]),
    // プロジェクトの担当者と利用者のロールを引く問い合わせの口（スパイ）。認可はルートの RBAC
    // 権限だけが担い、サービスは担当者（作成者・営業担当・工事担当）や admin ロールでの絞り込みを
    // 行わない（Task 23.1 の利用者の判断）。呼ばれないことを主張するために置き、戻り値は与えない
    project: { findUnique: vi.fn() },
    userRole: { findMany: vi.fn() },
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
      service.updateMetadataBatch([
        { id: PHOTO_1 },
        { id: PHOTO_2 },
      ] as BatchUpdatePhotoMetadataInput[])
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
  });

  it('複数アルバムにまたがるIDは precondition 違反として弾く', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1, { albumId: ALBUM_ID }),
      photoRef(PHOTO_2, { albumId: OTHER_ALBUM_ID }),
    ]);
    await expect(
      service.updateMetadataBatch([
        { id: PHOTO_1 },
        { id: PHOTO_2 },
      ] as BatchUpdatePhotoMetadataInput[])
    ).rejects.toThrow(ConstructionPhotoBatchAlbumMismatchError);
  });

  it('(a) comment/includeInReport/signboardId/placement を更新し displayOrder を 1..n に正規化する（Requirements: 7.5,7.6,9.1,9.5）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
      photoRef(PHOTO_2),
      photoRef(PHOTO_3),
    ]);
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
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

    const result = await service.updateMetadataBatch(inputs);

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
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: SIGNBOARD_ID, projectId: PROJECT_ID, deletedAt: null },
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where, data }) => photoRow(where.id as string, data as Record<string, unknown>)
    );

    await service.updateMetadataBatch([
      {
        id: PHOTO_1,
        signboardId: SIGNBOARD_ID,
        signboardPlacement: { left: 0, top: 0, width: 50, height: 50 },
      },
    ]);

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

    await service.updateMetadataBatch([
      { id: PHOTO_1, signboardId: null, signboardPlacement: null },
    ]);

    const data = (updateMock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.signboardId).toBeNull();
    // Json クリアは Prisma の null 表現に変換される（undefined ではない）
    expect(data.signboardPlacement).not.toBeUndefined();
    // 存在しない signboardId 検証はスキップされる（null のため）
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('(f) 存在しない signboardId は弾く（Requirements: 9.1）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.updateMetadataBatch([{ id: PHOTO_1, signboardId: SIGNBOARD_ID }])
    ).rejects.toThrow(SignboardNotAllowedError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('(f) 他プロジェクトの signboardId は弾く（Requirements: 9.1, 13.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: OTHER_SIGNBOARD_ID, projectId: OTHER_PROJECT_ID, deletedAt: null },
    ]);

    await expect(
      service.updateMetadataBatch([{ id: PHOTO_1, signboardId: OTHER_SIGNBOARD_ID }])
    ).rejects.toThrow(SignboardNotAllowedError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('看板の検証は、書き込みと同じトランザクションの中で看板の行を ID 順に FOR SHARE でロックして読む（Task 24.1）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
      photoRef(PHOTO_2),
    ]);
    let inTransaction = false;
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: PrismaClient) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await cb(mockPrisma);
        } finally {
          inTransaction = false;
        }
      }
    );
    const lockReads: Array<{ inTransaction: boolean; sql: string; ids: unknown[] }> = [];
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        lockReads.push({
          inTransaction,
          sql: strings.join('?'),
          ids: (values[0] as { values: unknown[] }).values,
        });
        return [
          { id: SIGNBOARD_ID, projectId: PROJECT_ID, deletedAt: null },
          { id: OTHER_SIGNBOARD_ID, projectId: PROJECT_ID, deletedAt: null },
        ];
      }
    );
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where, data }) => photoRow(where.id as string, data as Record<string, unknown>)
    );

    await service.updateMetadataBatch([
      { id: PHOTO_1, signboardId: OTHER_SIGNBOARD_ID },
      { id: PHOTO_2, signboardId: SIGNBOARD_ID },
    ]);

    expect(lockReads).toHaveLength(1);
    expect(lockReads[0]!.inTransaction).toBe(true);
    expect(lockReads[0]!.sql).toMatch(/FOR SHARE/);
    // ロックを取る順を一定にするため ID 順に並べる
    expect(lockReads[0]!.ids).toEqual([SIGNBOARD_ID, OTHER_SIGNBOARD_ID]);
  });

  it('取り除かれた（論理削除済みの）signboardId は弾き、書き込まない（Requirements: 9.7）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: SIGNBOARD_ID, projectId: PROJECT_ID, deletedAt: new Date('2026-10-05T00:00:00Z') },
    ]);

    await expect(
      service.updateMetadataBatch([{ id: PHOTO_1, signboardId: SIGNBOARD_ID }])
    ).rejects.toThrow(SignboardNotAllowedError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('(f) 担当者（作成者・営業担当・工事担当）や admin ロールを問い合わせずに更新する（Requirements: 13.2）', async () => {
    // 更新できる利用者はルートの RBAC 権限（construction_photo:update）が決め、サービスは利用者を
    // 受け取らない。担当でない一般ユーザーの要求でも、アルバムとプロジェクトが実在すれば更新する
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where, data }) => photoRow(where.id as string, data as Record<string, unknown>)
    );

    const result = await service.updateMetadataBatch([{ id: PHOTO_1, comment: 'ok' }]);

    expect(result.map((p) => p.comment)).toEqual(['ok']);
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('アルバムの配下として指したときは、写真項目がそのアルバムに属さなければ 404 とし書き込まない（Requirements: 13.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where, data }) => photoRow(where.id as string, data as Record<string, unknown>)
    );

    await expect(
      service.updateMetadataBatch([{ id: PHOTO_1, comment: 'x' }], OTHER_ALBUM_ID)
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();

    // 属するアルバムの配下として指したときは更新する
    const result = await service.updateMetadataBatch([{ id: PHOTO_1, comment: 'y' }], ALBUM_ID);
    expect(result.map((p) => p.comment)).toEqual(['y']);
  });

  it('論理削除済みアルバム配下の写真項目の更新は 404 とし書き込まない', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1, {
        album: { projectId: PROJECT_ID, deletedAt: new Date(), project: { deletedAt: null } },
      }),
    ]);

    await expect(service.updateMetadataBatch([{ id: PHOTO_1, comment: 'x' }])).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('取り除かれた（論理削除済みの）プロジェクトの写真項目の更新は 404 とし書き込まない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1, {
        album: { projectId: PROJECT_ID, deletedAt: null, project: { deletedAt: new Date() } },
      }),
    ]);

    await expect(service.updateMetadataBatch([{ id: PHOTO_1, comment: 'x' }])).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('DTO に thumbnailUrl と印字画像エンドポイントURLを含む', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }) => photoRow(where.id as string, { id: 'updated-xyz' })
    );

    const result = await service.updateMetadataBatch([{ id: PHOTO_1, comment: 'c' }]);
    const dto = result[0]!;
    expect(dto.thumbnailUrl).toBe('https://signed.example/thumb.jpg');
    expect(dto.printImageUrl).toBe('/api/construction-photos/images/updated-xyz/print-image');
    // 原本URLは含まない（サムネ優先, 11.3）
    expect(Object.keys(dto)).not.toContain('originalUrl');
  });

  // --------------------------------------------------------------------------
  // 応答の看板の指定の解決（Requirements: 9.7）
  //
  // 一括更新の応答も写真一覧と同じ DTO を返す。論理削除済みの看板を指す指定が行に残って
  // いても（本修正より前の行、削除と保存の競合）、応答は一覧と同じく「看板なし」として返す。
  // --------------------------------------------------------------------------
  it('応答は、論理削除済みの看板を指す指定を看板なし（signboardId と配置が null）として返す（Requirements: 9.7）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
      photoRef(PHOTO_2),
    ]);
    const placement = { left: 10, top: 20, width: 100, height: 80 };
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }) =>
        photoRow(where.id as string, {
          signboardId: SIGNBOARD_ID,
          signboardPlacement: placement,
          signboard: { deletedAt: where.id === PHOTO_1 ? new Date() : null },
        })
    );

    const result = await service.updateMetadataBatch([
      { id: PHOTO_1, comment: 'a' },
      { id: PHOTO_2, comment: 'b' },
    ]);

    expect(result.map((p) => p.id)).toEqual([PHOTO_1, PHOTO_2]);
    expect(result[0]!.signboardId).toBeNull();
    expect(result[0]!.signboardPlacement).toBeNull();
    // 生きている看板の指定はそのまま返す
    expect(result[1]!.signboardId).toBe(SIGNBOARD_ID);
    expect(result[1]!.signboardPlacement).toEqual(placement);
  });

  it('看板の生死は更新の応答の読み出しに含め、看板を引く追加のクエリを発行しない（Requirements: 9.7, 11.4）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }) => photoRow(where.id as string)
    );

    await service.updateMetadataBatch([{ id: PHOTO_1, comment: 'c' }]);

    const updateArgs = (mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { select?: Record<string, unknown> };
    expect(updateArgs.select?.signboard).toEqual({ select: { deletedAt: true } });
    // 看板の指定を送っていない更新では、看板の表を一度も引かない
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
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
    await expect(service.updateOrder(ALBUM_ID, [{ id: PHOTO_1, order: 1 }])).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
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
    await service.updateOrder(ALBUM_ID, [
      { id: PHOTO_1, order: 30 },
      { id: PHOTO_2, order: 10 },
      { id: PHOTO_3, order: 20 },
    ]);

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
      service.updateOrder(ALBUM_ID, [
        { id: PHOTO_1, order: 1 },
        { id: PHOTO_2, order: 2 },
      ])
    ).rejects.toThrow(ConstructionPhotoNotFoundError);
  });

  it('(f) 担当者（作成者・営業担当・工事担当）や admin ロールを問い合わせずに順序を更新する（Requirements: 13.2）', async () => {
    // 更新できる利用者はルートの RBAC 権限（construction_photo:update）が決める
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1),
    ]);
    const updateMock = mockPrisma.constructionPhoto.update as ReturnType<typeof vi.fn>;
    updateMock.mockResolvedValue(photoRow(PHOTO_1));

    await expect(
      service.updateOrder(ALBUM_ID, [{ id: PHOTO_1, order: 1 }])
    ).resolves.toBeUndefined();

    expect(updateMock).toHaveBeenCalledWith({ where: { id: PHOTO_1 }, data: { displayOrder: 1 } });
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('論理削除済みアルバムの順序更新は 404 とし書き込まない', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1, {
        album: { projectId: PROJECT_ID, deletedAt: new Date(), project: { deletedAt: null } },
      }),
    ]);

    await expect(service.updateOrder(ALBUM_ID, [{ id: PHOTO_1, order: 1 }])).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });

  it('取り除かれた（論理削除済みの）プロジェクトのアルバムの順序更新は 404 とし書き込まない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      photoRef(PHOTO_1, {
        album: { projectId: PROJECT_ID, deletedAt: null, project: { deletedAt: new Date() } },
      }),
    ]);

    await expect(service.updateOrder(ALBUM_ID, [{ id: PHOTO_1, order: 1 }])).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.update).not.toHaveBeenCalled();
  });
});
