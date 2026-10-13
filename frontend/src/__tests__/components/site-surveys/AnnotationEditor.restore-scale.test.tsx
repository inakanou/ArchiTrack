/**
 * @fileoverview AnnotationEditor - 復元時の表示倍率の適用先（Task 115.73）
 *
 * Requirements:
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上に設定する
 *   （比率の基準となる本体線幅は、実際に描かれている線と同じ座標系の値でなければならない）
 *
 * 保存時と現在のキャンバス寸法が異なる場合、復元処理は表示倍率を適用する。集合体（Group）の
 * 注釈では、実描画は子が保持し、表示倍率は集合体の `scaleX` / `scaleY` 経由で子へ伝搬する。
 * 集合体自身の `strokeWidth` は子から複写された後方互換用の値であり、ここへ重ねて倍率を掛けると
 * 実描画と食い違う基準値が残る。
 *
 * テスト対象:
 * - 集合体の注釈: 復元後の複写された線幅が実描画の本体線幅と一致すること（倍率を掛けない）
 * - 集合体の子の線幅は復元で書き換えられないこと
 * - 位置と拡大率には従来どおり表示倍率が適用されること
 * - 集合体でない注釈（テキスト: `strokeUniform` のため拡大率が線幅へ伝搬しない）は
 *   従来どおり平均倍率が線幅へ適用されること
 *
 * Boundary: AnnotationEditor の復元処理における表示倍率の適用先
 *
 * @requirement site-survey/REQ-32.2
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

// act 警告と画像読み込みエラーログを抑制
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

vi.mock('../../../hooks/useMediaQuery', () => ({
  default: () => false,
}));

// ============================================================================
// Fabric / API モック
// ============================================================================
const { mockCanvasInstance, mockFabricImageInstance, mockFromURL, mockEnlivenObjects } = vi.hoisted(
  () => {
    const mockCanvasInstance = {
      setDimensions: vi.fn(),
      backgroundImage: null as unknown,
      renderAll: vi.fn(),
      dispose: vi.fn(),
      getZoom: vi.fn(() => 1),
      setZoom: vi.fn(),
      // 現在のキャンバス寸法（保存時 400x300 の 2 倍）
      getWidth: vi.fn(() => 800),
      getHeight: vi.fn(() => 600),
      add: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      setViewportTransform: vi.fn(),
      zoomToPoint: vi.fn(),
      getObjects: vi.fn(() => []),
      requestRenderAll: vi.fn(),
      getActiveObject: vi.fn((): unknown => null),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      toJSON: vi.fn(() => ({ version: '6.0.0', objects: [] })),
      loadFromJSON: vi.fn(),
      viewportTransform: [1, 0, 0, 1, 0, 0] as number[],
      selection: false,
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      isDrawingMode: false,
      freeDrawingBrush: null as unknown,
    };

    const mockFabricImageInstance = {
      scaleToWidth: vi.fn(),
      scaleToHeight: vi.fn(),
      set: vi.fn(),
      scale: vi.fn(),
      getScaledWidth: vi.fn(() => 800),
      getScaledHeight: vi.fn(() => 600),
      width: 800,
      height: 600,
      scaleX: 1,
      scaleY: 1,
    };

    const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));
    const mockEnlivenObjects = vi.fn(() => Promise.resolve([] as unknown[]));

    return { mockCanvasInstance, mockFabricImageInstance, mockFromURL, mockEnlivenObjects };
  }
);

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
  createTouchGestureManager: vi.fn(() => ({
    attach: vi.fn(() => vi.fn()),
    getTouchState: vi.fn(() => 'idle'),
  })),
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

vi.mock('fabric', () => {
  function MockCanvas() {
    return mockCanvasInstance;
  }
  class MockShape {
    constructor(_a?: unknown, options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    setCoords(): void {}
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
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
      this._objects = objects || [];
      if (options) Object.assign(this, options);
    }
    getObjects(): unknown[] {
      return this._objects;
    }
    setCoords(): void {}
    add(obj: unknown): void {
      this._objects.push(obj);
    }
  }
  class MockPencilBrush {
    constructor(_canvas?: unknown) {}
  }
  return {
    Canvas: MockCanvas,
    FabricImage: { fromURL: mockFromURL },
    FabricObject: MockShape,
    Path: MockShape,
    Ellipse: MockShape,
    Rect: MockShape,
    Polygon: MockShape,
    Polyline: MockShape,
    Line: MockShape,
    Text: MockShape,
    IText: MockIText,
    Group: MockGroup,
    PencilBrush: MockPencilBrush,
    classRegistry: { setClass: vi.fn(), getClass: vi.fn() },
    util: { enlivenObjects: mockEnlivenObjects },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

/**
 * 復元されたオブジェクトの最小構造（`set` と `type` を持つことが復元処理の受入条件）
 */
type RestoredStub = Record<string, unknown> & {
  set: (options: Record<string, unknown> | string, value?: unknown) => RestoredStub;
};

function createStub(props: Record<string, unknown>): RestoredStub {
  const stub = {
    ...props,
    set(options: Record<string, unknown> | string, value?: unknown) {
      if (typeof options === 'string') {
        (stub as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(stub, options);
      }
      return stub;
    },
  } as RestoredStub;
  return stub;
}

/**
 * 集合体として復元された注釈の模擬。
 * 子は白縁取り（本体 4 + 片側 3 × 2 = 10）と本体（4）。集合体自身の 4 は複写された値。
 */
function createRestoredGroupStub(): {
  group: RestoredStub;
  outlineChild: RestoredStub;
  bodyChild: RestoredStub;
} {
  const outlineChild = createStub({ strokeWidth: 10 });
  const bodyChild = createStub({ strokeWidth: 4 });
  const group = createStub({
    type: 'circleShape',
    left: 50,
    top: 30,
    scaleX: 1,
    scaleY: 1,
    strokeWidth: 4,
    getObjects: () => [outlineChild, bodyChild],
  });
  return { group, outlineChild, bodyChild };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanvasInstance.backgroundImage = null;
  mockCanvasInstance.getWidth.mockReturnValue(800);
  mockCanvasInstance.getHeight.mockReturnValue(600);
  mockFromURL.mockResolvedValue(mockFabricImageInstance);
  mockEnlivenObjects.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('AnnotationEditor - 復元時の表示倍率の適用先 (Task 115.73, Req 32.2)', () => {
  async function renderWithRestoredObjects(objects: unknown[]): Promise<void> {
    const { getAnnotation } = await import('../../../api/survey-annotations');
    (getAnnotation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        version: '1.0',
        // 保存時 400x300 → 現在 800x600（scaleX = scaleY = 2、平均倍率 2）
        canvasWidth: 400,
        canvasHeight: 300,
        objects: [{ type: 'circleShape' }],
      },
    });
    mockEnlivenObjects.mockResolvedValueOnce(objects);

    render(<AnnotationEditor {...defaultProps} />);

    await waitFor(() => {
      expect(mockCanvasInstance.add).toHaveBeenCalledTimes(objects.length);
    });
  }

  it('集合体へ複写された線幅は実描画の本体線幅と一致する（表示倍率 2 倍でも 4 のまま）', async () => {
    const { group } = createRestoredGroupStub();

    await renderWithRestoredObjects([group]);

    expect(group['strokeWidth']).toBe(4);
  });

  it('集合体の子の線幅は復元で書き換えられない（白縁取り 10 / 本体 4 のまま）', async () => {
    const { group, outlineChild, bodyChild } = createRestoredGroupStub();

    await renderWithRestoredObjects([group]);

    expect(outlineChild['strokeWidth']).toBe(10);
    expect(bodyChild['strokeWidth']).toBe(4);
  });

  it('位置と拡大率には従来どおり表示倍率が適用される', async () => {
    const { group } = createRestoredGroupStub();

    await renderWithRestoredObjects([group]);

    expect(group['left']).toBe(100);
    expect(group['top']).toBe(60);
    expect(group['scaleX']).toBe(2);
    expect(group['scaleY']).toBe(2);
  });

  it('集合体でない注釈（テキスト）の線幅には従来どおり平均倍率が適用される', async () => {
    const text = createStub({
      type: 'i-text',
      left: 10,
      top: 20,
      scaleX: 1,
      scaleY: 1,
      strokeWidth: 3,
    });

    await renderWithRestoredObjects([text]);

    expect(text['strokeWidth']).toBe(6);
    expect(text['scaleX']).toBe(2);
  });
});
