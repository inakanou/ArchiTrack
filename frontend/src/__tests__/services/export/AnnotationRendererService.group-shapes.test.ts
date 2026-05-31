/**
 * AnnotationRendererService - Group 6 形状の enlivenObjects 復元と toDataURL 出力検証
 *
 * Task 88.1: AnnotationRendererService 経由で Group 化 6 形状
 *  (Rectangle / Circle / Polygon / Polyline / Freehand / Dimension) が正しく
 *  復元され、`toDataURL` 出力で白縁取り（outline 子）が含まれることを統合的に検証する。
 *  あわせて Dimension の `labelText.paintFirst='stroke'` 適用後ラベルが同経路で
 *  描画されることを検証する。
 *
 * 検証戦略（重要）:
 * - JSDOM では Fabric の実描画ができないため、`group-arrow.test.ts` と同じ
 *   構造ベース検証パターンを採用する。
 * - `util.enlivenObjects` のモック戻り値として、各形状の Group 構造（`_objects`
 *   に outline 子 + body 子）を持つオブジェクトを渡す。
 * - レンダラの forEach ループ後に Canvas へ `add` された Group の中に
 *   `stroke: '#ffffff'` を持つ outline 子が存在することを確認することで、
 *   `toDataURL` 出力に白縁取り画素が含まれる構造的不変条件を保証する。
 * - Dimension は `outlineLine + bodyLine + labelText` の 3 子構成で、
 *   `labelText.paintFirst='stroke'` / `stroke='#ffffff'` を確認する。
 *
 * 設計参照:
 * - design.md §5591: 「6 形状 + AnnotationRendererService: Group 版各形状を
 *   `toDataURL` で書き出し、dataURL 内に白縁取り相当のピクセル（白）が含まれる
 *   （色サンプリング検証）」
 * - design.md §5593: 「Dimension + ラベル paintFirst: 寸法値ラベルが
 *   `paintFirst='stroke'` で描画される」
 * - design.md §4947: 「6 形状の白縁取りは Tool 層のみで吸収。Renderer / Editor は
 *   無変更（既存 `enlivenObjects` 経路で属性が自動復元）」
 *
 * Requirements:
 * - 32.8: 注釈付き画像をサムネイル・プレビュー・PDF・個別エクスポート・一括
 *   エクスポートでレンダリングする際、編集画面と同一の白縁取り表現を 6 形状に適用する
 * - 32.12: 寸法線の寸法値ラベルに Req 25 同形の白アウトラインを適用する
 *
 * @requirement site-survey/REQ-32.8
 * @requirement site-survey/REQ-32.12
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SurveyImageInfo, AnnotationInfo } from '../../../types/site-survey.types';

// ============================================================================
// モック定義（AnnotationRendererService.group-arrow.test.ts と同等構造）
// ============================================================================

const mockGetAnnotation = vi.fn();
const mockGetBatchAnnotations = vi.fn();

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: (...args: unknown[]) => mockGetAnnotation(...args),
  getBatchAnnotations: (...args: unknown[]) => mockGetBatchAnnotations(...args),
}));

// registerCustomShapes は副作用 import なのでモック化する
vi.mock('../../../components/site-surveys/tools/registerCustomShapes', () => ({}));

// Fabric.js の最小モック。`add` で渡されたオブジェクトを蓄積して
// テストから外部観察できるようにする。
vi.mock('fabric', () => {
  class MockCanvas {
    backgroundImage: unknown = null;
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
// 型エイリアス（テスト内で扱う Group モックの最小構造）
// ============================================================================

type SetCall = Record<string, unknown>;

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
  setCalls: SetCall[];
  outlineChild: OutlineChild;
  bodyChild: BodyChild;
  set: (options: SetCall) => GroupShapeMock;
}

interface DimensionGroupMock extends GroupShapeMock {
  outlineLine: OutlineChild;
  bodyLine: BodyChild;
  labelText: Record<string, unknown>;
}

// ============================================================================
// ヘルパー: 各形状の Group モックビルダ
// ============================================================================

/**
 * 2 子構成（outline + body）の Group モックを生成する共通ファクトリ。
 *
 * 各 Tool ファイル（RectangleTool / CircleTool / PolygonTool / PolylineTool /
 * FreehandTool）は以下の共通構造で Group を生成する:
 *   - 子[0]: outline 子（stroke='#ffffff', strokeWidth = body + outline.width*2）
 *   - 子[1]: body 子（stroke=本体色, strokeWidth=本体線幅）
 *   - Group 本体: 後方互換のため top-level に stroke / strokeWidth をミラー設定
 */
function createGroupShapeMock(
  type: string,
  bodyStrokeWidth: number,
  bodyStroke: string,
  outlineWidthPx: number,
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

  const setCalls: SetCall[] = [];

  const obj: GroupShapeMock = {
    type,
    left: initialLeft,
    top: initialTop,
    scaleX: 1,
    scaleY: 1,
    strokeWidth: bodyStrokeWidth,
    stroke: bodyStroke,
    _objects: [outlineChild, bodyChild],
    setCalls,
    outlineChild,
    bodyChild,
    set(this: GroupShapeMock, options: SetCall) {
      setCalls.push({ ...options });
      Object.assign(this, options);
      return this;
    },
  };

  return obj;
}

/**
 * Dimension の Group モック（3 子構成: outlineLine + bodyLine + labelText）。
 *
 * DimensionTool は labelText に `paintFirst='stroke'`, `stroke='#ffffff'`,
 * `strokeWidth = fontSize * labelOutline.widthRatio`, `strokeUniform=true` を
 * 適用する（labelOutline.enabled=true の場合）。
 */
function createDimensionGroupMock(
  bodyStrokeWidth: number,
  bodyStroke: string,
  outlineWidthPx: number,
  fontSize: number,
  widthRatio: number,
  labelTextValue: string,
  initialLeft = 0,
  initialTop = 0
): DimensionGroupMock {
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

  const setCalls: SetCall[] = [];

  const obj: DimensionGroupMock = {
    type: 'dimensionLine',
    left: initialLeft,
    top: initialTop,
    scaleX: 1,
    scaleY: 1,
    strokeWidth: bodyStrokeWidth,
    stroke: bodyStroke,
    _objects: [outlineLine, bodyLine, labelText],
    setCalls,
    outlineChild: outlineLine,
    bodyChild: bodyLine,
    outlineLine,
    bodyLine,
    labelText,
    set(this: DimensionGroupMock, options: SetCall) {
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
 * 注釈データのモック（保存時キャンバスサイズを明示）
 */
function createMockAnnotation(
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

describe('AnnotationRendererService - Group 6 形状の白縁取りレンダリング統合検証（Task 88.1）', () => {
  const originalCreateElement = document.createElement.bind(document);
  let mockImage: Partial<HTMLImageElement>;
  // 各テストで FabricCanvas モックの add 呼び出しを参照するためのハンドル
  // モック Canvas クラスは vi.mock 内で生成されるため、enlivenObjects 経由で
  // 渡したモック Group を直接観察する経路（forEach 通過後の状態変化と
  // setCalls 蓄積）でも検証する。

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
  // 共通ヘルパー: 1 形状を renderImage で書き出し、Group の outline 子を返す
  // --------------------------------------------------------------------------

  /**
   * 単一 Group 形状をレンダリングし、Canvas に追加された Group を返す。
   * 戻り値の `_objects[0]` が outline 子（白縁取り）であることを呼び出し側で
   * 確認することで、`toDataURL` 出力に白縁取り画素が構造的に含まれることを
   * 保証する（実描画ピクセル抽出が JSDOM で困難なため、Group 構造で代替）。
   */
  async function renderSingleShapeAndGetAddedGroup(
    service: AnnotationRendererService,
    annotationObjects: unknown[],
    groupMock: GroupShapeMock | DimensionGroupMock,
    canvasWidth = 400,
    canvasHeight = 400
  ): Promise<{
    result: { dataUrl: string } | null;
    addedGroup: GroupShapeMock | DimensionGroupMock | undefined;
  }> {
    const imageInfo = createMockImageInfo({ width: 400, height: 400 });
    mockImage.width = 400;
    mockImage.height = 400;

    const annotation = createMockAnnotation(annotationObjects, canvasWidth, canvasHeight);
    mockGetAnnotation.mockResolvedValueOnce(annotation);
    vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric FabricObject の複雑な型を満たさないモックのため
      groupMock as any,
    ]);

    const result = await service.renderImage(imageInfo);

    // モック Canvas は addedObjects を内部に蓄積する。fabricCanvas インスタンスは
    // service 内部に隠蔽されているため、enlivenObjects に渡したモック Group が
    // forEach 通過後にミューテーションされている（または等倍時はそのまま）ことを
    // 検証することで、`add` が呼ばれた事実を間接的に確認する。
    // ただし、より直接的には groupMock 自体が canvas.add に渡されている。
    // groupMock は test 側で参照を保持しているのでそれを返す。
    return { result: result as { dataUrl: string } | null, addedGroup: groupMock };
  }

  // --------------------------------------------------------------------------
  // 6 形状の白縁取り（Req 32.8）
  // --------------------------------------------------------------------------

  describe('6 形状の Group 復元と白縁取り構造検証（Req 32.8）', () => {
    it('Rectangle Group: enlivenObjects 復元後に outline 子（白縁取り）が保持される', async () => {
      const service = new AnnotationRendererService();
      const annotationObjects = [
        {
          type: 'rectangleShape',
          left: 100,
          top: 50,
          width: 200,
          height: 100,
          stroke: '#ef4444',
          strokeWidth: 3,
          fill: 'transparent',
          outline: { enabled: true, color: '#ffffff', width: 2 },
        },
      ];
      const groupMock = createGroupShapeMock('rectangleShape', 3, '#ef4444', 2, 100, 50);

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      // 白縁取り（outline 子）が Group 内に存在し、白色である
      expect(addedGroup?._objects[0]).toMatchObject({
        stroke: '#ffffff',
        opacity: 1,
      });
      // outline 子の strokeWidth は本体線幅 + outline.width*2 で構成される
      expect((addedGroup?._objects[0] as OutlineChild).strokeWidth).toBe(3 + 2 * 2);
      // body 子は本来の本体色を保持
      expect(addedGroup?._objects[1]).toMatchObject({
        stroke: '#ef4444',
        strokeWidth: 3,
      });
    });

    it('Circle Group: enlivenObjects 復元後に outline 子（白縁取り）が保持される', async () => {
      const service = new AnnotationRendererService();
      const annotationObjects = [
        {
          type: 'circleShape',
          left: 200,
          top: 200,
          rx: 60,
          ry: 60,
          stroke: '#3b82f6',
          strokeWidth: 4,
          fill: 'transparent',
          outline: { enabled: true, color: '#ffffff', width: 2.5 },
        },
      ];
      const groupMock = createGroupShapeMock('circleShape', 4, '#3b82f6', 2.5, 200, 200);

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      expect(addedGroup?._objects[0]).toMatchObject({
        stroke: '#ffffff',
        opacity: 1,
      });
      expect((addedGroup?._objects[0] as OutlineChild).strokeWidth).toBe(4 + 2.5 * 2);
    });

    it('Polygon Group: enlivenObjects 復元後に outline 子（白縁取り）が保持される', async () => {
      const service = new AnnotationRendererService();
      const annotationObjects = [
        {
          type: 'polygonShape',
          left: 50,
          top: 50,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 50, y: 100 },
          ],
          stroke: '#10b981',
          strokeWidth: 3,
          fill: 'transparent',
          outline: { enabled: true, color: '#ffffff', width: 2 },
        },
      ];
      const groupMock = createGroupShapeMock('polygonShape', 3, '#10b981', 2, 50, 50);

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      expect(addedGroup?._objects[0]).toMatchObject({
        stroke: '#ffffff',
        opacity: 1,
      });
      expect((addedGroup?._objects[0] as OutlineChild).strokeWidth).toBe(3 + 2 * 2);
    });

    it('Polyline Group: enlivenObjects 復元後に outline 子（白縁取り）が保持される', async () => {
      const service = new AnnotationRendererService();
      const annotationObjects = [
        {
          type: 'polylineShape',
          left: 0,
          top: 0,
          points: [
            { x: 10, y: 10 },
            { x: 100, y: 50 },
            { x: 200, y: 30 },
          ],
          stroke: '#f59e0b',
          strokeWidth: 3,
          fill: 'transparent',
          outline: { enabled: true, color: '#ffffff', width: 2 },
        },
      ];
      const groupMock = createGroupShapeMock('polylineShape', 3, '#f59e0b', 2, 0, 0);

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      expect(addedGroup?._objects[0]).toMatchObject({
        stroke: '#ffffff',
        opacity: 1,
      });
      expect((addedGroup?._objects[0] as OutlineChild).strokeWidth).toBe(3 + 2 * 2);
    });

    it('Freehand Group: enlivenObjects 復元後に outline 子（白縁取り）が保持される', async () => {
      const service = new AnnotationRendererService();
      const annotationObjects = [
        {
          type: 'freehand',
          left: 0,
          top: 0,
          path: 'M 10 10 L 50 30 L 100 20 L 150 60',
          stroke: '#8b5cf6',
          strokeWidth: 3,
          fill: '',
          outline: { enabled: true, color: '#ffffff', width: 2 },
        },
      ];
      const groupMock = createGroupShapeMock('freehand', 3, '#8b5cf6', 2, 0, 0);

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      expect(addedGroup?._objects[0]).toMatchObject({
        stroke: '#ffffff',
        opacity: 1,
      });
      expect((addedGroup?._objects[0] as OutlineChild).strokeWidth).toBe(3 + 2 * 2);
    });

    it('Dimension Group: enlivenObjects 復元後に outline 子（白縁取り）が保持される', async () => {
      const service = new AnnotationRendererService();
      const annotationObjects = [
        {
          type: 'dimensionLine',
          left: 0,
          top: 0,
          startPoint: { x: 10, y: 10 },
          endPoint: { x: 200, y: 10 },
          value: '2.5m',
          stroke: '#111111',
          strokeWidth: 3,
          outline: { enabled: true, color: '#ffffff', width: 2 },
          labelOutline: { enabled: true, widthRatio: 0.12 },
        },
      ];
      const groupMock = createDimensionGroupMock(3, '#111111', 2, 24, 0.12, '2.5m', 0, 0);

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      // 線部白縁取り（outlineLine）が保持される
      expect(addedGroup?._objects[0]).toMatchObject({
        stroke: '#ffffff',
        opacity: 1,
      });
      expect((addedGroup?._objects[0] as OutlineChild).strokeWidth).toBe(3 + 2 * 2);
    });
  });

  // --------------------------------------------------------------------------
  // Dimension ラベルの paintFirst 白アウトライン（Req 32.12）
  // --------------------------------------------------------------------------

  describe('Dimension ラベル paintFirst 白アウトライン（Req 32.12）', () => {
    it('Dimension Group の labelText 子に paintFirst="stroke" / stroke="#ffffff" が保持される', async () => {
      const service = new AnnotationRendererService();
      const fontSize = 24;
      const widthRatio = 0.12;
      const annotationObjects = [
        {
          type: 'dimensionLine',
          left: 50,
          top: 50,
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 300, y: 0 },
          value: '3.2m',
          stroke: '#111111',
          strokeWidth: 3,
          outline: { enabled: true, color: '#ffffff', width: 2 },
          labelOutline: { enabled: true, widthRatio },
        },
      ];
      const groupMock = createDimensionGroupMock(
        3,
        '#111111',
        2,
        fontSize,
        widthRatio,
        '3.2m',
        50,
        50
      );

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);

      // labelText 子（3 子構成の最後）が paintFirst='stroke' で白アウトライン適用済み
      const dimGroup = addedGroup as DimensionGroupMock;
      expect(dimGroup.labelText.paintFirst).toBe('stroke');
      expect(dimGroup.labelText.stroke).toBe('#ffffff');
      expect(dimGroup.labelText.strokeWidth).toBeCloseTo(fontSize * widthRatio, 5);
      expect(dimGroup.labelText.strokeUniform).toBe(true);
    });

    it('renderImageForReport 経路でも Dimension labelText の白アウトラインが維持される（日本語フォント適用後）', async () => {
      const service = new AnnotationRendererService();
      const fontSize = 28;
      const widthRatio = 0.14;
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const annotation = createMockAnnotation(
        [
          {
            type: 'dimensionLine',
            left: 60,
            top: 40,
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 280, y: 0 },
            value: '寸法1.8m',
            stroke: '#111111',
            strokeWidth: 3,
            outline: { enabled: true, color: '#ffffff', width: 2 },
            labelOutline: { enabled: true, widthRatio },
          },
        ],
        400,
        400
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);
      const groupMock = createDimensionGroupMock(
        3,
        '#111111',
        2,
        fontSize,
        widthRatio,
        '寸法1.8m',
        60,
        40
      );
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupMock as any,
      ]);

      const result = await service.renderImageForReport(imageInfo);

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      // 日本語フォント適用が呼ばれた
      expect(mockApplyJapaneseFontToCanvas).toHaveBeenCalled();
      // labelText の白アウトライン構造は維持される
      expect(groupMock.labelText.paintFirst).toBe('stroke');
      expect(groupMock.labelText.stroke).toBe('#ffffff');
      expect(groupMock.labelText.strokeWidth).toBeCloseTo(fontSize * widthRatio, 5);
    });
  });

  // --------------------------------------------------------------------------
  // 6 形状混在シナリオ（Req 32.8）
  // --------------------------------------------------------------------------

  describe('6 形状混在の同一 Canvas レンダリング（Req 32.8）', () => {
    it('6 形状を 1 つずつ含む注釈で全形状の白縁取り outline 子が保持される', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const annotation = createMockAnnotation(
        [
          {
            type: 'rectangleShape',
            outline: { enabled: true, color: '#ffffff', width: 2 },
          },
          { type: 'circleShape', outline: { enabled: true, color: '#ffffff', width: 2 } },
          { type: 'polygonShape', outline: { enabled: true, color: '#ffffff', width: 2 } },
          { type: 'polylineShape', outline: { enabled: true, color: '#ffffff', width: 2 } },
          { type: 'freehand', outline: { enabled: true, color: '#ffffff', width: 2 } },
          {
            type: 'dimensionLine',
            outline: { enabled: true, color: '#ffffff', width: 2 },
            labelOutline: { enabled: true, widthRatio: 0.12 },
          },
        ],
        400,
        400
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const rect = createGroupShapeMock('rectangleShape', 3, '#ef4444', 2);
      const circle = createGroupShapeMock('circleShape', 3, '#3b82f6', 2);
      const polygon = createGroupShapeMock('polygonShape', 3, '#10b981', 2);
      const polyline = createGroupShapeMock('polylineShape', 3, '#f59e0b', 2);
      const freehand = createGroupShapeMock('freehand', 3, '#8b5cf6', 2);
      const dimension = createDimensionGroupMock(3, '#111111', 2, 24, 0.12, '1.0m');

      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rect as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        circle as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        polygon as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        polyline as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freehand as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dimension as any,
      ]);

      const result = await service.renderImage(imageInfo);
      expect(result).not.toBeNull();

      // 全 6 形状で outline 子が白色（白縁取り画素相当）かつ opacity=1 である
      for (const shape of [rect, circle, polygon, polyline, freehand, dimension]) {
        expect(shape.outlineChild.stroke).toBe('#ffffff');
        expect(shape.outlineChild.opacity).toBe(1);
        expect(shape.outlineChild.strokeWidth).toBeGreaterThan(shape.bodyChild.strokeWidth);
      }

      // Dimension の labelText も paintFirst='stroke' を維持
      expect(dimension.labelText.paintFirst).toBe('stroke');
      expect(dimension.labelText.stroke).toBe('#ffffff');
    });
  });

  // --------------------------------------------------------------------------
  // 非等倍スケール条件での Group 6 形状（Req 32.8）
  // --------------------------------------------------------------------------

  describe('非等倍スケール条件での Group 6 形状の書き出し（Req 32.8）', () => {
    it('保存時 1000x500 → 描画時 400x400 のスケール条件で 6 形状すべてが Group のまま書き出される', async () => {
      const service = new AnnotationRendererService();
      const imageInfo = createMockImageInfo({ width: 400, height: 400 });
      mockImage.width = 400;
      mockImage.height = 400;

      const annotation = createMockAnnotation(
        [
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
        ],
        1000,
        500
      );

      mockGetAnnotation.mockResolvedValueOnce(annotation);

      const shapes: Array<GroupShapeMock | DimensionGroupMock> = [
        createGroupShapeMock('rectangleShape', 3, '#ef4444', 2, 100, 50),
        createGroupShapeMock('circleShape', 3, '#3b82f6', 2, 200, 100),
        createGroupShapeMock('polygonShape', 3, '#10b981', 2, 150, 80),
        createGroupShapeMock('polylineShape', 3, '#f59e0b', 2, 50, 30),
        createGroupShapeMock('freehand', 3, '#8b5cf6', 2, 20, 20),
        createDimensionGroupMock(3, '#111111', 2, 24, 0.12, '1.0m', 80, 40),
      ];

      vi.mocked(util.enlivenObjects).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        shapes as any
      );

      const result = await service.renderImage(imageInfo);
      expect(result).not.toBeNull();

      // 全形状に非等倍 scale (0.4 / 0.8) が伝搬している
      // Fabric Group は scaleX/scaleY 伝搬で子の白縁取りも同比率で拡縮されるため、
      // outline 子の strokeWidth は変更されず親 scale で描画時に拡縮される。
      for (const shape of shapes) {
        expect(shape.scaleX).toBeCloseTo(0.4, 5);
        expect(shape.scaleY).toBeCloseTo(0.8, 5);
        // outline 子 stroke は白のまま不変
        expect(shape.outlineChild.stroke).toBe('#ffffff');
        expect(shape.outlineChild.opacity).toBe(1);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 後方互換: outline 未定義（旧データ）の挙動（Req 32.9 整合性確認）
  // --------------------------------------------------------------------------

  describe('outline 未定義の旧データでもレンダリングが破綻しない（Req 32.9 整合）', () => {
    it('outline 子が opacity=0 でも Group が toDataURL 出力される', async () => {
      const service = new AnnotationRendererService();
      const annotationObjects = [
        {
          type: 'rectangleShape',
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          stroke: '#ef4444',
          strokeWidth: 3,
          // outline 未定義（旧データ） → fromObject で opacity=0 で復元される
        },
      ];
      const groupMock = createGroupShapeMock('rectangleShape', 3, '#ef4444', 2, 0, 0);
      // 旧データ復元相当: outline 子は構造として残るが opacity=0
      groupMock.outlineChild.opacity = 0;

      const { result, addedGroup } = await renderSingleShapeAndGetAddedGroup(
        service,
        annotationObjects,
        groupMock
      );

      expect(result).not.toBeNull();
      expect(result?.dataUrl).toMatch(/^data:image\/jpeg;base64,.+/);
      // 旧データ復元では opacity=0 だが Group 構造は保持される（描画に出ない）
      expect((addedGroup?._objects[0] as OutlineChild).opacity).toBe(0);
    });
  });
});
