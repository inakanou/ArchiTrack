/**
 * @fileoverview ConstructionPhotoImageService ユニットテスト（addFromUpload）
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 2.2: 写真アップロード（ローカル/カメラ）サービス＋ルート
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し新規写真項目としてアルバムに紐付ける
 * - 4.2: 複数ファイルを取り込み写真項目を一括追加する
 * - 4.3: アップロード完了時にサムネイルを自動生成する
 * - 4.4: JPEG/PNG/WEBP をサポートする
 * - 4.5: 許可されない形式はアップロードを拒否する
 * - 4.6: 上限（300KB）超過時は段階的に圧縮して登録する（ImageProcessor に委譲）
 * - 4.7: 追加した写真項目を末尾の表示順に配置する
 * - 5.1, 5.2: カメラ撮影もサーバ側は通常の multipart と同一経路
 * - 12.3: 件数/サイズ超過の拒否（ルート層 multer）
 * - 12.5: ストレージ保存失敗時、失敗分は未登録・成功分は維持
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConstructionPhotoImageService,
  SurveyImageCopyNotAllowedError,
  ConstructionPhotoNotFoundError,
  type ConstructionPhotoImageServiceDependencies,
  type ConstructionPhotoUploadFile,
} from '../../../services/construction-photo-image.service.js';
import { ConstructionPhotoAlbumNotFoundError } from '../../../services/construction-photo-album.service.js';
import { SurveyImageService } from '../../../services/survey-image.service.js';
import { SignboardCompositeService } from '../../../services/signboard-composite.service.js';
import { SurveyDeletedError } from '../../../utils/survey-deleted-guard.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

const ALBUM_ID = '123e4567-e89b-12d3-a456-426614174000';
/** 写真項目が属さないアルバム（アルバムの配下として指したときの境界の検証用） */
const OTHER_ALBUM_ID = '133e4567-e89b-12d3-a456-426614174000';

/**
 * テスト用画像バッファ生成（先頭にマジックバイトを配置）
 */
function createBuffer(bytes: number[], size = 100): Buffer {
  const buffer = Buffer.alloc(size);
  bytes.forEach((byte, index) => {
    buffer[index] = byte;
  });
  return buffer;
}

const JPEG = () => createBuffer([0xff, 0xd8, 0xff, 0xe0]);
const PNG = () => createBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = () => createBuffer([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // 不正（未対応形式）

function jpegFile(name: string): ConstructionPhotoUploadFile {
  const buffer = JPEG();
  return { buffer, mimetype: 'image/jpeg', originalname: name, size: buffer.length };
}
function pngFile(name: string): ConstructionPhotoUploadFile {
  const buffer = PNG();
  return { buffer, mimetype: 'image/png', originalname: name, size: buffer.length };
}
function gifFile(name: string): ConstructionPhotoUploadFile {
  const buffer = GIF();
  return { buffer, mimetype: 'image/gif', originalname: name, size: buffer.length };
}

function createMockPrisma() {
  return {
    constructionPhotoAlbum: {
      findUnique: vi.fn().mockResolvedValue({
        id: ALBUM_ID,
        deletedAt: null,
        project: { deletedAt: null },
      }),
    },
    constructionPhoto: {
      findFirst: vi.fn().mockResolvedValue(null), // 既存写真なし → 末尾は 1 から
      create: vi.fn(),
    },
  } as unknown as PrismaClient;
}

function createMockStorage() {
  return {
    type: 'local' as const,
    upload: vi.fn().mockResolvedValue({ key: 'k', size: 1 }),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn(),
    exists: vi.fn(),
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/thumb.jpg'),
    getPublicUrl: vi.fn(),
    testConnection: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockProcessor() {
  return {
    processImage: vi.fn().mockResolvedValue({
      original: {
        buffer: Buffer.from('processed-original'),
        metadata: { width: 800, height: 600, size: 250 * 1024, format: 'jpeg' },
        originalExceededSizeLimit: true,
      },
      thumbnail: Buffer.from('thumbnail-bytes'),
      metadata: { width: 800, height: 600, size: 250 * 1024, format: 'jpeg' },
    }),
    getMetadata: vi.fn(),
    generateThumbnail: vi.fn(),
  };
}

/**
 * プロジェクトの担当者と利用者のロールを引く問い合わせの口（スパイ）。
 *
 * 工事写真の認可はルートの RBAC 権限だけが担い、サービスは担当者（作成者・営業担当・工事担当）や
 * admin ロールでの絞り込みを行わない（Task 23.1 の利用者の判断）。サービスがこれらを呼ばないことを
 * 主張するために置く。戻り値は与えない——呼ばれたら、担当でない利用者として扱われる。
 */
function createAssigneeLookupSpies() {
  return {
    project: { findUnique: vi.fn() },
    userRole: { findMany: vi.fn() },
  };
}

/**
 * prisma.constructionPhoto.create の戻り値（DBレコード形）を生成
 */
function photoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'photo-1',
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
    originalPath: `construction-photos/${ALBUM_ID}/1_photo.jpg`,
    thumbnailPath: `construction-photos/${ALBUM_ID}/1_thumb_photo.jpg`,
    sourceSurveyImageId: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ConstructionPhotoImageService.addFromUpload', () => {
  let service: ConstructionPhotoImageService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let mockProcessor: ReturnType<typeof createMockProcessor>;
  let surveyImageService: SurveyImageService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockStorage = createMockStorage();
    mockProcessor = createMockProcessor();
    // マジックバイト検証・ファイル名サニタイズは実装を再利用（ステートレスなヘルパー）
    surveyImageService = new SurveyImageService({
      prisma: mockPrisma as never,
      storageProvider: mockStorage as never,
    });

    const deps: ConstructionPhotoImageServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
      surveyImageService,
      imageProcessorService: mockProcessor as never,
    };
    service = new ConstructionPhotoImageService(deps);
  });

  it('存在しないアルバムへのアップロードは NotFound を投げる', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    await expect(service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg')])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('論理削除済みアルバムへのアップロードは NotFound を投げる', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ALBUM_ID,
      deletedAt: new Date(),
      project: { deletedAt: null },
    });
    await expect(service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg')])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('取り除かれた（論理削除済みの）プロジェクトのアルバムへのアップロードは NotFound を投げ、保存も登録もしない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ALBUM_ID,
      deletedAt: null,
      project: { deletedAt: new Date() },
    });
    await expect(service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg')])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(mockPrisma.constructionPhoto.create).not.toHaveBeenCalled();
  });

  it('複数画像を写真項目として登録しサムネを生成する（Requirements: 4.1, 4.2, 4.3）', async () => {
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(photoRow({ id: 'photo-1', fileName: 'a.jpg', displayOrder: 1 }))
      .mockResolvedValueOnce(photoRow({ id: 'photo-2', fileName: 'b.png', displayOrder: 2 }));

    const result = await service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg'), pngFile('b.png')]);

    expect(result.successful).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    // sharp 圧縮・サムネ生成へ委譲している（Requirements: 4.3, 4.6）
    expect(mockProcessor.processImage).toHaveBeenCalledTimes(2);
    // 原本＋サムネの2キーを保存（写真1件あたり2回 → 計4回）
    expect(mockStorage.upload).toHaveBeenCalledTimes(4);
  });

  it('ストレージキーが construction-photos/${albumId}/ 配下になる（design ストレージキー準拠）', async () => {
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(photoRow());

    await service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg')]);

    const keys = (mockStorage.upload as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).toMatch(new RegExp(`^construction-photos/${ALBUM_ID}/`));
    }
    // 一方はサムネ（_thumb_ を含む）
    expect(keys.some((k: string) => k.includes('_thumb_'))).toBe(true);
    expect(keys.some((k: string) => !k.includes('_thumb_'))).toBe(true);
  });

  it('追加した写真項目は末尾の表示順に配置される（Requirements: 4.7）', async () => {
    // 既存の最大 displayOrder = 5 → 新規は 6, 7
    (mockPrisma.constructionPhoto.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      displayOrder: 5,
    });
    const createMock = mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>;
    createMock
      .mockResolvedValueOnce(photoRow({ id: 'p6', displayOrder: 6 }))
      .mockResolvedValueOnce(photoRow({ id: 'p7', displayOrder: 7 }));

    await service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg'), pngFile('b.png')]);

    const orders = createMock.mock.calls.map(
      (c) => (c[0] as { data: { displayOrder: number } }).data.displayOrder
    );
    expect(orders).toEqual([6, 7]);
  });

  it('DTO に thumbnailUrl と印字画像エンドポイントURLを含む', async () => {
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      photoRow({ id: 'photo-xyz' })
    );

    const result = await service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg')]);

    const dto = result.successful[0]!;
    expect(dto.thumbnailUrl).toBe('https://signed.example/thumb.jpg');
    expect(dto.printImageUrl).toBe('/api/construction-photos/images/photo-xyz/print-image');
    expect(dto.albumId).toBe(ALBUM_ID);
    expect(dto.signboardId).toBeNull();
    expect(dto.signboardPlacement).toBeNull();
    expect(dto.includeInReport).toBe(false);
    // createdAt は ISO 文字列
    expect(typeof dto.createdAt).toBe('string');
  });

  it('不正な形式のファイルは failed に入り成功分は維持される（Requirements: 4.5, 12.5）', async () => {
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      photoRow({ id: 'ok', fileName: 'ok.jpg' })
    );

    const result = await service.addFromUpload(ALBUM_ID, [
      jpegFile('ok.jpg'),
      gifFile('bad.gif'), // マジックバイトが未対応形式 → 拒否
    ]);

    expect(result.successful).toHaveLength(1);
    expect(result.successful[0]!.fileName).toBe('ok.jpg');
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.fileName).toBe('bad.gif');
    expect(result.failed[0]!.error).toBeTruthy();
    // 不正ファイルは DB へ登録されない（create は成功分の1回のみ）
    expect(mockPrisma.constructionPhoto.create).toHaveBeenCalledTimes(1);
  });

  it('ストレージ保存に失敗したファイルは未登録・他は維持される（Requirements: 12.5）', async () => {
    // 1件目の original 保存で失敗、2件目は成功
    (mockStorage.upload as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValue({ key: 'k', size: 1 });
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      photoRow({ id: 'ok2', fileName: 'b.png', displayOrder: 2 })
    );

    const result = await service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg'), pngFile('b.png')]);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.fileName).toBe('a.jpg');
    expect(result.successful).toHaveLength(1);
    expect(result.successful[0]!.fileName).toBe('b.png');
  });

  it('サムネURL生成に失敗しても thumbnailUrl=null で成功として返す', async () => {
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(photoRow());
    (mockStorage.getSignedUrl as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('sign fail')
    );

    const result = await service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg')]);

    expect(result.successful).toHaveLength(1);
    expect(result.successful[0]!.thumbnailUrl).toBeNull();
  });
});

// ============================================================================
// Task 2.3: 現調写真コピー（addFromSurveyImage）
//
// Requirements:
// - 6.1: 同一プロジェクトの現場調査写真を選択候補として扱う（サービスは受領した ID を検証）
// - 6.2: 選択画像を独立した写真項目として複製（storage.copy で original+thumbnail）
// - 6.3: 複製後はコピー元の変更・削除の影響を受けない（独立行、site-survey 非依存）
// - 6.4: 参照対象を同一プロジェクトの現場調査写真に限定する（13.2）
// ============================================================================

const PROJECT_ID = '223e4567-e89b-12d3-a456-426614174000';
const OTHER_PROJECT_ID = '323e4567-e89b-12d3-a456-426614174000';
const SURVEY_IMAGE_ID_1 = '423e4567-e89b-12d3-a456-426614174001';
const SURVEY_IMAGE_ID_2 = '423e4567-e89b-12d3-a456-426614174002';

/** SurveyImage の読取形状（findMany の戻り値） */
function surveyImageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SURVEY_IMAGE_ID_1,
    originalPath: 'survey-images/survey-1/orig.jpg',
    thumbnailPath: 'survey-images/survey-1/thumb.jpg',
    annotatedThumbnailPath: null,
    fileName: 'survey.jpg',
    fileSize: 111111,
    width: 1024,
    height: 768,
    survey: { projectId: PROJECT_ID },
    ...overrides,
  };
}

/**
 * findMany の select を尊重して行を射影するモック設定。
 *
 * DB 上の状態（例: 注釈レコードの有無）を素直に書いたうえで、サービスが select していない
 * 列は取得できないことを再現する。これにより「DB には注釈があるが、サービスはそれを
 * 取得していない」という現状を、取得できたことにせずテストへ表現できる。
 */
function mockSurveyImageFindManySelectAware(
  findManyMock: ReturnType<typeof vi.fn>,
  dbRows: Array<Record<string, unknown>>
) {
  findManyMock.mockImplementation((args: { select?: Record<string, unknown> }) => {
    const select = args.select;
    if (!select) return Promise.resolve(dbRows);
    return Promise.resolve(
      dbRows.map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])))
    );
  });
}

function createSurveyMockPrisma() {
  return {
    constructionPhotoAlbum: {
      findUnique: vi.fn().mockResolvedValue({
        id: ALBUM_ID,
        deletedAt: null,
        projectId: PROJECT_ID,
        project: { deletedAt: null },
      }),
    },
    constructionPhoto: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    surveyImage: {
      findMany: vi.fn(),
      // 書込メソッドは呼ばれてはならない（site-survey 非依存の担保）
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  } as unknown as PrismaClient;
}

/** create の戻り値（DBレコード形、addFromUpload と同型に sourceSurveyImageId を追加） */
function copiedPhotoRow(overrides: Record<string, unknown> = {}) {
  return photoRow({
    fileName: 'survey.jpg',
    fileSize: 111111,
    width: 1024,
    height: 768,
    sourceSurveyImageId: SURVEY_IMAGE_ID_1,
    ...overrides,
  });
}

describe('ConstructionPhotoImageService.addFromSurveyImage', () => {
  let service: ConstructionPhotoImageService;
  let mockPrisma: ReturnType<typeof createSurveyMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let mockProcessor: ReturnType<typeof createMockProcessor>;
  let surveyImageService: SurveyImageService;

  beforeEach(() => {
    mockPrisma = createSurveyMockPrisma();
    mockStorage = createMockStorage();
    mockProcessor = createMockProcessor();
    surveyImageService = new SurveyImageService({
      prisma: mockPrisma as never,
      storageProvider: mockStorage as never,
    });

    const deps: ConstructionPhotoImageServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
      surveyImageService,
      imageProcessorService: mockProcessor as never,
    };
    service = new ConstructionPhotoImageService(deps);
  });

  it('存在しないアルバムへのコピーは NotFound を投げる', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    await expect(service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('論理削除済みアルバムへのコピーは NotFound を投げる', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ALBUM_ID,
      deletedAt: new Date(),
      projectId: PROJECT_ID,
      project: { deletedAt: null },
    });
    await expect(service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('取り除かれた（論理削除済みの）プロジェクトのアルバムへのコピーは NotFound を投げ、複製も登録もしない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ALBUM_ID,
      deletedAt: null,
      projectId: PROJECT_ID,
      project: { deletedAt: new Date() },
    });
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
    ]);
    await expect(service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
    expect(mockStorage.copy).not.toHaveBeenCalled();
    expect(mockPrisma.constructionPhoto.create).not.toHaveBeenCalled();
  });

  it('(a) 現調写真をコピーすると独立写真項目が生成され original/thumbnail の2キーが複製される（Requirements: 6.2）', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
    ]);
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      copiedPhotoRow({ id: 'copied-1' })
    );

    const result = await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);

    expect(result.successful).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    // original+thumbnail の2キーを storage.copy で複製
    expect(mockStorage.copy).toHaveBeenCalledTimes(2);
    const copyCalls = (mockStorage.copy as ReturnType<typeof vi.fn>).mock.calls;
    // コピー元は SurveyImage の original/thumbnail
    const sources = copyCalls.map((c) => c[0]);
    expect(sources).toContain('survey-images/survey-1/orig.jpg');
    expect(sources).toContain('survey-images/survey-1/thumb.jpg');
    // コピー先は construction-photos/${albumId}/ 配下
    const dsts = copyCalls.map((c) => c[1] as string);
    for (const dst of dsts) {
      expect(dst).toMatch(new RegExp(`^construction-photos/${ALBUM_ID}/`));
    }
    expect(dsts.some((d) => d.includes('_thumb_'))).toBe(true);
    expect(dsts.some((d) => !d.includes('_thumb_'))).toBe(true);

    // Sharp 再処理は行わない（バイト複製）
    expect(mockProcessor.processImage).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Task 115.8: 取り込み時の複製元の確定
  //
  // site-survey Requirements 20.2 / 20.3 により、現場調査の詳細画面・一覧画面の
  // サムネイルは保存済み注釈をレンダリングした状態で表示される。その表示元は
  // 115.1 以降「注釈付きサムネイル（annotatedThumbnailPath）」であり、通常サムネイル
  // （thumbnailPath）は素の画像として不変になった。
  // よって工事写真へ取り込んだ後の見た目を取り込み前と一致させるには、サムネイルの
  // 複製元として注釈付きサムネイルを優先する必要がある。
  // --------------------------------------------------------------------------

  it('(g) 注釈付きサムネイルを持つ現調写真はサムネの複製元が注釈付きサムネイルになる（site-survey Requirements: 20.2, 20.3）', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({
        id: SURVEY_IMAGE_ID_1,
        annotatedThumbnailPath: 'survey-images/survey-1/annotated/thumb.jpg',
      }),
    ]);
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      copiedPhotoRow({ id: 'copied-1' })
    );

    const result = await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);
    expect(result.failed).toHaveLength(0);

    const copyCalls = (mockStorage.copy as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, string]
    >;
    expect(copyCalls).toHaveLength(2);

    // サムネの複製先（_thumb_ を含むキー）に対応する複製元が注釈付きサムネイルであること
    const thumbCopy = copyCalls.find(([, dst]) => dst.includes('_thumb_'));
    expect(thumbCopy?.[0]).toBe('survey-images/survey-1/annotated/thumb.jpg');

    // 原本は原本のまま複製する（注釈は焼き込まない）
    const originalCopy = copyCalls.find(([, dst]) => !dst.includes('_thumb_'));
    expect(originalCopy?.[0]).toBe('survey-images/survey-1/orig.jpg');

    // 素の通常サムネイルは複製元にならない（注釈が消える退行の検出）
    expect(copyCalls.map(([src]) => src)).not.toContain('survey-images/survey-1/thumb.jpg');

    // 複製元は注釈付きサムネイルを読み出せている必要がある（Prisma の select 漏れ検出）
    const selected = (
      (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
        select: Record<string, unknown>;
      }
    ).select;
    expect(selected.annotatedThumbnailPath).toBe(true);
  });

  it('(h) 注釈が無い現調写真はサムネの複製元が通常サムネイルになる（site-survey Requirements: 20.2, 20.3）', async () => {
    // 注釈レコード自体が無い画像。現場調査側の表示も素のサムネイルであり、
    // 素の通常サムネイルを複製した結果が取り込み前の見た目と一致する（本来正しい結果）。
    mockSurveyImageFindManySelectAware(
      mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>,
      [surveyImageRow({ id: SURVEY_IMAGE_ID_1, annotatedThumbnailPath: null, annotation: null })]
    );
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      copiedPhotoRow({ id: 'copied-1' })
    );

    const result = await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);
    expect(result.failed).toHaveLength(0);

    const copyCalls = (mockStorage.copy as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, string]
    >;
    const thumbCopy = copyCalls.find(([, dst]) => dst.includes('_thumb_'));
    expect(thumbCopy?.[0]).toBe('survey-images/survey-1/thumb.jpg');
  });

  it('(i) 【承認済みの差分】注釈はあるが合成済みサムネイルが未生成の現調写真は、注釈が写らない通常サムネイルの複製になる（取り込みは失敗させない。合成済みサムネイルが生成されれば注釈付きが複製される）（site-survey Requirements: 20.2, 20.3）', async () => {
    // 注釈が存在する（描画された注釈あり）が、合成済みサムネイルは未生成の画像。
    // 合成済みサムネイルが埋まるのは画像編集画面での再保存時のみであり、現時点の既存
    // データはこの状態が既定である。現場調査側は表示時のクライアント合成で注釈を描くため、
    // この状態の取り込み結果には注釈が写らず、取り込み前の見た目と一致しない。
    // 取り込めないほうが後退であるため、この差分は承認のうえで受容している
    // （design.md「工事写真への取り込み時の見た目（承認済みの差分）」）。
    // サービスは注釈の有無を取得していないため、この状態は (h) と区別できないまま
    // 素の複製になる。ここではその結果を「承認済みの差分」として固定する。
    const annotatedDbRow = surveyImageRow({
      id: SURVEY_IMAGE_ID_1,
      annotatedThumbnailPath: null,
      annotation: { hasDrawnAnnotations: true },
    });
    mockSurveyImageFindManySelectAware(
      mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>,
      [annotatedDbRow]
    );
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      copiedPhotoRow({ id: 'copied-1' })
    );

    const result = await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);

    // 取り込み自体は成功させる（注釈が写らないことを理由に失敗させない）
    expect(result.successful).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    const copyCalls = (mockStorage.copy as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, string]
    >;
    const thumbCopy = copyCalls.find(([, dst]) => dst.includes('_thumb_'));
    expect(thumbCopy?.[0]).toBe('survey-images/survey-1/thumb.jpg');

    // サーバ側での再合成は行わない（合成手段は封鎖されている）
    expect(mockProcessor.processImage).not.toHaveBeenCalled();

    // この差分は恒久ではない。同じ注釈付き画像でも合成済みサムネイルが生成されれば、
    // 以降の取り込みでは注釈付きサムネイルが複製される。
    (mockStorage.copy as ReturnType<typeof vi.fn>).mockClear();
    mockSurveyImageFindManySelectAware(
      mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>,
      [
        {
          ...annotatedDbRow,
          annotatedThumbnailPath: 'survey-images/survey-1/annotated/thumb.jpg',
        },
      ]
    );

    const afterBackfill = await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);
    expect(afterBackfill.failed).toHaveLength(0);

    const copyCallsAfter = (mockStorage.copy as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, string]
    >;
    const thumbCopyAfter = copyCallsAfter.find(([, dst]) => dst.includes('_thumb_'));
    expect(thumbCopyAfter?.[0]).toBe('survey-images/survey-1/annotated/thumb.jpg');
  });

  it('(b) width/height/fileSize は複製元 SurveyImage から流用される（Requirements: 6.2）', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1, width: 4032, height: 3024, fileSize: 987654 }),
    ]);
    const createMock = mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>;
    createMock.mockResolvedValue(
      copiedPhotoRow({ id: 'copied-1', width: 4032, height: 3024, fileSize: 987654 })
    );

    await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);

    const data = (createMock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.width).toBe(4032);
    expect(data.height).toBe(3024);
    expect(data.fileSize).toBe(987654);
  });

  it('(c) sourceSurveyImageId に複製元IDを記録する（Requirements: 6.3）', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
    ]);
    const createMock = mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>;
    createMock.mockResolvedValue(copiedPhotoRow({ id: 'copied-1' }));

    await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);

    const data = (createMock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.sourceSurveyImageId).toBe(SURVEY_IMAGE_ID_1);
  });

  it('複数コピーは末尾表示順に連番配置される（Requirements: 6.2, 4.7）', async () => {
    (mockPrisma.constructionPhoto.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      displayOrder: 3,
    });
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
      surveyImageRow({ id: SURVEY_IMAGE_ID_2 }),
    ]);
    const createMock = mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>;
    createMock
      .mockResolvedValueOnce(copiedPhotoRow({ id: 'c1', displayOrder: 4 }))
      .mockResolvedValueOnce(copiedPhotoRow({ id: 'c2', displayOrder: 5 }));

    await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1, SURVEY_IMAGE_ID_2]);

    const orders = createMock.mock.calls.map(
      (c) => (c[0] as { data: { displayOrder: number } }).data.displayOrder
    );
    expect(orders).toEqual([4, 5]);
  });

  it('(e) 他プロジェクトの SurveyImage は拒否する（Requirements: 6.4, 13.2）', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1, survey: { projectId: OTHER_PROJECT_ID } }),
    ]);

    await expect(service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1])).rejects.toThrow(
      SurveyImageCopyNotAllowedError
    );

    // 1件でも境界外なら複製・登録は一切行わない
    expect(mockStorage.copy).not.toHaveBeenCalled();
    expect(mockPrisma.constructionPhoto.create).not.toHaveBeenCalled();
  });

  it('存在しない SurveyImage を含む場合も拒否する（Requirements: 6.4）', async () => {
    // 要求2件に対し1件しか返らない → 拒否
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
    ]);

    await expect(
      service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1, SURVEY_IMAGE_ID_2])
    ).rejects.toThrow(SurveyImageCopyNotAllowedError);
    expect(mockPrisma.constructionPhoto.create).not.toHaveBeenCalled();
  });

  // 親の現場調査の論理削除の検査（Task 17.1）。
  // 守る不変条件は site-survey スペックの論理削除の意味であり、本スペックの受入基準ではない。
  // 判定は survey-deleted-guard の共通機構に委ね、site-survey・数量表の経路と同じ
  // SurveyDeletedError（経路側で 410 へ写す）で全体を拒否する。
  describe('親の現場調査の論理削除の検査', () => {
    const LIVE_SURVEY_ID = 'a23e4567-e89b-12d3-a456-426614174001';
    const DELETED_SURVEY_ID = 'a23e4567-e89b-12d3-a456-426614174002';

    /**
     * findMany の select を入れ子まで尊重して射影する。
     *
     * DB 上は親の削除状態を持たせたうえで、サービスが `survey.select` に `deletedAt` を
     * 置かない限りそれを読めないことを再現する（select の欠落を検査の素通りとして露出させる）。
     */
    function project(row: unknown, select: Record<string, unknown>): Record<string, unknown> {
      const src = row as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(select).map(([key, spec]) => {
          const value = src[key];
          if (spec && typeof spec === 'object' && 'select' in spec && value) {
            return [key, project(value, (spec as { select: Record<string, unknown> }).select)];
          }
          return [key, value];
        })
      );
    }

    function mockNestedSelectAware(dbRows: Array<Record<string, unknown>>) {
      (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockImplementation(
        (args: { select?: Record<string, unknown> }) =>
          Promise.resolve(args.select ? dbRows.map((r) => project(r, args.select!)) : dbRows)
      );
    }

    it('親の現場調査が論理削除済みの参照を含むと SurveyDeletedError で全体を拒否し、複製・登録を一切行わない', async () => {
      mockNestedSelectAware([
        surveyImageRow({
          id: SURVEY_IMAGE_ID_1,
          surveyId: LIVE_SURVEY_ID,
          survey: { projectId: PROJECT_ID, deletedAt: null },
        }),
        surveyImageRow({
          id: SURVEY_IMAGE_ID_2,
          surveyId: DELETED_SURVEY_ID,
          survey: { projectId: PROJECT_ID, deletedAt: new Date('2026-09-01T00:00:00Z') },
        }),
      ]);

      const error = await service
        .addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1, SURVEY_IMAGE_ID_2])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SurveyDeletedError);
      expect((error as SurveyDeletedError).surveyId).toBe(DELETED_SURVEY_ID);
      expect((error as SurveyDeletedError).message).toBe(
        `削除された現場調査の画像は追加できません: ${DELETED_SURVEY_ID}`
      );
      // 生きている参照が先にあっても、部分的に複製しない（全体の拒否）
      expect(mockStorage.copy).not.toHaveBeenCalled();
      expect(mockPrisma.constructionPhoto.create).not.toHaveBeenCalled();
    });

    it('他プロジェクトかつ親が論理削除済みの参照は、存在有無を漏らさない 404 側の拒否を優先する', async () => {
      mockNestedSelectAware([
        surveyImageRow({
          id: SURVEY_IMAGE_ID_1,
          surveyId: DELETED_SURVEY_ID,
          survey: { projectId: OTHER_PROJECT_ID, deletedAt: new Date('2026-09-01T00:00:00Z') },
        }),
      ]);

      await expect(service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1])).rejects.toThrow(
        SurveyImageCopyNotAllowedError
      );
      expect(mockStorage.copy).not.toHaveBeenCalled();
    });

    it('親の現場調査が生きている参照は従来どおり複製される（対照）', async () => {
      mockNestedSelectAware([
        surveyImageRow({
          id: SURVEY_IMAGE_ID_1,
          surveyId: LIVE_SURVEY_ID,
          survey: { projectId: PROJECT_ID, deletedAt: null },
        }),
      ]);
      (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        copiedPhotoRow({ id: 'copied-live' })
      );

      const result = await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
    });
  });

  it('(f) site-survey テーブルへは一切書込まない（Requirements: 6.3）', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
    ]);
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      copiedPhotoRow({ id: 'copied-1' })
    );

    await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);

    expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    expect(mockPrisma.surveyImage.create).not.toHaveBeenCalled();
    expect(mockPrisma.surveyImage.delete).not.toHaveBeenCalled();
    expect(mockPrisma.surveyImage.deleteMany).not.toHaveBeenCalled();
    // 削除メソッド（storage.delete）も現調側原本に対して呼ばない
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it('コピーに失敗した項目は failed に入り成功分は維持される（Requirements: 12.5相当）', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
      surveyImageRow({ id: SURVEY_IMAGE_ID_2 }),
    ]);
    // 1件目の original コピーで失敗、以降は成功
    (mockStorage.copy as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('copy failed'))
      .mockResolvedValue(undefined);
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      copiedPhotoRow({ id: 'c2', sourceSurveyImageId: SURVEY_IMAGE_ID_2 })
    );

    const result = await service.addFromSurveyImage(ALBUM_ID, [
      SURVEY_IMAGE_ID_1,
      SURVEY_IMAGE_ID_2,
    ]);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.surveyImageId).toBe(SURVEY_IMAGE_ID_1);
    expect(result.successful).toHaveLength(1);
  });

  it('DTO に thumbnailUrl と印字画像エンドポイントURLを含む', async () => {
    (mockPrisma.surveyImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      surveyImageRow({ id: SURVEY_IMAGE_ID_1 }),
    ]);
    (mockPrisma.constructionPhoto.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      copiedPhotoRow({ id: 'copied-xyz' })
    );

    const result = await service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1]);

    const dto = result.successful[0]!;
    expect(dto.thumbnailUrl).toBe('https://signed.example/thumb.jpg');
    expect(dto.printImageUrl).toBe('/api/construction-photos/images/copied-xyz/print-image');
    expect(dto.albumId).toBe(ALBUM_ID);
  });
});

// ============================================================================
// Task 2.4: 写真一覧取得（署名URL一括）（listWithUrls）
//
// Requirements:
// - 7.8: 写真項目一覧＋表示用署名付きURLを個別リクエストに分割せずまとめて取得する
// - 11.2: 詳細は写真項目一覧＋署名URLを1リクエストで返し、写真ごとの個別取得を発生させない（N+1回避）
// - 11.3: 一覧・詳細はサムネ優先。原本は必要時のみ（一覧では原本URLを返さない）
// - 13.2: 取得対象が実在し取り除かれていないプロジェクト配下であることを検証する。担当者（作成者・
//   営業担当・工事担当）や admin ロールでの絞り込みは行わず、認可はルートの RBAC 権限が担う
// ============================================================================

/** 工事写真一覧（findMany）の読取形状。原本パスは一覧では取得しない（サムネ優先） */
function listPhotoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lp-1',
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
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createListMockPrisma() {
  return {
    constructionPhotoAlbum: {
      findUnique: vi.fn().mockResolvedValue({
        id: ALBUM_ID,
        deletedAt: null,
        project: { deletedAt: null },
      }),
    },
    constructionPhoto: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...createAssigneeLookupSpies(),
  } as unknown as PrismaClient;
}

describe('ConstructionPhotoImageService.listWithUrls', () => {
  let service: ConstructionPhotoImageService;
  let mockPrisma: ReturnType<typeof createListMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let mockProcessor: ReturnType<typeof createMockProcessor>;
  let surveyImageService: SurveyImageService;

  beforeEach(() => {
    mockPrisma = createListMockPrisma();
    mockStorage = createMockStorage();
    mockProcessor = createMockProcessor();
    surveyImageService = new SurveyImageService({
      prisma: mockPrisma as never,
      storageProvider: mockStorage as never,
    });

    const deps: ConstructionPhotoImageServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
      surveyImageService,
      imageProcessorService: mockProcessor as never,
    };
    service = new ConstructionPhotoImageService(deps);
  });

  it('存在しないアルバムの一覧取得は NotFound を投げる', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    await expect(service.listWithUrls(ALBUM_ID)).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('論理削除済みアルバムの一覧取得は NotFound を投げる', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ALBUM_ID,
      deletedAt: new Date(),
      project: { deletedAt: null },
    });
    await expect(service.listWithUrls(ALBUM_ID)).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('(a) displayOrder 昇順で全写真項目を返す（Requirements: 7.8）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({ id: 'p1', displayOrder: 1 }),
      listPhotoRow({ id: 'p2', displayOrder: 2 }),
      listPhotoRow({ id: 'p3', displayOrder: 3 }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID);

    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    // displayOrder 昇順で1クエリ取得している
    const findManyArgs = (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { where: { albumId: string }; orderBy: { displayOrder: string } };
    expect(findManyArgs.where.albumId).toBe(ALBUM_ID);
    expect(findManyArgs.orderBy).toEqual({ displayOrder: 'asc' });
  });

  it('写真0件のアルバムは空配列を返し署名URL生成を行わない', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.listWithUrls(ALBUM_ID);

    expect(result).toEqual([]);
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('(b) 署名URLはまとめて生成され写真ごとの個別DB取得を発生させない（N+1回避, Requirements: 11.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({ id: 'p1', displayOrder: 1 }),
      listPhotoRow({ id: 'p2', displayOrder: 2 }),
      listPhotoRow({ id: 'p3', displayOrder: 3 }),
    ]);

    await service.listWithUrls(ALBUM_ID);

    // 写真件数に関わらず findMany は1回のみ（写真ごとの個別クエリを発生させない）
    expect(mockPrisma.constructionPhoto.findMany).toHaveBeenCalledTimes(1);
    // 署名URLは取得済みパスから写真ごとに1回だけ生成（追加のDBラウンドトリップなし）
    expect(mockStorage.getSignedUrl).toHaveBeenCalledTimes(3);
  });

  it('(c) DTO にサムネ署名URLと印字画像エンドポイントURLを含み原本URLは含まない（Requirements: 11.3）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({
        id: 'photo-xyz',
        thumbnailPath: `construction-photos/${ALBUM_ID}/9_thumb_x.jpg`,
      }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID);
    const dto = result[0]!;

    expect(dto.thumbnailUrl).toBe('https://signed.example/thumb.jpg');
    expect(dto.printImageUrl).toBe('/api/construction-photos/images/photo-xyz/print-image');
    // 原本URLは一覧では返さない（サムネ優先, 11.3）
    expect(Object.keys(dto)).not.toContain('originalUrl');
    // 署名はサムネパスに対してのみ生成される（原本パスは取得すらしない）
    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
      `construction-photos/${ALBUM_ID}/9_thumb_x.jpg`,
      { expiresIn: 900 }
    );
    // 選択列に originalPath を含めない（サムネ優先の取得）
    const findManyArgs = (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { select?: Record<string, boolean> };
    expect(findManyArgs.select?.originalPath).toBeUndefined();
  });

  it('サムネURL生成に失敗した写真は thumbnailUrl=null で返す', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({ id: 'p1' }),
    ]);
    (mockStorage.getSignedUrl as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('sign fail')
    );

    const result = await service.listWithUrls(ALBUM_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.thumbnailUrl).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 看板の指定の解決（Requirements: 9.7）
  //
  // 看板の削除は論理削除であり、削除の処理が参照側を解除する。それでも、本修正より前に
  // 作られた行や、削除と保存が競合した行には、論理削除済みの看板を指す指定が残りうる。
  // 一覧は読み出しの時点で看板の生死を確かめ、生きていない看板の指定を「看板なし」として返す。
  // --------------------------------------------------------------------------
  const LIST_SIGNBOARD_ID = '923e4567-e89b-12d3-a456-426614174099';
  const LIST_PLACEMENT = { left: 10, top: 20, width: 300, height: 200 };

  it('生きている看板の指定は signboardId と配置をそのまま返す（Requirements: 9.6）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({
        id: 'p1',
        signboardId: LIST_SIGNBOARD_ID,
        signboardPlacement: LIST_PLACEMENT,
        signboard: { deletedAt: null },
      }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.signboardId).toBe(LIST_SIGNBOARD_ID);
    expect(result[0]!.signboardPlacement).toEqual(LIST_PLACEMENT);
  });

  it('論理削除済みの看板を指す指定は、看板なし（signboardId と配置が null）として返す（Requirements: 9.7）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({
        id: 'p-dangling',
        displayOrder: 1,
        signboardId: LIST_SIGNBOARD_ID,
        signboardPlacement: LIST_PLACEMENT,
        signboard: { deletedAt: new Date('2024-02-01T00:00:00.000Z') },
      }),
      listPhotoRow({
        id: 'p-live',
        displayOrder: 2,
        signboardId: LIST_SIGNBOARD_ID,
        signboardPlacement: LIST_PLACEMENT,
        signboard: { deletedAt: null },
      }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID);

    expect(result.map((p) => p.id)).toEqual(['p-dangling', 'p-live']);
    expect(result[0]!.signboardId).toBeNull();
    expect(result[0]!.signboardPlacement).toBeNull();
    // 同じ一覧の中の生きている指定は巻き添えにしない
    expect(result[1]!.signboardId).toBe(LIST_SIGNBOARD_ID);
    expect(result[1]!.signboardPlacement).toEqual(LIST_PLACEMENT);
  });

  it('看板の実体を確かめられない指定（参照先の行が無い）も看板なしとして返す（Requirements: 9.7）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({
        id: 'p1',
        signboardId: LIST_SIGNBOARD_ID,
        signboardPlacement: LIST_PLACEMENT,
        signboard: null,
      }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.signboardId).toBeNull();
    expect(result[0]!.signboardPlacement).toBeNull();
  });

  it('看板の生死は一覧の1クエリの中で読み、看板を引く追加のクエリを発行しない（Requirements: 9.7, 11.2）', async () => {
    const signboardFindMany = vi.fn();
    const signboardFindUnique = vi.fn();
    (mockPrisma as unknown as Record<string, unknown>).constructionSignboard = {
      findMany: signboardFindMany,
      findUnique: signboardFindUnique,
    };
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({
        id: 'p1',
        signboardId: LIST_SIGNBOARD_ID,
        signboardPlacement: LIST_PLACEMENT,
        signboard: { deletedAt: null },
      }),
    ]);

    await service.listWithUrls(ALBUM_ID);

    expect(mockPrisma.constructionPhoto.findMany).toHaveBeenCalledTimes(1);
    const findManyArgs = (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { select?: Record<string, unknown> };
    expect(findManyArgs.select?.signboard).toEqual({ select: { deletedAt: true } });
    expect(signboardFindMany).not.toHaveBeenCalled();
    expect(signboardFindUnique).not.toHaveBeenCalled();
  });

  it('(d) 担当者（作成者・営業担当・工事担当）や admin ロールを問い合わせずに一覧を返す（Requirements: 13.2）', async () => {
    // 認可はルートの RBAC 権限（construction_photo:read）が担い、サービスは利用者を受け取らない。
    // 担当でない一般ユーザーの要求でも、アルバムとプロジェクトが実在すれば一覧を返す
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({ id: 'p1' }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID);

    expect(result.map((p) => p.id)).toEqual(['p1']);
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
    // アルバムの読み出しは、プロジェクトの担当者の列を読まない（論理削除の状態だけを読む）
    const albumArgs = (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0] as { select: { project: unknown } };
    expect(albumArgs.select.project).toEqual({ select: { deletedAt: true } });
  });

  it('取り除かれた（論理削除済みの）プロジェクトのアルバムは 404 とし、写真項目を読み出さない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ALBUM_ID,
      deletedAt: null,
      project: { deletedAt: new Date() },
    });

    await expect(service.listWithUrls(ALBUM_ID)).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
    expect(mockPrisma.constructionPhoto.findMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Task 2.5: 写真項目の削除（delete）
//
// Requirements:
// - 7.7: 写真項目と関連する看板配置データを削除する（配置は行のカラムのため行削除で消える）
// - 9.5: 保持のみ（削除では合成物は存在しない=オンデマンドのため）
// - 13.2: 対象アルバムが実在し取り除かれていないプロジェクト配下であることを検証する（担当者や
//   admin ロールでの絞り込みは行わない）
// ============================================================================

const PHOTO_ID = '623e4567-e89b-12d3-a456-426614174099';

/** delete 対象写真の読取形状（アルバムと所属プロジェクトの論理削除の状態を同梱） */
function deletePhotoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PHOTO_ID,
    albumId: ALBUM_ID,
    originalPath: `construction-photos/${ALBUM_ID}/1_photo.jpg`,
    thumbnailPath: `construction-photos/${ALBUM_ID}/1_thumb_photo.jpg`,
    album: { deletedAt: null, project: { deletedAt: null } },
    ...overrides,
  };
}

function createDeleteMockPrisma() {
  return {
    constructionPhoto: {
      findUnique: vi.fn().mockResolvedValue(deletePhotoRow()),
      delete: vi.fn().mockResolvedValue(deletePhotoRow()),
    },
    ...createAssigneeLookupSpies(),
  } as unknown as PrismaClient;
}

describe('ConstructionPhotoImageService.delete', () => {
  let service: ConstructionPhotoImageService;
  let mockPrisma: ReturnType<typeof createDeleteMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let mockProcessor: ReturnType<typeof createMockProcessor>;
  let surveyImageService: SurveyImageService;

  beforeEach(() => {
    mockPrisma = createDeleteMockPrisma();
    mockStorage = createMockStorage();
    mockProcessor = createMockProcessor();
    surveyImageService = new SurveyImageService({
      prisma: mockPrisma as never,
      storageProvider: mockStorage as never,
    });
    const deps: ConstructionPhotoImageServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
      surveyImageService,
      imageProcessorService: mockProcessor as never,
    };
    service = new ConstructionPhotoImageService(deps);
  });

  it('存在しない写真項目の削除は NotFound を投げる', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.delete(PHOTO_ID)).rejects.toThrow(ConstructionPhotoNotFoundError);
    expect(mockPrisma.constructionPhoto.delete).not.toHaveBeenCalled();
  });

  it('(d) 写真行を削除し original/thumbnail のストレージも削除する（Requirements: 7.7）', async () => {
    await service.delete(PHOTO_ID);

    // DB 行削除
    expect(mockPrisma.constructionPhoto.delete).toHaveBeenCalledWith({ where: { id: PHOTO_ID } });
    // 原本＋サムネの2キーをストレージから削除
    const deleted = (mockStorage.delete as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(deleted).toContain(`construction-photos/${ALBUM_ID}/1_photo.jpg`);
    expect(deleted).toContain(`construction-photos/${ALBUM_ID}/1_thumb_photo.jpg`);
    // オンデマンド合成のため保存済み合成物は無く、合成処理は呼ばれない
    expect(mockProcessor.processImage).not.toHaveBeenCalled();
  });

  it('ストレージ削除が失敗しても DB 行削除は完了する（ベストエフォート）', async () => {
    (mockStorage.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('storage down'));
    await expect(service.delete(PHOTO_ID)).resolves.toBeUndefined();
    expect(mockPrisma.constructionPhoto.delete).toHaveBeenCalledWith({ where: { id: PHOTO_ID } });
  });

  it('(f) 担当者（作成者・営業担当・工事担当）や admin ロールを問い合わせずに削除する（Requirements: 13.2）', async () => {
    // 削除できる利用者はルートの RBAC 権限（construction_photo:delete）が決める
    await expect(service.delete(PHOTO_ID)).resolves.toBeUndefined();

    expect(mockPrisma.constructionPhoto.delete).toHaveBeenCalledWith({ where: { id: PHOTO_ID } });
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('取り除かれた（論理削除済みの）プロジェクトの写真は 404 とし削除しない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      deletePhotoRow({
        album: { deletedAt: null, project: { deletedAt: new Date() } },
      })
    );

    await expect(service.delete(PHOTO_ID)).rejects.toThrow(ConstructionPhotoNotFoundError);
    expect(mockPrisma.constructionPhoto.delete).not.toHaveBeenCalled();
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it('アルバムの配下として指したときは、写真項目がそのアルバムに属さなければ 404 とし削除しない（Requirements: 13.2）', async () => {
    await expect(service.delete(PHOTO_ID, OTHER_ALBUM_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.delete).not.toHaveBeenCalled();
    expect(mockStorage.delete).not.toHaveBeenCalled();

    // 属するアルバムの配下として指したときは削除する
    await service.delete(PHOTO_ID, ALBUM_ID);
    expect(mockPrisma.constructionPhoto.delete).toHaveBeenCalledWith({ where: { id: PHOTO_ID } });
  });

  it('論理削除済みアルバム配下の写真は 404 とする', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      deletePhotoRow({
        album: { deletedAt: new Date(), project: { deletedAt: null } },
      })
    );
    await expect(service.delete(PHOTO_ID)).rejects.toThrow(ConstructionPhotoNotFoundError);
    expect(mockPrisma.constructionPhoto.delete).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Task 3.3: 印字画像（getPrintImage）— 看板合成はオンデマンド・保存しない
//
// Requirements:
// - 9.6: 看板ありは指定位置・大きさで写真へ重畳する（オンデマンド）
// - 9.7: 参照先の看板が削除済みなら看板なしとして扱い原本を返す
// - 10.8: 看板の登録内容を指定位置・大きさで重畳する
// - 10.9: 看板なしの写真は重畳なしで原本を返す
// - 13.2: 取り除かれたプロジェクトの写真は 404（担当者や admin ロールでの絞り込みは行わない）
// ============================================================================

const PRINT_PHOTO_ID = '723e4567-e89b-12d3-a456-426614174099';
const SIGNBOARD_ID = '823e4567-e89b-12d3-a456-426614174011';

const ORIGINAL_BUFFER = Buffer.from('original-image-bytes');
const COMPOSITED_BUFFER = Buffer.from('composited-jpeg-bytes');

/** getPrintImage 対象写真の読取形状 */
function printPhotoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRINT_PHOTO_ID,
    albumId: ALBUM_ID,
    originalPath: `construction-photos/${ALBUM_ID}/1_photo.jpg`,
    signboardId: null,
    signboardPlacement: null,
    album: { deletedAt: null, project: { deletedAt: null } },
    ...overrides,
  };
}

/** signboard レコードの読取形状 */
function signboardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SIGNBOARD_ID,
    projectId: PROJECT_ID,
    workName: '外壁改修工事',
    workLocation: '東京都千代田区',
    freeItems: [{ label: '施工者', value: '株式会社アークン' }],
    footerText: '施工状況',
    deletedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createPrintMockPrisma() {
  return {
    constructionPhoto: {
      findUnique: vi.fn().mockResolvedValue(printPhotoRow()),
    },
    constructionSignboard: {
      findUnique: vi.fn().mockResolvedValue(signboardRow()),
    },
    ...createAssigneeLookupSpies(),
  } as unknown as PrismaClient;
}

describe('ConstructionPhotoImageService.getPrintImage', () => {
  let service: ConstructionPhotoImageService;
  let mockPrisma: ReturnType<typeof createPrintMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let mockProcessor: ReturnType<typeof createMockProcessor>;
  let surveyImageService: SurveyImageService;
  let compositeService: SignboardCompositeService;
  let compositeSpy: ReturnType<typeof vi.fn>;

  const PLACEMENT = { left: 10, top: 20, width: 300, height: 200 };

  beforeEach(() => {
    mockPrisma = createPrintMockPrisma();
    mockStorage = createMockStorage();
    mockProcessor = createMockProcessor();
    (mockStorage.get as ReturnType<typeof vi.fn>).mockResolvedValue(ORIGINAL_BUFFER);
    surveyImageService = new SurveyImageService({
      prisma: mockPrisma as never,
      storageProvider: mockStorage as never,
    });

    // 合成サービスはスパイ化（実 sharp を呼ばない）
    compositeSpy = vi.fn().mockResolvedValue(COMPOSITED_BUFFER);
    compositeService = new SignboardCompositeService({
      sharp: (() => ({})) as never,
    });
    compositeService.composite = compositeSpy as never;

    const deps: ConstructionPhotoImageServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
      surveyImageService,
      imageProcessorService: mockProcessor as never,
      signboardCompositeService: compositeService,
    };
    service = new ConstructionPhotoImageService(deps);
  });

  it('(a) 看板あり写真は原本へ看板を重畳した画像を返す（Requirements: 9.6, 10.8）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: SIGNBOARD_ID, signboardPlacement: PLACEMENT })
    );

    const result = await service.getPrintImage(PRINT_PHOTO_ID);

    // 原本取得
    expect(mockStorage.get).toHaveBeenCalledWith(`construction-photos/${ALBUM_ID}/1_photo.jpg`);
    // 合成が原本バッファ＋看板DTO＋配置で呼ばれる
    expect(compositeSpy).toHaveBeenCalledTimes(1);
    const [buf, sb, placement] = compositeSpy.mock.calls[0]!;
    expect(buf).toEqual(ORIGINAL_BUFFER);
    expect(sb.workName).toBe('外壁改修工事');
    expect(placement).toEqual(PLACEMENT);
    // 合成結果を返す
    expect(result).toEqual(COMPOSITED_BUFFER);
    // 保存しない（オンデマンド）
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it('(b) 看板なし写真は原本をそのまま返し合成を呼ばない（Requirements: 10.9）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: null, signboardPlacement: null })
    );

    const result = await service.getPrintImage(PRINT_PHOTO_ID);

    expect(result).toEqual(ORIGINAL_BUFFER);
    expect(compositeSpy).not.toHaveBeenCalled();
    expect(mockPrisma.constructionSignboard.findUnique).not.toHaveBeenCalled();
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it('(c) 参照先の看板が削除済みなら看板なしとして原本を返す（Requirements: 9.7）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: SIGNBOARD_ID, signboardPlacement: PLACEMENT })
    );
    // 看板は論理削除済み
    (mockPrisma.constructionSignboard.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      signboardRow({ deletedAt: new Date() })
    );

    const result = await service.getPrintImage(PRINT_PHOTO_ID);

    expect(result).toEqual(ORIGINAL_BUFFER);
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('参照先の看板が存在しない（onDelete/物理削除）場合も原本を返す（Requirements: 9.7）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: SIGNBOARD_ID, signboardPlacement: PLACEMENT })
    );
    (mockPrisma.constructionSignboard.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const result = await service.getPrintImage(PRINT_PHOTO_ID);

    expect(result).toEqual(ORIGINAL_BUFFER);
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('看板IDはあるが配置が無い場合は原本を返す', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: SIGNBOARD_ID, signboardPlacement: null })
    );

    const result = await service.getPrintImage(PRINT_PHOTO_ID);

    expect(result).toEqual(ORIGINAL_BUFFER);
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('存在しない写真は 404 を投げる', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.getPrintImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
  });

  it('論理削除済みアルバム配下の写真は 404 を投げる', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({
        album: { deletedAt: new Date(), project: { deletedAt: null } },
      })
    );
    await expect(service.getPrintImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
  });

  it('(e) 担当者（作成者・営業担当・工事担当）や admin ロールを問い合わせずに印字画像を返す（Requirements: 13.2）', async () => {
    // 取得できる利用者はルートの RBAC 権限（construction_photo:read）が決める
    const result = await service.getPrintImage(PRINT_PHOTO_ID);

    expect(result).toEqual(ORIGINAL_BUFFER);
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('取り除かれた（論理削除済みの）プロジェクトの写真は 404 を投げ、原本取得も合成も行わない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({
        signboardId: SIGNBOARD_ID,
        signboardPlacement: PLACEMENT,
        album: { deletedAt: null, project: { deletedAt: new Date() } },
      })
    );

    await expect(service.getPrintImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockStorage.get).not.toHaveBeenCalled();
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('アルバムの配下として指したときは、写真項目がそのアルバムに属さなければ 404 を投げ、原本を読まない（Requirements: 13.2）', async () => {
    await expect(service.getPrintImage(PRINT_PHOTO_ID, OTHER_ALBUM_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockStorage.get).not.toHaveBeenCalled();

    // 属するアルバムの配下として指したときは返す
    await expect(service.getPrintImage(PRINT_PHOTO_ID, ALBUM_ID)).resolves.toEqual(ORIGINAL_BUFFER);
  });

  it('原本がストレージに存在しない場合は 404 を投げる', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: null, signboardPlacement: null })
    );
    (mockStorage.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.getPrintImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
  });
});

// ============================================================================
// Task 10.1: 非合成原本（getOriginalImage）— 看板配置の有無に関わらず看板を
// 合成しない生原本を返す（ビューア/ZIP用）
//
// Requirements:
// - 14.6: ビューアで表示する原本画像を必要時にのみ取得する
// - 15.4: 「アップロード原本そのまま」の看板重畳モードを成立させる
// - 13.2: 取り除かれたプロジェクトの写真は 404（担当者や admin ロールでの絞り込みは行わない）
// - 13.4: 画像は署名付きURLではなく、この専用エンドポイント経由でのみ配信する
// ============================================================================

describe('ConstructionPhotoImageService.getOriginalImage', () => {
  let service: ConstructionPhotoImageService;
  let mockPrisma: ReturnType<typeof createPrintMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let mockProcessor: ReturnType<typeof createMockProcessor>;
  let surveyImageService: SurveyImageService;
  let compositeService: SignboardCompositeService;
  let compositeSpy: ReturnType<typeof vi.fn>;

  const PLACEMENT = { left: 10, top: 20, width: 300, height: 200 };

  beforeEach(() => {
    mockPrisma = createPrintMockPrisma();
    mockStorage = createMockStorage();
    mockProcessor = createMockProcessor();
    (mockStorage.get as ReturnType<typeof vi.fn>).mockResolvedValue(ORIGINAL_BUFFER);
    surveyImageService = new SurveyImageService({
      prisma: mockPrisma as never,
      storageProvider: mockStorage as never,
    });

    // 合成サービスはスパイ化（getOriginalImage からは一切呼ばれないはず）
    compositeSpy = vi.fn().mockResolvedValue(COMPOSITED_BUFFER);
    compositeService = new SignboardCompositeService({
      sharp: (() => ({})) as never,
    });
    compositeService.composite = compositeSpy as never;

    const deps: ConstructionPhotoImageServiceDependencies = {
      prisma: mockPrisma,
      storageProvider: mockStorage as never,
      surveyImageService,
      imageProcessorService: mockProcessor as never,
      signboardCompositeService: compositeService,
    };
    service = new ConstructionPhotoImageService(deps);
  });

  it('(a) 看板未配置の写真は原本をそのまま返す（Requirements: 14.6, 15.4）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: null, signboardPlacement: null })
    );

    const result = await service.getOriginalImage(PRINT_PHOTO_ID);

    expect(mockStorage.get).toHaveBeenCalledWith(`construction-photos/${ALBUM_ID}/1_photo.jpg`);
    expect(result).toEqual(ORIGINAL_BUFFER);
    expect(compositeSpy).not.toHaveBeenCalled();
  });

  it('(b) 看板配置済みの写真でも合成せず原本をそのまま返す（Requirements: 14.6, 15.4）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: SIGNBOARD_ID, signboardPlacement: PLACEMENT })
    );

    const result = await service.getOriginalImage(PRINT_PHOTO_ID);

    expect(result).toEqual(ORIGINAL_BUFFER);
    // 看板配置があっても合成サービス・看板マスタ参照は一切行わない
    expect(compositeSpy).not.toHaveBeenCalled();
    expect(mockPrisma.constructionSignboard.findUnique).not.toHaveBeenCalled();
  });

  it('存在しない写真は 404 を投げる', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.getOriginalImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
  });

  it('論理削除済みアルバム配下の写真は 404 を投げる', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({
        album: { deletedAt: new Date(), project: { deletedAt: null } },
      })
    );
    await expect(service.getOriginalImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
  });

  it('(c) 担当者（作成者・営業担当・工事担当）や admin ロールを問い合わせずに原本を返す（Requirements: 13.2）', async () => {
    // 取得できる利用者はルートの RBAC 権限（construction_photo:read）が決める
    const result = await service.getOriginalImage(PRINT_PHOTO_ID);

    expect(result).toEqual(ORIGINAL_BUFFER);
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('取り除かれた（論理削除済みの）プロジェクトの写真は 404 を投げ、原本取得を行わない（Requirements: 13.2, 13.3）', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({
        album: { deletedAt: null, project: { deletedAt: new Date() } },
      })
    );

    await expect(service.getOriginalImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockStorage.get).not.toHaveBeenCalled();
  });

  it('アルバムの配下として指したときは、写真項目がそのアルバムに属さなければ 404 を投げ、原本を読まない（Requirements: 13.2）', async () => {
    await expect(service.getOriginalImage(PRINT_PHOTO_ID, OTHER_ALBUM_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockStorage.get).not.toHaveBeenCalled();

    // 属するアルバムの配下として指したときは返す
    await expect(service.getOriginalImage(PRINT_PHOTO_ID, ALBUM_ID)).resolves.toEqual(
      ORIGINAL_BUFFER
    );
  });

  it('原本がストレージに存在しない場合は 404 を投げる', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      printPhotoRow({ signboardId: null, signboardPlacement: null })
    );
    (mockStorage.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.getOriginalImage(PRINT_PHOTO_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-4.3
 * @requirement construction-photo/REQ-4.5
 * @requirement construction-photo/REQ-4.6
 * @requirement construction-photo/REQ-4.7
 * @requirement construction-photo/REQ-7.7
 * @requirement construction-photo/REQ-9.7
 * @requirement construction-photo/REQ-11.6
 * @requirement construction-photo/REQ-12.5
 */
