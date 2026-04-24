/**
 * @fileoverview AnnotationEditor - touchGestureManager attach/detach + configureHandleSizes 統合テスト
 *
 * Task 72.1: AnnotationEditor 初期化時に `touchGestureManager.attach()` を呼び、
 * unmount 時に detach が呼ばれること。`configureHandleSizes()` も初期化時に 1 回呼ばれること。
 * Canvas 初期化時に `enablePointerEvents: true` が渡されること（design.md §4611）。
 *
 * Requirements:
 * - 27.1: タッチ環境でのダブルタップ検知基盤（attach 経由）
 * - 27.2: タッチ環境での長押し検知基盤（attach 経由）
 * - 29.4, 29.5: タッチ/マウスでハンドルサイズ切替
 * - 30.1: 2本指入力時の描画中断（attach 経由）
 *
 * Boundary: AnnotationEditor (ext)
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

// ============================================================================
// vi.hoisted で spy / モックを定義（ホイスト対応）
// ============================================================================

const {
  mockCanvasInstance,
  mockFabricImageInstance,
  mockFromURL,
  canvasConstructorSpy,
  detachSpy,
  attachSpy,
  createTouchGestureManagerSpy,
  configureHandleSizesSpy,
} = vi.hoisted(() => {
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

  // Fabric Canvas コンストラクタの引数を捕捉するための spy
  const canvasConstructorSpy = vi.fn();

  // touchGestureManager のモック
  const detachSpy = vi.fn();
  const attachSpy = vi.fn((_canvas: unknown, _getCurrentTool: () => string) => detachSpy);
  const createTouchGestureManagerSpy = vi.fn(() => ({
    attach: attachSpy,
    getTouchState: vi.fn(() => 'idle'),
  }));

  // annotation-visual-feedback のモック
  const configureHandleSizesSpy = vi.fn();

  return {
    mockCanvasInstance,
    mockFabricImageInstance,
    mockFromURL,
    canvasConstructorSpy,
    detachSpy,
    attachSpy,
    createTouchGestureManagerSpy,
    configureHandleSizesSpy,
  };
});

// survey-annotations APIのモック
vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
  saveAnnotation: vi.fn().mockResolvedValue({ id: 'test-annotation-id' }),
  exportAnnotationJson: vi.fn().mockResolvedValue('{}'),
  updateThumbnail: vi.fn().mockResolvedValue({ success: true, thumbnailPath: '/test/path' }),
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

// touchGestureManager のモック
vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: createTouchGestureManagerSpy,
}));

// annotation-visual-feedback のモック（configureHandleSizes 呼出検証用）
vi.mock('../../../components/site-surveys/annotation-visual-feedback', () => ({
  configureHandleSizes: configureHandleSizesSpy,
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

// Fabric.js のモック（コンストラクタ引数を記録）
vi.mock('fabric', () => {
  function MockCanvas(
    this: Record<string, unknown>,
    canvasElement: HTMLCanvasElement,
    options?: Record<string, unknown>
  ) {
    canvasConstructorSpy(canvasElement, options);
    return mockCanvasInstance;
  }

  class MockPath {
    constructor(_path?: string, options?: Record<string, unknown>) {
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
  }

  class MockIText {
    isEditing?: boolean;
    constructor(_text?: string, options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    setCoords(): void {}
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    enterEditing(): void {
      this.isEditing = true;
    }
    exitEditing(): void {
      this.isEditing = false;
    }
    selectAll(): void {}
  }

  class MockGroup {
    _objects: unknown[];
    constructor(objects?: unknown[], options?: Record<string, unknown>) {
      this._objects = objects || [];
      if (options) Object.assign(this, options);
    }
    setCoords(): void {}
    add(obj: unknown): void {
      this._objects.push(obj);
    }
  }

  class MockPencilBrush {
    constructor(_canvas?: unknown) {}
  }

  class MockFabricObject {
    constructor(options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
  }

  const mockClassRegistry = {
    setClass: vi.fn(),
    getClass: vi.fn(),
  };

  return {
    Canvas: MockCanvas,
    FabricImage: {
      fromURL: mockFromURL,
    },
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
      enlivenObjects: vi.fn(() => Promise.resolve([])),
    },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

// ============================================================================
// テストスイート
// ============================================================================

describe('AnnotationEditor - touchGestureManager 統合 (Task 72.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mockCanvasInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
    Object.values(mockFabricImageInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('Canvas 初期化オプション (design.md §4611)', () => {
    it('FabricCanvas コンストラクタに enablePointerEvents: true が渡される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(canvasConstructorSpy).toHaveBeenCalled();
      });

      // 最初の呼出しの options 引数を取り出す
      const callArgs = canvasConstructorSpy.mock.calls[0];
      expect(callArgs).toBeDefined();
      const options = callArgs![1] as Record<string, unknown>;
      expect(options).toBeDefined();
      expect(options.enablePointerEvents).toBe(true);
    });
  });

  describe('touchGestureManager.attach / detach (Req 27.1, 27.2, 30.1)', () => {
    it('マウント時に createTouchGestureManager が呼ばれ、attach が canvas と getCurrentTool で 1 回呼ばれる', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(createTouchGestureManagerSpy).toHaveBeenCalledTimes(1);
        expect(attachSpy).toHaveBeenCalledTimes(1);
      });

      // attach は (canvas, getCurrentTool) の 2 引数で呼ばれる
      const firstCall = attachSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [canvasArg, getCurrentToolArg] = firstCall!;
      expect(canvasArg).toBe(mockCanvasInstance);
      expect(typeof getCurrentToolArg).toBe('function');
    });

    it('attach に渡された getCurrentTool() は現在のツール名を返す（初期値は "select"）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(attachSpy).toHaveBeenCalled();
      });

      const firstCall = attachSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const getCurrentTool = firstCall![1];
      expect(getCurrentTool()).toBe('select');
    });

    it('アンマウント時に detach が呼ばれる', async () => {
      const { unmount } = render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(attachSpy).toHaveBeenCalled();
      });

      // unmount 前は detach はまだ呼ばれていない
      expect(detachSpy).not.toHaveBeenCalled();

      unmount();

      expect(detachSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('configureHandleSizes (Req 29.4, 29.5)', () => {
    it('マウント時に configureHandleSizes が 1 回呼ばれる', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(configureHandleSizesSpy).toHaveBeenCalledTimes(1);
      });
    });
  });
});
