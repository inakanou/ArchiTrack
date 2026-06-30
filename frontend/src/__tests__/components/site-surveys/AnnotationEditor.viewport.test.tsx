/**
 * @fileoverview AnnotationEditor - useCanvasViewport 配線 / ZoomControls マウント / initialZoom・Pan 適用 統合テスト
 *
 * Task 96.1: AnnotationEditor に `useCanvasViewport` を配線して単一の
 * canvasViewportController を生成し、それを
 *   - `touchGestureManager.attach` の options.viewportController として注入
 *   - `ZoomControls`（zoom/zoomIn/zoomOut/fit）に結線
 * すること。さらに props `initialZoom` / `initialPan` を初期ビュー状態として適用すること。
 *
 * Requirements:
 * - 33.9: ズーム可能範囲を画像ビューア（Req 5）と一貫した範囲で提供する（clampZoom 経由）
 * - 34.1: ズームイン・ズームアウト・全体表示（フィット）の操作手段を提供する
 * - 34.2: 現在のズーム倍率を示す視覚的表示（倍率バッジ）を提供する
 * - 34.3: ズームイン/ズームアウト操作で倍率表示を最新のズーム倍率に更新する
 * - 34.8: ズーム操作手段の操作が背景画像への描画として誤発火しないようにする
 *
 * Boundary: AnnotationEditor (ext)
 *
 * @requirement site-survey/REQ-33.9
 * @requirement site-survey/REQ-34.1
 * @requirement site-survey/REQ-34.2
 * @requirement site-survey/REQ-34.3
 * @requirement site-survey/REQ-34.8
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TouchGestureAttachOptions } from '../../../components/site-surveys/gestures/touchGestureManager';
import type { CanvasViewportController } from '../../../components/site-surveys/gestures/canvasViewportController';

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

const { mockCanvasInstance, mockFromURL, attachSpy, createTouchGestureManagerSpy, resetZoom } =
  vi.hoisted(() => {
    // 中点ズームのために getZoom / viewportTransform を zoomToPoint と連動させる
    // （実コントローラの onZoomChange は canvas.getZoom() を読むため、ステートフルにする）
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

    const resetZoom = (): void => {
      state.zoom = 1;
      mockCanvasInstance.viewportTransform = [1, 0, 0, 1, 0, 0];
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

    const detachSpy = vi.fn();
    // attach は (canvas, getCurrentTool, options?) の 3 引数。options を捕捉する。
    const attachSpy = vi.fn(
      (_canvas: unknown, _getCurrentTool: () => string, _options?: unknown) => detachSpy
    );
    const createTouchGestureManagerSpy = vi.fn(() => ({
      attach: attachSpy,
      getTouchState: vi.fn(() => 'idle'),
    }));

    return {
      mockCanvasInstance,
      mockFabricImageInstance,
      mockFromURL,
      detachSpy,
      attachSpy,
      createTouchGestureManagerSpy,
      resetZoom,
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

// touchGestureManager のモック（attach の options を捕捉するため）
vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: createTouchGestureManagerSpy,
}));

// annotation-visual-feedback のモック
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
    isEditing?: boolean;
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

/** attach に注入された viewportController を取り出す。 */
const getInjectedController = (): CanvasViewportController => {
  const calls = attachSpy.mock.calls;
  const lastCall = calls[calls.length - 1];
  expect(lastCall).toBeDefined();
  const options = lastCall![2] as TouchGestureAttachOptions | undefined;
  expect(options).toBeDefined();
  expect(options!.viewportController).toBeDefined();
  return options!.viewportController as CanvasViewportController;
};

describe('AnnotationEditor - useCanvasViewport 配線 / ZoomControls / initialZoom・Pan (Task 96.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetZoom();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('ZoomControls マウント (Req 34.1, 34.2, 34.8)', () => {
    it('編集モードでは ZoomControls がマウントされる', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      });
      // 現在倍率バッジが初期値 100% を表示する（Req 34.2）
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('100%');
    });

    it('readOnly モードでは ZoomControls はマウントされない', async () => {
      render(<AnnotationEditor {...defaultProps} readOnly />);

      await waitFor(() => {
        expect(createTouchGestureManagerSpy).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('zoom-controls')).not.toBeInTheDocument();
    });
  });

  describe('単一 controller 共有 (touchGestureManager と ZoomControls)', () => {
    it('attach に viewportController が注入される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(attachSpy).toHaveBeenCalled();
      });

      const controller = getInjectedController();
      expect(typeof controller.zoomToPoint).toBe('function');
      expect(typeof controller.fit).toBe('function');
    });

    it('attach に注入された controller のズームが ZoomControls の倍率バッジへ反映される（同一インスタンス）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(attachSpy).toHaveBeenCalled();
      });

      const controller = getInjectedController();

      // touchGestureManager 側（注入された controller）でズームすると、
      // ZoomControls の倍率バッジ（hook 状態）が更新される＝同一インスタンスを共有している証拠。
      act(() => {
        controller.zoomToPoint({ x: 400, y: 300 }, 2);
      });

      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('200%');
      });
    });
  });

  describe('ZoomControls 操作で controller 経由ズームが起きる (Req 34.1)', () => {
    it('ズームインボタンで表示領域中央を基準に controller.zoomToPoint が呼ばれ、倍率が反映される', async () => {
      const user = userEvent.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'ズームイン' }));

      // 表示領域中央（800/2, 600/2）を基準に 1 ステップ拡大（1 + 0.1）
      expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalledWith(
        { x: 400, y: 300 },
        expect.closeTo(1.1, 5)
      );

      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('110%');
      });
    });

    it('全体表示ボタンで controller.fit が等倍へ戻す', async () => {
      const user = userEvent.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      });

      // 先に拡大しておく
      await user.click(screen.getByRole('button', { name: 'ズームイン' }));
      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('110%');
      });

      await user.click(screen.getByRole('button', { name: '全体表示' }));

      // fit は setViewportTransform([1,0,0,1,0,0]) で等倍へ戻す（Req 34.4）
      expect(mockCanvasInstance.setViewportTransform).toHaveBeenCalledWith([1, 0, 0, 1, 0, 0]);
      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('100%');
      });
    });
  });

  describe('initialZoom / initialPan の適用 (Req 33.9)', () => {
    it('initialZoom が canvas 初期化後に controller 経由で適用される', async () => {
      render(<AnnotationEditor {...defaultProps} initialZoom={2} />);

      await waitFor(() => {
        // 表示領域中央を基準に initialZoom を適用
        expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalledWith({ x: 400, y: 300 }, 2);
      });

      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('200%');
      });
    });

    it('initialPan が controller 経由で適用される（拡大時のみ有効）', async () => {
      render(<AnnotationEditor {...defaultProps} initialZoom={2} initialPan={{ x: 50, y: 60 }} />);

      await waitFor(() => {
        expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalledWith({ x: 400, y: 300 }, 2);
      });

      // pan は setViewportTransform で translate を更新する（zoom>=MIN_PAN_ZOOM のため有効）
      await waitFor(() => {
        const panCall = mockCanvasInstance.setViewportTransform.mock.calls.find(
          (call) => call[0][4] !== 0 || call[0][5] !== 0
        );
        expect(panCall).toBeDefined();
      });
    });

    it('initialZoom/initialPan 未指定時は初期ビュー適用を行わない（等倍のまま）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      });

      expect(mockCanvasInstance.zoomToPoint).not.toHaveBeenCalled();
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('100%');
    });
  });
});
