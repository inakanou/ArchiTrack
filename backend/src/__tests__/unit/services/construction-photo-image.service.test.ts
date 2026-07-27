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
import type { PrismaClient } from '../../../generated/prisma/client.js';

const ALBUM_ID = '123e4567-e89b-12d3-a456-426614174000';

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
      findUnique: vi.fn().mockResolvedValue({ id: ALBUM_ID, deletedAt: null }),
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
        wasCompressed: true,
      },
      thumbnail: Buffer.from('thumbnail-bytes'),
      metadata: { width: 800, height: 600, size: 250 * 1024, format: 'jpeg' },
    }),
    getMetadata: vi.fn(),
    generateThumbnail: vi.fn(),
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
    });
    await expect(service.addFromUpload(ALBUM_ID, [jpegFile('a.jpg')])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
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
    fileName: 'survey.jpg',
    fileSize: 111111,
    width: 1024,
    height: 768,
    survey: { projectId: PROJECT_ID },
    ...overrides,
  };
}

function createSurveyMockPrisma() {
  return {
    constructionPhotoAlbum: {
      findUnique: vi.fn().mockResolvedValue({
        id: ALBUM_ID,
        deletedAt: null,
        projectId: PROJECT_ID,
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
    });
    await expect(service.addFromSurveyImage(ALBUM_ID, [SURVEY_IMAGE_ID_1])).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
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
// - 13.2: 取得対象がユーザーのアクセス可能なプロジェクト配下であることを検証（他プロジェクトは404）
// ============================================================================

const LIST_USER_ID = '523e4567-e89b-12d3-a456-426614174010';

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
        projectId: PROJECT_ID,
      }),
    },
    constructionPhoto: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // プロジェクト境界検証（13.2）用: 既定はリクエストユーザーが作成者 → アクセス可
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        deletedAt: null,
        createdById: LIST_USER_ID,
        salesPersonId: 'someone-else',
        constructionPersonId: null,
      }),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
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
    await expect(service.listWithUrls(ALBUM_ID, LIST_USER_ID)).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('論理削除済みアルバムの一覧取得は NotFound を投げる', async () => {
    (mockPrisma.constructionPhotoAlbum.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ALBUM_ID,
      deletedAt: new Date(),
      projectId: PROJECT_ID,
    });
    await expect(service.listWithUrls(ALBUM_ID, LIST_USER_ID)).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
  });

  it('(a) displayOrder 昇順で全写真項目を返す（Requirements: 7.8）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({ id: 'p1', displayOrder: 1 }),
      listPhotoRow({ id: 'p2', displayOrder: 2 }),
      listPhotoRow({ id: 'p3', displayOrder: 3 }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID, LIST_USER_ID);

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

    const result = await service.listWithUrls(ALBUM_ID, LIST_USER_ID);

    expect(result).toEqual([]);
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('(b) 署名URLはまとめて生成され写真ごとの個別DB取得を発生させない（N+1回避, Requirements: 11.2）', async () => {
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({ id: 'p1', displayOrder: 1 }),
      listPhotoRow({ id: 'p2', displayOrder: 2 }),
      listPhotoRow({ id: 'p3', displayOrder: 3 }),
    ]);

    await service.listWithUrls(ALBUM_ID, LIST_USER_ID);

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

    const result = await service.listWithUrls(ALBUM_ID, LIST_USER_ID);
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

    const result = await service.listWithUrls(ALBUM_ID, LIST_USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.thumbnailUrl).toBeNull();
  });

  it('(d) ユーザーがアクセスできないプロジェクト（他プロジェクト）のアルバムは 404 とする（Requirements: 13.2）', async () => {
    // アルバムは存在するが、リクエストユーザーは当該プロジェクトの関係者でなく admin でもない
    (mockPrisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PROJECT_ID,
      deletedAt: null,
      createdById: 'other-user',
      salesPersonId: 'another-user',
      constructionPersonId: null,
    });
    (mockPrisma.userRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(service.listWithUrls(ALBUM_ID, LIST_USER_ID)).rejects.toThrow(
      ConstructionPhotoAlbumNotFoundError
    );
    // 境界外は写真取得を一切行わない
    expect(mockPrisma.constructionPhoto.findMany).not.toHaveBeenCalled();
  });

  it('admin ロールのユーザーは関係者でなくても一覧取得できる（Requirements: 13.2）', async () => {
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
    (mockPrisma.constructionPhoto.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      listPhotoRow({ id: 'p1' }),
    ]);

    const result = await service.listWithUrls(ALBUM_ID, LIST_USER_ID);
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// Task 2.5: 写真項目の削除（delete）
//
// Requirements:
// - 7.7: 写真項目と関連する看板配置データを削除する（配置は行のカラムのため行削除で消える）
// - 9.5: 保持のみ（削除では合成物は存在しない=オンデマンドのため）
// - 13.2: 対象アルバムがアクセス可能なプロジェクト配下であることを検証（他プロジェクトは404）
// ============================================================================

const DELETE_USER_ID = '523e4567-e89b-12d3-a456-426614174010';
const PHOTO_ID = '623e4567-e89b-12d3-a456-426614174099';

/** delete 対象写真の読取形状（album.projectId/deletedAt 同梱） */
function deletePhotoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PHOTO_ID,
    originalPath: `construction-photos/${ALBUM_ID}/1_photo.jpg`,
    thumbnailPath: `construction-photos/${ALBUM_ID}/1_thumb_photo.jpg`,
    album: { projectId: PROJECT_ID, deletedAt: null },
    ...overrides,
  };
}

function createDeleteMockPrisma() {
  return {
    constructionPhoto: {
      findUnique: vi.fn().mockResolvedValue(deletePhotoRow()),
      delete: vi.fn().mockResolvedValue(deletePhotoRow()),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        deletedAt: null,
        createdById: DELETE_USER_ID,
        salesPersonId: 'someone-else',
        constructionPersonId: null,
      }),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
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
    await expect(service.delete(PHOTO_ID, DELETE_USER_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.delete).not.toHaveBeenCalled();
  });

  it('(d) 写真行を削除し original/thumbnail のストレージも削除する（Requirements: 7.7）', async () => {
    await service.delete(PHOTO_ID, DELETE_USER_ID);

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
    await expect(service.delete(PHOTO_ID, DELETE_USER_ID)).resolves.toBeUndefined();
    expect(mockPrisma.constructionPhoto.delete).toHaveBeenCalledWith({ where: { id: PHOTO_ID } });
  });

  it('(f) アクセスできないプロジェクトの写真は 404 とし削除しない（Requirements: 13.2）', async () => {
    (mockPrisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PROJECT_ID,
      deletedAt: null,
      createdById: 'other-user',
      salesPersonId: 'another-user',
      constructionPersonId: null,
    });
    (mockPrisma.userRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(service.delete(PHOTO_ID, DELETE_USER_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.delete).not.toHaveBeenCalled();
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it('論理削除済みアルバム配下の写真は 404 とする', async () => {
    (mockPrisma.constructionPhoto.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      deletePhotoRow({ album: { projectId: PROJECT_ID, deletedAt: new Date() } })
    );
    await expect(service.delete(PHOTO_ID, DELETE_USER_ID)).rejects.toThrow(
      ConstructionPhotoNotFoundError
    );
    expect(mockPrisma.constructionPhoto.delete).not.toHaveBeenCalled();
  });
});
