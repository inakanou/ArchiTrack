/**
 * @fileoverview ImageProcessorServiceの単体テスト
 *
 * Task 4.2: 画像圧縮・サムネイル生成機能を実装する
 * - Sharpによる画像処理
 * - 300KB超過時の段階的圧縮（品質を10%ずつ下げながらリサイズ、350KB以下で打ち切る）
 * - サムネイル生成（200x200px）
 * - 画像メタデータ（幅・高さ・サイズ）の取得
 *
 * Requirements:
 * - 4.4: 画像アップロード完了時にサムネイルを自動生成する
 * - 4.6: ファイルサイズが上限（300KB）を超える場合、画像サイズと品質を段階的に下げ、
 *        350KB以下に収まった時点で圧縮を打ち切って登録する
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
        expect(result.originalExceededSizeLimit).toBe(false);
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
        expect(result.originalExceededSizeLimit).toBe(false);
      });
    });

    describe('when image is over 300KB', () => {
      it('should compress JPEG image by reducing quality', async () => {
        const originalBuffer = createTestBuffer(400 * 1024); // 400KB
        const compressedBuffer = createTestBuffer(280 * 1024); // 280KB (350KB以下)

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

        expect(result.originalExceededSizeLimit).toBe(true);
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

        expect(result.originalExceededSizeLimit).toBe(true);
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

        expect(result.originalExceededSizeLimit).toBe(true);
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

        expect(result.originalExceededSizeLimit).toBe(true);
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

        expect(result.originalExceededSizeLimit).toBe(true);
        expect(mockSharpInstance.webp).toHaveBeenCalled();
      });
    });

    describe('compression stop condition (350KB以下で打ち切る)', () => {
      const KB = 1024;

      /**
       * 圧縮の各段階が返すサイズを順に与える
       *
       * 先頭が元画像のサイズ、以降が再エンコード1回ごとの結果サイズである。
       * 実装は再エンコードのたびに getMetadata を呼ぶため、この並びが
       * そのまま「何段階まで圧縮したか」を決める。
       *
       * 並びを使い切ったあとは最後のサイズを返し続ける。実装が打ち切りを
       * 誤って圧縮を続けた場合に、モックの枯渇による別種の失敗ではなく
       * 段階数そのものの主張で赤くするためである。
       *
       * @param sizes - 元画像サイズと各段階の結果サイズ
       */
      function giveCompressionStages(sizes: number[]): void {
        const mock = mockSharpInstance.metadata as Mock;
        for (const size of sizes) {
          mock.mockResolvedValueOnce({
            width: 1920,
            height: 1080,
            format: 'jpeg',
            size,
          });
        }
        mock.mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: sizes[sizes.length - 1],
        });
        (mockSharpInstance.toBuffer as Mock).mockImplementation(() =>
          Promise.resolve(createTestBuffer(1))
        );
      }

      it('打ち切りサイズを大きく下回っても、その結果をそのまま登録する', async () => {
        // 従前の検証は sharp をモックして 250KB〜350KB の値だけを与えており、
        // 打ち切りサイズを大きく下回る経路を一度も通していなかった。
        // 61,638 バイトは 2MB / 1920x1080 の JPEG をE2Eで実測した値である。
        const originalBuffer = createTestBuffer(2048 * KB);
        giveCompressionStages([2048 * KB, 61_638]);

        const result = await service.compressImage(originalBuffer);

        expect(result.originalExceededSizeLimit).toBe(true);
        expect(result.metadata.size, '打ち切りサイズを下回った結果が採用されていない').toBe(61_638);
        // 品質を上げ直す・拡大するといった「容量を増やし直す」段階が無いこと。
        expect(
          (mockSharpInstance.toBuffer as Mock).mock.calls.length,
          '350KB以下に収まったのに再エンコードが続いた'
        ).toBe(1);
        expect((mockSharpInstance.jpeg as Mock).mock.calls).toEqual([[{ quality: 90 }]]);
        expect(
          (mockSharpInstance.resize as Mock).mock.calls.length,
          '350KB以下に収まったのにリサイズが行われた'
        ).toBe(0);
      });

      it('ちょうど350KBに収まった時点で打ち切る', async () => {
        const originalBuffer = createTestBuffer(400 * KB);
        giveCompressionStages([400 * KB, 350 * KB]);

        const result = await service.compressImage(originalBuffer);

        expect(result.metadata.size).toBe(350 * KB);
        expect(
          (mockSharpInstance.toBuffer as Mock).mock.calls.length,
          'ちょうど350KBなのに再エンコードが続いた'
        ).toBe(1);
      });

      it('350KBを超える間は品質を10%ずつ下げ、収まった最初の段階で打ち切る', async () => {
        const originalBuffer = createTestBuffer(900 * KB);
        // 品質90 → 360KB（超過）、品質80 → 340KB（収まる）、以降は与えない
        giveCompressionStages([900 * KB, 360 * KB, 340 * KB]);

        const result = await service.compressImage(originalBuffer);

        expect(result.metadata.size).toBe(340 * KB);
        expect((mockSharpInstance.jpeg as Mock).mock.calls).toEqual([
          [{ quality: 90 }],
          [{ quality: 80 }],
        ]);
        expect(
          (mockSharpInstance.toBuffer as Mock).mock.calls.length,
          '収まった段階を越えて圧縮が続いた'
        ).toBe(2);
      });

      it('品質だけで収まらない場合は画像サイズも段階的に下げ、収まった時点で打ち切る', async () => {
        const originalBuffer = createTestBuffer(8192 * KB);
        // 品質90〜30 の7段階はいずれも超過し、続くリサイズ 1/2 でも超過、1/4 で収まる
        giveCompressionStages([
          8192 * KB,
          800 * KB,
          780 * KB,
          760 * KB,
          740 * KB,
          720 * KB,
          700 * KB,
          680 * KB,
          400 * KB,
          300 * KB,
        ]);

        const result = await service.compressImage(originalBuffer);

        expect(result.metadata.size).toBe(300 * KB);
        expect(result.metadata.size, '打ち切りサイズを超えたまま登録された').toBeLessThanOrEqual(
          ImageProcessorService.TARGET_MAX_SIZE_BYTES
        );
        expect((mockSharpInstance.jpeg as Mock).mock.calls.map((call) => call[0])).toEqual([
          { quality: 90 },
          { quality: 80 },
          { quality: 70 },
          { quality: 60 },
          { quality: 50 },
          { quality: 40 },
          { quality: 30 },
          { quality: 30 },
          { quality: 30 },
        ]);
        // リサイズは品質段階が尽きたあとにのみ、1/2 → 1/4 の順で適用される
        expect(
          (mockSharpInstance.resize as Mock).mock.calls.map((call) => [call[0], call[1]])
        ).toEqual([
          [960, 540],
          [480, 270],
        ]);
        expect(
          (mockSharpInstance.toBuffer as Mock).mock.calls.length,
          '収まった段階を越えて圧縮が続いた'
        ).toBe(9);
      });
    });

    describe('品質のループはリサイズを行わない (Task 115.171 (a))', () => {
      const KB = 1024;

      /**
       * 圧縮の各段階が返すサイズを順に与える（上の節と同じ仕掛け）
       *
       * @param sizes - 元画像サイズと各段階の結果サイズ
       */
      function giveCompressionStages(sizes: number[]): void {
        const mock = mockSharpInstance.metadata as Mock;
        for (const size of sizes) {
          mock.mockResolvedValueOnce({ width: 1920, height: 1080, format: 'jpeg', size });
        }
        mock.mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: sizes[sizes.length - 1],
        });
        (mockSharpInstance.toBuffer as Mock).mockImplementation(() =>
          Promise.resolve(createTestBuffer(1))
        );
      }

      it('品質段階が複数回まわってもリサイズは一度も行われない', async () => {
        // 撤去した `if (resizeRatio < 1.0)` は恒偽であり、逐語的に復元しても
        // 本テストは緑のままである。それが (a) の等価性そのものであって、
        // 本テストはその復元を検出しない。
        // 本テストが捉えるのは、品質のループへ新たにリサイズが混入した場合である
        // （実測: 無条件の `instance.resize(...)` を差し込むと赤くなる）。
        // 段階を複数回まわして 0 件を主張する。
        giveCompressionStages([900 * KB, 400 * KB, 380 * KB, 340 * KB]);

        await service.compressImage(createTestBuffer(900 * KB));

        expect((mockSharpInstance.jpeg as Mock).mock.calls.map((call) => call[0])).toEqual([
          { quality: 90 },
          { quality: 80 },
          { quality: 70 },
        ]);
        expect(
          (mockSharpInstance.resize as Mock).mock.calls,
          '品質のループがリサイズを行った'
        ).toEqual([]);
      });

      it('最初のリサイズは等倍ではなく 1/2 から始まる', async () => {
        // リサイズの初出は、品質段階を7回使い切ったあとの [960, 540] である。
        // 品質のループへリサイズが混入すると初出が等倍 [1920, 1080] へ変わり赤くなる。
        // 撤去した恒偽の分岐の逐語復元では本体に入らないため、本テストは緑のままである。
        giveCompressionStages([
          8192 * KB,
          800 * KB,
          780 * KB,
          760 * KB,
          740 * KB,
          720 * KB,
          700 * KB,
          680 * KB,
          300 * KB,
        ]);

        await service.compressImage(createTestBuffer(8192 * KB));

        const resizeCalls = (mockSharpInstance.resize as Mock).mock.calls.map((call) => [
          call[0],
          call[1],
        ]);
        expect(
          resizeCalls,
          'リサイズの初出が 1/2 でない（品質のループへリサイズが混入している）'
        ).toEqual([[960, 540]]);
      });
    });

    describe('返り値 originalExceededSizeLimit の意味 (Task 115.171 (b))', () => {
      const KB = 1024;

      it('300KB超〜350KB以下は再エンコードを一度も行わず、入力そのものを返す', async () => {
        // 従前の呼称 `wasCompressed` が実態を表していなかった区間。
        // 打ち切りサイズ（350KB）を既に満たすため圧縮のループが一度も回らない。
        const buffer = createTestBuffer(320 * KB);
        (mockSharpInstance.metadata as Mock).mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 320 * KB,
        });

        const result = await service.compressImage(buffer);

        expect(result.originalExceededSizeLimit, '300KB超なのに経路を通っていない').toBe(true);
        expect(result.buffer, '再エンコードしていないのに別のバッファを返した').toBe(buffer);
        expect(
          (mockSharpInstance.toBuffer as Mock).mock.calls.length,
          '350KB以下なのに再エンコードが行われた'
        ).toBe(0);
        expect((mockSharpInstance.resize as Mock).mock.calls.length).toBe(0);
        expect((mockSharpInstance.jpeg as Mock).mock.calls.length).toBe(0);
      });

      it('300KBちょうどは経路を通らず false を返す', async () => {
        const buffer = createTestBuffer(300 * KB);
        (mockSharpInstance.metadata as Mock).mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 300 * KB,
        });

        const result = await service.compressImage(buffer);

        expect(result.originalExceededSizeLimit).toBe(false);
        expect(result.buffer).toBe(buffer);
        expect((mockSharpInstance.toBuffer as Mock).mock.calls.length).toBe(0);
      });

      it('300KB+1バイトから経路を通り true になる', async () => {
        const buffer = createTestBuffer(300 * KB + 1);
        (mockSharpInstance.metadata as Mock).mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: 300 * KB + 1,
        });

        const result = await service.compressImage(buffer);

        expect(result.originalExceededSizeLimit).toBe(true);
        expect(result.buffer).toBe(buffer);
      });

      it('品質もリサイズも尽きて350KBを超えたままでも true を返す', async () => {
        // `true` は「打ち切りサイズ以下に収まった」ことを意味しない、という但し書きの実測。
        const over = 800 * KB;
        (mockSharpInstance.metadata as Mock).mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          size: over,
        });
        (mockSharpInstance.toBuffer as Mock).mockImplementation(() =>
          Promise.resolve(createTestBuffer(1))
        );

        const result = await service.compressImage(createTestBuffer(over));

        expect(result.originalExceededSizeLimit).toBe(true);
        expect(
          result.metadata.size,
          '打ち切りサイズを超えたまま返っていない（前提が崩れている）'
        ).toBeGreaterThan(ImageProcessorService.TARGET_MAX_SIZE_BYTES);
        // 品質7段階 + リサイズ2段階を使い切る
        expect((mockSharpInstance.toBuffer as Mock).mock.calls.length).toBe(9);
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
      expect(result.original.originalExceededSizeLimit).toBe(false);
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

      expect(result.original.originalExceededSizeLimit).toBe(true);
      expect(result.thumbnail).toBe(thumbnailBuffer);
    });
  });

  describe('constants', () => {
    it('should define correct size thresholds', () => {
      expect(ImageProcessorService.MAX_SIZE_BYTES).toBe(300 * 1024);
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

      expect(result.originalExceededSizeLimit).toBe(true);
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

      expect(result.originalExceededSizeLimit).toBe(true);
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

/**
 * サムネイルの出力形式の指定（Task 115.18）
 *
 * 保存キーの拡張子と Content-Type を特定の形式で申告する呼び出し元があるため、
 * 生成する実体の形式を申告へ合わせられる必要がある。
 * ここでは実体の形式を確かめる必要があるため、モックではなく実 sharp を用いる。
 */
describe('ImageProcessorService: サムネイルの出力形式（実 sharp / Task 115.18）', () => {
  /**
   * 実 sharp を結線した ImageProcessorService を組み立てる
   */
  async function createRealService(): Promise<ImageProcessorService> {
    const sharp = (await import('sharp')).default;
    return new ImageProcessorService(((input: Buffer) => sharp(input)) as unknown as SharpStatic);
  }

  /**
   * 指定形式の実画像を生成する
   */
  async function createImage(format: 'png' | 'webp' | 'jpeg'): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    const base = sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 12, g: 34, b: 56 } },
    });
    if (format === 'png') return await base.png().toBuffer();
    if (format === 'webp') return await base.webp().toBuffer();
    return await base.jpeg().toBuffer();
  }

  /**
   * バッファの実体の形式を読み出す
   */
  async function detectFormat(buffer: Buffer): Promise<string | undefined> {
    const sharp = (await import('sharp')).default;
    return (await sharp(buffer).metadata()).format;
  }

  it('出力形式に jpeg を指定すると、元がPNGでも実体はJPEGになる', async () => {
    const service = await createRealService();
    const source = await createImage('png');
    expect(await detectFormat(source), '前提: 元画像はPNGである').toBe('png');

    const thumbnail = await service.generateThumbnail(source, 200, 200, {
      outputFormat: 'jpeg',
    });

    expect(await detectFormat(thumbnail), 'jpeg指定時の実体はJPEGである').toBe('jpeg');
  });

  it('出力形式に jpeg を指定すると、元がWebPでも実体はJPEGになる', async () => {
    const service = await createRealService();
    const source = await createImage('webp');
    expect(await detectFormat(source), '前提: 元画像はWebPである').toBe('webp');

    const thumbnail = await service.generateThumbnail(source, 200, 200, {
      outputFormat: 'jpeg',
    });

    expect(await detectFormat(thumbnail), 'jpeg指定時の実体はJPEGである').toBe('jpeg');
  });

  it('出力形式を指定しない場合は元画像の形式を保つ（アップロード時の素のサムネイル）', async () => {
    const service = await createRealService();
    const source = await createImage('png');

    const thumbnail = await service.generateThumbnail(source);

    expect(await detectFormat(thumbnail), '未指定時は元の形式を保つ').toBe('png');
  });
});
