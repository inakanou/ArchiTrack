/**
 * AnnotationRendererService - Group 矢印 / paintFirst テキスト統合検証
 *
 * Task 72.6: `AnnotationRendererService` での Group 矢印と textStroke 出力の統合検証
 *
 * 設計参照:
 * - design.md §4305, §4329: Group 版 Arrow / `paintFirst` テキストが `toDataURL` で
 *   正しく出ることを検証する。現行 `:153` は `await util.enlivenObjects(...)` を
 *   使用しており、Group 化 Arrow の非同期 `fromObject` との互換性は確保される。
 *   ただし `strokeWidth` スケーリング分岐は Group 化 Arrow では Group 本体に
 *   `strokeWidth` が top-level で存在しない場合スキップされる。Fabric Group は
 *   子 Path に親の `scaleX/scaleY` を伝搬するため描画結果は正しいが、旧 Path 版と
 *   新 Group 版で内部経路が異なるため、Integration Test でスケール非等倍時の矢印
 *   レンダリングを必ず検証する。
 * - design.md §4786 (Integration Tests): 保存時キャンバスと描画時キャンバスの
 *   サイズが異なる（スケール非等倍）条件で書き出し、Group 化に伴う strokeWidth
 *   スケーリング経路変更で矢印太さ・白縁取り太さが期待通りに拡縮されることを検証。
 *
 * Requirements:
 * - 24.8: 注釈付き画像をサムネイル・プレビュー・PDF・個別エクスポートで
 *   レンダリングする際、編集画面と同一の白縁取り表現を適用する
 * - 25.9: 注釈付き画像をサムネイル・プレビュー・PDF・個別エクスポートで
 *   レンダリングする際、編集画面と同一の白アウトライン表現を適用する
 *
 * @requirement site-survey/REQ-24.8
 * @requirement site-survey/REQ-25.9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SurveyImageInfo, AnnotationInfo } from '../../../types/site-survey.types';

// ============================================================================
// モック定義（AnnotationRendererService.test.ts と同等）
// ============================================================================

const mockGetAnnotation = vi.fn();
const mockGetBatchAnnotations = vi.fn();

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: (...args: unknown[]) => mockGetAnnotation(...args),
  getBatchAnnotations: (...args: unknown[]) => mockGetBatchAnnotations(...args),
}));

vi.mock('../../../components/site-surveys/tools/registerCustomShapes', () => ({}));

// Fabric.js の型だけで使う軽量モック。toDataURL と add の呼び出し、
// enlivenObjects からの任意のモックオブジェクト受け取りを許容する。
vi.mock('fabric', () => {
  class MockCanvas {
    backgroundImage: unknown = null;
    // 追加された注釈オブジェクトを蓄積してテストから検証可能にする
    public addedObjects: unknown[] = [];
    add = vi.fn((obj: unknown) => {
      this.addedObjects.push(obj);
    });
    renderAll = vi.fn();
    requestRenderAll = vi.fn();
    // 本番と同じく有効な base64 ペイロードを返す
    toDataURL = vi.fn(
      () =>
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgAH/9k='
    );
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

// JapaneseFontRenderer は report 経路で使われる。
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
  resetAnnotationRendererService,
} from '../../../services/export/AnnotationRendererService';
import { util } from 'fabric';

// ============================================================================
// ヘルパー: モック fabric オブジェクトビルダ
// ============================================================================

/**
 * Group 版 Arrow の enlivened モック。
 *
 * 実装（ArrowTool.ts）の重要なポイント:
 * - Arrow は Group を継承し、Group 本体にも `stroke` / `strokeWidth` を
 *   後方互換のためミラー設定している（line 282-283）。
 * - 子 Path として `outlinePath`（白縁取り、strokeWidth = body + outline.width*2）
 *   と `bodyPath`（本体色、strokeWidth = body）を持つ。
 * - Fabric Group は描画時に子 Path に親の scaleX/scaleY を伝搬するため、
 *   Group の scaleX/scaleY を更新すれば子の太さも同一比率で拡縮される。
 *
 * このモックは AnnotationRendererService.ts の forEach ループで観測される
 * ミューテーションを検出できるよう、`set` メソッドで実際にプロパティを更新する。
 */
function createMockGroupArrow(
  initialStrokeWidth: number,
  bodyStrokeWidth: number,
  outlineWidthPx: number
): Record<string, unknown> & {
  setCalls: Array<Record<string, unknown>>;
  childOutline: Record<string, unknown>;
  childBody: Record<string, unknown>;
} {
  const childOutline: Record<string, unknown> = {
    type: 'path',
    stroke: '#ffffff',
    // outline は本体線幅 + outline.width * 2 で生成される（ArrowTool.ts:240）
    strokeWidth: bodyStrokeWidth + outlineWidthPx * 2,
  };
  const childBody: Record<string, unknown> = {
    type: 'path',
    stroke: '#ef4444',
    strokeWidth: bodyStrokeWidth,
  };

  const setCalls: Array<Record<string, unknown>> = [];

  const obj: Record<string, unknown> & {
    setCalls: Array<Record<string, unknown>>;
    childOutline: Record<string, unknown>;
    childBody: Record<string, unknown>;
  } = {
    type: 'arrow',
    left: 100,
    top: 80,
    scaleX: 1,
    scaleY: 1,
    // Arrow Group は後方互換のため top-level に strokeWidth / stroke をミラー設定している
    strokeWidth: initialStrokeWidth,
    stroke: '#ef4444',
    // 子 Path 参照（Group の内部構造を模擬）
    _objects: [childOutline, childBody],
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
 * paintFirst: 'stroke' テキストの enlivened モック。
 *
 * 実装（TextTool.ts）の重要なポイント:
 * - 白アウトライン有効時、IText に `paintFirst: 'stroke'`, `stroke: '#ffffff'`,
 *   `strokeWidth = fontSize * widthRatio`, `strokeUniform: true` を設定する。
 * - Text 自身が top-level の `strokeWidth` を持つため、
 *   AnnotationRendererService の strokeWidth スケーリング分岐が適用される。
 */
function createMockPaintFirstText(
  fontSize: number,
  widthRatio: number
): Record<string, unknown> & {
  setCalls: Array<Record<string, unknown>>;
} {
  const setCalls: Array<Record<string, unknown>> = [];
  const obj: Record<string, unknown> & { setCalls: Array<Record<string, unknown>> } = {
    type: 'textAnnotation',
    text: 'サンプル',
    left: 50,
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

/**
 * 基本的な画像情報のモック
 */
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

/**
 * 保存時キャンバスサイズ（1000x500）で非等倍 (400x400 target → scaleX=0.4, scaleY=0.8) を作る注釈
 */
function createMockAnnotationWithSize(
  objects: unknown[],
  canvasWidth: number,
  canvasHeight: number
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

// ============================================================================
// テスト本体
// ============================================================================

describe('AnnotationRendererService - Group Arrow / paintFirst Text 統合検証（Task 72.6）', () => {
  const originalCreateElement = document.createElement.bind(document);
  let mockImage: Partial<HTMLImageElement>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnnotationRendererService();

    // ターゲット画像サイズ = 400x400（保存時 1000x500 との非等倍比較のため）
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
  // Group 矢印 (Req 24.8)
  // --------------------------------------------------------------------------

  describe('Group 版 Arrow のレンダリング (Req 24.8)', () => {
    it('Group Arrow を含む注釈をスケール等倍条件で toDataURL 書き出しできる', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      // 保存時キャンバスも 400x400（scale = 1）
      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'arrow',
            startPoint: { x: 10, y: 10 },
            endPoint: { x: 100, y: 100 },
            stroke: '#ef4444',
            strokeWidth: 3,
            arrowheadSize: 10,
            outline: { enabled: true, color: '#ffffff', width: 2.5 },
          },
        ],
        400,
        400
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const groupArrow = createMockGroupArrow(3, 3, 2.5);
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupArrow as any,
      ]);

      const result = await service.renderImage(imageInfo);

      // dataURL が非空で base64 ペイロードを含む
      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      expect((result?.dataUrl.split('base64,')[1] ?? '').length).toBeGreaterThan(0);

      // 等倍なので set は一度も呼ばれない（scaleX===1 && scaleY===1 の分岐）
      expect(groupArrow.setCalls.length).toBe(0);
    });

    it('非等倍スケール (1000x500 → 400x400) でも Group Arrow が dataURL に書き出される', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      // 保存時 1000x500 → 描画時 400x400（scaleX = 0.4, scaleY = 0.8）
      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'arrow',
            startPoint: { x: 100, y: 50 },
            endPoint: { x: 500, y: 250 },
            stroke: '#ef4444',
            strokeWidth: 3,
            arrowheadSize: 10,
            outline: { enabled: true, color: '#ffffff', width: 2.5 },
          },
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const groupArrow = createMockGroupArrow(3, 3, 2.5);
      // 初期位置を注釈JSONと整合させる（enlivenObjects 復元後の状態を模擬）
      groupArrow.left = 100;
      groupArrow.top = 50;
      // 子 Path の初期 strokeWidth を保持して後で比較する
      const originalOutlineStrokeWidth = groupArrow.childOutline.strokeWidth as number;
      const originalBodyStrokeWidth = groupArrow.childBody.strokeWidth as number;

      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupArrow as any,
      ]);

      const result = await service.renderImage(imageInfo);

      // dataURL が正常に書き出される
      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      expect((result?.dataUrl.split('base64,')[1] ?? '').length).toBeGreaterThan(0);

      // 非等倍スケール分岐が適用された
      expect(groupArrow.setCalls.length).toBeGreaterThanOrEqual(1);

      // 位置が scale 乗算された: left 100 * 0.4 = 40, top 50 * 0.8 = 40
      expect(groupArrow.left).toBeCloseTo(40, 5);
      expect(groupArrow.top).toBeCloseTo(40, 5);
      // Group の scaleX/scaleY が非等倍で伝搬している
      expect(groupArrow.scaleX).toBeCloseTo(0.4, 5);
      expect(groupArrow.scaleY).toBeCloseTo(0.8, 5);

      // 設計不変条件: Fabric Group の scaleX/scaleY 伝搬で子 Path が拡縮されるため、
      // 子 Path 自身の strokeWidth はレンダラが直接触らない（Group Arrow の描画結果は
      // Group の scaleX/scaleY 反映で正しく拡縮される）。
      expect(groupArrow.childOutline.strokeWidth).toBe(originalOutlineStrokeWidth);
      expect(groupArrow.childBody.strokeWidth).toBe(originalBodyStrokeWidth);
    });

    it('非等倍スケール条件で複数の Group Arrow を同一 Canvas 上に書き出せる', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'arrow',
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 100, y: 100 },
            stroke: '#ef4444',
            strokeWidth: 3,
            arrowheadSize: 10,
            outline: { enabled: true, color: '#ffffff', width: 2 },
          },
          {
            type: 'arrow',
            startPoint: { x: 200, y: 200 },
            endPoint: { x: 300, y: 300 },
            stroke: '#3b82f6',
            strokeWidth: 5,
            arrowheadSize: 12,
            outline: { enabled: true, color: '#ffffff', width: 3 },
          },
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const arrow1 = createMockGroupArrow(3, 3, 2);
      const arrow2 = createMockGroupArrow(5, 5, 3);

      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric FabricObject の複雑な型を満たさないモックのため
        arrow1 as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric FabricObject の複雑な型を満たさないモックのため
        arrow2 as any,
      ]);

      const result = await service.renderImage(imageInfo);
      expect(result).not.toBeNull();

      // 両方の Group Arrow に scale 適用があった
      expect(arrow1.scaleX).toBeCloseTo(0.4, 5);
      expect(arrow1.scaleY).toBeCloseTo(0.8, 5);
      expect(arrow2.scaleX).toBeCloseTo(0.4, 5);
      expect(arrow2.scaleY).toBeCloseTo(0.8, 5);
    });
  });

  // --------------------------------------------------------------------------
  // paintFirst テキスト (Req 25.9)
  // --------------------------------------------------------------------------

  describe('paintFirst: "stroke" テキストのレンダリング (Req 25.9)', () => {
    it('paintFirst テキストをスケール等倍条件で toDataURL 書き出しできる', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'textAnnotation',
            text: 'サンプル',
            position: { x: 50, y: 50 },
            fontSize: 24,
            fontFamily: 'Arial',
            fill: '#000000',
            backgroundColor: '',
            paintFirst: 'stroke',
            stroke: '#ffffff',
            strokeWidth: 24 * 0.12,
            strokeUniform: true,
            textOutline: { enabled: true, widthRatio: 0.12 },
          },
        ],
        400,
        400
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const textObj = createMockPaintFirstText(24, 0.12);
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textObj as any,
      ]);

      const result = await service.renderImage(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      expect((result?.dataUrl.split('base64,')[1] ?? '').length).toBeGreaterThan(0);

      // 等倍なので set 呼び出しは発生しない
      expect(textObj.setCalls.length).toBe(0);
      // paintFirst / stroke 属性は enlivened 状態のまま保持される
      expect(textObj.paintFirst).toBe('stroke');
      expect(textObj.stroke).toBe('#ffffff');
      expect(textObj.strokeWidth).toBeCloseTo(24 * 0.12, 5);
    });

    it('非等倍スケール (1000x500 → 400x400) で paintFirst テキストの strokeWidth が avgScale で拡縮される', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      // scaleX = 0.4, scaleY = 0.8, avgScale = 0.6
      const fontSize = 24;
      const widthRatio = 0.12;
      const initialStrokeWidth = fontSize * widthRatio; // 2.88

      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'textAnnotation',
            text: 'サンプル',
            position: { x: 100, y: 50 },
            fontSize,
            fontFamily: 'Arial',
            fill: '#000000',
            backgroundColor: '',
            paintFirst: 'stroke',
            stroke: '#ffffff',
            strokeWidth: initialStrokeWidth,
            strokeUniform: true,
            textOutline: { enabled: true, widthRatio },
          },
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const textObj = createMockPaintFirstText(fontSize, widthRatio);
      // 初期位置を注釈JSONと整合させる
      textObj.left = 100;
      textObj.top = 50;
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textObj as any,
      ]);

      const result = await service.renderImage(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);

      // 非等倍 scale 分岐が適用された
      expect(textObj.setCalls.length).toBeGreaterThanOrEqual(1);

      // 位置が scale 乗算された
      expect(textObj.left).toBeCloseTo(100 * 0.4, 5);
      expect(textObj.top).toBeCloseTo(50 * 0.8, 5);
      expect(textObj.scaleX).toBeCloseTo(0.4, 5);
      expect(textObj.scaleY).toBeCloseTo(0.8, 5);

      // paintFirst テキストの strokeWidth は top-level に存在するため、avgScale (0.6) で拡縮される
      const avgScale = (0.4 + 0.8) / 2;
      expect(textObj.strokeWidth).toBeCloseTo(initialStrokeWidth * avgScale, 5);
      // 白アウトライン色・paintFirst 属性は維持
      expect(textObj.paintFirst).toBe('stroke');
      expect(textObj.stroke).toBe('#ffffff');
    });

    it('日本語を含む paintFirst テキストでも非等倍スケールで正常にレンダリングされる (Req 25.12 との整合性)', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const fontSize = 32;
      const widthRatio = 0.15;
      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'textAnnotation',
            text: '現場調査テキスト注釈',
            position: { x: 60, y: 40 },
            fontSize,
            fontFamily: '"Noto Sans JP", sans-serif',
            fill: '#111111',
            backgroundColor: '',
            paintFirst: 'stroke',
            stroke: '#ffffff',
            strokeWidth: fontSize * widthRatio,
            strokeUniform: true,
            textOutline: { enabled: true, widthRatio },
          },
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const textObj = createMockPaintFirstText(fontSize, widthRatio);
      textObj.text = '現場調査テキスト注釈';
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textObj as any,
      ]);

      const result = await service.renderImageForReport(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      // 日本語フォント適用が呼び出されている
      expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      // 非等倍 scale が適用されている
      expect(textObj.scaleX).toBeCloseTo(0.4, 5);
      expect(textObj.scaleY).toBeCloseTo(0.8, 5);
    });
  });

  // --------------------------------------------------------------------------
  // Group Arrow と paintFirst Text の同時レンダリング
  // --------------------------------------------------------------------------

  describe('Group Arrow + paintFirst テキスト混在（Req 24.8 + 25.9）', () => {
    it('非等倍スケールで両オブジェクトが同一 Canvas に正しく統合される', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'arrow',
            startPoint: { x: 50, y: 50 },
            endPoint: { x: 250, y: 150 },
            stroke: '#ef4444',
            strokeWidth: 4,
            arrowheadSize: 12,
            outline: { enabled: true, color: '#ffffff', width: 3 },
          },
          {
            type: 'textAnnotation',
            text: 'テキスト注釈',
            position: { x: 300, y: 300 },
            fontSize: 20,
            fontFamily: 'Arial',
            fill: '#000000',
            backgroundColor: '',
            paintFirst: 'stroke',
            stroke: '#ffffff',
            strokeWidth: 20 * 0.12,
            strokeUniform: true,
            textOutline: { enabled: true, widthRatio: 0.12 },
          },
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const groupArrow = createMockGroupArrow(4, 4, 3);
      const textObj = createMockPaintFirstText(20, 0.12);

      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        groupArrow as unknown as object,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textObj as any,
      ]);

      const result = await service.renderImageForReport(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);

      // Group Arrow: scaleX/scaleY 伝搬、子 Path は直接変更されない
      expect(groupArrow.scaleX).toBeCloseTo(0.4, 5);
      expect(groupArrow.scaleY).toBeCloseTo(0.8, 5);

      // paintFirst Text: strokeWidth が avgScale で拡縮される
      expect(textObj.scaleX).toBeCloseTo(0.4, 5);
      expect(textObj.scaleY).toBeCloseTo(0.8, 5);
      expect(textObj.strokeWidth).toBeCloseTo(20 * 0.12 * 0.6, 5);

      // Japanese font 適用コールが発生
      expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // strokeWidth スケーリング分岐の経路変更検証（設計上の不変条件）
  // --------------------------------------------------------------------------

  describe('strokeWidth スケーリング分岐の経路変更検証', () => {
    it('strokeWidth 未定義の Group Arrow（レガシー構造）ではスケーリング分岐がスキップされる', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'arrow',
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 100, y: 100 },
            stroke: '#ef4444',
            strokeWidth: 3,
            arrowheadSize: 10,
            outline: { enabled: true, color: '#ffffff', width: 2 },
          },
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      // Group に top-level strokeWidth が無いケースを再現（design.md §4329 の注釈）
      const groupArrow = createMockGroupArrow(3, 3, 2);
      // ミラー strokeWidth を削除して「Group 本体に strokeWidth が無い」状態を作る
      delete (groupArrow as Record<string, unknown>).strokeWidth;

      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupArrow as any,
      ]);

      const result = await service.renderImage(imageInfo);
      expect(result).not.toBeNull();

      // 位置 / scale は伝搬される
      expect(groupArrow.scaleX).toBeCloseTo(0.4, 5);
      expect(groupArrow.scaleY).toBeCloseTo(0.8, 5);

      // strokeWidth * avgScale の set 呼び出しは発生しない（strokeWidth 未定義の条件分岐）
      const strokeWidthSet = groupArrow.setCalls.find(
        (call) => 'strokeWidth' in call && !('left' in call)
      );
      expect(strokeWidthSet).toBeUndefined();
    });

    it('paintFirst テキストは top-level strokeWidth を持つため strokeWidth スケーリング分岐が必ず適用される', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const fontSize = 24;
      const widthRatio = 0.12;
      const initialStrokeWidth = fontSize * widthRatio;

      const annotation = createMockAnnotationWithSize(
        [
          {
            type: 'textAnnotation',
            text: 'T',
            position: { x: 0, y: 0 },
            fontSize,
            fontFamily: 'Arial',
            fill: '#000',
            backgroundColor: '',
            paintFirst: 'stroke',
            stroke: '#ffffff',
            strokeWidth: initialStrokeWidth,
            strokeUniform: true,
            textOutline: { enabled: true, widthRatio },
          },
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const textObj = createMockPaintFirstText(fontSize, widthRatio);
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textObj as any,
      ]);

      await service.renderImage(imageInfo);

      // strokeWidth を変更する set 呼び出しが少なくとも1回発生している
      const strokeWidthSet = textObj.setCalls.find(
        (call) => 'strokeWidth' in call && !('left' in call)
      );
      expect(strokeWidthSet).toBeDefined();
      expect(strokeWidthSet?.strokeWidth).toBeCloseTo(initialStrokeWidth * 0.6, 5);
    });
  });
});
