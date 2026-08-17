/**
 * @fileoverview AnnotationEditor - 既定スタイルの供給元が一元管理の資材であることの検証
 *
 * Task 115.60 (Req 26.1, 26.5): 注釈編集画面が既定スタイルを自前の定数として局所宣言し、
 * 一元管理の資材（`annotation-style-tokens.ts` の `ANNOTATION_DEFAULTS` を橋渡しする
 * `annotation-toolbar.constants.ts` の `DEFAULT_STYLE_OPTIONS`）が供給する値を覆い隠していた。
 * 中央の既定線幅は 3、既定本体色は `#e53935` だが、局所宣言は 2 / `#ff0000` であり、
 * 実際に描かれる注釈は中央の意図と異なっていた。
 *
 * 本テストは「中央に一元管理した」ことではなく「一元管理された値が注釈編集画面から
 * 実際に使われている」ことを、画面が公開するスタイルパネルの入力値という経路で検証する。
 *
 * `FIELD_OBSERVERS` は `StyleOptions` の全フィールドを網羅することを自ら主張するため、
 * 中央の資材にフィールドが増えた場合や、画面が局所宣言を再導入して中央と食い違わせた
 * 場合のいずれでも失敗する。
 *
 * Boundary: 注釈編集画面の既定スタイル値の供給元
 *
 * Requirements:
 * - 26.1: 初期線幅をモバイル画面でも明瞭に視認できる太さ（概ね3論理ピクセル以上）に設定する
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を設定資材として一元管理する
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.5
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

  return { mockCanvasInstance, mockFromURL };
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

  class MockPath extends MockShape {
    path: unknown;
    constructor(pathData?: unknown, options?: Record<string, unknown>) {
      super(undefined, options);
      this.path = pathData ?? '';
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
    createPath(pathData: unknown): unknown {
      return new MockPath(pathData);
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
import type { StyleOptions } from '../../../components/site-surveys/annotation-toolbar.constants';
import { DEFAULT_STYLE_OPTIONS } from '../../../components/site-surveys/annotation-toolbar.constants';
import { ANNOTATION_DEFAULTS } from '../../../components/site-surveys/annotation-style-tokens';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

/**
 * `StyleOptions` の各フィールドについて、注釈編集画面の UI 上での観測手段と
 * 一元管理の資材が定める期待値を対応づける。
 *
 * `toolLabel` はスタイルパネルに当該フィールドの入力を出現させるツール
 * （スタイルパネルは選択ツールでは表示されず、フィールドごとに表示条件が異なる）。
 */
const FIELD_OBSERVERS: Record<
  keyof StyleOptions,
  { toolLabel: string; testId: string; expected: string }
> = {
  strokeColor: {
    toolLabel: '矢印',
    testId: 'color-picker',
    expected: ANNOTATION_DEFAULTS.stroke,
  },
  strokeWidth: {
    toolLabel: '矢印',
    testId: 'line-width',
    expected: String(ANNOTATION_DEFAULTS.strokeWidth),
  },
  fillColor: {
    toolLabel: '四角形',
    testId: 'fill-color-picker',
    // 塗りつぶし入力は空文字（＝塗りつぶし無し）を色入力へ与えられないため、
    // 画面側が `#ffffff` を代替表示する。中央の値が空でなくなれば期待値も追随する。
    expected: ANNOTATION_DEFAULTS.fill || '#ffffff',
  },
  fontSize: {
    toolLabel: 'テキスト',
    testId: 'font-size',
    expected: String(ANNOTATION_DEFAULTS.fontSize),
  },
};

/**
 * 注釈編集画面を描画し、指定ツールを選択したうえで当該入力の表示値を返す
 */
async function readDefaultStyleValue(toolLabel: string, testId: string): Promise<string> {
  const user = userEvent.setup();
  render(<AnnotationEditor {...defaultProps} />);

  await waitFor(() => {
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  await user.click(screen.getByRole('button', { name: toolLabel }));

  const input = await screen.findByTestId(testId);
  return (input as HTMLInputElement).value;
}

describe('AnnotationEditor - 既定スタイルの供給元は一元管理の資材である (Task 115.60)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvasInstance.isDrawingMode = false;
    mockCanvasInstance.freeDrawingBrush = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('観測手段は一元管理の既定スタイルの全フィールドを網羅する (Req 26.5)', () => {
    expect(Object.keys(FIELD_OBSERVERS).sort()).toEqual(Object.keys(DEFAULT_STYLE_OPTIONS).sort());
  });

  it.each(
    (Object.keys(FIELD_OBSERVERS) as Array<keyof StyleOptions>).map((field) => ({
      field,
      ...FIELD_OBSERVERS[field],
    }))
  )(
    '$field の初期表示値は一元管理の資材が供給する値と一致する (Req 26.5)',
    async ({ toolLabel, testId, expected }) => {
      await expect(readDefaultStyleValue(toolLabel, testId)).resolves.toBe(expected);
    }
  );

  it('初期線幅はモバイルでも視認できる太さ（3以上）で画面に供給される (Req 26.1)', async () => {
    const value = await readDefaultStyleValue('矢印', 'line-width');

    expect(Number(value)).toBeGreaterThanOrEqual(3);
  });
});
