/**
 * @fileoverview AnnotationEditor - custom:dbltap / custom:longpress ハンドラ配線テスト
 *
 * Task 72.2: touchGestureManager から発火される custom:dbltap / custom:longpress を
 * AnnotationEditor 側でハンドリングし、以下を行うことを検証する。
 *   - custom:dbltap: target が TextAnnotation（type === 'textAnnotation' または 'i-text'）
 *     の場合、`target.enterEditing()` を呼ぶ
 *   - custom:dbltap: target が他のタイプ（例: rectangle）の場合、enterEditing を呼ばない
 *   - custom:longpress: 選択ツール選択中かつ target がある場合、コンテキストメニュー状態を
 *     表示状態に遷移（Req 27.10）
 *   - custom:longpress: 描画ツール選択中は何もしない（Req 27.9 / Req 17）
 *   - custom:longpress: target が null の場合は開かない（防御的）
 *
 * コンテキストメニューの可視状態は `data-context-menu-visible` 属性で観測する。
 *
 * Requirements:
 * - 27.1: ダブルタップで編集モード
 * - 27.7: 長押し/ダブルタップ由来操作を Undo/Redo 履歴に記録（配線レベルでは
 *   `useFabricUndoIntegration` 経由で履歴に乗るため、本テストでは直接検証しない。
 *   配線の存在と boundary 内の責務のみ検証する。）
 * - 27.8: マウス dblclick の従来挙動維持（canvas.on('mouse:dblclick') が引き続き
 *   登録されていることを確認）
 * - 27.9: 描画ツール中の長押しはメニューを表示しない
 * - 27.10: 選択ツール中の長押しはメニューを表示する
 *
 * Boundary: AnnotationEditor (ext)
 *
 * @requirement site-survey/REQ-27.1
 * @requirement site-survey/REQ-27.7
 * @requirement site-survey/REQ-27.8
 * @requirement site-survey/REQ-27.9
 * @requirement site-survey/REQ-27.10
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

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
// vi.hoisted で spy / モックを定義
// ============================================================================

const { mockCanvasInstance, mockFromURL, createTouchGestureManagerSpy, configureHandleSizesSpy } =
  vi.hoisted(() => {
    // canvas.on('event', handler) 呼出しを型安全に蓄積する map
    const registeredHandlers = new Map<string, (...args: unknown[]) => void>();

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
      on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
        registeredHandlers.set(eventName, handler);
      }),
      off: vi.fn((eventName: string) => {
        registeredHandlers.delete(eventName);
      }),
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
      // テスト用: 登録されたハンドラを取得
      __getHandler: (eventName: string): ((...args: unknown[]) => void) | undefined =>
        registeredHandlers.get(eventName),
      __clearHandlers: () => {
        registeredHandlers.clear();
      },
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
    const attachSpy = vi.fn((_canvas: unknown, _getCurrentTool: () => string) => detachSpy);
    const createTouchGestureManagerSpy = vi.fn(() => ({
      attach: attachSpy,
      getTouchState: vi.fn(() => 'idle'),
    }));

    const configureHandleSizesSpy = vi.fn();

    return {
      mockCanvasInstance,
      mockFromURL,
      createTouchGestureManagerSpy,
      configureHandleSizesSpy,
    };
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
  createTouchGestureManager: createTouchGestureManagerSpy,
}));

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

vi.mock('fabric', () => {
  function MockCanvas(this: Record<string, unknown>) {
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
// テスト用ヘルパ: 登録済みハンドラ取得
// ============================================================================

type HandlerAccess = {
  __getHandler: (eventName: string) => ((payload: unknown) => void) | undefined;
  __clearHandlers: () => void;
};

const getRegisteredHandler = (eventName: string): ((payload: unknown) => void) | undefined => {
  return (mockCanvasInstance as unknown as HandlerAccess).__getHandler(eventName);
};

// ============================================================================
// テストスイート
// ============================================================================

describe('AnnotationEditor - custom:dbltap / custom:longpress ハンドラ (Task 72.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockCanvasInstance as unknown as HandlerAccess).__clearHandlers();
    Object.values(mockCanvasInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('ハンドラ登録 (canvas.on) の配線', () => {
    it('初期化時に canvas.on("custom:dbltap", handler) が登録される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
      });
    });

    it('初期化時に canvas.on("custom:longpress", handler) が登録される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });
    });

    it('初期化時に canvas.on("mouse:dblclick", handler) が引き続き登録される (Req 27.8 後方互換)', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('mouse:dblclick')).toBeDefined();
      });
    });

    it('アンマウント時に canvas.off("custom:dbltap", ...) / canvas.off("custom:longpress", ...) が呼ばれる', async () => {
      const { unmount } = render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      unmount();

      // unmount 後に off 呼出しで両ハンドラが解除されている（登録簿がクリアされている）
      expect(getRegisteredHandler('custom:dbltap')).toBeUndefined();
      expect(getRegisteredHandler('custom:longpress')).toBeUndefined();
    });
  });

  describe('handleDoubleTap (Req 27.1)', () => {
    it('target が textAnnotation（TextAnnotation）なら target.enterEditing() を呼ぶ', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
      });

      const dbltapHandler = getRegisteredHandler('custom:dbltap')!;

      const enterEditingSpy = vi.fn();
      const target = {
        type: 'textAnnotation',
        enterEditing: enterEditingSpy,
      };

      dbltapHandler({
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
        target,
        currentTool: 'select',
      });

      expect(enterEditingSpy).toHaveBeenCalledTimes(1);
    });

    it('target が i-text なら target.enterEditing() を呼ぶ', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
      });

      const dbltapHandler = getRegisteredHandler('custom:dbltap')!;

      const enterEditingSpy = vi.fn();
      const target = {
        type: 'i-text',
        enterEditing: enterEditingSpy,
      };

      dbltapHandler({
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
        target,
        currentTool: 'select',
      });

      expect(enterEditingSpy).toHaveBeenCalledTimes(1);
    });

    it('target が rectangle なら enterEditing は呼ばれない', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
      });

      const dbltapHandler = getRegisteredHandler('custom:dbltap')!;

      const enterEditingSpy = vi.fn();
      const target = {
        type: 'rectangle',
        enterEditing: enterEditingSpy,
      };

      dbltapHandler({
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
        target,
        currentTool: 'select',
      });

      expect(enterEditingSpy).not.toHaveBeenCalled();
    });

    it('target が undefined なら enterEditing は呼ばれない（防御的）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
      });

      const dbltapHandler = getRegisteredHandler('custom:dbltap')!;

      // enterEditing を持つオブジェクトが target に入らないケース
      expect(() =>
        dbltapHandler({
          pointerType: 'touch',
          clientX: 100,
          clientY: 200,
          currentTool: 'select',
        })
      ).not.toThrow();
    });
  });

  describe('handleLongPress (Req 27.9, 27.10)', () => {
    it('選択ツール選択中に target ありで長押し → コンテキストメニュー state が visible になる (Req 27.10)', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      // 初期 activeTool は 'select'（AnnotationEditor の初期状態）
      const container = screen.getByTestId('annotation-editor-container');
      expect(container).toHaveAttribute('data-context-menu-visible', 'false');

      const longpressHandler = getRegisteredHandler('custom:longpress')!;

      const target = { type: 'rectangle' };
      longpressHandler({
        pointerType: 'touch',
        clientX: 120,
        clientY: 240,
        target,
        currentTool: 'select',
      });

      await waitFor(() => {
        expect(container).toHaveAttribute('data-context-menu-visible', 'true');
      });
    });

    it('描画ツール選択中に target ありで長押し → コンテキストメニューは開かない (Req 27.9 / Req 17)', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      // 矢印ツールへ切替（描画ツール）
      const arrowButton = screen.getByRole('button', { name: /矢印/i });
      await user.click(arrowButton);

      await waitFor(() => {
        expect(arrowButton).toHaveAttribute('aria-pressed', 'true');
      });

      const longpressHandler = getRegisteredHandler('custom:longpress')!;

      const target = { type: 'rectangle' };
      longpressHandler({
        pointerType: 'touch',
        clientX: 120,
        clientY: 240,
        target,
        currentTool: 'arrow',
      });

      const container = screen.getByTestId('annotation-editor-container');
      // 描画ツール中の長押しはメニューを開かない
      expect(container).toHaveAttribute('data-context-menu-visible', 'false');
    });

    it('選択ツール選択中に target なしで長押し → コンテキストメニューは開かない（防御的）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      const container = screen.getByTestId('annotation-editor-container');
      expect(container).toHaveAttribute('data-context-menu-visible', 'false');

      const longpressHandler = getRegisteredHandler('custom:longpress')!;

      longpressHandler({
        pointerType: 'touch',
        clientX: 120,
        clientY: 240,
        currentTool: 'select',
      });

      expect(container).toHaveAttribute('data-context-menu-visible', 'false');
    });
  });
});
