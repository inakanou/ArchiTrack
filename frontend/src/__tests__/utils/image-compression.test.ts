/**
 * @fileoverview compressImageForUpload / compressImagesForUpload のテスト
 *
 * アップロード前の事前圧縮ユーティリティの契約を検証する。
 * - 非対応MIMEタイプは元ファイルをそのまま返す
 * - ブラウザAPI非対応環境では元ファイルをそのまま返す
 * - 大きな画像は縮小・再エンコードされる
 * - 圧縮後に逆にサイズが増える場合は元ファイルを返す
 * - 十分に小さい画像は再エンコードしない
 * - デコード失敗時は元ファイルへフォールバックする
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressImageForUpload, compressImagesForUpload } from '../../utils/image-compression';

// 指定バイト数のダミー画像ファイルを生成する
function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type, lastModified: 1700000000000 });
}

describe('compressImageForUpload', () => {
  const originalCreateImageBitmap = (globalThis as { createImageBitmap?: typeof createImageBitmap })
    .createImageBitmap;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;

  afterEach(() => {
    (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap =
      originalCreateImageBitmap;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    vi.restoreAllMocks();
  });

  it('圧縮対象外のMIMEタイプは元ファイルをそのまま返す', async () => {
    const file = makeFile('doc.pdf', 'application/pdf', 5_000_000);
    const result = await compressImageForUpload(file);
    expect(result).toBe(file);
  });

  it('ブラウザの圧縮APIが非対応の場合は元ファイルをそのまま返す', async () => {
    // createImageBitmap を未定義にして非対応環境を再現
    (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap =
      undefined as unknown as typeof createImageBitmap;

    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);
    const result = await compressImageForUpload(file);
    expect(result).toBe(file);
  });

  describe('圧縮APIが利用可能な場合', () => {
    let toBlobSize: number;

    beforeEach(() => {
      // 大きな画像としてデコードされるようにモック
      (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap = vi
        .fn()
        .mockResolvedValue({
          width: 4000,
          height: 3000,
          close: vi.fn(),
        } as unknown as ImageBitmap);

      HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
        drawImage: vi.fn(),
      })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

      HTMLCanvasElement.prototype.toBlob = vi.fn(function (
        this: HTMLCanvasElement,
        callback: BlobCallback
      ) {
        callback(new Blob([new Uint8Array(toBlobSize)], { type: 'image/jpeg' }));
      }) as typeof HTMLCanvasElement.prototype.toBlob;
    });

    it('大きな画像は縮小・再エンコードされ、JPEGの新規Fileを返す', async () => {
      toBlobSize = 300_000; // 元より小さい
      const file = makeFile('big.png', 'image/png', 5_000_000);

      const result = await compressImageForUpload(file);

      expect(result).not.toBe(file);
      expect(result.type).toBe('image/jpeg');
      expect(result.size).toBe(300_000);
      // 拡張子が .jpg に変換される
      expect(result.name).toBe('big.jpg');
      // lastModified は引き継ぐ
      expect(result.lastModified).toBe(file.lastModified);
    });

    it('圧縮後に逆にサイズが増える場合は元ファイルを返す', async () => {
      toBlobSize = 9_000_000; // 元より大きい
      const file = makeFile('big.jpg', 'image/jpeg', 5_000_000);

      const result = await compressImageForUpload(file);
      expect(result).toBe(file);
    });

    it('十分に小さい画像は再エンコードせず元ファイルを返す', async () => {
      // 1MB以下かつ長辺がしきい値以下の画像としてデコード
      (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap = vi
        .fn()
        .mockResolvedValue({
          width: 1000,
          height: 800,
          close: vi.fn(),
        } as unknown as ImageBitmap);
      toBlobSize = 100_000;

      const file = makeFile('small.jpg', 'image/jpeg', 500_000);
      const result = await compressImageForUpload(file);
      expect(result).toBe(file);
    });

    it('デコードに失敗した場合は元ファイルへフォールバックする', async () => {
      (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap = vi
        .fn()
        .mockRejectedValue(new Error('decode failed'));

      const file = makeFile('broken.heic', 'image/jpeg', 5_000_000);
      const result = await compressImageForUpload(file);
      expect(result).toBe(file);
    });
  });
});

describe('compressImagesForUpload', () => {
  it('複数ファイルを順序を維持して処理する', async () => {
    // API非対応環境では各ファイルがそのまま返る
    (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap =
      undefined as unknown as typeof createImageBitmap;

    const files = [
      makeFile('a.jpg', 'image/jpeg', 1000),
      makeFile('b.png', 'image/png', 2000),
      makeFile('c.pdf', 'application/pdf', 3000),
    ];

    const result = await compressImagesForUpload(files);
    expect(result).toHaveLength(3);
    expect(result[0]!.name).toBe('a.jpg');
    expect(result[1]!.name).toBe('b.png');
    expect(result[2]!.name).toBe('c.pdf');
  });
});
