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
