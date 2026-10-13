/**
 * @fileoverview AnnotationEditor - フリーハンド描画が白縁取り付き専用形状として作成されることの結線テスト
 *
 * Task 115.50: 要件 32 の対象 6 形状のうちフリーハンドだけが、本番の描画経路で
 * 白縁取りを持たない素の Fabric `Path` として作成されていた。専用形状 `FreehandPath`
 * とそれを生成する `FreehandBrush` は実装・単体検証ともに存在したが、本番の
 * 描画経路（`AnnotationEditor.handleToolChange` → `canvas.freeDrawingBrush`）から
 * 一度も参照されていなかった。
 *
 * 本テストは「部品があること」ではなく「本番の経路から実際に到達すること」を検証する:
 *   1. フリーハンドツール選択時に canvas へ設定されるブラシが `FreehandBrush` であること
 *   2. Fabric が描画完了時に呼ぶ `createPath()`（`PencilBrush._finalizeAndAddPath` から
 *      呼ばれ、その戻り値がそのまま canvas へ追加される）が、白縁取り付きの
 *      `FreehandPath` を返すこと
 *   3. 生成された形状が `outline` を含めてシリアライズされること（保存・復元経路）
 *
 * Boundary: 注釈エディタのフリーハンド描画
 *
 * Requirements:
 * - 32.1: フリーハンドで描画した注釈本体線の外側に白色の縁取り線を付与して表示する
 * - 32.6: 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
 * - 32.7: 保存済みの対象注釈を再表示する際に白縁取り属性を復元して表示する
 * - 32.11: 対象ツール選択時に白縁取りが有効な初期状態でツールを起動する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上の太さで付与する
 *
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
 * @requirement site-survey/REQ-32.6
 * @requirement site-survey/REQ-32.7
 * @requirement site-survey/REQ-32.11
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// act警告とエラーログを抑制
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (
      message.includes('act(...)') ||
      message.includes('画像の読み込みに失敗しました') ||
      message.includes('注釈データの読み込みに失敗しました')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

const { mockCanvasInstance, mockFromURL } = vi.hoisted(() => {
  const mockCanvasInstance = {
    setDimensions: vi.fn(),
    backgroundImage: null as unknown,
    renderAll: vi.fn(),
    dispose: vi.fn(),
    getZoom: vi.fn(() => 1),
    setZoom: vi.fn(),
    getWidth: vi.fn(() => 800),
    getHeight: vi.fn(() => 600),
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    setViewportTransform: vi.fn(),
    getObjects: vi.fn(() => []),
    requestRenderAll: vi.fn(),
    getActiveObject: vi.fn((): unknown => null),
    discardActiveObject: vi.fn(),
    setActiveObject: vi.fn(),
    toJSON: vi.fn(() => ({ version: '6.0.0', objects: [] })),
    loadFromJSON: vi.fn(),
    viewportTransform: [1, 0, 0, 1, 0, 0],
    selection: false,
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    isDrawingMode: false,
    freeDrawingBrush: null as unknown,
    skipTargetFind: false,
    defaultCursor: 'default' as string,
    hoverCursor: 'default' as string,
    freeDrawingCursor: 'default' as string,
    setCursor: vi.fn(),
    fire: vi.fn(),
  };

  const mockFabricImageInstance = {
    scaleToWidth: vi.fn(),
    scaleToHeight: vi.fn(),
    set: vi.fn(),
    scale: vi.fn(),
    getScaledWidth: vi.fn(() => 800),
    getScaledHeight: vi.fn(() => 600),
    width: 1000,
    height: 800,
    scaleX: 0.8,
    scaleY: 0.75,
  };

  const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

  return { mockCanvasInstance, mockFabricImageInstance, mockFromURL };
});

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
  saveAnnotation: vi.fn().mockResolvedValue({ id: 'test-annotation-id' }),
  exportAnnotationJson: vi.fn().mockResolvedValue('{}'),
  updateAnnotatedThumbnail: vi.fn().mockResolvedValue({
    success: true,
    annotatedThumbnailPath: 'annotated-thumbnails/test.jpg',
    annotatedThumbnailUrl: null,
  }),
  deleteAnnotatedThumbnail: vi.fn().mockResolvedValue({
    success: true,
    annotatedThumbnailPath: null,
    annotatedThumbnailUrl: null,
  }),
}));

const mockToast = {
  toasts: [],
  addToast: vi.fn(),
  removeToast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  projectCreated: vi.fn(),
  projectUpdated: vi.fn(),
  projectDeleted: vi.fn(),
  projectStatusChanged: vi.fn(),
  operationFailed: vi.fn(),
};

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: () => ({
    attach: () => () => {},
    getTouchState: () => 'idle',
  }),
}));

vi.mock('../../../components/site-surveys/annotation-visual-feedback', () => ({
  configureHandleSizes: vi.fn(),
  applyToolCursor: vi.fn(),
  TOOL_CURSOR_MAP: {
    select: 'default',
    arrow: 'crosshair',
    text: 'text',
    dimension: 'crosshair',
    circle: 'crosshair',
    rectangle: 'crosshair',
    polygon: 'crosshair',
    polyline: 'crosshair',
    freehand: 'crosshair',
  },
}));

// Fabric.js のモック
// Path / Group は FreehandPath の Group 構造（outlinePath + bodyPath）を観測できるよう
// オプションを保持する実体を持たせる。util.joinPath は Fabric 本体と同じ結合規則
// （fractionDigits 未指定 = 丸めなし）で実装する。
vi.mock('fabric', () => {
  function MockCanvas() {
    return mockCanvasInstance;
  }

  class MockFabricObject {
    static ownDefaults = { cornerSize: 13, touchCornerSize: 24 };
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockPath {
    path: string | Array<unknown>;
    constructor(pathData?: string | Array<unknown>, options?: Record<string, unknown>) {
      this.path = pathData ?? '';
      Object.assign(this, {
        fill: 'transparent',
        stroke: '#000000',
        strokeWidth: 2,
        opacity: 1,
      });
      if (options) Object.assign(this, options);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    setCoords(): void {}
    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockShape {
    constructor(_a?: unknown, options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    setCoords(): void {}
    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockIText extends MockShape {
    enterEditing(): void {}
    exitEditing(): void {}
    selectAll(): void {}
  }

  class MockGroup {
    _objects: unknown[];
    constructor(objects?: unknown[], options?: Record<string, unknown>) {
      this._objects = objects ? [...objects] : [];
      if (options) Object.assign(this, options);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    setCoords(): void {}
    add(object: unknown): void {
      this._objects.push(object);
    }
    remove(object: unknown): void {
      const index = this._objects.indexOf(object);
      if (index > -1) this._objects.splice(index, 1);
    }
    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockPencilBrush {
    color = '#000000';
    width = 1;
    decimate = 8;
    strokeLineCap = 'round';
    strokeLineJoin = 'round';
    constructor(_canvas?: unknown) {}
    onMouseDown(_pointer: unknown, _ev?: unknown): void {}
    onMouseMove(_pointer: unknown, _ev?: unknown): void {}
    onMouseUp(_ev?: unknown): boolean {
      return true;
    }
    createPath(pathData: unknown): unknown {
      return new MockPath(pathData as string);
    }
  }

  const mockClassRegistry = { setClass: vi.fn(), getClass: vi.fn() };

  return {
    Canvas: MockCanvas,
    FabricImage: { fromURL: mockFromURL },
    FabricObject: MockFabricObject,
    Path: MockPath,
    Ellipse: MockShape,
    Rect: MockShape,
    Polygon: MockShape,
    Polyline: MockShape,
    Line: MockShape,
    Text: MockShape,
    IText: MockIText,
    Group: MockGroup,
    PencilBrush: MockPencilBrush,
    classRegistry: mockClassRegistry,
    util: {
      joinPath: (pathData: Array<Array<string | number>>) =>
        pathData.map((segment) => segment.join(' ')).join(' '),
    },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';
import { FreehandBrush, FreehandPath } from '../../../components/site-surveys/tools/FreehandTool';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

/** Fabric が `_finalizeAndAddPath` で `createPath` に渡す平滑化済みパスデータの形 */
const SMOOTHED_PATH_DATA: Array<Array<string | number>> = [
  ['M', 100, 100],
  ['Q', 120, 140, 140, 180],
  ['L', 160, 220],
];

/** Group の子（outline, body）を取得する */
function getOutlineAndBody(
  freehand: FreehandPath
): [{ stroke?: string; strokeWidth?: number }, { stroke?: string; strokeWidth?: number }] {
  const children = (
    freehand as unknown as { _objects: Array<{ stroke?: string; strokeWidth?: number }> }
  )._objects;
  if (!children || children.length < 2) {
    throw new Error(
      `Freehand は outline + body の 2 子を持つ必要がある（実際: ${children?.length}）`
    );
  }
  return [children[0]!, children[1]!];
}

/** フリーハンドツールを選択し、canvas へ設定されたブラシを返す */
async function selectFreehandAndGetBrush(): Promise<unknown> {
  const user = (await import('@testing-library/user-event')).default.setup();
  render(<AnnotationEditor {...defaultProps} />);

  await waitFor(() => {
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  await user.click(screen.getByRole('button', { name: /フリーハンド/i }));

  await waitFor(() => {
    expect(mockCanvasInstance.isDrawingMode).toBe(true);
  });

  return mockCanvasInstance.freeDrawingBrush;
}

describe('AnnotationEditor - フリーハンドの白縁取り結線 (Task 115.50)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvasInstance.isDrawingMode = false;
    mockCanvasInstance.freeDrawingBrush = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('フリーハンドツール選択時に canvas へ設定されるブラシは FreehandBrush である（Req 32.11）', async () => {
    const brush = await selectFreehandAndGetBrush();

    expect(brush).toBeInstanceOf(FreehandBrush);
  });

  it('描画完了時に Fabric が呼ぶ createPath が白縁取り付きフリーハンド形状を返す（Req 32.1）', async () => {
    const brush = (await selectFreehandAndGetBrush()) as FreehandBrush;

    const created = brush.createPath(
      SMOOTHED_PATH_DATA as unknown as Parameters<FreehandBrush['createPath']>[0]
    ) as unknown as FreehandPath;

    expect(created).toBeInstanceOf(FreehandPath);
    expect(created.type).toBe('freehand');

    const outline = created.getOutline();
    expect(outline?.enabled).toBe(true);
    expect(outline?.color).toBe('#ffffff');
    expect(outline?.width).toBeGreaterThan(0);
  });

  it('白縁取り線幅は本体線幅の 1.5 倍以上である（Req 32.2）', async () => {
    const brush = (await selectFreehandAndGetBrush()) as FreehandBrush;

    const created = brush.createPath(
      SMOOTHED_PATH_DATA as unknown as Parameters<FreehandBrush['createPath']>[0]
    ) as unknown as FreehandPath;

    const [outlineChild, bodyChild] = getOutlineAndBody(created);
    expect(outlineChild.stroke).toBe('#ffffff');
    expect(bodyChild.strokeWidth).toBeGreaterThan(0);
    expect(outlineChild.strokeWidth!).toBeGreaterThanOrEqual(bodyChild.strokeWidth! * 1.5);
  });

  it('生成された形状は outline とパス文字列を含めてシリアライズされる（Req 32.6, 32.7）', async () => {
    const brush = (await selectFreehandAndGetBrush()) as FreehandBrush;

    const created = brush.createPath(
      SMOOTHED_PATH_DATA as unknown as Parameters<FreehandBrush['createPath']>[0]
    ) as unknown as FreehandPath;

    const serialized = created.toObject();
    expect(serialized.type).toBe('freehand');
    expect(serialized.outline?.enabled).toBe(true);
    expect(serialized.outline?.color).toBe('#ffffff');
    expect(serialized.outline?.width).toBeGreaterThan(0);
    // fromObject は pathData が文字列であることを必須とする（文字列でないと
    // 安全既定値へフォールバックし白縁取りが復元されない）
    expect(typeof serialized.pathData).toBe('string');
    expect(serialized.pathData).toContain('M 100 100');
  });

  it('ブラシの本体色・線幅がスタイル設定から生成形状へ伝播する（Req 32.3 との整合）', async () => {
    const brush = (await selectFreehandAndGetBrush()) as FreehandBrush;

    brush.color = '#123456';
    brush.width = 8;

    const created = brush.createPath(
      SMOOTHED_PATH_DATA as unknown as Parameters<FreehandBrush['createPath']>[0]
    ) as unknown as FreehandPath;

    const [outlineChild, bodyChild] = getOutlineAndBody(created);
    expect(bodyChild.stroke).toBe('#123456');
    expect(bodyChild.strokeWidth).toBe(8);
    // 本体色を変えても縁取りは白のまま
    expect(outlineChild.stroke).toBe('#ffffff');
  });
});
