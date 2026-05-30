/**
 * @fileoverview bulkExportService - 順次レンダリング + JSZip パッケージング テスト
 *
 * Task 84.1: bulkExportService の最初の段階として、
 *   - `AnnotationRendererService.renderImage()` を順次呼び
 *   - 戻りの Blob を JSZip インスタンスに追加し
 *   - `JSZip.generateAsync` で単一 ZIP Blob を生成し
 *   - エントリ名が `zip-naming.buildEntryName()` 規則に従う
 * ことを検証する。
 *
 * 観測可能完了状態:
 *   - 3 画像入力 → 3 エントリの ZIP Blob が返る
 *   - 各エントリ名が `NNN_<sanitized>.<ext>` 形式
 *
 * Task 84.3: 部分失敗集約と原本そのまま分岐
 *   - 個別画像 reject を `failures: BulkExportFailure[]` に集約しループ継続
 *   - `annotationMode === 'original-only'` のとき renderImage をスキップし
 *     R2 fetch（`image.originalUrl`）で Blob を取得
 *
 * @requirement site-survey/REQ-31.5 順次レンダリング
 * @requirement site-survey/REQ-31.6 JSZip パッケージング
 * @requirement site-survey/REQ-31.7 進捗 callback
 * @requirement site-survey/REQ-31.8 ZIP 内ファイル名規則の統一
 * @requirement site-survey/REQ-31.13 部分失敗集約
 * @requirement site-survey/REQ-31.18 原本そのまま分岐
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import type {
  BulkExportInput,
  BulkExportProgress,
  ExportSettings,
} from '../../../services/export/bulkExportService';
import { createBulkExportService } from '../../../services/export/bulkExportService';
import type { SurveyImageInfo } from '../../../types/site-survey.types';

// ============================================================================
// AnnotationRendererService モック
// ============================================================================

const mockRenderImage = vi.fn();

vi.mock('../../../services/export/AnnotationRendererService', () => {
  class MockAnnotationRendererService {
    renderImage = (
      imageInfo: SurveyImageInfo,
      options: { format?: 'jpeg' | 'png'; quality?: number } = {}
    ) => mockRenderImage(imageInfo, options);
  }
  return {
    AnnotationRendererService: MockAnnotationRendererService,
    default: MockAnnotationRendererService,
  };
});

// ============================================================================
// テストヘルパー
// ============================================================================

const makeImage = (overrides: Partial<SurveyImageInfo> = {}): SurveyImageInfo => ({
  id: 'img-001',
  surveyId: 'survey-1',
  originalPath: 'original/img-001.jpg',
  thumbnailPath: 'thumb/img-001.jpg',
  originalUrl: 'https://example.com/original/img-001.jpg',
  thumbnailUrl: 'https://example.com/thumb/img-001.jpg',
  fileName: 'photo.jpg',
  fileSize: 1024,
  width: 800,
  height: 600,
  displayOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const defaultSettings: ExportSettings = {
  format: 'jpeg',
  resolution: 'medium',
  annotationMode: 'include',
};

const makeInput = (overrides: Partial<BulkExportInput> = {}): BulkExportInput => ({
  surveyId: 'survey-1',
  surveyName: '現場A',
  images: [],
  settings: defaultSettings,
  ...overrides,
});

/**
 * 最小限の 1x1 JPEG dataURL（実 PNG/JPEG ヘッダではないが、サービス内では
 * `fetch(dataUrl)` で Blob に変換することを想定する。テストでは MSW 等を
 * 使わず、グローバル fetch を vi.stubGlobal で差し替えて Blob を返す）。
 */
const dummyDataUrl = 'data:image/jpeg;base64,dummy';

const makeBlobFromDataUrl = (dataUrl: string, type: string): Blob => {
  // テスト環境では base64 decode はモック fetch 側で代替する
  return new Blob([dataUrl], { type });
};

// ============================================================================
// グローバル fetch モック（dataURL → Blob 変換用）
// ============================================================================

beforeEach(() => {
  mockRenderImage.mockReset();
  // 軽量 fetch スタブ: `Response` ではなく blob()/arrayBuffer() を持つ duck-typed
  // オブジェクトを返す。JSDOM 環境の Response 実装は Blob からのストリーム化に
  // 制限があるため、サービスが利用する `.blob()` のみ満たせば良い。
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const mime = url.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const blob = makeBlobFromDataUrl(url, mime);
      return {
        ok: true,
        status: 200,
        blob: async () => blob,
        arrayBuffer: async () => blob.arrayBuffer(),
      };
    })
  );
});

// ============================================================================
// テスト本体
// ============================================================================

describe('bulkExportService - 順次レンダリング + JSZip パッケージング', () => {
  it('観測可能完了状態: 3 画像入力に対し 3 エントリの ZIP Blob が返る', async () => {
    const images = [
      makeImage({ id: 'img-1', fileName: 'first.jpg', displayOrder: 0 }),
      makeImage({ id: 'img-2', fileName: 'second.jpg', displayOrder: 1 }),
      makeImage({ id: 'img-3', fileName: 'third.jpg', displayOrder: 2 }),
    ];
    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => ({
      imageInfo,
      dataUrl: dummyDataUrl,
    }));

    const service = createBulkExportService();
    const controller = new AbortController();
    const progressLog: BulkExportProgress[] = [];

    const result = await service.execute(
      makeInput({ images, settings: { ...defaultSettings, format: 'jpeg' } }),
      (p) => progressLog.push(p),
      controller.signal
    );

    expect(result.status).toBe('success');
    expect(result.zipBlob).toBeInstanceOf(Blob);
    expect(result.zipFileName).toMatch(/^.+_\d{8}_\d{6}\.zip$/);
    expect(result.failures).toEqual([]);

    // ZIP を読み戻してエントリ数を検証
    const reopened = await JSZip.loadAsync(result.zipBlob!);
    const fileNames = Object.keys(reopened.files);
    expect(fileNames).toHaveLength(3);

    // 進捗 callback: 3 回呼ばれ、最終 done === total
    expect(progressLog).toHaveLength(3);
    expect(progressLog[progressLog.length - 1]).toEqual({
      done: 3,
      total: 3,
      failedSoFar: 0,
    });

    // renderImage が 3 回順次呼ばれる
    expect(mockRenderImage).toHaveBeenCalledTimes(3);
  });

  it('ZIP 内ファイル名が zip-naming.buildEntryName 規則どおりに命名される', async () => {
    const images = [
      makeImage({ id: 'img-1', fileName: 'photo.jpg', displayOrder: 0 }),
      makeImage({ id: 'img-2', fileName: 'photo.jpg', displayOrder: 1 }),
      makeImage({ id: 'img-3', fileName: 'sub/dir/photo.png', displayOrder: 2 }),
    ];
    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => ({
      imageInfo,
      dataUrl: dummyDataUrl,
    }));

    const service = createBulkExportService();
    const controller = new AbortController();

    const result = await service.execute(
      makeInput({ images, settings: { ...defaultSettings, format: 'jpeg' } }),
      () => {
        /* noop */
      },
      controller.signal
    );

    expect(result.status).toBe('success');

    const reopened = await JSZip.loadAsync(result.zipBlob!);
    const fileNames = Object.keys(reopened.files).sort();

    // jpeg 設定なので 3 件目（fileName=photo.png）も拡張子は jpg になる
    // 1 件目: 000_photo.jpg, 2 件目: 001_photo.jpg, 3 件目: 002_sub_dir_photo.jpg
    expect(fileNames).toEqual(['000_photo.jpg', '001_photo.jpg', '002_sub_dir_photo.jpg']);
  });

  it('format=png 設定時はエントリ拡張子が .png になる', async () => {
    const images = [makeImage({ id: 'img-1', fileName: 'snap.jpg', displayOrder: 0 })];
    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => ({
      imageInfo,
      dataUrl: 'data:image/png;base64,dummy',
    }));

    const service = createBulkExportService();
    const controller = new AbortController();

    const result = await service.execute(
      makeInput({ images, settings: { ...defaultSettings, format: 'png' } }),
      () => {
        /* noop */
      },
      controller.signal
    );

    expect(result.status).toBe('success');
    const reopened = await JSZip.loadAsync(result.zipBlob!);
    const fileNames = Object.keys(reopened.files);
    expect(fileNames).toEqual(['000_snap.png']);
  });

  it('renderImage が順次（直列）呼ばれることを確認する', async () => {
    const callOrder: string[] = [];
    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => {
      callOrder.push(`start:${imageInfo.id}`);
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push(`end:${imageInfo.id}`);
      return { imageInfo, dataUrl: dummyDataUrl };
    });

    const images = [
      makeImage({ id: 'a', fileName: 'a.jpg', displayOrder: 0 }),
      makeImage({ id: 'b', fileName: 'b.jpg', displayOrder: 1 }),
    ];
    const service = createBulkExportService();
    const controller = new AbortController();

    await service.execute(
      makeInput({ images }),
      () => {
        /* noop */
      },
      controller.signal
    );

    // 並列なら start:a, start:b, end:a, end:b の順になり得るが、
    // 順次なら start:a, end:a, start:b, end:b
    expect(callOrder).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('開始前に既に abort 済みの signal の場合は cancelled で即 return する', async () => {
    const images = [makeImage({ id: 'img-1', fileName: 'photo.jpg', displayOrder: 0 })];
    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => ({
      imageInfo,
      dataUrl: dummyDataUrl,
    }));

    const service = createBulkExportService();
    const controller = new AbortController();
    controller.abort();

    const result = await service.execute(
      makeInput({ images }),
      () => {
        /* noop */
      },
      controller.signal
    );

    expect(result.status).toBe('cancelled');
    expect(result.zipBlob).toBeUndefined();
    expect(result.failures).toEqual([]);
    expect(mockRenderImage).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Task 84.2: AbortSignal によるキャンセル経路
  // ==========================================================================

  it('5 画像処理中に abort すると status: cancelled で resolve し zipBlob が undefined になる', async () => {
    // 5 画像のうち 2 件処理完了後に abort を発火させ、
    // 残り 3 件は処理されず、ZIP も生成されないことを観測する。
    const images = [
      makeImage({ id: 'img-1', fileName: 'a.jpg', displayOrder: 0 }),
      makeImage({ id: 'img-2', fileName: 'b.jpg', displayOrder: 1 }),
      makeImage({ id: 'img-3', fileName: 'c.jpg', displayOrder: 2 }),
      makeImage({ id: 'img-4', fileName: 'd.jpg', displayOrder: 3 }),
      makeImage({ id: 'img-5', fileName: 'e.jpg', displayOrder: 4 }),
    ];

    const controller = new AbortController();

    // 2 件処理完了したタイミングで abort を呼ぶ
    let processedCount = 0;
    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => {
      processedCount += 1;
      if (processedCount === 2) {
        // 2 件目の renderImage 解決後に abort をスケジュール
        // （次反復先頭または当該反復内の post-render チェックで cancelled になる）
        controller.abort();
      }
      return { imageInfo, dataUrl: dummyDataUrl };
    });

    const service = createBulkExportService();
    const progressLog: BulkExportProgress[] = [];

    const result = await service.execute(
      makeInput({ images }),
      (p) => progressLog.push(p),
      controller.signal
    );

    expect(result.status).toBe('cancelled');
    expect(result.zipBlob).toBeUndefined();
    expect(result.zipFileName).toBeUndefined();
    expect(result.failures).toEqual([]);

    // 残り 3 件（img-3, img-4, img-5）は render が呼ばれないこと
    expect(mockRenderImage).toHaveBeenCalledTimes(2);
    // 最終 progress.done は 2 を超えない（abort により ZIP 追加・進捗通知が止まる）
    expect(progressLog.length).toBeLessThanOrEqual(2);
  });

  // ==========================================================================
  // Task 84.3: 部分失敗集約と原本そのまま分岐
  // ==========================================================================

  it('1 件失敗 + 4 件成功で status: partial、failures.length === 1、zipBlob に 4 件含まれる', async () => {
    const images = [
      makeImage({ id: 'img-1', fileName: 'a.jpg', displayOrder: 0 }),
      makeImage({ id: 'img-2', fileName: 'b.jpg', displayOrder: 1 }),
      makeImage({ id: 'img-3', fileName: 'c.jpg', displayOrder: 2 }),
      makeImage({ id: 'img-4', fileName: 'd.jpg', displayOrder: 3 }),
      makeImage({ id: 'img-5', fileName: 'e.jpg', displayOrder: 4 }),
    ];

    // img-3 のみ renderImage が reject
    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => {
      if (imageInfo.id === 'img-3') {
        throw new Error('render failure: simulated');
      }
      return { imageInfo, dataUrl: dummyDataUrl };
    });

    const service = createBulkExportService();
    const controller = new AbortController();
    const progressLog: BulkExportProgress[] = [];

    const result = await service.execute(
      makeInput({ images }),
      (p) => progressLog.push(p),
      controller.signal
    );

    expect(result.status).toBe('partial');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      imageId: 'img-3',
      imageName: 'c.jpg',
      reason: 'render',
    });
    expect(result.failures[0]?.message).toContain('render failure');

    // zipBlob は成功した 4 件分を含む
    expect(result.zipBlob).toBeInstanceOf(Blob);
    expect(result.zipFileName).toMatch(/^.+_\d{8}_\d{6}\.zip$/);

    const reopened = await JSZip.loadAsync(result.zipBlob!);
    const fileNames = Object.keys(reopened.files);
    expect(fileNames).toHaveLength(4);

    // 進捗 callback は 5 回呼ばれ、最終で failedSoFar === 1
    expect(progressLog).toHaveLength(5);
    expect(progressLog[progressLog.length - 1]).toEqual({
      done: 5,
      total: 5,
      failedSoFar: 1,
    });
    // 失敗発生時点（img-3 完了相当）で failedSoFar が 1 に増えている
    expect(progressLog[2]).toEqual({ done: 3, total: 5, failedSoFar: 1 });
    expect(progressLog[1]).toEqual({ done: 2, total: 5, failedSoFar: 0 });
  });

  it('annotationMode === "original-only" のとき renderImage は呼ばれず R2 fetch で blob を取得する', async () => {
    const images = [
      makeImage({
        id: 'img-1',
        fileName: 'photo.jpg',
        displayOrder: 0,
        originalUrl: 'https://r2.example.com/original/img-1.jpg',
      }),
      makeImage({
        id: 'img-2',
        fileName: 'photo.png',
        displayOrder: 1,
        originalUrl: 'https://r2.example.com/original/img-2.png',
      }),
    ];

    // renderImage が誤って呼ばれたらテスト失敗するように throw
    mockRenderImage.mockImplementation(async () => {
      throw new Error('renderImage MUST NOT be called for original-only');
    });

    // fetch 呼び出しを記録
    const fetchedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        fetchedUrls.push(url);
        const mime = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const blob = makeBlobFromDataUrl(url, mime);
        return {
          ok: true,
          status: 200,
          blob: async () => blob,
          arrayBuffer: async () => blob.arrayBuffer(),
        };
      })
    );

    const service = createBulkExportService();
    const controller = new AbortController();

    const result = await service.execute(
      makeInput({
        images,
        settings: { ...defaultSettings, annotationMode: 'original-only' },
      }),
      () => {
        /* noop */
      },
      controller.signal
    );

    expect(result.status).toBe('success');
    expect(result.failures).toEqual([]);
    expect(mockRenderImage).not.toHaveBeenCalled();

    // R2 fetch が 2 回、それぞれ originalUrl 宛に行われている
    expect(fetchedUrls).toEqual([
      'https://r2.example.com/original/img-1.jpg',
      'https://r2.example.com/original/img-2.png',
    ]);

    // ZIP に 2 件含まれている
    const reopened = await JSZip.loadAsync(result.zipBlob!);
    expect(Object.keys(reopened.files)).toHaveLength(2);
  });

  it('annotationMode === "original-only" で R2 fetch が失敗すると reason: "fetch" の failure が記録される', async () => {
    const images = [
      makeImage({
        id: 'img-1',
        fileName: 'ok.jpg',
        displayOrder: 0,
        originalUrl: 'https://r2.example.com/original/img-1.jpg',
      }),
      makeImage({
        id: 'img-2',
        fileName: 'broken.jpg',
        displayOrder: 1,
        originalUrl: 'https://r2.example.com/original/img-2.jpg',
      }),
    ];

    mockRenderImage.mockImplementation(async () => {
      throw new Error('renderImage MUST NOT be called for original-only');
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('img-2')) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            blob: async () => new Blob([], { type: 'image/jpeg' }),
            arrayBuffer: async () => new ArrayBuffer(0),
          };
        }
        const blob = makeBlobFromDataUrl(url, 'image/jpeg');
        return {
          ok: true,
          status: 200,
          blob: async () => blob,
          arrayBuffer: async () => blob.arrayBuffer(),
        };
      })
    );

    const service = createBulkExportService();
    const controller = new AbortController();

    const result = await service.execute(
      makeInput({
        images,
        settings: { ...defaultSettings, annotationMode: 'original-only' },
      }),
      () => {
        /* noop */
      },
      controller.signal
    );

    expect(result.status).toBe('partial');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      imageId: 'img-2',
      imageName: 'broken.jpg',
      reason: 'fetch',
    });

    const reopened = await JSZip.loadAsync(result.zipBlob!);
    expect(Object.keys(reopened.files)).toHaveLength(1);
  });

  it('全件失敗で status: partial、failures.length === total、zipBlob は空 ZIP', async () => {
    const images = [
      makeImage({ id: 'img-1', fileName: 'a.jpg', displayOrder: 0 }),
      makeImage({ id: 'img-2', fileName: 'b.jpg', displayOrder: 1 }),
    ];
    mockRenderImage.mockImplementation(async () => {
      throw new Error('always fails');
    });

    const service = createBulkExportService();
    const controller = new AbortController();

    const result = await service.execute(
      makeInput({ images }),
      () => {
        /* noop */
      },
      controller.signal
    );

    expect(result.status).toBe('partial');
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((f) => f.imageId)).toEqual(['img-1', 'img-2']);
    expect(result.failures.every((f) => f.reason === 'render')).toBe(true);

    // 成功分のみの ZIP（= 空 ZIP）を生成する
    expect(result.zipBlob).toBeInstanceOf(Blob);
    const reopened = await JSZip.loadAsync(result.zipBlob!);
    expect(Object.keys(reopened.files)).toHaveLength(0);
  });

  it('renderImage 完了直後に abort された場合も ZIP に追加せず cancelled で resolve する', async () => {
    // 1 画像入力で renderImage 進行中に abort を発火させ、
    // renderImage 完了後・zip.file 追加前の abort 検知で cancelled になることを観測する。
    const image = makeImage({ id: 'img-1', fileName: 'only.jpg', displayOrder: 0 });
    const controller = new AbortController();

    mockRenderImage.mockImplementation(async (imageInfo: SurveyImageInfo) => {
      // renderImage 自体の進行中に abort を発火させる
      controller.abort();
      return { imageInfo, dataUrl: dummyDataUrl };
    });

    const service = createBulkExportService();
    const progressLog: BulkExportProgress[] = [];

    const result = await service.execute(
      makeInput({ images: [image] }),
      (p) => progressLog.push(p),
      controller.signal
    );

    expect(result.status).toBe('cancelled');
    expect(result.zipBlob).toBeUndefined();
    expect(result.zipFileName).toBeUndefined();
    expect(result.failures).toEqual([]);
    // 進捗 callback は呼ばれない（abort 検知後に通知されない）
    expect(progressLog).toEqual([]);
  });
});
