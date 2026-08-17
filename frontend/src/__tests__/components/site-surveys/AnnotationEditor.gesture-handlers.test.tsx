/**
 * @fileoverview AnnotationEditor - custom:dbltap / custom:longpress ハンドラ配線テスト
 *
 * Task 72.2: touchGestureManager から発火される custom:dbltap / custom:longpress を
 * AnnotationEditor 側でハンドリングし、以下を行うことを検証する。
 *   - custom:dbltap: target が TextAnnotation（type === 'textAnnotation' または 'i-text'）
 *     の場合、`target.enterEditing()` を呼ぶ
 *   - custom:dbltap: target が他のタイプ（例: rectangle）の場合、enterEditing を呼ばない
 *   - custom:longpress: 選択ツール選択中に長押し点へヒットテストで対象が居る場合、
 *     コンテキストメニュー状態を表示状態に遷移（Req 27.2, 27.10）
 *   - custom:longpress: 描画ツール選択中は何もしない（Req 27.9 / Req 17）
 *   - custom:longpress: 長押し点に対象が無い場合は開かない（防御的）
 *
 * Task 115.47: longpress の対象は payload.target ではなく `canvas.findTarget` の実ヒット
 * テストで解決する（buildPayload は target を設定しないため、payload.target 依存では
 * 実機のタッチ長押しでメニューが開かない）。ダブルタップ側（Task 96.3）と同一方式。
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
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';

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
      // Task 96.3: 空き領域ダブルタップのズームトグルが viewportController 経由で呼ぶ。
      zoomToPoint: vi.fn(),
      // Task 96.3: handleDoubleTap は payload.target ではなく canvas.findTarget による
      // 実ヒットテストで対象を判定する（Fabric v7 形状: { target?, subTargets, ... }）。
      findTarget: vi.fn(() => ({ target: undefined, subTargets: [], currentSubTargets: [] })),
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

/**
 * Task 96.3: handleDoubleTap はタップ点クライアント座標から canvas.findTarget で対象を
 * ヒットテストする。テストでは「タップ点に居る対象」をここでモックする。
 */
const setHitTarget = (target: unknown): void => {
  (mockCanvasInstance.findTarget as ReturnType<typeof vi.fn>).mockReturnValue({
    target,
    subTargets: [],
    currentSubTargets: [],
  });
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
    // Task 96.3: 既定は空き領域（ヒットなし）。各テストが必要に応じて setHitTarget で上書きする。
    setHitTarget(undefined);
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
      // ヒットテストでタップ点に textAnnotation が居る
      setHitTarget({ type: 'textAnnotation', enterEditing: enterEditingSpy });

      // 実 payload 形状（target なし）
      dbltapHandler({
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
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
      // ヒットテストでタップ点に i-text が居る
      setHitTarget({ type: 'i-text', enterEditing: enterEditingSpy });

      dbltapHandler({
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
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
      // ヒットテストでタップ点に rectangle が居る
      setHitTarget({ type: 'rectangle', enterEditing: enterEditingSpy });

      dbltapHandler({
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
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

  describe('handleLongPress (Req 27.2, 27.9, 27.10)', () => {
    it('target を含まない通知でも、対象の上を長押しすればコンテキストメニューが開く (Req 27.2, 27.10)', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      // 初期 activeTool は 'select'（AnnotationEditor の初期状態）
      const container = screen.getByTestId('annotation-editor-container');
      expect(container).toHaveAttribute('data-context-menu-visible', 'false');

      const longpressHandler = getRegisteredHandler('custom:longpress')!;

      // 長押し点に注釈オブジェクトが居る
      const target = { type: 'rectangle' };
      setHitTarget(target);

      // 本番 payload 形状（touchGestureManager.buildPayload は target を設定しない）
      longpressHandler({
        pointerType: 'touch',
        clientX: 120,
        clientY: 240,
        currentTool: 'select',
      });

      await waitFor(() => {
        expect(container).toHaveAttribute('data-context-menu-visible', 'true');
      });

      // メニューはヒットテストで解決した対象に対して操作を行う
      const panel = screen.getByTestId('annotation-context-menu-panel');
      expect(panel).toBeInTheDocument();

      const user = (await import('@testing-library/user-event')).default.setup();
      await user.click(screen.getByRole('button', { name: '削除' }));
      expect(mockCanvasInstance.remove).toHaveBeenCalledWith(target);
    });

    it('payload.target があってもヒットテストで対象が無ければ開かない（payload.target に依存しない）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      const container = screen.getByTestId('annotation-editor-container');
      const longpressHandler = getRegisteredHandler('custom:longpress')!;

      // 長押し点は空き領域（beforeEach で setHitTarget(undefined) 済み）だが payload には target がある
      // act で state 更新を確定させてから「開いていない」ことを判定する（未反映による偽陰性の排除）
      await act(async () => {
        longpressHandler({
          pointerType: 'touch',
          clientX: 120,
          clientY: 240,
          target: { type: 'rectangle' },
          currentTool: 'select',
        });
      });

      expect(container).toHaveAttribute('data-context-menu-visible', 'false');
      expect(screen.queryByTestId('annotation-context-menu-panel')).not.toBeInTheDocument();
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

      // 長押し点には注釈オブジェクトが居るが、描画ツール中なのでメニューは開かない
      setHitTarget({ type: 'rectangle' });
      await act(async () => {
        longpressHandler({
          pointerType: 'touch',
          clientX: 120,
          clientY: 240,
          currentTool: 'arrow',
        });
      });

      const container = screen.getByTestId('annotation-editor-container');
      // 描画ツール中の長押しはメニューを開かない
      expect(container).toHaveAttribute('data-context-menu-visible', 'false');
      expect(screen.queryByTestId('annotation-context-menu-panel')).not.toBeInTheDocument();
    });

    it('選択ツール選択中に対象の無い位置を長押し → コンテキストメニューは開かない（防御的）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      const container = screen.getByTestId('annotation-editor-container');
      expect(container).toHaveAttribute('data-context-menu-visible', 'false');

      const longpressHandler = getRegisteredHandler('custom:longpress')!;

      await act(async () => {
        longpressHandler({
          pointerType: 'touch',
          clientX: 120,
          clientY: 240,
          currentTool: 'select',
        });
      });

      expect(container).toHaveAttribute('data-context-menu-visible', 'false');
      expect(screen.queryByTestId('annotation-context-menu-panel')).not.toBeInTheDocument();
    });
  });
});
