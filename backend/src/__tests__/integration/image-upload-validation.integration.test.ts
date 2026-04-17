/**
 * @fileoverview 画像アップロードバリデーション統合テスト
 *
 * Task 49: 統合テスト・E2Eテストで回帰防止を確認する
 *
 * Requirements coverage:
 * - 19.1: JPEG先頭3バイト（FF D8 FF）でJPEG形式を判定する
 * - 19.2: ICCプロファイル付きJPEG（4バイト目0xE2）を正常に受け付けて保存する
 * - 19.7: 先頭3バイトがFF D8 FFでないファイルをJPEGとして認識せず拒否する
 * - 19.10: バッチアップロードでエラー情報を含む結果を返却する
 * - 19.12: 部分成功時に成功結果とエラー情報の両方を返却する
 * - 19.16: 全件正常アップロード時にエラーメッセージを表示しない
 *
 * テスト方針:
 * - SurveyImageService.validateFile() によるマジックバイト判定
 * - ImageUploadService.uploadBatch() による部分成功/部分失敗の結果構造
 * - 実際のバイナリデータを使用して回帰テストとする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SurveyImageService,
  UnsupportedImageFormatError,
} from '../../services/survey-image.service.js';
import { ImageUploadService, type BatchUploadResult } from '../../services/image-upload.service.js';
import type { UploadFile } from '../../services/survey-image.service.js';

// Prismaモック
const mockPrisma = {
  siteSurvey: {
    findUnique: vi.fn(),
  },
  surveyImage: {
    create: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
};

// StorageProviderモック
const mockStorageProvider = {
  type: 'local' as const,
  upload: vi.fn().mockResolvedValue(undefined),
  download: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
  getSignedUrl: vi.fn(),
};

// ImageProcessorServiceモック
const mockImageProcessorService = {
  processImage: vi.fn().mockResolvedValue({
    original: {
      buffer: Buffer.from('processed'),
      metadata: { width: 800, height: 600, size: 1024, format: 'jpeg' },
      wasCompressed: false,
    },
    thumbnail: Buffer.from('thumbnail'),
    metadata: { width: 800, height: 600, size: 1024, format: 'jpeg' },
  }),
  getMetadata: vi.fn(),
  generateThumbnail: vi.fn(),
};

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class PutObjectCommand {
    constructor(public params: unknown) {}
  },
}));

describe('画像アップロードバリデーション統合テスト (Task 49)', () => {
  let surveyImageService: SurveyImageService;
  let imageUploadService: ImageUploadService;

  const SURVEY_ID = '123e4567-e89b-12d3-a456-426614174000';

  /**
   * テスト用バッファを生成するヘルパー
   */
  function createBuffer(bytes: number[], size: number = 100): Buffer {
    const buffer = Buffer.alloc(size);
    bytes.forEach((byte, index) => {
      buffer[index] = byte;
    });
    return buffer;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    surveyImageService = new SurveyImageService({
      prisma: mockPrisma as never,
      storageProvider: mockStorageProvider as never,
    });

    imageUploadService = new ImageUploadService({
      prisma: mockPrisma as never,
      storageProvider: mockStorageProvider as never,
      surveyImageService,
      imageProcessorService: mockImageProcessorService as never,
    });

    // デフォルト: 現場調査が存在する
    mockPrisma.siteSurvey.findUnique.mockResolvedValue({
      id: SURVEY_ID,
      deletedAt: null,
    });
    mockPrisma.surveyImage.count.mockResolvedValue(0);
  });

  describe('Requirement 19.1, 19.2: ICCプロファイル付きJPEG（4バイト目0xE2）のアップロード', () => {
    it('ICCプロファイル付きJPEG（FF D8 FF E2）がvalidateFileで正常に受け付けられること', () => {
      const iccJpegBuffer = createBuffer([0xff, 0xd8, 0xff, 0xe2]);

      const detectedMimeType = surveyImageService.validateFile({
        buffer: iccJpegBuffer,
        mimetype: 'image/jpeg',
        originalname: 'icc-profile.jpg',
        size: iccJpegBuffer.length,
      });

      expect(detectedMimeType).toBe('image/jpeg');
    });

    it('ICCプロファイル付きJPEGのバッチアップロードが成功結果を返却すること', async () => {
      const iccJpegBuffer = createBuffer([0xff, 0xd8, 0xff, 0xe2]);

      mockPrisma.surveyImage.create.mockResolvedValue({
        id: 'img-icc-1',
        surveyId: SURVEY_ID,
        fileName: 'icc-profile.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 1,
        originalPath: 'surveys/test/icc-profile.jpg',
        thumbnailPath: 'surveys/test/thumb_icc-profile.jpg',
        createdAt: new Date(),
      });

      const result: BatchUploadResult = await imageUploadService.uploadBatch(SURVEY_ID, [
        {
          buffer: iccJpegBuffer,
          mimetype: 'image/jpeg',
          originalname: 'icc-profile.jpg',
          size: iccJpegBuffer.length,
        },
      ]);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
      expect(result.successful[0]!.fileName).toContain('icc');
    });
  });

  describe('Requirement 19.7: 不正マジックバイトのファイル拒否', () => {
    it('先頭3バイトがFF D8 FFでないファイルがvalidateFileで拒否されること', () => {
      // GIFのマジックバイト（GIF89a）
      const gifBuffer = createBuffer([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

      expect(() => {
        surveyImageService.validateFile({
          buffer: gifBuffer,
          mimetype: 'image/gif',
          originalname: 'test.gif',
          size: gifBuffer.length,
        });
      }).toThrow(UnsupportedImageFormatError);
    });

    it('ランダムバイトのファイルがvalidateFileで拒否されること', () => {
      const randomBuffer = createBuffer([0x00, 0x01, 0x02, 0x03]);

      expect(() => {
        surveyImageService.validateFile({
          buffer: randomBuffer,
          mimetype: 'application/octet-stream',
          originalname: 'random.bin',
          size: randomBuffer.length,
        });
      }).toThrow(UnsupportedImageFormatError);
    });

    it('空バッファがvalidateFileで拒否されること', () => {
      const emptyBuffer = Buffer.alloc(0);

      expect(() => {
        surveyImageService.validateFile({
          buffer: emptyBuffer,
          mimetype: 'image/jpeg',
          originalname: 'empty.jpg',
          size: 0,
        });
      }).toThrow(UnsupportedImageFormatError);
    });

    it('不正マジックバイトのファイルがバッチアップロードで失敗結果を返却すること', async () => {
      const gifBuffer = createBuffer([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

      const result: BatchUploadResult = await imageUploadService.uploadBatch(SURVEY_ID, [
        {
          buffer: gifBuffer,
          mimetype: 'image/gif',
          originalname: 'test.gif',
          size: gifBuffer.length,
        },
      ]);

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.fileName).toBe('test.gif');
      expect(result.failed[0]!.error).toContain('サポートされていない画像形式');
    });
  });

  describe('Requirement 19.10, 19.12: 混在ファイルのバッチアップロードで部分成功結果の返却', () => {
    it('有効なJPEGと無効なGIFの混在バッチで部分成功結果を返却すること', async () => {
      const validJpegBuffer = createBuffer([0xff, 0xd8, 0xff, 0xe0]); // JFIF JPEG
      const invalidGifBuffer = createBuffer([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF
      const validPngBuffer = createBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG

      mockPrisma.surveyImage.create
        .mockResolvedValueOnce({
          id: 'img-1',
          surveyId: SURVEY_ID,
          fileName: 'valid.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/test/valid.jpg',
          thumbnailPath: 'surveys/test/thumb_valid.jpg',
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'img-2',
          surveyId: SURVEY_ID,
          fileName: 'valid.png',
          fileSize: 2048,
          width: 1024,
          height: 768,
          displayOrder: 3,
          originalPath: 'surveys/test/valid.png',
          thumbnailPath: 'surveys/test/thumb_valid.png',
          createdAt: new Date(),
        });

      const files: UploadFile[] = [
        {
          buffer: validJpegBuffer,
          mimetype: 'image/jpeg',
          originalname: 'valid.jpg',
          size: validJpegBuffer.length,
        },
        {
          buffer: invalidGifBuffer,
          mimetype: 'image/gif',
          originalname: 'invalid.gif',
          size: invalidGifBuffer.length,
        },
        {
          buffer: validPngBuffer,
          mimetype: 'image/png',
          originalname: 'valid.png',
          size: validPngBuffer.length,
        },
      ];

      const result: BatchUploadResult = await imageUploadService.uploadBatch(SURVEY_ID, files);

      // 部分成功: 2件成功、1件失敗
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);

      // 成功結果の検証
      expect(result.successful[0]!.fileName).toContain('valid');
      expect(result.successful[1]!.fileName).toContain('valid');

      // 失敗結果の検証
      expect(result.failed[0]!.fileName).toBe('invalid.gif');
      expect(result.failed[0]!.error).toBeTruthy();
    });

    it('複数の無効ファイル混在時にも各ファイルのエラー情報が正しく返却されること', async () => {
      const validJpegBuffer = createBuffer([0xff, 0xd8, 0xff, 0xe2]); // ICC JPEG
      const invalidBmpBuffer = createBuffer([0x42, 0x4d]); // BMP
      const invalidTiffBuffer = createBuffer([0x49, 0x49, 0x2a, 0x00]); // TIFF

      mockPrisma.surveyImage.create.mockResolvedValueOnce({
        id: 'img-1',
        surveyId: SURVEY_ID,
        fileName: 'icc-profile.jpg',
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: 1,
        originalPath: 'surveys/test/icc-profile.jpg',
        thumbnailPath: 'surveys/test/thumb_icc-profile.jpg',
        createdAt: new Date(),
      });

      const files: UploadFile[] = [
        {
          buffer: validJpegBuffer,
          mimetype: 'image/jpeg',
          originalname: 'icc-profile.jpg',
          size: validJpegBuffer.length,
        },
        {
          buffer: invalidBmpBuffer,
          mimetype: 'image/bmp',
          originalname: 'photo.bmp',
          size: invalidBmpBuffer.length,
        },
        {
          buffer: invalidTiffBuffer,
          mimetype: 'image/tiff',
          originalname: 'scan.tiff',
          size: invalidTiffBuffer.length,
        },
      ];

      const result: BatchUploadResult = await imageUploadService.uploadBatch(SURVEY_ID, files);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0]!.fileName).toBe('photo.bmp');
      expect(result.failed[1]!.fileName).toBe('scan.tiff');
    });
  });

  describe('Requirement 19.16: 全件成功時のレスポンス構造', () => {
    it('全件成功時にfailedが空配列であること', async () => {
      const jpegBuffer = createBuffer([0xff, 0xd8, 0xff, 0xe0]);
      const pngBuffer = createBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const webpBuffer = createBuffer([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);

      mockPrisma.surveyImage.create
        .mockResolvedValueOnce({
          id: 'img-1',
          surveyId: SURVEY_ID,
          fileName: 'photo.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/test/photo.jpg',
          thumbnailPath: 'surveys/test/thumb_photo.jpg',
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'img-2',
          surveyId: SURVEY_ID,
          fileName: 'photo.png',
          fileSize: 2048,
          width: 1024,
          height: 768,
          displayOrder: 2,
          originalPath: 'surveys/test/photo.png',
          thumbnailPath: 'surveys/test/thumb_photo.png',
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'img-3',
          surveyId: SURVEY_ID,
          fileName: 'photo.webp',
          fileSize: 512,
          width: 640,
          height: 480,
          displayOrder: 3,
          originalPath: 'surveys/test/photo.webp',
          thumbnailPath: 'surveys/test/thumb_photo.webp',
          createdAt: new Date(),
        });

      const files: UploadFile[] = [
        {
          buffer: jpegBuffer,
          mimetype: 'image/jpeg',
          originalname: 'photo.jpg',
          size: jpegBuffer.length,
        },
        {
          buffer: pngBuffer,
          mimetype: 'image/png',
          originalname: 'photo.png',
          size: pngBuffer.length,
        },
        {
          buffer: webpBuffer,
          mimetype: 'image/webp',
          originalname: 'photo.webp',
          size: webpBuffer.length,
        },
      ];

      const result: BatchUploadResult = await imageUploadService.uploadBatch(SURVEY_ID, files);

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      // 各結果にidが含まれること
      result.successful.forEach((item) => {
        expect(item.id).toBeTruthy();
        expect(item.surveyId).toBe(SURVEY_ID);
      });
    });
  });

  describe('JPEG 4バイト目バリエーションの回帰テスト', () => {
    const jpegVariants: Array<{ name: string; fourthByte: number }> = [
      { name: 'JFIF (0xE0)', fourthByte: 0xe0 },
      { name: 'EXIF (0xE1)', fourthByte: 0xe1 },
      { name: 'ICC Profile (0xE2)', fourthByte: 0xe2 },
      { name: 'SOS marker (0xDA)', fourthByte: 0xda },
      { name: 'DQT marker (0xDB)', fourthByte: 0xdb },
      { name: 'COM marker (0xFE)', fourthByte: 0xfe },
      { name: 'APP3 (0xE3)', fourthByte: 0xe3 },
      { name: 'APP14 (0xEE)', fourthByte: 0xee },
    ];

    for (const variant of jpegVariants) {
      it(`${variant.name} JPEG（4バイト目 0x${variant.fourthByte.toString(16).toUpperCase()}）がvalidateFileで受け付けられること`, () => {
        const buffer = createBuffer([0xff, 0xd8, 0xff, variant.fourthByte]);

        const detectedMimeType = surveyImageService.validateFile({
          buffer,
          mimetype: 'image/jpeg',
          originalname: `test-${variant.name}.jpg`,
          size: buffer.length,
        });

        expect(detectedMimeType).toBe('image/jpeg');
      });
    }
  });
});
