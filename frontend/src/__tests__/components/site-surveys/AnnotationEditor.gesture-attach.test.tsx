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
 * Task 115.146 (Req 33.10): 閲覧モードと編集モードのジェスチャー操作体系の一貫性を、
 * 本番の出荷経路（`SiteSurveyImageViewerPage` → `AnnotationEditor`）で主張する。
 * 閲覧モードは `readOnly` の `AnnotationEditor` であり、編集モードと同一の
 * `touchGestureManager` を同一の `canvasViewportController` 契約で attach する。
 * この主張は従来、本番から参照されない `ImageViewer` の単体検証にしか存在せず、
 * 出荷される画面については一度も検証されていなかった（`ImageViewer` は 115.146 で撤去）。
 *
 * Boundary: AnnotationEditor (ext)
 *
 * @requirement site-survey/REQ-27.1
 * @requirement site-survey/REQ-27.2
 * @requirement site-survey/REQ-29.4
 * @requirement site-survey/REQ-29.5
 * @requirement site-survey/REQ-30.1
 * @requirement site-survey/REQ-33.10
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
  // attach は (canvas, getCurrentTool, options?) の 3 引数。options（viewportController 等）も捕捉する。
  const attachSpy = vi.fn(
    (_canvas: unknown, _getCurrentTool: () => string, _options?: unknown) => detachSpy
  );
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

  // ==========================================================================
  // Task 115.146 (Req 33.10): 閲覧モードと編集モードのジェスチャー操作体系の一貫性
  //
  // 要件33.10 は「注釈編集モードと閲覧モードとの間でズーム・パンのタッチジェスチャー
  // 操作体系を一貫させる」と定める。本番の閲覧モードは `SiteSurveyImageViewerPage` が
  // `AnnotationEditor` を `readOnly` で描画したものであり、一貫性は
  // 「同一のジェスチャー管理器が、同一のビューポート制御契約で、両モードとも
  // attach される」ことで成立する。
  //
  // 検出できる壊し方の例: 閲覧モードで attach を行わない／別のジェスチャー経路を使う／
  // 閲覧モードだけ `viewportController` を注入しない。いずれも下の主張が落ちる。
  // ==========================================================================
  describe('閲覧モードと編集モードのジェスチャー操作体系の一貫性 (Req 33.10)', () => {
    /** canvasViewportController が公開するビューポート制御の契約（同モジュールの型定義と同順）。 */
    const VIEWPORT_CONTROLLER_CONTRACT = [
      'zoomToPoint',
      'toCanvasPoint',
      'pan',
      'fit',
      'clampZoom',
      'clampPan',
      'isPanEnabled',
      'getState',
    ] as const;

    /** 直近の attach 呼出しから (canvas, getCurrentTool, options) を取り出す。 */
    const readLastAttachCall = (): {
      canvas: unknown;
      getCurrentTool: () => string;
      viewportController: Record<string, unknown>;
    } => {
      const calls = attachSpy.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      const options = lastCall![2] as { viewportController?: unknown } | undefined;
      expect(options).toBeDefined();
      expect(options!.viewportController).toBeDefined();
      return {
        canvas: lastCall![0],
        getCurrentTool: lastCall![1] as () => string,
        viewportController: options!.viewportController as Record<string, unknown>,
      };
    };

    it('閲覧のみの状態でも編集モードと同一のジェスチャー管理器・ビューポート制御が attach される', async () => {
      // --- 編集モード ---
      const editView = render(<AnnotationEditor {...defaultProps} />);
      await waitFor(() => {
        expect(attachSpy).toHaveBeenCalledTimes(1);
      });
      const editAttach = readLastAttachCall();
      expect(createTouchGestureManagerSpy).toHaveBeenCalledTimes(1);
      expect(editAttach.canvas).toBe(mockCanvasInstance);
      editView.unmount();

      attachSpy.mockClear();
      createTouchGestureManagerSpy.mockClear();

      // --- 閲覧モード（readOnly） ---
      render(<AnnotationEditor {...defaultProps} readOnly />);
      await waitFor(() => {
        expect(attachSpy).toHaveBeenCalledTimes(1);
      });
      const viewAttach = readLastAttachCall();

      // 同一のジェスチャー管理器（touchGestureManager）を経由する
      expect(createTouchGestureManagerSpy).toHaveBeenCalledTimes(1);
      expect(viewAttach.canvas).toBe(mockCanvasInstance);
      // ツール状態の問い合わせ口も両モードで同じ形（閲覧の既定は選択ツール）
      expect(typeof viewAttach.getCurrentTool).toBe('function');
      expect(viewAttach.getCurrentTool()).toBe(editAttach.getCurrentTool());

      // 同一のビューポート制御契約（canvasViewportController）で駆動される
      for (const method of VIEWPORT_CONTROLLER_CONTRACT) {
        expect(typeof editAttach.viewportController[method]).toBe('function');
        expect(typeof viewAttach.viewportController[method]).toBe('function');
      }
      expect(Object.keys(viewAttach.viewportController).sort()).toEqual(
        Object.keys(editAttach.viewportController).sort()
      );
    });
  });
});
