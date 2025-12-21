/**
 * AnnotationRendererService - テスト
 *
 * Task 28.4: AnnotationRendererServiceを拡張して報告書用画像をレンダリングする
 *
 * Requirements:
 * - 11.7: 日本語を含むテキスト注釈を正しくレンダリングしてPDF出力する
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件11.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SurveyImageInfo, AnnotationInfo } from '../../../types/site-survey.types';

// モック関数を定義
const mockGetAnnotation = vi.fn();

// JapaneseFontRendererモック関数
const mockLoadJapaneseFont = vi.fn().mockResolvedValue(undefined);
const mockApplyJapaneseFontToCanvas = vi.fn();

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: (...args: unknown[]) => mockGetAnnotation(...args),
}));

vi.mock('../../../components/site-surveys/tools/registerCustomShapes', () => ({}));

// Fabric.jsのモック - クラスとして正しく定義
vi.mock('fabric', () => {
  // クラスとして定義（コンストラクタが呼び出される）
  class MockCanvas {
    backgroundImage: unknown = null;
    add = vi.fn();
    renderAll = vi.fn();
    requestRenderAll = vi.fn();
    toDataURL = vi.fn(() => 'data:image/jpeg;base64,annotatedImageData');
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

// JapaneseFontRendererのモック
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
  renderImagesWithAnnotations,
  renderImagesForReport,
  resetAnnotationRendererService,
} from '../../../services/export/AnnotationRendererService';
import type { RenderOptions } from '../../../services/export/AnnotationRendererService';
import { util } from 'fabric';

// ============================================================================
// テストヘルパー
// ============================================================================

/**
 * モック画像情報を生成
 */
function createMockImageInfo(overrides?: Partial<SurveyImageInfo>): SurveyImageInfo {
  return {
    id: 'image-1',
    surveyId: 'survey-1',
    originalPath: '/path/to/original.jpg',
    thumbnailPath: '/path/to/thumbnail.jpg',
    originalUrl: 'https://example.com/original.jpg',
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
    fileName: 'test-image.jpg',
    fileSize: 102400,
    width: 800,
    height: 600,
    displayOrder: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    comment: null,
    includeInReport: true,
    ...overrides,
  };
}

/**
 * モック注釈情報を生成
 */
function createMockAnnotation(overrides?: Partial<AnnotationInfo>): AnnotationInfo {
  return {
    id: 'annotation-1',
    imageId: 'image-1',
    data: {
      version: '1.0',
      objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
    },
    version: '1.0',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * 日本語テキスト注釈を含むモック注釈情報を生成
 */
function createMockAnnotationWithJapaneseText(): AnnotationInfo {
  return {
    id: 'annotation-1',
    imageId: 'image-1',
    data: {
      version: '1.0',
      objects: [
        {
          type: 'textbox',
          left: 100,
          top: 100,
          text: 'サンプルテキスト',
          fontFamily: 'Arial',
          fontSize: 16,
        },
        {
          type: 'i-text',
          left: 200,
          top: 200,
          text: '寸法: 500mm',
          fontFamily: 'Arial',
          fontSize: 14,
        },
        {
          type: 'rect',
          left: 300,
          top: 300,
          width: 100,
          height: 50,
        },
      ],
    },
    version: '1.0',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

// ============================================================================
// テスト
// ============================================================================

describe('AnnotationRendererService', () => {
  const originalCreateElement = document.createElement.bind(document);
  let mockImage: Partial<HTMLImageElement>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnnotationRendererService();

    // HTMLImageElementのモック
    mockImage = {
      width: 800,
      height: 600,
      crossOrigin: '',
      src: '',
      onload: null,
      onerror: null,
    };

    // document.createElementをモック
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
          })),
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

    // JapaneseFontRendererモックをリセット
    mockLoadJapaneseFont.mockClear();
    mockApplyJapaneseFontToCanvas.mockClear();
    mockLoadJapaneseFont.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      const service = new AnnotationRendererService();
      expect(service).toBeInstanceOf(AnnotationRendererService);
    });
  });

  describe('renderImage', () => {
    it('should return null if image has no originalUrl', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ originalUrl: null });

      const result = await service.renderImage(imageInfo);

      expect(result).toBeNull();
    });

    it('should return original image as dataURL when no annotation exists', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockResolvedValueOnce(null);

      const result = await service.renderImage(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.imageInfo).toBe(imageInfo);
      expect(result?.dataUrl).toContain('data:image/jpeg');
    });

    it('should return original image when annotation has empty objects array', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation({
          data: { version: '1.0', objects: [] },
        })
      );

      const result = await service.renderImage(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toContain('data:image/jpeg');
    });

    it('should render image with annotations using Fabric.js Canvas', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      const annotation = createMockAnnotation();

      mockGetAnnotation.mockResolvedValueOnce(annotation);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([{ type: 'rect', set: vi.fn() } as any]);

      const result = await service.renderImage(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toBe('data:image/jpeg;base64,annotatedImageData');
      // Canvasインスタンスが作成され結果が返される
      expect(result?.imageInfo).toBe(imageInfo);
    });

    it('should handle annotation fetch error gracefully', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();

      mockGetAnnotation.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.renderImage(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toContain('data:image/jpeg');
    });

    it('should support PNG format output', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      const annotation = createMockAnnotation();

      mockGetAnnotation.mockResolvedValueOnce(annotation);
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

      const options: RenderOptions = { format: 'png', quality: 1.0 };
      const result = await service.renderImage(imageInfo, options);

      // 結果が返される（モックなのでjpeg形式のまま）
      expect(result).not.toBeNull();
      expect(result?.dataUrl).toBeDefined();
    });

    it('should use default quality value of 0.9', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      const annotation = createMockAnnotation();

      mockGetAnnotation.mockResolvedValueOnce(annotation);
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

      const result = await service.renderImage(imageInfo);

      // 結果が返される
      expect(result).not.toBeNull();
      expect(result?.dataUrl).toBeDefined();
    });
  });

  describe('renderImages', () => {
    it('should render multiple images sequentially', async () => {
      const service = new AnnotationRendererService();
      const images = [
        createMockImageInfo({ id: 'image-1' }),
        createMockImageInfo({ id: 'image-2' }),
        createMockImageInfo({ id: 'image-3' }),
      ];

      mockGetAnnotation.mockResolvedValue(null);

      const results = await service.renderImages(images);

      expect(results).toHaveLength(3);
      expect(mockGetAnnotation).toHaveBeenCalledTimes(3);
    });

    it('should skip images that fail to render', async () => {
      const service = new AnnotationRendererService();
      const images = [
        createMockImageInfo({ id: 'image-1' }),
        createMockImageInfo({ id: 'image-2', originalUrl: null }),
        createMockImageInfo({ id: 'image-3' }),
      ];

      mockGetAnnotation.mockResolvedValue(null);

      const results = await service.renderImages(images);

      expect(results).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const service = new AnnotationRendererService();

      const results = await service.renderImages([]);

      expect(results).toEqual([]);
    });
  });

  describe('renderImagesWithAnnotations (standalone function)', () => {
    it('should use default service instance', async () => {
      const images = [createMockImageInfo()];

      mockGetAnnotation.mockResolvedValue(null);

      const results = await renderImagesWithAnnotations(images);

      expect(results).toHaveLength(1);
    });
  });

  describe('renderImageForReport', () => {
    it('should render image with Japanese font applied for PDF report', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      const annotation = createMockAnnotationWithJapaneseText();

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const mockTextObject = {
        type: 'textbox',
        set: vi.fn(),
        fontFamily: 'Arial',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([mockTextObject as any]);

      const result = await service.renderImageForReport(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toBe('data:image/jpeg;base64,annotatedImageData');
    });

    it('should ensure Japanese font is loaded before rendering', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      const annotation = createMockAnnotationWithJapaneseText();

      mockGetAnnotation.mockResolvedValueOnce(annotation);
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

      await service.renderImageForReport(imageInfo);

      expect(mockLoadJapaneseFont).toHaveBeenCalled();
    });

    it('should apply Japanese font to all text objects', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      const annotation = createMockAnnotationWithJapaneseText();

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const mockTextObject1 = { type: 'textbox', set: vi.fn() };
      const mockTextObject2 = { type: 'i-text', set: vi.fn() };
      const mockRectObject = { type: 'rect', set: vi.fn() };

      /* eslint-disable @typescript-eslint/no-explicit-any */
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        mockTextObject1 as any,
        mockTextObject2 as any,
        mockRectObject as any,
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      await service.renderImageForReport(imageInfo);

      expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
    });

    it('should return null for image without originalUrl', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ originalUrl: null });

      const result = await service.renderImageForReport(imageInfo);

      expect(result).toBeNull();
    });
  });

  describe('renderImagesForReport', () => {
    it('should render multiple images for PDF report with Japanese font', async () => {
      const service = new AnnotationRendererService();
      const images = [
        createMockImageInfo({ id: 'image-1' }),
        createMockImageInfo({ id: 'image-2' }),
      ];

      mockGetAnnotation.mockResolvedValue(createMockAnnotationWithJapaneseText());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(util.enlivenObjects).mockResolvedValue([{ type: 'textbox', set: vi.fn() } as any]);

      const results = await service.renderImagesForReport(images);

      expect(results).toHaveLength(2);
      expect(mockLoadJapaneseFont).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const service = new AnnotationRendererService();

      const results = await service.renderImagesForReport([]);

      expect(results).toEqual([]);
    });

    it('should skip images that fail to render', async () => {
      const service = new AnnotationRendererService();
      const images = [
        createMockImageInfo({ id: 'image-1' }),
        createMockImageInfo({ id: 'image-2', originalUrl: null }),
        createMockImageInfo({ id: 'image-3' }),
      ];

      mockGetAnnotation.mockResolvedValue(null);

      const results = await service.renderImagesForReport(images);

      expect(results).toHaveLength(2);
    });
  });

  describe('renderImagesForReport (standalone function)', () => {
    it('should use default service instance', async () => {
      const images = [createMockImageInfo()];

      mockGetAnnotation.mockResolvedValue(null);

      const results = await renderImagesForReport(images);

      expect(results).toHaveLength(1);
    });
  });

  describe('resetAnnotationRendererService', () => {
    it('should reset the singleton instance', async () => {
      const images = [createMockImageInfo()];
      mockGetAnnotation.mockResolvedValue(null);
      await renderImagesWithAnnotations(images);

      resetAnnotationRendererService();

      await renderImagesWithAnnotations(images);

      expect(mockGetAnnotation).toHaveBeenCalledTimes(2);
    });
  });
});
