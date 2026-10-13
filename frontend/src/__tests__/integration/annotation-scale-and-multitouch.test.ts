/**
 * @fileoverview スケール非等倍時の書き出し経路における表示倍率の適用先の統合検証
 * （Task 73.2 で新設、Task 115.110 で空の主張を撤去し観測へ改めた）
 *
 * 本ファイルはかつて 3 件の `expect(true).toBe(true)`（真をそのまま主張する空の検証）で
 * 構成されており、何も観測していなかった。うち 1 件は
 * 「top-level strokeWidth を持たない Group では avgScale 経路がスキップされる」という
 * 事実に反する前提を注釈として記録していた。七形状（Arrow / Dimension / Circle /
 * Rectangle / Polygon / Polyline / Freehand）はいずれも構築時に本体線幅を集合体自身へ
 * 複写する（`super([...], { strokeWidth: mergedOptions.strokeWidth })`）ため、
 * 集合体本体にも `strokeWidth` は存在し、当該分岐は適用される。
 *
 * Task 115.110 は前提の訂正に加えて、書き出し経路の倍率の適用先を復元処理
 * （Task 115.73 / `resolveRestoredStrokeWidth`）と同じ方式へ揃えた。本ファイルは
 * その挙動を書き出しの 3 つの入口すべてで観測する。
 *
 * Requirements:
 * - 24.8: 白縁取り表現を dataURL 出力で再現する
 * - 25.9: 白アウトライン表現を dataURL 出力で再現する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に保つ（比率の基準となる本体線幅が
 *   実描画と同一の座標系であること）
 *
 * マルチタッチ誤発火の Undo 復旧（要件30.4）について本ファイルは何も観測していない。
 * かつてここには「当該契約の観測は touchGestureManager.test.ts が担う」と記していたが、
 * これは事実に反する（Task 115.110 で訂正）。同ファイルはダブルタップ・長押し判定と
 * `idle → one-finger-down → drawing | two-finger-pinch-pan | three-plus-suspend → cooldown`
 * の状態遷移およびタイマ解除だけを観測しており、`undo` の語を 1 件も含まない
 * （`grep -ci "undo"` の出力は `0`）。
 *
 * すなわち **要件 30.4 が定める Undo 1 ステップ復旧は、現在どこでも観測されていない**。
 * 観測できないものに判定を置かない（恒真の空の主張は撤去した）うえで、何が確かめられて
 * いないかをここに明記する。
 *
 * @requirement site-survey/REQ-24.8
 * @requirement site-survey/REQ-25.9
 * @requirement site-survey/REQ-32.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SurveyImageInfo, AnnotationInfo } from '../../types/site-survey.types';

const mockGetAnnotation = vi.fn();
const mockGetBatchAnnotations = vi.fn();

vi.mock('../../api/survey-annotations', () => ({
  getAnnotation: (...args: unknown[]) => mockGetAnnotation(...args),
  getBatchAnnotations: (...args: unknown[]) => mockGetBatchAnnotations(...args),
}));

vi.mock('../../components/site-surveys/tools/registerCustomShapes', () => ({}));

vi.mock('fabric', () => {
  class MockCanvas {
    backgroundImage: unknown = null;
    public addedObjects: unknown[] = [];
    add = vi.fn((obj: unknown) => {
      this.addedObjects.push(obj);
    });
    renderAll = vi.fn();
    requestRenderAll = vi.fn();
    toDataURL = vi.fn(() => 'data:image/jpeg;base64,QUJD');
    dispose = vi.fn();
    getObjects = vi.fn(() => []);
  }

  class MockFabricImage {
    set = vi.fn();
    img: unknown;
    constructor(img: unknown) {
      this.img = img;
    }
  }

  return {
    Canvas: MockCanvas,
    FabricImage: MockFabricImage,
    util: { enlivenObjects: vi.fn().mockResolvedValue([]) },
  };
});

const mockLoadJapaneseFont = vi.fn().mockResolvedValue(undefined);
const mockApplyJapaneseFontToCanvas = vi.fn();
vi.mock('../../services/JapaneseFontRenderer', () => ({
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
  resetAnnotationRendererService,
} from '../../services/export/AnnotationRendererService';
import { util } from 'fabric';

// ============================================================================
// モック構築ヘルパー
// ============================================================================

interface MockGroupShape extends Record<string, unknown> {
  setCalls: Array<Record<string, unknown>>;
  childOutline: Record<string, unknown>;
  childBody: Record<string, unknown>;
  getObjects: () => readonly unknown[];
}

/**
 * 集合体として復元された注釈のモック
 *
 * 本番（七形状の構築処理）と同じく、
 * - 子は `[outline*, body*]` の順（寸法線のみラベルが 3 番目に続くが本体線の位置は同じ）
 * - 集合体自身へ本体線幅を複写（後方互換のミラー）
 * - `getObjects()` で子を公開（Fabric Group の契約）
 * を再現する。
 */
function createMockGroupShape(
  type: string,
  bodyStrokeWidth: number,
  outlineWidthPx: number,
  extraChildren: Record<string, unknown>[] = []
): MockGroupShape {
  const childOutline: Record<string, unknown> = {
    type: 'path',
    stroke: '#ffffff',
    strokeWidth: bodyStrokeWidth + outlineWidthPx * 2,
  };
  const childBody: Record<string, unknown> = {
    type: 'path',
    stroke: '#ef4444',
    strokeWidth: bodyStrokeWidth,
  };
  const children = [childOutline, childBody, ...extraChildren];
  const setCalls: Array<Record<string, unknown>> = [];

  const obj: MockGroupShape = {
    type,
    left: 100,
    top: 50,
    scaleX: 1,
    scaleY: 1,
    // 集合体本体へ複写された線幅（本体線幅と同じ値）
    strokeWidth: bodyStrokeWidth,
    stroke: '#ef4444',
    _objects: children,
    getObjects: () => children,
    setCalls,
    childOutline,
    childBody,
    set(this: Record<string, unknown>, options: Record<string, unknown>) {
      setCalls.push({ ...options });
      Object.assign(this, options);
      return this;
    },
  };

  return obj;
}

/**
 * 自身の線で描かれる注釈（テキストの白アウトライン）のモック
 *
 * `strokeUniform: true` のため拡大率が線幅へ伝搬しない。集合体ではないので
 * `getObjects` を持たない。
 */
function createMockOutlinedText(
  fontSize: number,
  widthRatio: number
): Record<string, unknown> & { setCalls: Array<Record<string, unknown>> } {
  const setCalls: Array<Record<string, unknown>> = [];
  const obj: Record<string, unknown> & { setCalls: Array<Record<string, unknown>> } = {
    type: 'textAnnotation',
    text: 'サンプル',
    left: 100,
    top: 50,
    fontSize,
    scaleX: 1,
    scaleY: 1,
    paintFirst: 'stroke',
    stroke: '#ffffff',
    strokeWidth: fontSize * widthRatio,
    strokeUniform: true,
    fill: '#000000',
    setCalls,
    set(this: Record<string, unknown>, options: Record<string, unknown>) {
      setCalls.push({ ...options });
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

function createMockAnnotation(objects: unknown[]): AnnotationInfo {
  return {
    id: 'annotation-1',
    imageId: 'image-1',
    data: {
      version: '1.0',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保存済みJSONの素の形をそのまま渡す
      objects: objects as any,
      // 保存時 1000x500 / 描画時 400x400 → scaleX = 0.4, scaleY = 0.8, 平均 0.6
      canvasWidth: 1000,
      canvasHeight: 500,
    },
    version: '1.0',
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  };
}

/** 保存済みJSON上の集合体注釈（形状は問わない。復元後の実体はモックで与える） */
const SAVED_GROUP_OBJECT = {
  type: 'arrow',
  startPoint: { x: 100, y: 50 },
  endPoint: { x: 500, y: 250 },
  stroke: '#ef4444',
  strokeWidth: 4,
  arrowheadSize: 10,
  outline: { enabled: true, color: '#ffffff', width: 3 },
};

const SCALE_X = 0.4;
const SCALE_Y = 0.8;
const AVERAGE_SCALE = (SCALE_X + SCALE_Y) / 2;

// ============================================================================
// テスト本体
// ============================================================================

describe('書き出し経路の表示倍率の適用先（Task 115.110 / Req 32.2）', () => {
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
          toDataURL: vi.fn(() => 'data:image/jpeg;base64,QUJD'),
        } as unknown as HTMLCanvasElement;
      }
      if (tagName === 'img') {
        const img = mockImage as HTMLImageElement;
        setTimeout(() => img.onload?.(new Event('load')), 0);
        return img;
      }
      return originalCreateElement(tagName);
    });

    mockLoadJapaneseFont.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 集合体の複写線幅は実描画の本体線幅と同じ座標系に保たれる
   *
   * 分母（実描画の本体線幅）を入力値へ厳密に固定したうえで、複写値がそれと一致することを
   * 主張する（115.61 の「比較する二つの値は同一の座標系から取ること」）。
   */
  function expectMirroredStrokeWidthStaysInDrawnCoordinateSystem(
    shape: MockGroupShape,
    inputBodyStrokeWidth: number,
    inputOutlineWidthPx: number
  ): void {
    // 表示倍率は集合体の scaleX / scaleY が担う
    expect(shape.scaleX).toBeCloseTo(SCALE_X, 10);
    expect(shape.scaleY).toBeCloseTo(SCALE_Y, 10);
    // 実描画（子）の線幅は描画時に入力した値のまま。分母をここで固定する
    expect(shape.childBody.strokeWidth).toBe(inputBodyStrokeWidth);
    expect(shape.childOutline.strokeWidth).toBe(inputBodyStrokeWidth + inputOutlineWidthPx * 2);
    // 複写値は実描画の本体線幅と一致する（平均倍率を重ねて掛けない）
    expect(shape.strokeWidth).toBe(shape.childBody.strokeWidth);
    expect(shape.strokeWidth).toBe(inputBodyStrokeWidth);
  }

  describe('個別書き出し（renderImage）', () => {
    it('集合体注釈の複写線幅は実描画の本体線幅と同じ座標系に保たれる', async () => {
      const service = new AnnotationRendererService();
      mockGetAnnotation.mockResolvedValueOnce(createMockAnnotation([SAVED_GROUP_OBJECT]));

      const shape = createMockGroupShape('arrow', 4, 3);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([shape as any]);

      const result = await service.renderImage(createMockImageInfo());

      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      expectMirroredStrokeWidthStaysInDrawnCoordinateSystem(shape, 4, 3);
      // 位置は従来どおり倍率が掛かる
      expect(shape.left).toBeCloseTo(100 * SCALE_X, 10);
      expect(shape.top).toBeCloseTo(50 * SCALE_Y, 10);
    });

    it('子が 3 つある寸法線でも複写線幅は実描画の本体線幅と一致する', async () => {
      const service = new AnnotationRendererService();
      mockGetAnnotation.mockResolvedValueOnce(createMockAnnotation([SAVED_GROUP_OBJECT]));

      const shape = createMockGroupShape('dimensionLine', 6, 2, [
        { type: 'text', text: '1200', strokeWidth: 1.2 },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([shape as any]);

      await service.renderImage(createMockImageInfo());

      expectMirroredStrokeWidthStaysInDrawnCoordinateSystem(shape, 6, 2);
    });

    it('自身の線で描かれるテキスト注釈の線幅には従来どおり平均倍率が掛かる', async () => {
      const service = new AnnotationRendererService();
      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation([{ type: 'textAnnotation', text: 'サンプル' }])
      );

      const initialStrokeWidth = 24 * 0.12;
      const textObj = createMockOutlinedText(24, 0.12);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([textObj as any]);

      await service.renderImage(createMockImageInfo());

      expect(textObj.strokeWidth).toBeCloseTo(initialStrokeWidth * AVERAGE_SCALE, 10);
      expect(textObj.strokeWidth).not.toBeCloseTo(initialStrokeWidth, 10);
    });
  });

  describe('報告書向け書き出し（renderImageForReport）', () => {
    it('集合体注釈の複写線幅は実描画の本体線幅と同じ座標系に保たれる', async () => {
      const service = new AnnotationRendererService();
      mockGetAnnotation.mockResolvedValueOnce(createMockAnnotation([SAVED_GROUP_OBJECT]));

      const shape = createMockGroupShape('circleShape', 5, 4);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([shape as any]);

      const result = await service.renderImageForReport(createMockImageInfo());

      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      expectMirroredStrokeWidthStaysInDrawnCoordinateSystem(shape, 5, 4);
    });

    it('自身の線で描かれるテキスト注釈の線幅には従来どおり平均倍率が掛かる', async () => {
      const service = new AnnotationRendererService();
      mockGetAnnotation.mockResolvedValueOnce(
        createMockAnnotation([{ type: 'textAnnotation', text: 'サンプル' }])
      );

      const initialStrokeWidth = 32 * 0.15;
      const textObj = createMockOutlinedText(32, 0.15);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([textObj as any]);

      await service.renderImageForReport(createMockImageInfo());

      expect(textObj.strokeWidth).toBeCloseTo(initialStrokeWidth * AVERAGE_SCALE, 10);
    });
  });

  describe('一括取得を伴う報告書向け書き出し（renderImagesForReport）', () => {
    it('集合体注釈の複写線幅は実描画の本体線幅と同じ座標系に保たれる', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      mockGetBatchAnnotations.mockResolvedValueOnce({
        [imageInfo.id]: createMockAnnotation([SAVED_GROUP_OBJECT]),
      });

      const shape = createMockGroupShape('freehand', 9, 7);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([shape as any]);

      const results = await service.renderImagesForReport([imageInfo]);

      expect(results).toHaveLength(1);
      expect(mockGetBatchAnnotations).toHaveBeenCalledTimes(1);
      // 一括取得が成立しているため個別取得は行われない
      expect(mockGetAnnotation).not.toHaveBeenCalled();
      expectMirroredStrokeWidthStaysInDrawnCoordinateSystem(shape, 9, 7);
    });

    it('自身の線で描かれるテキスト注釈の線幅には従来どおり平均倍率が掛かる', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo();
      mockGetBatchAnnotations.mockResolvedValueOnce({
        [imageInfo.id]: createMockAnnotation([{ type: 'textAnnotation', text: 'サンプル' }]),
      });

      const initialStrokeWidth = 20 * 0.12;
      const textObj = createMockOutlinedText(20, 0.12);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([textObj as any]);

      await service.renderImagesForReport([imageInfo]);

      expect(textObj.strokeWidth).toBeCloseTo(initialStrokeWidth * AVERAGE_SCALE, 10);
    });
  });
});
