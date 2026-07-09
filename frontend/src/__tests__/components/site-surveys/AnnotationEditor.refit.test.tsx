/**
 * @fileoverview AnnotationEditor - フィット計算の computeFitScale 移行・再フィット・モバイル拡大許容
 *
 * Task 101.1: 既存の原寸頭打ちフィット計算（`Math.min(maxW/imgW, maxH/imgH, 1)`）を
 * `computeFitScale` へ移行し、`allowUpscale=isMobile` を適用する。さらに `useElementSize` で
 * コンテナ実寸の変化（resize）に追従して再フィットする。ただし等倍/初期化時のみ再フィットを
 * 適用し、ユーザーがズーム中は表示状態を保持する。
 *
 * Requirements:
 * - 36.1: 画像を利用可能な表示領域の幅または高さに収まる最大倍率（フィット）で初期表示する
 * - 36.2: 原寸が表示領域より小さい場合、フィット倍率まで拡大し、原寸で頭打ちにする（モバイル）
 * - 36.4: 表示領域の変化に追従して再フィットする（ResizeObserver）
 * - 36.8: Req 33-34（ズーム/パン）の挙動を維持したまま提供する
 * - 35.7: デスクトップは原寸頭打ち（現行挙動）を維持する
 *
 * Boundary: AnnotationEditor
 *
 * @requirement site-survey/REQ-36.1
 * @requirement site-survey/REQ-36.2
 * @requirement site-survey/REQ-36.4
 * @requirement site-survey/REQ-36.8
 * @requirement site-survey/REQ-35.7
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';

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
// isMobile 切替（useMediaQuery をモックしてテスト側から制御する）
// ============================================================================
let mockIsMobile = false;
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: () => mockIsMobile,
}));

// ============================================================================
// ResizeObserver モック（jsdom 未実装。手動発火で resize を再現する）
// ============================================================================
type ResizeCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  public readonly callback: ResizeCallback;
  public readonly observed: Set<Element> = new Set();
  public readonly disconnect = vi.fn(() => {
    this.observed.clear();
  });
  constructor(callback: ResizeCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.observed.add(target);
  }
  unobserve(target: Element): void {
    this.observed.delete(target);
  }
}

function fireResizeOnAll(size: { width: number; height: number }): void {
  const entry = {
    contentRect: {
      width: size.width,
      height: size.height,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      x: 0,
      y: 0,
    } as DOMRectReadOnly,
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  };
  // 生成済みの全 ResizeObserver（複数コンテナ購読の可能性に備える）に発火する。
  MockResizeObserver.instances.forEach((observer) => {
    observer.observed.forEach((target) => {
      observer.callback(
        [{ ...entry, target } as unknown as ResizeObserverEntry],
        observer as unknown as ResizeObserver
      );
    });
  });
}

// ============================================================================
// Fabric / API モック（AnnotationEditor.viewport.test.tsx のパターンを踏襲）
// ============================================================================
const { mockCanvasInstance, mockFabricImageInstance, mockFromURL, resetCanvas } = vi.hoisted(() => {
  const state = { zoom: 1 };

  const mockCanvasInstance = {
    setDimensions: vi.fn(),
    backgroundImage: null as unknown,
    renderAll: vi.fn(),
    dispose: vi.fn(),
    getZoom: vi.fn(() => state.zoom),
    setZoom: vi.fn(),
    getWidth: vi.fn(() => 800),
    getHeight: vi.fn(() => 600),
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    setViewportTransform: vi.fn((vpt: number[]) => {
      mockCanvasInstance.viewportTransform = vpt;
      state.zoom = vpt[0]!;
    }),
    zoomToPoint: vi.fn((_point: { x: number; y: number }, z: number) => {
      state.zoom = z;
      mockCanvasInstance.viewportTransform = [z, 0, 0, z, 0, 0];
    }),
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
    width: 100,
    height: 100,
    scaleX: 1,
    scaleY: 1,
  };

  const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

  const resetCanvas = (): void => {
    state.zoom = 1;
    mockCanvasInstance.viewportTransform = [1, 0, 0, 1, 0, 0];
    mockCanvasInstance.backgroundImage = null;
    mockFabricImageInstance.width = 100;
    mockFabricImageInstance.height = 100;
    mockFabricImageInstance.scaleX = 1;
    mockFabricImageInstance.scaleY = 1;
  };

  return { mockCanvasInstance, mockFabricImageInstance, mockFromURL, resetCanvas };
});

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
    util: { enlivenObjects: vi.fn(() => Promise.resolve([])) },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvas();
  mockIsMobile = false;
  MockResizeObserver.instances = [];
  originalResizeObserver = globalThis.ResizeObserver;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = MockResizeObserver;
});

afterEach(() => {
  cleanup();
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).ResizeObserver;
  }
});

describe('AnnotationEditor - フィット計算の computeFitScale 移行 (Task 101.1)', () => {
  describe('初期フィット表示 (Req 36.1, 36.2, 35.7)', () => {
    it('デスクトップ: 原寸より小さい画像は拡大せず原寸頭打ち（scale=1）でキャンバス寸法を設定する', async () => {
      mockIsMobile = false;
      mockFabricImageInstance.width = 100;
      mockFabricImageInstance.height = 100;

      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(mockCanvasInstance.setDimensions).toHaveBeenCalled();
      });

      // allowUpscale=false → 原寸頭打ち。小画像 100x100 は 100x100 のまま（現行維持, Req 35.7）。
      expect(mockCanvasInstance.setDimensions).toHaveBeenCalledWith({ width: 100, height: 100 });
    });

    it('モバイル: 原寸より小さい画像をフィット倍率まで拡大する（allowUpscale, 上限 maxUpscale=3）', async () => {
      mockIsMobile = true;
      mockFabricImageInstance.width = 100;
      mockFabricImageInstance.height = 100;

      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(mockCanvasInstance.setDimensions).toHaveBeenCalled();
      });

      // コンテナ 800x600・padding 48 → avail 752x552。小画像は maxUpscale=3 で頭打ち → 300x300。
      // 従来の Math.min(...,1) では 100x100 のままなので、拡大許容が効いている証拠。
      expect(mockCanvasInstance.setDimensions).toHaveBeenCalledWith({ width: 300, height: 300 });
    });
  });

  describe('再フィット (Req 36.4, 36.8, 33.7)', () => {
    it('等倍表示中は resize でキャンバス寸法を再計算し、controller.fit で viewport を恒等へ戻す', async () => {
      mockIsMobile = false;
      // 大きい画像でフィット倍率 < 1 とし、コンテナ変化で寸法が変わることを観測可能にする。
      mockFabricImageInstance.width = 2000;
      mockFabricImageInstance.height = 2000;

      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(mockCanvasInstance.setDimensions).toHaveBeenCalled();
      });

      // コンテナ実寸の変化（400x400）を発火 → 再フィット。
      // avail 352x352 / 画像 2000 → scale 0.176 → 352x352。
      act(() => {
        fireResizeOnAll({ width: 400, height: 400 });
      });

      await waitFor(() => {
        expect(mockCanvasInstance.setDimensions).toHaveBeenLastCalledWith({
          width: 352,
          height: 352,
        });
      });

      // 等倍/初期化時は controller.fit（viewport 恒等リセット）を呼ぶ（Req 33-34 所有機能を呼ぶのみ）。
      expect(mockCanvasInstance.setViewportTransform).toHaveBeenCalledWith([1, 0, 0, 1, 0, 0]);
    });

    it('ユーザーがズーム中（等倍でない）は resize で再フィットせず表示状態を保持する', async () => {
      mockIsMobile = false;
      mockFabricImageInstance.width = 2000;
      mockFabricImageInstance.height = 2000;

      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(mockCanvasInstance.setDimensions).toHaveBeenCalled();
      });

      // ユーザーがズーム中（zoom=2）の状態を再現する。
      mockCanvasInstance.viewportTransform = [2, 0, 0, 2, 0, 0];

      const setDimensionsCallsBefore = mockCanvasInstance.setDimensions.mock.calls.length;
      const setViewportCallsBefore = mockCanvasInstance.setViewportTransform.mock.calls.length;

      act(() => {
        fireResizeOnAll({ width: 400, height: 400 });
      });

      // ズーム中は再フィットしない → setDimensions も controller.fit も追加で呼ばれない（Req 33.7, 36.8）。
      expect(mockCanvasInstance.setDimensions.mock.calls.length).toBe(setDimensionsCallsBefore);
      expect(mockCanvasInstance.setViewportTransform.mock.calls.length).toBe(
        setViewportCallsBefore
      );
    });
  });
});
