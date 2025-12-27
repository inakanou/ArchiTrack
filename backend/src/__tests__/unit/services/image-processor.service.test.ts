/**
 * @fileoverview ImageProcessorServiceの単体テスト
 *
 * Task 4.2: 画像圧縮・サムネイル生成機能を実装する
 * - Sharpによる画像処理
 * - 300KB超過時の段階的圧縮（品質を10%ずつ下げながらリサイズ、250KB〜350KB範囲に収める）
 * - サムネイル生成（200x200px）
 * - 画像メタデータ（幅・高さ・サイズ）の取得
 *
 * Requirements:
 * - 4.4: 画像アップロード完了時にサムネイルを自動生成する
 * - 4.6: ファイルサイズが上限（300KB）を超える場合、画像サイズと品質を段階的に下げて
 *        250KB〜350KBの範囲に圧縮した上で登録する
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import {
  ImageProcessorService,
  type SharpInstance,
  type SharpStatic,
  ImageProcessingError,
} from '../../../services/image-processor.service.js';

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;
  let mockSharp: SharpStatic;
  let mockSharpInstance: SharpInstance;

  // テスト用の画像バッファを作成
  function createTestBuffer(size: number): Buffer {
    return Buffer.alloc(size);
  }

  beforeEach(() => {
    // モックのSharpインスタンスを作成
    mockSharpInstance = {
      metadata: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn(),
    };

    // モックのSharp関数を作成
    mockSharp = vi.fn().mockReturnValue(mockSharpInstance) as unknown as SharpStatic;

    service = new ImageProcessorService(mockSharp);
  });

  describe('getMetadata', () => {
    it('should extract metadata from JPEG image', async () => {
      const buffer = createTestBuffer(1000);
      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 1000,
      });

      const metadata = await service.getMetadata(buffer);

      expect(mockSharp).toHaveBeenCalledWith(buffer);
      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(metadata).toEqual({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 1000,
      });
    });

    it('should extract metadata from PNG image', async () => {
      const buffer = createTestBuffer(2000);
      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 800,
        height: 600,
        format: 'png',
        size: 2000,
      });

      const metadata = await service.getMetadata(buffer);

      expect(metadata).toEqual({
        width: 800,
        height: 600,
        format: 'png',
        size: 2000,
      });
    });

    it('should extract metadata from WebP image', async () => {
      const buffer = createTestBuffer(500);
      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 640,
        height: 480,
        format: 'webp',
        size: 500,
      });

      const metadata = await service.getMetadata(buffer);

      expect(metadata).toEqual({
        width: 640,
        height: 480,
        format: 'webp',
        size: 500,
      });
    });

    it('should throw ImageProcessingError when metadata extraction fails', async () => {
      const buffer = createTestBuffer(100);
      (mockSharpInstance.metadata as Mock).mockRejectedValue(new Error('Invalid image'));

      await expect(service.getMetadata(buffer)).rejects.toThrow(ImageProcessingError);
    });

    it('should throw ImageProcessingError for invalid image with missing dimensions', async () => {
      const buffer = createTestBuffer(100);
      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        format: 'jpeg',
        size: 100,
        // width and height are undefined
      });

      await expect(service.getMetadata(buffer)).rejects.toThrow(ImageProcessingError);
    });
  });

  describe('generateThumbnail (Requirements: 4.4)', () => {
    it('should generate 200x200 thumbnail', async () => {
      const buffer = createTestBuffer(1000);
      const thumbnailBuffer = createTestBuffer(500);

      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 1000,
      });
      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(thumbnailBuffer);

      const thumbnail = await service.generateThumbnail(buffer);

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(200, 200, {
        fit: 'cover',
        position: 'centre',
      });
      expect(thumbnail).toBe(thumbnailBuffer);
    });

    it('should generate thumbnail preserving original format for JPEG', async () => {
      const buffer = createTestBuffer(1000);
      const thumbnailBuffer = createTestBuffer(500);

      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 1000,
      });
      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(thumbnailBuffer);

      await service.generateThumbnail(buffer);

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should generate thumbnail preserving original format for PNG', async () => {
      const buffer = createTestBuffer(1000);
      const thumbnailBuffer = createTestBuffer(500);

      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 800,
        height: 600,
        format: 'png',
        size: 1000,
      });
      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(thumbnailBuffer);

      await service.generateThumbnail(buffer);

      // Quality 80 -> compressionLevel = Math.round(9 - (80/100) * 6) = 4
      expect(mockSharpInstance.png).toHaveBeenCalledWith({ compressionLevel: 4 });
    });

    it('should generate thumbnail preserving original format for WebP', async () => {
      const buffer = createTestBuffer(1000);
      const thumbnailBuffer = createTestBuffer(500);

      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 640,
        height: 480,
        format: 'webp',
        size: 1000,
      });
      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(thumbnailBuffer);

      await service.generateThumbnail(buffer);

      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should throw ImageProcessingError when thumbnail generation fails', async () => {
      const buffer = createTestBuffer(1000);

      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 1000,
      });
      (mockSharpInstance.toBuffer as Mock).mockRejectedValue(
        new Error('Thumbnail generation failed')
      );

      await expect(service.generateThumbnail(buffer)).rejects.toThrow(ImageProcessingError);
    });

    it('should use custom thumbnail size when provided', async () => {
      const buffer = createTestBuffer(1000);
      const thumbnailBuffer = createTestBuffer(300);

      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 1000,
      });
      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(thumbnailBuffer);

      await service.generateThumbnail(buffer, 100, 100);

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(100, 100, {
        fit: 'cover',
        position: 'centre',
      });
    });
  });

  describe('compressImage (Requirements: 4.6)', () => {
    describe('when image is under 300KB', () => {
      it('should return original buffer without compression', async () => {
        const buffer = createTestBuffer(200 * 1024); // 200KB

        (mockSharpInstance.metadata as Mock).mockResolvedValue({
          width: 800,
          height: 600,
          format: 'jpeg',
          size: 200 * 1024,
        });

        const result = await service.compressImage(buffer);

        expect(result.buffer).toBe(buffer);
        expect(result.wasCompressed).toBe(false);
      });

      it('should include original metadata for uncompressed image', async () => {
        const buffer = createTestBuffer(250 * 1024); // 250KB

        (mockSharpInstance.metadata as Mock).mockResolvedValue({
          width: 800,
          height: 600,
          format: 'jpeg',
          size: 250 * 1024,
        });

        const result = await service.compressImage(buffer);

        expect(result.metadata.width).toBe(800);
        expect(result.metadata.height).toBe(600);
        expect(result.wasCompressed).toBe(false);
      });
    });

    describe('when image is over 300KB', () => {
      it('should compress JPEG image by reducing quality', async () => {
        const originalBuffer = createTestBuffer(400 * 1024); // 400KB
        const compressedBuffer = createTestBuffer(280 * 1024); // 280KB (within 250-350KB)

        // First call for original metadata
        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 400 * 1024,
          })
          // Second call for compressed metadata
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 280 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

        const result = await service.compressImage(originalBuffer);

        expect(result.wasCompressed).toBe(true);
        expect(mockSharpInstance.jpeg).toHaveBeenCalled();
      });

      it('should reduce quality by 10% increments until target size is reached', async () => {
        const originalBuffer = createTestBuffer(500 * 1024); // 500KB
        const intermediateBuffer = createTestBuffer(380 * 1024); // 380KB (still over)
        const finalBuffer = createTestBuffer(300 * 1024); // 300KB (within range)

        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 500 * 1024,
          })
          // First compression attempt - still too large
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 380 * 1024,
          })
          // Second compression attempt - within range
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 300 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock)
          .mockResolvedValueOnce(intermediateBuffer)
          .mockResolvedValueOnce(finalBuffer);

        const result = await service.compressImage(originalBuffer);

        expect(result.wasCompressed).toBe(true);
        // jpeg should be called multiple times with decreasing quality
        expect(mockSharpInstance.jpeg).toHaveBeenCalledTimes(2);
      });

      it('should resize image if quality reduction alone is insufficient', async () => {
        const originalBuffer = createTestBuffer(800 * 1024); // 800KB - very large
        const stillLargeBuffer = createTestBuffer(500 * 1024); // 500KB - still over target
        const afterResize = createTestBuffer(300 * 1024); // 300KB - within target range

        // Mock metadata calls: original + 7 quality reductions (90->30) + resize
        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 800 * 1024,
          })
          // Quality 90 - still too large
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 700 * 1024,
          })
          // Quality 80 - still too large
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 650 * 1024,
          })
          // Quality 70 - still too large
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 600 * 1024,
          })
          // Quality 60 - still too large
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 550 * 1024,
          })
          // Quality 50 - still too large
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 520 * 1024,
          })
          // Quality 40 - still too large
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 500 * 1024,
          })
          // Quality 30 (min) - still too large, triggers resize
          .mockResolvedValueOnce({
            width: 4000,
            height: 3000,
            format: 'jpeg',
            size: 500 * 1024,
          })
          // After resize - within target range
          .mockResolvedValueOnce({
            width: 2000,
            height: 1500,
            format: 'jpeg',
            size: 300 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock)
          .mockResolvedValueOnce(stillLargeBuffer) // q90
          .mockResolvedValueOnce(stillLargeBuffer) // q80
          .mockResolvedValueOnce(stillLargeBuffer) // q70
          .mockResolvedValueOnce(stillLargeBuffer) // q60
          .mockResolvedValueOnce(stillLargeBuffer) // q50
          .mockResolvedValueOnce(stillLargeBuffer) // q40
          .mockResolvedValueOnce(stillLargeBuffer) // q30
          .mockResolvedValueOnce(afterResize); // after resize

        const result = await service.compressImage(originalBuffer);

        expect(result.wasCompressed).toBe(true);
        expect(mockSharpInstance.resize).toHaveBeenCalled();
      });

      it('should compress PNG image appropriately', async () => {
        const originalBuffer = createTestBuffer(400 * 1024);
        const compressedBuffer = createTestBuffer(280 * 1024);

        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'png',
            size: 400 * 1024,
          })
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'png',
            size: 280 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

        const result = await service.compressImage(originalBuffer);

        expect(result.wasCompressed).toBe(true);
        expect(mockSharpInstance.png).toHaveBeenCalled();
      });

      it('should compress WebP image appropriately', async () => {
        const originalBuffer = createTestBuffer(400 * 1024);
        const compressedBuffer = createTestBuffer(280 * 1024);

        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'webp',
            size: 400 * 1024,
          })
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'webp',
            size: 280 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

        const result = await service.compressImage(originalBuffer);

        expect(result.wasCompressed).toBe(true);
        expect(mockSharpInstance.webp).toHaveBeenCalled();
      });
    });

    describe('compression target range (250KB - 350KB)', () => {
      it('should accept result within 250KB-350KB range', async () => {
        const originalBuffer = createTestBuffer(400 * 1024);
        const compressedBuffer = createTestBuffer(300 * 1024); // 300KB - in range

        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 400 * 1024,
          })
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 300 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

        const result = await service.compressImage(originalBuffer);

        expect(result.metadata.size).toBe(300 * 1024);
        expect(result.wasCompressed).toBe(true);
      });

      it('should accept result at lower boundary (250KB)', async () => {
        const originalBuffer = createTestBuffer(400 * 1024);
        const compressedBuffer = createTestBuffer(250 * 1024);

        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 400 * 1024,
          })
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 250 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

        const result = await service.compressImage(originalBuffer);

        expect(result.metadata.size).toBe(250 * 1024);
      });

      it('should accept result at upper boundary (350KB)', async () => {
        const originalBuffer = createTestBuffer(400 * 1024);
        const compressedBuffer = createTestBuffer(350 * 1024);

        (mockSharpInstance.metadata as Mock)
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 400 * 1024,
          })
          .mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size: 350 * 1024,
          });

        (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

        const result = await service.compressImage(originalBuffer);

        expect(result.metadata.size).toBe(350 * 1024);
      });
    });

    describe('error handling', () => {
      it('should throw ImageProcessingError when compression fails', async () => {
        const buffer = createTestBuffer(400 * 1024);

        (mockSharpInstance.metadata as Mock).mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 400 * 1024,
        });
        (mockSharpInstance.toBuffer as Mock).mockRejectedValue(new Error('Compression failed'));

        await expect(service.compressImage(buffer)).rejects.toThrow(ImageProcessingError);
      });
    });
  });

  describe('processImage (combined processing)', () => {
    it('should process image and return both original and thumbnail', async () => {
      const buffer = createTestBuffer(200 * 1024); // Under 300KB
      const thumbnailBuffer = createTestBuffer(10 * 1024);

      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 200 * 1024,
      });
      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(thumbnailBuffer);

      const result = await service.processImage(buffer);

      expect(result.original.buffer).toBe(buffer);
      expect(result.original.wasCompressed).toBe(false);
      expect(result.thumbnail).toBe(thumbnailBuffer);
      expect(result.metadata.width).toBe(1920);
      expect(result.metadata.height).toBe(1080);
    });

    it('should compress and generate thumbnail for large images', async () => {
      const originalBuffer = createTestBuffer(400 * 1024);
      const compressedBuffer = createTestBuffer(280 * 1024);
      const thumbnailBuffer = createTestBuffer(10 * 1024);

      // Setup metadata mock - will be called multiple times:
      // 1. compressImage -> getMetadata (original)
      // 2. compressImage -> compression attempt -> getMetadata
      // 3. generateThumbnail -> getMetadata
      // 4. processImage -> final getMetadata
      (mockSharpInstance.metadata as Mock)
        // 1. Original metadata check in compressImage
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 400 * 1024,
        })
        // 2. After first compression attempt in compressImage (within target range)
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 280 * 1024,
        })
        // 3. generateThumbnail calls getMetadata
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 280 * 1024,
        })
        // 4. Final getMetadata call in processImage
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 280 * 1024,
        });

      (mockSharpInstance.toBuffer as Mock)
        .mockResolvedValueOnce(compressedBuffer) // compression result
        .mockResolvedValueOnce(thumbnailBuffer); // thumbnail result

      const result = await service.processImage(originalBuffer);

      expect(result.original.wasCompressed).toBe(true);
      expect(result.thumbnail).toBe(thumbnailBuffer);
    });
  });

  describe('constants', () => {
    it('should define correct size thresholds', () => {
      expect(ImageProcessorService.MAX_SIZE_BYTES).toBe(300 * 1024);
      expect(ImageProcessorService.TARGET_MIN_SIZE_BYTES).toBe(250 * 1024);
      expect(ImageProcessorService.TARGET_MAX_SIZE_BYTES).toBe(350 * 1024);
    });

    it('should define correct thumbnail dimensions', () => {
      expect(ImageProcessorService.THUMBNAIL_WIDTH).toBe(200);
      expect(ImageProcessorService.THUMBNAIL_HEIGHT).toBe(200);
    });

    it('should define quality reduction step', () => {
      expect(ImageProcessorService.QUALITY_STEP).toBe(10);
    });
  });

  describe('ImageProcessingError', () => {
    it('should create error with correct properties', () => {
      const error = new ImageProcessingError('Test error', 'TEST_CODE');

      expect(error.name).toBe('ImageProcessingError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
    });

    it('should include original error when provided', () => {
      const originalError = new Error('Original error');
      const error = new ImageProcessingError('Test error', 'TEST_CODE', originalError);

      expect(error.cause).toBe(originalError);
    });
  });

  describe('applyFormatSettings edge cases', () => {
    it('should handle unknown format as JPEG', async () => {
      const buffer = createTestBuffer(400 * 1024);
      const compressedBuffer = createTestBuffer(280 * 1024);

      (mockSharpInstance.metadata as Mock)
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'unknown-format',
          size: 400 * 1024,
        })
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'unknown-format',
          size: 280 * 1024,
        });

      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

      const result = await service.compressImage(buffer);

      expect(result.wasCompressed).toBe(true);
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();
    });

    it('should handle jpg format same as jpeg', async () => {
      const buffer = createTestBuffer(400 * 1024);
      const compressedBuffer = createTestBuffer(280 * 1024);

      (mockSharpInstance.metadata as Mock)
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'jpg',
          size: 400 * 1024,
        })
        .mockResolvedValueOnce({
          width: 1920,
          height: 1080,
          format: 'jpg',
          size: 280 * 1024,
        });

      (mockSharpInstance.toBuffer as Mock).mockResolvedValue(compressedBuffer);

      const result = await service.compressImage(buffer);

      expect(result.wasCompressed).toBe(true);
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();
    });
  });

  describe('getMetadata edge cases', () => {
    it('should handle missing format with fallback to unknown', async () => {
      const buffer = createTestBuffer(1000);
      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 800,
        height: 600,
        // format is undefined
        size: 1000,
      });

      const metadata = await service.getMetadata(buffer);

      expect(metadata.format).toBe('unknown');
    });

    it('should handle missing size with fallback to buffer length', async () => {
      const buffer = createTestBuffer(1000);
      (mockSharpInstance.metadata as Mock).mockResolvedValue({
        width: 800,
        height: 600,
        format: 'jpeg',
        // size is undefined
      });

      const metadata = await service.getMetadata(buffer);

      expect(metadata.size).toBe(1000);
    });

    it('should re-throw ImageProcessingError without wrapping', async () => {
      const buffer = createTestBuffer(100);
      const originalError = new ImageProcessingError('Original error', 'ORIGINAL_CODE');
      (mockSharpInstance.metadata as Mock).mockRejectedValue(originalError);

      await expect(service.getMetadata(buffer)).rejects.toThrow(originalError);
    });
  });

  describe('generateThumbnail edge cases', () => {
    it('should re-throw ImageProcessingError without wrapping', async () => {
      const buffer = createTestBuffer(1000);
      const originalError = new ImageProcessingError('Original error', 'ORIGINAL_CODE');
      (mockSharpInstance.metadata as Mock).mockRejectedValue(originalError);

      await expect(service.generateThumbnail(buffer)).rejects.toThrow(originalError);
    });

    it('should handle non-Error exceptions', async () => {
      const buffer = createTestBuffer(1000);
      (mockSharpInstance.metadata as Mock).mockRejectedValue('string error');

      await expect(service.generateThumbnail(buffer)).rejects.toThrow(ImageProcessingError);
    });
  });

  describe('compressImage edge cases', () => {
    it('should re-throw ImageProcessingError without wrapping', async () => {
      const buffer = createTestBuffer(400 * 1024);
      const originalError = new ImageProcessingError('Original error', 'ORIGINAL_CODE');
      (mockSharpInstance.metadata as Mock).mockRejectedValue(originalError);

      await expect(service.compressImage(buffer)).rejects.toThrow(originalError);
    });

    it('should handle non-Error exceptions', async () => {
      const buffer = createTestBuffer(400 * 1024);
      (mockSharpInstance.metadata as Mock).mockRejectedValue('string error');

      await expect(service.compressImage(buffer)).rejects.toThrow(ImageProcessingError);
    });
  });
});
