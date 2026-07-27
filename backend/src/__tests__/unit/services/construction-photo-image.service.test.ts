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
    delete: vi.fn(),
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
