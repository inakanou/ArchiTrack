/**
 * JapaneseTextExportRendering - 日本語テキスト注釈エクスポートレンダリングテスト
 *
 * Task 29.4: 日本語テキスト注釈の正確なレンダリング検証
 * - 個別画像エクスポート時の日本語テキスト表示確認
 * - Fabric.js Canvas上のテキスト注釈がエクスポート画像に正しく含まれることを検証
 *
 * Requirements:
 * - 12.5: 日本語テキスト注釈が画像エクスポート時に正確にレンダリングされること
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件12.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SurveyImageInfo, AnnotationInfo } from '../../../types/site-survey.types';

// ============================================================================
// モック定義
// ============================================================================

// 注釈取得モック
const mockGetAnnotation = vi.fn();

// JapaneseFontRendererモック
const mockLoadJapaneseFont = vi.fn().mockResolvedValue(undefined);
const mockApplyJapaneseFontToCanvas = vi.fn();
const mockIsJapaneseFontLoaded = vi.fn().mockReturnValue(true);
const mockGetJapaneseFontFamily = vi.fn().mockReturnValue('"Noto Sans JP", sans-serif');

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: (...args: unknown[]) => mockGetAnnotation(...args),
}));

vi.mock('../../../components/site-surveys/tools/registerCustomShapes', () => ({}));

// JapaneseFontRendererのモック
vi.mock('../../../services/JapaneseFontRenderer', () => ({
  default: vi.fn(),
  JapaneseFontRenderer: vi.fn(),
  loadJapaneseFont: () => mockLoadJapaneseFont(),
  isJapaneseFontLoaded: () => mockIsJapaneseFontLoaded(),
  getJapaneseFontFamily: () => mockGetJapaneseFontFamily(),
  applyJapaneseFontToCanvas: (canvas: unknown) => mockApplyJapaneseFontToCanvas(canvas),
  waitForFontLoad: () => mockLoadJapaneseFont(),
  resetDefaultRenderer: vi.fn(),
  JAPANESE_FONT_FAMILY: '"Noto Sans JP"',
  JAPANESE_FONT_FALLBACK:
    '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif',
}));

// Fabric.jsモック
const mockToDataURL = vi.fn(() => 'data:image/jpeg;base64,exportedImageWithJapaneseText');
const mockRenderAll = vi.fn();
const mockAdd = vi.fn();
const mockDispose = vi.fn();
const mockGetObjects = vi.fn(() => []);

vi.mock('fabric', () => {
  class MockCanvas {
    backgroundImage: unknown = null;
    add = mockAdd;
    renderAll = mockRenderAll;
    requestRenderAll = vi.fn();
    toDataURL = mockToDataURL;
    dispose = mockDispose;
    getObjects = mockGetObjects;
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

import {
  AnnotationRendererService,
  resetAnnotationRendererService,
} from '../../../services/export/AnnotationRendererService';
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
          text: '寸法: 1000mm',
          fontFamily: 'Arial',
          fontSize: 16,
        },
        {
          type: 'i-text',
          left: 200,
          top: 200,
          text: '現場調査メモ',
          fontFamily: 'Arial',
          fontSize: 14,
        },
        {
          type: 'textAnnotation',
          left: 300,
          top: 300,
          text: 'ひらがなテスト',
          fontFamily: 'sans-serif',
          fontSize: 12,
        },
      ],
    },
    version: '1.0',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

/**
 * 複数の日本語文字タイプを含むモック注釈情報を生成
 */
function createMockAnnotationWithMixedJapaneseText(): AnnotationInfo {
  return {
    id: 'annotation-mixed',
    imageId: 'image-1',
    data: {
      version: '1.0',
      objects: [
        {
          type: 'textbox',
          left: 100,
          top: 100,
          text: 'ひらがな: あいうえお',
          fontFamily: 'Arial',
          fontSize: 16,
        },
        {
          type: 'i-text',
          left: 200,
          top: 200,
          text: 'カタカナ: アイウエオ',
          fontFamily: 'Arial',
          fontSize: 14,
        },
        {
          type: 'textbox',
          left: 300,
          top: 300,
          text: '漢字: 現場調査',
          fontFamily: 'Arial',
          fontSize: 14,
        },
        {
          type: 'i-text',
          left: 400,
          top: 400,
          text: '混合: 寸法100mm（サンプル）',
          fontFamily: 'Arial',
          fontSize: 12,
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

describe('Task 29.4: 日本語テキスト注釈の正確なレンダリング検証', () => {
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

    // モックをリセット
    mockLoadJapaneseFont.mockClear();
    mockApplyJapaneseFontToCanvas.mockClear();
    mockIsJapaneseFontLoaded.mockClear();
    mockGetJapaneseFontFamily.mockClear();
    mockLoadJapaneseFont.mockResolvedValue(undefined);
    mockIsJapaneseFontLoaded.mockReturnValue(true);
    mockGetJapaneseFontFamily.mockReturnValue('"Noto Sans JP", sans-serif');
    mockToDataURL.mockClear();
    mockRenderAll.mockClear();
    mockAdd.mockClear();
    mockDispose.mockClear();
    mockGetObjects.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Requirements 12.5: 個別画像エクスポート時の日本語テキストレンダリング', () => {
    describe('renderImageForReport - 日本語フォント適用の検証', () => {
      it('エクスポート前に日本語フォントがロードされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

        await service.renderImageForReport(imageInfo);

        // 日本語フォントがロードされたことを確認
        expect(mockLoadJapaneseFont).toHaveBeenCalled();
      });

      it('日本語テキスト注釈に日本語フォントが適用されること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);

        // テキストオブジェクトのモック
        const mockTextObjects = [
          { type: 'textbox', set: vi.fn(), text: '寸法: 1000mm' },
          { type: 'i-text', set: vi.fn(), text: '現場調査メモ' },
          { type: 'textAnnotation', set: vi.fn(), text: 'ひらがなテスト' },
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce(mockTextObjects as any);

        await service.renderImageForReport(imageInfo);

        // 日本語フォントがCanvasに適用されたことを確認
        expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      });

      it('エクスポート画像が生成されること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

        const result = await service.renderImageForReport(imageInfo);

        // エクスポート結果が返されること
        expect(result).not.toBeNull();
        expect(result?.dataUrl).toBeDefined();
        expect(result?.dataUrl).toContain('data:image');
      });
    });

    describe('日本語文字タイプ別のレンダリング検証', () => {
      it('ひらがなを含むテキストがレンダリングされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation: AnnotationInfo = {
          id: 'annotation-hiragana',
          imageId: 'image-1',
          data: {
            version: '1.0',
            objects: [
              {
                type: 'textbox',
                left: 100,
                top: 100,
                text: 'ひらがなテスト',
                fontFamily: 'Arial',
                fontSize: 16,
              },
            ],
          },
          version: '1.0',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        };

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        const mockTextObject = { type: 'textbox', set: vi.fn(), text: 'ひらがなテスト' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([mockTextObject as any]);

        const result = await service.renderImageForReport(imageInfo);

        expect(result).not.toBeNull();
        expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      });

      it('カタカナを含むテキストがレンダリングされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation: AnnotationInfo = {
          id: 'annotation-katakana',
          imageId: 'image-1',
          data: {
            version: '1.0',
            objects: [
              {
                type: 'i-text',
                left: 100,
                top: 100,
                text: 'カタカナテスト',
                fontFamily: 'Arial',
                fontSize: 16,
              },
            ],
          },
          version: '1.0',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        };

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        const mockTextObject = { type: 'i-text', set: vi.fn(), text: 'カタカナテスト' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([mockTextObject as any]);

        const result = await service.renderImageForReport(imageInfo);

        expect(result).not.toBeNull();
        expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      });

      it('漢字を含むテキストがレンダリングされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation: AnnotationInfo = {
          id: 'annotation-kanji',
          imageId: 'image-1',
          data: {
            version: '1.0',
            objects: [
              {
                type: 'textbox',
                left: 100,
                top: 100,
                text: '現場調査報告',
                fontFamily: 'Arial',
                fontSize: 16,
              },
            ],
          },
          version: '1.0',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        };

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        const mockTextObject = { type: 'textbox', set: vi.fn(), text: '現場調査報告' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([mockTextObject as any]);

        const result = await service.renderImageForReport(imageInfo);

        expect(result).not.toBeNull();
        expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      });

      it('日本語と英数字の混合テキストがレンダリングされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation: AnnotationInfo = {
          id: 'annotation-mixed',
          imageId: 'image-1',
          data: {
            version: '1.0',
            objects: [
              {
                type: 'textbox',
                left: 100,
                top: 100,
                text: '寸法: 1000mm（サンプル）',
                fontFamily: 'Arial',
                fontSize: 16,
              },
            ],
          },
          version: '1.0',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        };

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        const mockTextObject = { type: 'textbox', set: vi.fn(), text: '寸法: 1000mm（サンプル）' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([mockTextObject as any]);

        const result = await service.renderImageForReport(imageInfo);

        expect(result).not.toBeNull();
        expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      });
    });

    describe('複数の日本語テキスト注釈の同時レンダリング', () => {
      it('複数の日本語テキスト注釈が全て正しくレンダリングされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithMixedJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);

        const mockTextObjects = [
          { type: 'textbox', set: vi.fn(), text: 'ひらがな: あいうえお' },
          { type: 'i-text', set: vi.fn(), text: 'カタカナ: アイウエオ' },
          { type: 'textbox', set: vi.fn(), text: '漢字: 現場調査' },
          { type: 'i-text', set: vi.fn(), text: '混合: 寸法100mm（サンプル）' },
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce(mockTextObjects as any);

        const result = await service.renderImageForReport(imageInfo);

        expect(result).not.toBeNull();
        // 全てのテキストオブジェクトがCanvasに追加されること
        expect(mockAdd).toHaveBeenCalledTimes(4);
        // 日本語フォントが適用されること
        expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      });
    });

    describe('エラーハンドリング', () => {
      it('日本語フォントロード失敗時もエクスポートが継続されること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        // フォントロード失敗をシミュレート
        mockLoadJapaneseFont.mockRejectedValueOnce(new Error('Font load failed'));

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

        // フォントロード失敗時もエクスポートが成功すること（フォールバック）
        const result = await service.renderImageForReport(imageInfo);

        expect(result).not.toBeNull();
        expect(result?.dataUrl).toBeDefined();
      });

      it('注釈がない画像でも正常にエクスポートされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();

        // 注釈なし
        mockGetAnnotation.mockResolvedValueOnce(null);

        const result = await service.renderImageForReport(imageInfo);

        expect(result).not.toBeNull();
        expect(result?.dataUrl).toBeDefined();
      });
    });

    describe('エクスポート品質設定', () => {
      it('JPEG形式でエクスポートできること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

        await service.renderImageForReport(imageInfo, { format: 'jpeg', quality: 0.9 });

        // toDataURLが呼ばれたことを確認
        expect(mockToDataURL).toHaveBeenCalled();
      });

      it('PNG形式でエクスポートできること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

        await service.renderImageForReport(imageInfo, { format: 'png', quality: 1.0 });

        expect(mockToDataURL).toHaveBeenCalled();
      });
    });

    describe('Canvas操作の検証', () => {
      it('レンダリング後にCanvasがクリーンアップされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

        await service.renderImageForReport(imageInfo);

        // dispose()が呼ばれてクリーンアップされること
        expect(mockDispose).toHaveBeenCalled();
      });

      it('Canvasが正しくレンダリングされること', async () => {
        const service = new AnnotationRendererService();
        const imageInfo = createMockImageInfo();
        const annotation = createMockAnnotationWithJapaneseText();

        mockGetAnnotation.mockResolvedValueOnce(annotation);
        vi.mocked(util.enlivenObjects).mockResolvedValueOnce([]);

        await service.renderImageForReport(imageInfo);

        // renderAll()が呼ばれたことを確認
        expect(mockRenderAll).toHaveBeenCalled();
      });
    });
  });
});
