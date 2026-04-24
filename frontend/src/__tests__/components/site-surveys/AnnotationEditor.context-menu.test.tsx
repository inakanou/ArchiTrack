/**
 * @fileoverview AnnotationEditor - AnnotationContextMenu のマウントと状態管理テスト
 *
 * Task 72.3: AnnotationContextMenu を AnnotationEditor にマウントし、以下を検証する。
 *   - 選択ツール中に `custom:longpress` を発火 → メニュー表示（編集/複製/削除ボタン）
 *   - 「削除」タップ → `canvas.remove(target)` が呼ばれ、メニューが閉じる
 *   - 「複製」タップ → `target.clone()` が呼ばれ、Promise 解決後に `canvas.add(cloned)` が呼ばれ、
 *     cloned の left/top は元の値 + 20 になる
 *   - 「編集」タップ（テキスト対象） → `target.enterEditing()` が呼ばれる
 *   - オーバーレイ（メニュー外領域）クリック → メニューが閉じる
 *   - `canvas.skipTargetFind` がメニュー可視中のみ true、閉じると false に戻る
 *
 * Requirements:
 * - 27.2: 長押しでコンテキストメニュー表示
 * - 27.3: 各アクション実行（edit/duplicate/delete）
 * - 27.4: メニュー表示中は背景描画抑止（canvas.skipTargetFind = true）
 * - 27.5: メニュー外タップで閉じる
 * - 27.7: Undo/Redo 履歴に記録（useFabricUndoIntegration が object:added/object:removed を
 *   自然に捕捉するため、本テストでは canvas 操作が実行されることを確認する）
 *
 * Boundary: AnnotationEditor (ext)
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
      skipTargetFind: false as boolean,
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
// テスト用ヘルパ
// ============================================================================

type HandlerAccess = {
  __getHandler: (eventName: string) => ((payload: unknown) => void) | undefined;
  __clearHandlers: () => void;
};

const getRegisteredHandler = (eventName: string): ((payload: unknown) => void) | undefined => {
  return (mockCanvasInstance as unknown as HandlerAccess).__getHandler(eventName);
};

/**
 * 選択ツール中に target に対して長押しを発火してメニューを開く共通処理
 */
const openMenuWith = async (
  target: Record<string, unknown>,
  clientX = 120,
  clientY = 240
): Promise<void> => {
  const longpressHandler = getRegisteredHandler('custom:longpress');
  if (!longpressHandler) {
    throw new Error('custom:longpress handler is not registered');
  }
  await act(async () => {
    longpressHandler({
      pointerType: 'touch',
      clientX,
      clientY,
      target,
      currentTool: 'select',
    });
  });
};

// ============================================================================
// テストスイート
// ============================================================================

describe('AnnotationEditor - AnnotationContextMenu 統合 (Task 72.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockCanvasInstance as unknown as HandlerAccess).__clearHandlers();
    // skipTargetFind の初期値もリセット
    mockCanvasInstance.skipTargetFind = false;
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

  describe('メニュー表示 (Req 27.2)', () => {
    it('選択ツール中に custom:longpress を発火すると AnnotationContextMenu が表示される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      const target = { type: 'rectangle' };
      await openMenuWith(target);

      // メニューの各ボタンがレンダリングされる
      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '複製' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });
  });

  describe('削除アクション (Req 27.3, 27.7)', () => {
    it('「削除」ボタンをタップすると canvas.remove(target) が1回呼ばれ、メニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      const target = { type: 'rectangle', left: 50, top: 60 };
      await openMenuWith(target);

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      // canvas.remove が target を引数に1回呼ばれる
      expect(mockCanvasInstance.remove).toHaveBeenCalledTimes(1);
      expect(mockCanvasInstance.remove).toHaveBeenCalledWith(target);

      // メニューが閉じる（ボタンが DOM から消える）
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
      });

      // 再描画要求
      expect(mockCanvasInstance.requestRenderAll).toHaveBeenCalled();
    });
  });

  describe('複製アクション (Req 27.3, 27.7)', () => {
    it('「複製」ボタンをタップすると target.clone() が呼ばれ、Promise 解決後に canvas.add(cloned) が呼ばれる。cloned の left/top は元の値 + 20', async () => {
      const user = userEvent.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      // clone は Fabric v6 の仕様で Promise<FabricObject> を返す
      const clonedSetSpy = vi.fn();
      const cloned: Record<string, unknown> = {
        type: 'rectangle',
        left: 0,
        top: 0,
        set: (opts: Record<string, unknown>) => {
          clonedSetSpy(opts);
          Object.assign(cloned, opts);
          return cloned;
        },
      };
      const cloneSpy = vi.fn(() => Promise.resolve(cloned));
      const target = {
        type: 'rectangle',
        left: 50,
        top: 60,
        clone: cloneSpy,
      };

      await openMenuWith(target);

      const duplicateButton = screen.getByRole('button', { name: '複製' });

      await act(async () => {
        await user.click(duplicateButton);
      });

      // clone 呼出し確認
      expect(cloneSpy).toHaveBeenCalledTimes(1);

      // Promise 解決後に canvas.add(cloned) が呼ばれる
      await waitFor(() => {
        expect(mockCanvasInstance.add).toHaveBeenCalledWith(cloned);
      });

      // cloned の位置が target から +20 ずれる
      expect(clonedSetSpy).toHaveBeenCalledWith(expect.objectContaining({ left: 70, top: 80 }));
      expect(cloned.left).toBe(70);
      expect(cloned.top).toBe(80);

      // 選択状態にセットし、再描画を要求
      expect(mockCanvasInstance.setActiveObject).toHaveBeenCalledWith(cloned);
      expect(mockCanvasInstance.requestRenderAll).toHaveBeenCalled();
    });
  });

  describe('編集アクション (Req 27.3)', () => {
    it('テキスト対象で「編集」ボタンをタップすると target.enterEditing() が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      const enterEditingSpy = vi.fn();
      const target = {
        type: 'textAnnotation',
        left: 50,
        top: 60,
        enterEditing: enterEditingSpy,
      };

      await openMenuWith(target);

      const editButton = screen.getByRole('button', { name: '編集' });
      expect(editButton).not.toBeDisabled();

      await user.click(editButton);

      expect(enterEditingSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('外タップで閉じる (Req 27.5)', () => {
    it('オーバーレイをクリックするとメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      const target = { type: 'rectangle' };
      await openMenuWith(target);

      // メニュー表示確認
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();

      // オーバーレイクリック
      const overlay = screen.getByTestId('annotation-context-menu-overlay');
      await user.click(overlay);

      // メニューが閉じる
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
      });

      // data 属性でも確認
      const container = screen.getByTestId('annotation-editor-container');
      expect(container).toHaveAttribute('data-context-menu-visible', 'false');
    });
  });

  describe('skipTargetFind 制御 (Req 27.4)', () => {
    it('メニュー表示中は canvas.skipTargetFind === true、メニュー閉で false に戻る', async () => {
      const user = userEvent.setup();
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(getRegisteredHandler('custom:longpress')).toBeDefined();
      });

      // 初期: false
      expect(mockCanvasInstance.skipTargetFind).toBe(false);

      const target = { type: 'rectangle' };
      await openMenuWith(target);

      // メニュー表示中: true
      await waitFor(() => {
        expect(mockCanvasInstance.skipTargetFind).toBe(true);
      });

      // オーバーレイクリックで閉じる
      const overlay = screen.getByTestId('annotation-context-menu-overlay');
      await user.click(overlay);

      // メニュー閉じた後: false に戻る
      await waitFor(() => {
        expect(mockCanvasInstance.skipTargetFind).toBe(false);
      });
    });
  });
});
