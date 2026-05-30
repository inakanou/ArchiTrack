/**
 * AnnotationRendererService - 既存 caller 後方互換確認（Task 88.2）
 *
 * Group 6 形状（Rectangle / Circle / Polygon / Polyline / Freehand / Dimension）
 * を含む注釈データを、既存呼出経路（PDF 報告書 / 個別エクスポート / レガシー
 * renderImages 経路）に渡したとき、従来どおりレンダリングが完了することを検証する。
 *
 * 検証戦略（重要）:
 * - Task 84 (bulkExportService) で導入された `onProgress` / `signal` は
 *   `bulkExportService` 内部のラッパー機能であり、`AnnotationRendererService` の
 *   public メソッド（`renderImage` / `renderImages` / `renderImageForReport` /
 *   `renderImagesForReport`）のシグネチャには追加されていない。
 * - 本テストは「既存呼出点が `onProgress` / `signal` を渡さない」状況、すなわち
 *   `renderImagesForReport(images, options)` / `renderImages(images, options)` の
 *   2 引数呼び出しが Group 6 形状の注釈に対して従来挙動（成功時にレンダリング結果
 *   が返る・失敗時に null/スキップが返る）を維持していることを確認する。
 * - 既存 caller 経路:
 *   - `SiteSurveyDetailInfo` / `EstimateRequestDetailPage` →
 *     `renderImagesForReport(images, { format, quality })` → `PdfReportService.generateSurveyReport`
 *   - `ExportService.exportImage(canvas, options)` → Canvas.toDataURL（注釈は
 *     Canvas に既にロード済み）
 *
 * 設計参照:
 * - design.md §4947: 「6 形状の白縁取りは Tool 層のみで吸収。Renderer / Editor は
 *   無変更（既存 `enlivenObjects` 経路で属性が自動復元）」
 *
 * Requirements:
 * - 31.6: 一括エクスポート機能の追加が既存個別ダウンロード経路の挙動を変更しない
 * - 32.8: 注釈付き画像をサムネイル・プレビュー・PDF・個別エクスポート・一括
 *   エクスポートでレンダリングする際、編集画面と同一の白縁取り表現を 6 形状に適用する
 *
 * @requirement site-survey/REQ-31.6
 * @requirement site-survey/REQ-32.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SurveyImageInfo, AnnotationInfo } from '../../../types/site-survey.types';

// ============================================================================
// モック定義
// ============================================================================

const mockGetAnnotation = vi.fn();
const mockGetBatchAnnotations = vi.fn();

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: (...args: unknown[]) => mockGetAnnotation(...args),
  getBatchAnnotations: (...args: unknown[]) => mockGetBatchAnnotations(...args),
}));

vi.mock('../../../components/site-surveys/tools/registerCustomShapes', () => ({}));

vi.mock('fabric', () => {
  class MockCanvas {
    backgroundImage: unknown = null;
    public addedObjects: unknown[] = [];
    add = vi.fn((obj: unknown) => {
      this.addedObjects.push(obj);
    });
    renderAll = vi.fn();
    requestRenderAll = vi.fn();
    toDataURL = vi.fn(() => 'data:image/jpeg;base64,legacyCompatRenderResult');
    dispose = vi.fn();
    getObjects = vi.fn(() => []);
  }

  class MockFabricImage {
    set = vi.fn();
    img: unknown;
    left = 0;
    top = 0;
    originX = 'left';
    originY = 'top';
    selectable = false;
    evented = false;

    constructor(img: unknown) {
      this.img = img;
    }
  }

  return {
    Canvas: MockCanvas,
    FabricImage: MockFabricImage,
    util: {
      enlivenObjects: vi.fn().mockResolvedValue([]),
    },
  };
});

const mockLoadJapaneseFont = vi.fn().mockResolvedValue(undefined);
const mockApplyJapaneseFontToCanvas = vi.fn();
vi.mock('../../../services/JapaneseFontRenderer', () => ({
  default: vi.fn(),
  JapaneseFontRenderer: vi.fn(),
  loadJapaneseFont: () => mockLoadJapaneseFont(),
  isJapaneseFontLoaded: vi.fn(() => true),
  getJapaneseFontFamily: vi.fn(() => '"Noto Sans JP", sans-serif'),
  applyJapaneseFontToCanvas: (canvas: unknown) => mockApplyJapaneseFontToCanvas(canvas),
  waitForFontLoad: () => mockLoadJapaneseFont(),
  resetDefaultRenderer: vi.fn(),
}));

import {
  AnnotationRendererService,
  renderImagesForReport,
  renderImagesWithAnnotations,
  resetAnnotationRendererService,
} from '../../../services/export/AnnotationRendererService';
import { ExportService } from '../../../services/ExportService';
import { util } from 'fabric';

// ============================================================================
// 型 / ヘルパー
// ============================================================================

interface OutlineChild {
  type: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

interface BodyChild {
  type: string;
  stroke: string;
  strokeWidth: number;
}

interface GroupShapeMock extends Record<string, unknown> {
  type: string;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  strokeWidth: number;
  stroke: string;
  _objects: Array<OutlineChild | BodyChild | Record<string, unknown>>;
  outlineChild: OutlineChild;
  bodyChild: BodyChild;
  set: (options: Record<string, unknown>) => GroupShapeMock;
}

/**
 * 2 子構成（outline + body）の Group モックを生成する共通ファクトリ。
 * group-shapes.test.ts と同等の構造を採用。
 */
function createGroupShapeMock(
  type: string,
  bodyStrokeWidth = 3,
  bodyStroke = '#ef4444',
  outlineWidthPx = 2,
  initialLeft = 0,
  initialTop = 0
): GroupShapeMock {
  const outlineChild: OutlineChild = {
    type: 'shape',
    stroke: '#ffffff',
    strokeWidth: bodyStrokeWidth + outlineWidthPx * 2,
    opacity: 1,
  };
  const bodyChild: BodyChild = {
    type: 'shape',
    stroke: bodyStroke,
    strokeWidth: bodyStrokeWidth,
  };

  const obj: GroupShapeMock = {
    type,
    left: initialLeft,
    top: initialTop,
    scaleX: 1,
    scaleY: 1,
    strokeWidth: bodyStrokeWidth,
    stroke: bodyStroke,
    _objects: [outlineChild, bodyChild],
    outlineChild,
    bodyChild,
    set(this: GroupShapeMock, options: Record<string, unknown>) {
      Object.assign(this, options);
      return this;
    },
  };

  return obj;
}

/**
 * Dimension の Group モック（3 子構成: outlineLine + bodyLine + labelText）。
 */
function createDimensionGroupMock(
  bodyStrokeWidth = 3,
  bodyStroke = '#111111',
  outlineWidthPx = 2,
  fontSize = 24,
  widthRatio = 0.12,
  labelTextValue = '1.0m'
): GroupShapeMock & { labelText: Record<string, unknown> } {
  const outlineLine: OutlineChild = {
    type: 'path',
    stroke: '#ffffff',
    strokeWidth: bodyStrokeWidth + outlineWidthPx * 2,
    opacity: 1,
  };
  const bodyLine: BodyChild = {
    type: 'path',
    stroke: bodyStroke,
    strokeWidth: bodyStrokeWidth,
  };
  const labelText: Record<string, unknown> = {
    type: 'text',
    text: labelTextValue,
    fontSize,
    paintFirst: 'stroke',
    stroke: '#ffffff',
    strokeWidth: fontSize * widthRatio,
    strokeUniform: true,
    fill: '#000000',
  };

  const obj: GroupShapeMock & { labelText: Record<string, unknown> } = {
    type: 'dimensionLine',
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
    strokeWidth: bodyStrokeWidth,
    stroke: bodyStroke,
    _objects: [outlineLine, bodyLine, labelText],
    outlineChild: outlineLine,
    bodyChild: bodyLine,
    labelText,
    set(this: GroupShapeMock, options: Record<string, unknown>) {
      Object.assign(this, options);
      return this;
    },
  };

  return obj;
}

function createMockImageInfo(overrides: Partial<SurveyImageInfo> = {}): SurveyImageInfo {
  return {
    id: 'image-1',
    surveyId: 'survey-1',
    originalPath: '/orig.jpg',
    thumbnailPath: '/thumb.jpg',
    originalUrl: 'https://example.com/orig.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    fileName: 'test.jpg',
    fileSize: 1024,
    width: 400,
    height: 400,
    displayOrder: 1,
    createdAt: '2026-04-24T00:00:00.000Z',
    comment: null,
    includeInReport: true,
    ...overrides,
  };
}

function createMockAnnotation(
  objects: unknown[],
  canvasWidth = 400,
  canvasHeight = 400
): AnnotationInfo {
  return {
    id: 'annotation-1',
    imageId: 'image-1',
    data: {
      version: '1.0',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      objects: objects as any,
      canvasWidth,
      canvasHeight,
    },
    version: '1.0',
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  };
}

/**
 * 6 形状すべてを含む注釈データを生成する。
 */
function createSixShapeAnnotationObjects(): unknown[] {
  return [
    { type: 'rectangleShape', outline: { enabled: true, color: '#ffffff', width: 2 } },
    { type: 'circleShape', outline: { enabled: true, color: '#ffffff', width: 2 } },
    { type: 'polygonShape', outline: { enabled: true, color: '#ffffff', width: 2 } },
    { type: 'polylineShape', outline: { enabled: true, color: '#ffffff', width: 2 } },
    { type: 'freehand', outline: { enabled: true, color: '#ffffff', width: 2 } },
    {
      type: 'dimensionLine',
      outline: { enabled: true, color: '#ffffff', width: 2 },
      labelOutline: { enabled: true, widthRatio: 0.12 },
    },
  ];
}

/**
 * 6 形状すべての Group モックを生成する。
 */
function createSixShapeGroupMocks(): GroupShapeMock[] {
  return [
    createGroupShapeMock('rectangleShape', 3, '#ef4444', 2),
    createGroupShapeMock('circleShape', 3, '#3b82f6', 2),
    createGroupShapeMock('polygonShape', 3, '#10b981', 2),
    createGroupShapeMock('polylineShape', 3, '#f59e0b', 2),
    createGroupShapeMock('freehand', 3, '#8b5cf6', 2),
    createDimensionGroupMock(3, '#111111', 2, 24, 0.12, '1.0m'),
  ];
}

// ============================================================================
// テスト本体
// ============================================================================

describe('AnnotationRendererService - 既存 caller 後方互換確認（Task 88.2）', () => {
  const originalCreateElement = document.createElement.bind(document);
  let mockImage: Partial<HTMLImageElement>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnnotationRendererService();

    mockImage = {
      width: 400,
      height: 400,
      crossOrigin: '',
      src: '',
      onload: null,
      onerror: null,
    };

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({ drawImage: vi.fn() })),
          toDataURL: vi.fn(() => 'data:image/jpeg;base64,rawImageData'),
        } as unknown as HTMLCanvasElement;
      }
      if (tagName === 'img') {
        const img = mockImage as HTMLImageElement;
        setTimeout(() => {
          if (img.onload) {
            img.onload(new Event('load'));
          }
        }, 0);
        return img as HTMLImageElement;
      }
      return originalCreateElement(tagName);
    });

    mockLoadJapaneseFont.mockClear();
    mockApplyJapaneseFontToCanvas.mockClear();
    mockLoadJapaneseFont.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // PDF 報告書経路: renderImagesForReport (Req 32.8, 31.6)
  // --------------------------------------------------------------------------

  describe('PDF 報告書経路: renderImagesForReport(images, options) の後方互換性', () => {
    it('Group 6 形状を含む注釈データで従来どおりレンダリング結果が返る（既存呼出点が onProgress/signal を渡さない）', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      // 既存 caller (SiteSurveyDetailInfo) はバッチ取得 API を使う経路を辿る。
      // バッチ取得成功シナリオを再現する。
      const annotation = createMockAnnotation(createSixShapeAnnotationObjects(), 400, 400);
      mockGetBatchAnnotations.mockResolvedValueOnce({
        [imageInfo.id]: annotation,
      });

      const shapes = createSixShapeGroupMocks();
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        shapes as any
      );

      // 既存 caller シグネチャ: 2 引数（images, options）。
      // onProgress / signal は渡さない。
      const results = await service.renderImagesForReport([imageInfo], {
        format: 'jpeg',
        quality: 0.9,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        imageInfo: { id: 'image-1' },
        dataUrl: expect.stringMatching(/^data:image\/jpeg;base64,.+/),
      });
      // バッチ取得経路が使われたことを確認
      expect(mockGetBatchAnnotations).toHaveBeenCalledTimes(1);
      // 日本語フォントが適用された（PDF 用経路の不変条件）
      expect(mockLoadJapaneseFont).toHaveBeenCalled();
      expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
    });

    it('バッチ取得失敗時に個別取得フォールバック経路で Group 6 形状が処理される（Req 18.7 整合）', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetBatchAnnotations.mockRejectedValueOnce(new Error('batch endpoint down'));
      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation(createSixShapeAnnotationObjects(), 400, 400)
      );

      vi.mocked(util.enlivenObjects).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createSixShapeGroupMocks() as any
      );

      const results = await service.renderImagesForReport([imageInfo], {
        format: 'jpeg',
        quality: 0.9,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      // フォールバックで個別取得 API が呼ばれた
      expect(mockGetAnnotation).toHaveBeenCalledWith(imageInfo.id);
    });

    it('options を完全省略しても従来どおりデフォルト形式 (jpeg/0.9) でレンダリングされる', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetBatchAnnotations.mockResolvedValueOnce({
        [imageInfo.id]: createMockAnnotation(createSixShapeAnnotationObjects(), 400, 400),
      });
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createSixShapeGroupMocks() as any
      );

      // options なしの呼び出し（メソッドのデフォルト引数挙動を確認）
      const results = await service.renderImagesForReport([imageInfo]);

      expect(results).toHaveLength(1);
      expect(results[0]?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
    });

    it('スタンドアロン関数 renderImagesForReport(images) も 2 引数経路で Group 6 形状を処理できる', async () => {
      const imageInfo = createMockImageInfo();

      mockGetBatchAnnotations.mockResolvedValueOnce({
        [imageInfo.id]: createMockAnnotation(createSixShapeAnnotationObjects(), 400, 400),
      });
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createSixShapeGroupMocks() as any
      );

      // 既存 SiteSurveyDetailInfo の呼び出しと同じ形（スタンドアロン関数 + options）
      const results = await renderImagesForReport([imageInfo], { format: 'jpeg', quality: 0.9 });

      expect(results).toHaveLength(1);
      expect(results[0]?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
    });
  });

  // --------------------------------------------------------------------------
  // 個別エクスポート経路: renderImages / ExportService.exportImage (Req 31.6, 32.8)
  // --------------------------------------------------------------------------

  describe('レガシー個別エクスポート経路: renderImages(images, options) の後方互換性', () => {
    it('Group 6 形状を含む注釈データで renderImages が従来どおり結果配列を返す', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation(createSixShapeAnnotationObjects(), 400, 400)
      );
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createSixShapeGroupMocks() as any
      );

      // 2 引数呼び出し（onProgress / signal なし）
      const results = await service.renderImages([imageInfo], { format: 'png', quality: 1.0 });

      expect(results).toHaveLength(1);
      expect(results[0]?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      // renderImages は個別取得を使用（バッチ取得は呼ばれない）
      expect(mockGetBatchAnnotations).not.toHaveBeenCalled();
    });

    it('スタンドアロン関数 renderImagesWithAnnotations も従来シグネチャで動作する', async () => {
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation(createSixShapeAnnotationObjects(), 400, 400)
      );
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createSixShapeGroupMocks() as any
      );

      const results = await renderImagesWithAnnotations([imageInfo], {
        format: 'jpeg',
        quality: 0.9,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
    });
  });

  // --------------------------------------------------------------------------
  // ExportService.exportImage 経路: Canvas.toDataURL の後方互換 (Req 31.6, 32.8)
  // --------------------------------------------------------------------------

  describe('ExportService.exportImage の後方互換性（Group 6 形状を含む Canvas）', () => {
    /**
     * `ExportService.exportImage` は Fabric.js Canvas を直接受け取り
     * `toDataURL` を呼ぶシンプルなラッパーである。
     * Canvas 内の注釈オブジェクトの構造（Group / 非 Group）には依存しない。
     * 本テストでは Group 6 形状を含む Canvas でも従来どおり toDataURL が呼ばれ、
     * dataURL が返ることを構造的に確認する。
     */
    it('Group 6 形状を含む Canvas でも toDataURL がそのまま呼ばれ dataURL が返る', () => {
      const exportService = new ExportService();

      // 6 形状の Group がロードされた Canvas を表すモック
      const groupShapes = createSixShapeGroupMocks();
      const mockCanvas = {
        toDataURL: vi.fn(() => 'data:image/jpeg;base64,exportImageResult'),
        getWidth: vi.fn(() => 800),
        getHeight: vi.fn(() => 600),
        getObjects: vi.fn(() => groupShapes),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = exportService.exportImage(mockCanvas as any, {
        format: 'jpeg',
        quality: 0.9,
        includeAnnotations: true,
      });

      // ExportService は注釈の中身に関与せず、toDataURL を 1 回呼んで結果を返す
      expect(mockCanvas.toDataURL).toHaveBeenCalledTimes(1);
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'jpeg',
          quality: 0.9,
          multiplier: 1,
        })
      );
      expect(result).toBe('data:image/jpeg;base64,exportImageResult');
    });

    it('PNG 形式・品質 1.0 でも Group 6 形状を含む Canvas で従来どおり動作する', () => {
      const exportService = new ExportService();
      const groupShapes = createSixShapeGroupMocks();
      const mockCanvas = {
        toDataURL: vi.fn(() => 'data:image/png;base64,exportImagePng'),
        getObjects: vi.fn(() => groupShapes),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = exportService.exportImage(mockCanvas as any, {
        format: 'png',
        quality: 1.0,
        includeAnnotations: true,
      });

      expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'png', quality: 1.0 })
      );
      expect(result).toBe('data:image/png;base64,exportImagePng');
    });
  });

  // --------------------------------------------------------------------------
  // onProgress / signal 引数省略時の挙動検証（Task 88.2 明示要件）
  // --------------------------------------------------------------------------

  describe('onProgress / signal を渡さない既存呼出点の挙動が変化していない', () => {
    /**
     * Task 84 で導入された `onProgress` / `signal` は bulkExportService の内部
     * 機能であり、AnnotationRendererService の renderImage / renderImages /
     * renderImageForReport / renderImagesForReport の public シグネチャには
     * 追加されていない。本テストは TypeScript レベルおよびランタイムレベルで
     * 既存の 1〜2 引数呼び出しが従来どおり動作することを明示する。
     */
    it('renderImage(imageInfo) - 1 引数呼び出しが従来どおり動作する', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation([{ type: 'rectangleShape' }], 400, 400)
      );
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createGroupShapeMock('rectangleShape') as any,
      ]);

      // options 省略
      const result = await service.renderImage(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
    });

    it('renderImage(imageInfo, options) - 2 引数呼び出しが従来どおり動作する', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation([{ type: 'circleShape' }], 400, 400)
      );
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createGroupShapeMock('circleShape') as any,
      ]);

      const result = await service.renderImage(imageInfo, { format: 'png', quality: 1.0 });

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
    });

    it('renderImageForReport(imageInfo, options) - 2 引数呼び出しで日本語フォント適用経路が維持される', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation([{ type: 'dimensionLine' }], 400, 400)
      );
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createDimensionGroupMock() as any,
      ]);

      const result = await service.renderImageForReport(imageInfo, {
        format: 'jpeg',
        quality: 0.9,
      });

      expect(result).not.toBeNull();
      // 報告書用経路では日本語フォントが必ず適用される
      expect(mockLoadJapaneseFont).toHaveBeenCalled();
      expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
    });

    it('renderImagesForReport は実行中に AbortSignal を受け取らないため途中中断は起きない', async () => {
      const service = new AnnotationRendererService();
      const imageInfos = [
        createMockImageInfo({ id: 'image-1' }),
        createMockImageInfo({ id: 'image-2' }),
        createMockImageInfo({ id: 'image-3' }),
      ];

      mockGetBatchAnnotations.mockResolvedValueOnce({
        'image-1': createMockAnnotation([{ type: 'rectangleShape' }], 400, 400),
        'image-2': createMockAnnotation([{ type: 'circleShape' }], 400, 400),
        'image-3': createMockAnnotation([{ type: 'freehand' }], 400, 400),
      });

      // 3 回分の enliven 呼び出し（各画像で 1 回ずつ）
      vi.mocked(util.enlivenObjects)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce([createGroupShapeMock('rectangleShape') as any])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce([createGroupShapeMock('circleShape') as any])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce([createGroupShapeMock('freehand') as any]);

      // 既存 caller は signal を渡さないため、外部キャンセル経路は存在しない
      const results = await service.renderImagesForReport(imageInfos);

      // 全画像が処理され完走する
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.imageInfo.id)).toEqual(['image-1', 'image-2', 'image-3']);
    });
  });
});
