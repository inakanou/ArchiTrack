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
 * @requirement site-survey/REQ-31.5 順次レンダリング
 * @requirement site-survey/REQ-31.6 JSZip パッケージング
 * @requirement site-survey/REQ-31.7 進捗 callback
 * @requirement site-survey/REQ-31.8 ZIP 内ファイル名規則の統一
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
});
