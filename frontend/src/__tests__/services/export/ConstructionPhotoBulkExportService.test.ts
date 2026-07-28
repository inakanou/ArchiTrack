/**
 * @fileoverview ConstructionPhotoBulkExportService のテスト
 *
 * Task 11.3: ZIP一括エクスポートサービス
 *
 * 検証観点（観測可能完了状態）:
 * - signboardMode 別に取得元が切替わる
 *   - composited => getConstructionPhotoPrintImage
 *   - plain/original => getConstructionPhotoOriginalImage
 * - resolution/format は canvas 再エンコード（createImageBitmap → canvas.drawImage →
 *   canvas.toBlob(mimeType, quality)）で適用される
 * - signboardMode === 'original' は canvas を通さず原本バイトをそのまま格納する
 * - onProgress が各件完了ごとに { completed, total, failed } で通知される
 * - AbortSignal の abort（開始前・処理途中）で AbortError が throw され処理が中断する
 * - 1件の取得/変換失敗は failed[] に写真IDを積み、残りを継続する
 *
 * @requirement construction-photo/15.1〜15.6, 15.8, 15.9, 15.10 (task 13.1: 15.2,15.3,15.4,15.9,15.10)
 * @see .kiro/specs/construction-photo/design.md
 *   - Frontend Interfaces（追加機能）: ConstructionPhotoBulkExportService.export
 *   - Testing Strategy: ConstructionPhotoBulkExportService.export のテスト観点
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import type { ConstructionPhotoWithUrls } from '../../../types/construction-photo.types';

vi.mock('../../../api/construction-photo-images');

import {
  createConstructionPhotoBulkExportService,
  type ConstructionPhotoExportSettings,
  type ConstructionPhotoExportProgress,
} from '../../../services/export/ConstructionPhotoBulkExportService';
import * as imagesApi from '../../../api/construction-photo-images';

// ============================================================================
// テストヘルパー
// ============================================================================

function makePhoto(overrides: Partial<ConstructionPhotoWithUrls> = {}): ConstructionPhotoWithUrls {
  return {
    id: 'photo-1',
    albumId: 'album-1',
    fileName: 'photo-1.jpg',
    fileSize: 1000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    comment: null,
    includeInReport: true,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    printImageUrl: 'https://example.com/print-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const defaultSettings: ConstructionPhotoExportSettings = {
  format: 'jpeg',
  resolution: 'medium',
  signboardMode: 'composited',
};

// ============================================================================
// canvas 再エンコードのモック（`utils/image-compression.ts` テストの規約に倣う）
// ============================================================================

const originalCreateImageBitmap = (globalThis as { createImageBitmap?: typeof createImageBitmap })
  .createImageBitmap;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

let toBlobCalls: Array<{ type?: string; quality?: number }>;
let createImageBitmapCalls: number;

function setupCanvasMocks(): void {
  toBlobCalls = [];
  createImageBitmapCalls = 0;

  (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap = vi
    .fn()
    .mockImplementation(async () => {
      createImageBitmapCalls += 1;
      return {
        width: 800,
        height: 600,
        close: vi.fn(),
      } as unknown as ImageBitmap;
    });

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = vi.fn(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: number
  ) {
    toBlobCalls.push({ type, quality });
    callback(new Blob(['reencoded'], { type: type ?? 'image/jpeg' }));
  }) as typeof HTMLCanvasElement.prototype.toBlob;
}

function restoreCanvasMocks(): void {
  (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap =
    originalCreateImageBitmap;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toBlob = originalToBlob;
}

// ============================================================================
// テスト本体
// ============================================================================

describe('ConstructionPhotoBulkExportService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupCanvasMocks();
  });

  afterEach(() => {
    restoreCanvasMocks();
  });

  describe('signboardMode 別の取得元切替', () => {
    it('composited は getConstructionPhotoPrintImage から取得する', async () => {
      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockResolvedValue(
        new Blob(['print'], { type: 'image/jpeg' })
      );
      vi.mocked(imagesApi.getConstructionPhotoOriginalImage).mockResolvedValue(
        new Blob(['original'], { type: 'image/jpeg' })
      );

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      const result = await service.export(
        [makePhoto({ id: 'photo-1' })],
        { ...defaultSettings, signboardMode: 'composited' },
        { onProgress: () => {}, signal: controller.signal }
      );

      expect(imagesApi.getConstructionPhotoPrintImage).toHaveBeenCalledWith('photo-1');
      expect(imagesApi.getConstructionPhotoOriginalImage).not.toHaveBeenCalled();
      expect(result.failed).toEqual([]);
      expect(result.blob).toBeInstanceOf(Blob);
    });

    it('plain は getConstructionPhotoOriginalImage から取得する', async () => {
      vi.mocked(imagesApi.getConstructionPhotoOriginalImage).mockResolvedValue(
        new Blob(['original'], { type: 'image/jpeg' })
      );

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      await service.export(
        [makePhoto({ id: 'photo-2' })],
        { ...defaultSettings, signboardMode: 'plain' },
        { onProgress: () => {}, signal: controller.signal }
      );

      expect(imagesApi.getConstructionPhotoOriginalImage).toHaveBeenCalledWith('photo-2');
      expect(imagesApi.getConstructionPhotoPrintImage).not.toHaveBeenCalled();
    });

    it('original は getConstructionPhotoOriginalImage から取得する', async () => {
      vi.mocked(imagesApi.getConstructionPhotoOriginalImage).mockResolvedValue(
        new Blob(['original'], { type: 'image/jpeg' })
      );

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      await service.export(
        [makePhoto({ id: 'photo-3' })],
        { ...defaultSettings, signboardMode: 'original' },
        { onProgress: () => {}, signal: controller.signal }
      );

      expect(imagesApi.getConstructionPhotoOriginalImage).toHaveBeenCalledWith('photo-3');
      expect(imagesApi.getConstructionPhotoPrintImage).not.toHaveBeenCalled();
    });
  });

  describe('解像度/形式の canvas 再エンコード', () => {
    it('composited/plain は canvas 再エンコード（createImageBitmap→drawImage→toBlob）を経由する', async () => {
      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockResolvedValue(
        new Blob(['print'], { type: 'image/jpeg' })
      );

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      await service.export(
        [makePhoto({ id: 'photo-1' })],
        { format: 'png', resolution: 'high', signboardMode: 'composited' },
        { onProgress: () => {}, signal: controller.signal }
      );

      expect(createImageBitmapCalls).toBe(1);
      expect(toBlobCalls).toEqual([{ type: 'image/png', quality: 1.0 }]);
    });

    it('resolution=low は quality=0.6 で再エンコードされる', async () => {
      vi.mocked(imagesApi.getConstructionPhotoOriginalImage).mockResolvedValue(
        new Blob(['orig'], { type: 'image/jpeg' })
      );

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      await service.export(
        [makePhoto({ id: 'photo-1' })],
        { format: 'jpeg', resolution: 'low', signboardMode: 'plain' },
        { onProgress: () => {}, signal: controller.signal }
      );

      expect(toBlobCalls).toEqual([{ type: 'image/jpeg', quality: 0.6 }]);
    });

    it('resolution=medium は quality=0.9 で再エンコードされる', async () => {
      vi.mocked(imagesApi.getConstructionPhotoOriginalImage).mockResolvedValue(
        new Blob(['orig'], { type: 'image/jpeg' })
      );

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      await service.export(
        [makePhoto({ id: 'photo-1' })],
        { format: 'jpeg', resolution: 'medium', signboardMode: 'plain' },
        { onProgress: () => {}, signal: controller.signal }
      );

      expect(toBlobCalls).toEqual([{ type: 'image/jpeg', quality: 0.9 }]);
    });

    it('signboardMode === "original" は canvas を通さず原本バイトをそのまま格納する', async () => {
      const originalBlob = new Blob(['raw-original-bytes'], { type: 'image/png' });
      vi.mocked(imagesApi.getConstructionPhotoOriginalImage).mockResolvedValue(originalBlob);

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      const result = await service.export(
        [makePhoto({ id: 'photo-1', fileName: 'raw.png' })],
        { format: 'jpeg', resolution: 'low', signboardMode: 'original' },
        { onProgress: () => {}, signal: controller.signal }
      );

      // canvas 再エンコード経路が一切呼ばれていないこと（設定を適用しない）
      expect(createImageBitmapCalls).toBe(0);
      expect(toBlobCalls).toEqual([]);

      // ZIP に格納されたバイトが原本 Blob と一致すること
      const reopened = await JSZip.loadAsync(result.blob);
      const entryNames = Object.keys(reopened.files);
      expect(entryNames).toHaveLength(1);
      const storedText = await reopened.files[entryNames[0]!]!.async('text');
      expect(storedText).toBe('raw-original-bytes');
    });
  });

  describe('進捗通知', () => {
    it('各件完了ごとに { completed, total, failed } を通知する', async () => {
      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockResolvedValue(
        new Blob(['print'], { type: 'image/jpeg' })
      );

      const photos = [
        makePhoto({ id: 'p1', fileName: 'a.jpg' }),
        makePhoto({ id: 'p2', fileName: 'b.jpg' }),
        makePhoto({ id: 'p3', fileName: 'c.jpg' }),
      ];
      const progressLog: ConstructionPhotoExportProgress[] = [];

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      await service.export(photos, defaultSettings, {
        onProgress: (p) => progressLog.push(p),
        signal: controller.signal,
      });

      expect(progressLog).toEqual([
        { completed: 1, total: 3, failed: 0 },
        { completed: 2, total: 3, failed: 0 },
        { completed: 3, total: 3, failed: 0 },
      ]);
    });
  });

  describe('AbortSignal による中断', () => {
    it('開始前に abort 済みの signal では AbortError を throw し、取得APIは呼ばれない', async () => {
      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.export([makePhoto()], defaultSettings, {
          onProgress: () => {},
          signal: controller.signal,
        })
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(imagesApi.getConstructionPhotoPrintImage).not.toHaveBeenCalled();
    });

    it('処理途中の abort で AbortError を throw し、残りの写真は処理されない', async () => {
      const photos = [
        makePhoto({ id: 'p1', fileName: 'a.jpg' }),
        makePhoto({ id: 'p2', fileName: 'b.jpg' }),
        makePhoto({ id: 'p3', fileName: 'c.jpg' }),
      ];

      const controller = new AbortController();
      let callCount = 0;
      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockImplementation(async () => {
        callCount += 1;
        if (callCount === 2) {
          controller.abort();
        }
        return new Blob(['print'], { type: 'image/jpeg' });
      });

      const service = createConstructionPhotoBulkExportService();
      const progressLog: ConstructionPhotoExportProgress[] = [];

      await expect(
        service.export(photos, defaultSettings, {
          onProgress: (p) => progressLog.push(p),
          signal: controller.signal,
        })
      ).rejects.toMatchObject({ name: 'AbortError' });

      // 3件目は処理されない
      expect(imagesApi.getConstructionPhotoPrintImage).toHaveBeenCalledTimes(2);
      expect(progressLog.length).toBeLessThanOrEqual(1);
    });
  });

  describe('部分失敗の継続', () => {
    it('1件の取得失敗は failed[] に積まれ、残りは継続して ZIP に含まれる', async () => {
      const photos = [
        makePhoto({ id: 'p1', fileName: 'a.jpg' }),
        makePhoto({ id: 'p2', fileName: 'b.jpg' }),
        makePhoto({ id: 'p3', fileName: 'c.jpg' }),
      ];

      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockImplementation(
        async (photoId: string) => {
          if (photoId === 'p2') {
            throw new Error('fetch failed: simulated');
          }
          return new Blob(['print'], { type: 'image/jpeg' });
        }
      );

      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();
      const progressLog: ConstructionPhotoExportProgress[] = [];

      const result = await service.export(photos, defaultSettings, {
        onProgress: (p) => progressLog.push(p),
        signal: controller.signal,
      });

      expect(result.failed).toEqual(['p2']);

      const reopened = await JSZip.loadAsync(result.blob);
      expect(Object.keys(reopened.files)).toHaveLength(2);

      expect(progressLog[progressLog.length - 1]).toEqual({
        completed: 3,
        total: 3,
        failed: 1,
      });
    });

    it('canvas 再エンコード失敗（toBlob が null を返す）も failed[] に積まれ継続する', async () => {
      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockResolvedValue(
        new Blob(['print'], { type: 'image/jpeg' })
      );

      // toBlob を null 返却に差し替え（再エンコード失敗を模擬）
      HTMLCanvasElement.prototype.toBlob = vi.fn(function (
        this: HTMLCanvasElement,
        callback: BlobCallback
      ) {
        callback(null);
      }) as typeof HTMLCanvasElement.prototype.toBlob;

      const photos = [makePhoto({ id: 'p1', fileName: 'a.jpg' })];
      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      const result = await service.export(photos, defaultSettings, {
        onProgress: () => {},
        signal: controller.signal,
      });

      expect(result.failed).toEqual(['p1']);
      const reopened = await JSZip.loadAsync(result.blob);
      expect(Object.keys(reopened.files)).toHaveLength(0);
    });

    it('全件失敗でも空 ZIP を返す（throw しない）', async () => {
      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockRejectedValue(
        new Error('always fails')
      );

      const photos = [
        makePhoto({ id: 'p1', fileName: 'a.jpg' }),
        makePhoto({ id: 'p2', fileName: 'b.jpg' }),
      ];
      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      const result = await service.export(photos, defaultSettings, {
        onProgress: () => {},
        signal: controller.signal,
      });

      expect(result.failed).toEqual(['p1', 'p2']);
      const reopened = await JSZip.loadAsync(result.blob);
      expect(Object.keys(reopened.files)).toHaveLength(0);
    });
  });

  describe('ZIP エントリ命名', () => {
    it('constructionPhotoZipNaming 規則（3桁連番_サニタイズ済みファイル名.拡張子）でエントリ名が決まる', async () => {
      vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockResolvedValue(
        new Blob(['print'], { type: 'image/jpeg' })
      );

      const photos = [
        makePhoto({ id: 'p1', fileName: 'first.png', displayOrder: 0 }),
        makePhoto({ id: 'p2', fileName: 'second.png', displayOrder: 1 }),
      ];
      const service = createConstructionPhotoBulkExportService();
      const controller = new AbortController();

      const result = await service.export(
        photos,
        { ...defaultSettings, format: 'jpeg' },
        { onProgress: () => {}, signal: controller.signal }
      );

      const reopened = await JSZip.loadAsync(result.blob);
      const fileNames = Object.keys(reopened.files).sort();
      expect(fileNames).toEqual(['000_first.jpg', '001_second.jpg']);
    });
  });
});
